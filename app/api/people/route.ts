import { and, desc, eq, inArray, isNull, like, ne, or } from "drizzle-orm";
import { getDb } from "../../../db";
import { appSessions, chatMembers, chats, contacts, notifications, users } from "../../../db/schema";
import { getAppUser } from "../../server-auth";
import { ensureProfileIdentity, hashPhone, normalizeHandle, publicProfile } from "../../profile-utils";

async function auth(request:Request){
 const user=await getAppUser(request);
 if(!user)return null;
 await getDb().insert(users).values({id:user.userId,email:user.email,name:user.displayName,createdAt:Date.now()}).onConflictDoNothing();
 await ensureProfileIdentity(user.userId);
 return user;
}
async function online(userIds:string[]){
 if(!userIds.length)return new Set<string>();
 const rows=await getDb().select({userId:appSessions.userId,lastSeenAt:appSessions.lastSeenAt}).from(appSessions).where(inArray(appSessions.userId,userIds));
 return new Set(rows.filter(row=>row.lastSeenAt>=Date.now()-120000).map(row=>row.userId));
}

export async function GET(request:Request){
 try{
  const me=await auth(request);if(!me)return Response.json({error:"Требуется вход"},{status:401});
  const db=getDb(),url=new URL(request.url),query=(url.searchParams.get("q")||"").trim();
  const links=await db.select().from(contacts).where(eq(contacts.ownerId,me.userId));
  const ids=links.map(link=>link.contactUserId);
  const people=ids.length?await db.select().from(users).where(and(inArray(users.id,ids),eq(users.registrationCompleted,true))):[];
  const active=await online(ids),aliases=new Map(links.map(item=>[item.contactUserId,item.alias]));
  const contactProfiles=people.map(person=>({...publicProfile(person),name:aliases.get(person.id)||person.name,online:active.has(person.id),isContact:true}));
  let results:unknown[]=[];
  if(query){
   const exactHandle=normalizeHandle(query),phoneHash=await hashPhone(query),pattern=`%${query.replace(/^\$/,"").slice(0,60)}%`;
   const clauses=[like(users.name,pattern),like(users.email,pattern),like(users.handle,pattern)];
   if(exactHandle)clauses.push(eq(users.handle,exactHandle));if(phoneHash)clauses.push(eq(users.phoneHash,phoneHash));
   const rows=await db.select().from(users).where(and(eq(users.registrationCompleted,true),ne(users.id,me.userId),or(...clauses))).limit(30);
   const saved=new Set(ids),foundActive=await online(rows.map(row=>row.id));
   results=rows.map(row=>({...publicProfile(row),online:foundActive.has(row.id),isContact:saved.has(row.id)}));
  }
  const [profile]=await db.select().from(users).where(eq(users.id,me.userId)).limit(1);
  const alerts=await db.select().from(notifications).where(eq(notifications.userId,me.userId)).orderBy(desc(notifications.createdAt)).limit(30);
  return Response.json({contacts:contactProfiles,results,notifications:alerts,profile:publicProfile(profile,true)});
 }catch(error){return Response.json({error:error instanceof Error?error.message:"Ошибка контактов"},{status:500})}
}

export async function POST(request:Request){
 try{
  const me=await auth(request);if(!me)return Response.json({error:"Требуется вход"},{status:401});
  const p=await request.json() as {action?:string;phoneHashes?:string[];targetUserId?:string;alias?:string};
  const db=getDb();
  if(p.action==="sync-phonebook"){
   const hashes=[...new Set((p.phoneHashes||[]).filter(value=>/^[a-f0-9]{64}$/.test(value)))].slice(0,5000);
   if(!hashes.length)return Response.json({matches:[]});
   const rows=await db.select().from(users).where(and(inArray(users.phoneHash,hashes),eq(users.registrationCompleted,true)));
   const existing=await db.select().from(contacts).where(eq(contacts.ownerId,me.userId)),saved=new Set(existing.map(x=>x.contactUserId)),active=await online(rows.map(x=>x.id));
   return Response.json({matches:rows.filter(x=>x.id!==me.userId).map(x=>({...publicProfile(x),phoneHash:x.phoneHash,isContact:saved.has(x.id),online:active.has(x.id)}))});
  }
  if(p.action==="add-contact"){
   const target=p.targetUserId||"";if(!target||target===me.userId)return Response.json({error:"Некорректный контакт"},{status:400});
   const [person]=await db.select().from(users).where(and(eq(users.id,target),eq(users.registrationCompleted,true))).limit(1);
   if(!person)return Response.json({error:"Пользователь не найден"},{status:404});
   const now=Date.now();await db.batch([
    db.insert(contacts).values({ownerId:me.userId,contactUserId:target,alias:p.alias?.trim().slice(0,80)||null,createdAt:now}).onConflictDoNothing(),
    db.insert(notifications).values({id:crypto.randomUUID(),userId:target,actorId:me.userId,kind:"contact_added",body:`${me.displayName} добавил(а) вас в контакты`,createdAt:now})
   ]);return Response.json({ok:true,person:publicProfile(person)});
  }
  if(p.action==="start-direct"){
   const target=p.targetUserId||"";const [person]=await db.select().from(users).where(and(eq(users.id,target),eq(users.registrationCompleted,true))).limit(1);
   if(!person)return Response.json({error:"Пользователь не найден"},{status:404});
   const mine=await db.select({chatId:chatMembers.chatId}).from(chatMembers).where(eq(chatMembers.userId,me.userId)),theirs=await db.select({chatId:chatMembers.chatId}).from(chatMembers).where(eq(chatMembers.userId,target)),theirIds=new Set(theirs.map(x=>x.chatId));
   for(const row of mine){if(!theirIds.has(row.chatId))continue;const [room]=await db.select().from(chats).where(and(eq(chats.id,row.chatId),eq(chats.kind,"direct"))).limit(1);if(room){const members=await db.select().from(chatMembers).where(eq(chatMembers.chatId,row.chatId));if(members.length===2)return Response.json({chat:{...room,title:person.name}})}}
   const id=crypto.randomUUID(),now=Date.now();await db.batch([
    db.insert(chats).values({id,title:person.name,kind:"direct",createdBy:me.userId,createdAt:now}),
    db.insert(chatMembers).values({chatId:id,userId:me.userId,role:"owner",joinedAt:now}),
    db.insert(chatMembers).values({chatId:id,userId:target,role:"member",joinedAt:now}),
    db.insert(contacts).values({ownerId:me.userId,contactUserId:target,createdAt:now}).onConflictDoNothing()
   ]);return Response.json({chat:{id,title:person.name,kind:"direct",createdAt:now}},{status:201});
  }
  if(p.action==="read-notifications"){await db.update(notifications).set({readAt:Date.now()}).where(and(eq(notifications.userId,me.userId),isNull(notifications.readAt)));return Response.json({ok:true})}
  return Response.json({error:"Неизвестное действие"},{status:400});
 }catch(error){return Response.json({error:error instanceof Error?error.message:"Ошибка контактов"},{status:500})}
}
