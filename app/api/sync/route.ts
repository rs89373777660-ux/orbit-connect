import { and, asc, desc, eq, gt, inArray } from "drizzle-orm";
import { getDb } from "../../../db";
import { chatMembers, chats, messageHidden, messageReceipts, messages, reactions, users } from "../../../db/schema";
import { getAppUser } from "../../server-auth";

async function identity(request:Request){
 const user=await getAppUser(request);if(!user)return null;
 const db=getDb();
 await db.insert(users).values({id:user.userId,email:user.email,name:user.displayName,createdAt:Date.now()}).onConflictDoUpdate({target:users.id,set:{email:user.email,name:user.displayName}});
 const existing=await db.select().from(chatMembers).where(eq(chatMembers.userId,user.userId)).limit(1);
 if(!existing.length){
  const id=crypto.randomUUID(),now=Date.now();
  await db.batch([
   db.insert(chats).values({id,title:"Избранное",kind:"direct",createdBy:user.userId,createdAt:now}),
   db.insert(chatMembers).values({chatId:id,userId:user.userId,role:"owner",joinedAt:now}),
   db.insert(messages).values({id:crypto.randomUUID(),chatId:id,senderId:user.userId,body:"Это ваш личный чат. Здесь можно хранить сообщения и файлы.",kind:"system",createdAt:now})
  ]);
 }
 return user;
}
async function member(chatId:string,userId:string){return (await getDb().select().from(chatMembers).where(and(eq(chatMembers.chatId,chatId),eq(chatMembers.userId,userId))).limit(1)).length>0}

export async function GET(request:Request){
 try{
  const user=await identity(request);if(!user)return Response.json({error:"Требуется вход"},{status:401});
  const db=getDb(),url=new URL(request.url),chatId=url.searchParams.get("chatId"),after=Number(url.searchParams.get("after")||0);
  if(chatId){
   if(!await member(chatId,user.userId))return Response.json({error:"Нет доступа"},{status:403});
   const allRows=await db.select().from(messages).where(and(eq(messages.chatId,chatId),gt(messages.createdAt,after))).orderBy(asc(messages.createdAt)).limit(200);
   const allIds=allRows.map(item=>item.id);
   const hidden=allIds.length?await db.select({messageId:messageHidden.messageId}).from(messageHidden).where(and(eq(messageHidden.userId,user.userId),inArray(messageHidden.messageId,allIds))):[];
   const hiddenIds=new Set(hidden.map(item=>item.messageId)),rows=allRows.filter(item=>!hiddenIds.has(item.id)),ids=rows.map(item=>item.id),now=Date.now();
   if(ids.length)await db.update(messageReceipts).set({deliveredAt:now,readAt:now}).where(and(eq(messageReceipts.userId,user.userId),inArray(messageReceipts.messageId,ids)));
   const receiptRows=ids.length?await db.select().from(messageReceipts).where(inArray(messageReceipts.messageId,ids)):[];
   const rs=ids.length?await db.select().from(reactions).where(inArray(reactions.messageId,ids)):[];
   const members=await db.select({userId:chatMembers.userId}).from(chatMembers).where(eq(chatMembers.chatId,chatId));
   const enriched=rows.map(message=>{
    const receipts=receiptRows.filter(item=>item.messageId===message.id),recipientCount=Math.max(0,members.length-1);
    const deliveryStatus=recipientCount===0||receipts.length>=recipientCount&&receipts.every(item=>Boolean(item.readAt))?"read":receipts.length>=recipientCount&&receipts.every(item=>Boolean(item.deliveredAt))?"delivered":"sent";
    return {...message,body:message.deletedAt?null:message.body,fileName:message.deletedAt?null:message.fileName,deliveryStatus};
   });
   return Response.json({messages:enriched,reactions:rs,serverTime:Date.now(),user});
  }
  const memberships=await db.select().from(chatMembers).where(eq(chatMembers.userId,user.userId));
  const ids=memberships.map(item=>item.chatId);
  const roomRows=ids.length?await db.select().from(chats).where(inArray(chats.id,ids)).orderBy(desc(chats.createdAt)):[];
  const chatList=await Promise.all(roomRows.map(async room=>{
   if(room.kind!=="direct")return {...room,avatarPreset:"👥"};
   const roomMembers=await db.select().from(chatMembers).where(eq(chatMembers.chatId,room.id));
   const other=roomMembers.find(item=>item.userId!==user.userId);
   if(!other)return {...room,avatarPreset:"⭐"};
   const [person]=await db.select({id:users.id,name:users.name,avatarData:users.avatarData,avatarPreset:users.avatarPreset,privacyPhoto:users.privacyPhoto}).from(users).where(eq(users.id,other.userId)).limit(1);
   return person?{...room,title:person.name,avatarPreset:person.avatarPreset,avatarUrl:person.avatarData&&person.privacyPhoto?`/api/avatar?id=${encodeURIComponent(person.id)}`:null}:room;
  }));
  const directory=await db.select({id:users.id,name:users.name,email:users.email}).from(users).orderBy(asc(users.name)).limit(100);
  return Response.json({user,chatList,memberships,directory});
 }catch(error){return Response.json({error:error instanceof Error?error.message:"Ошибка сервера"},{status:500})}
}

export async function POST(request:Request){
 try{
  const user=await identity(request);if(!user)return Response.json({error:"Требуется вход"},{status:401});
  const p=await request.json() as {action?:string;chatId?:string;title?:string;body?:string;memberIds?:string[];replyTo?:string;messageId?:string;emoji?:string};
  const db=getDb();
  if(p.action==="create-chat"){
   const title=p.title?.trim();if(!title)return Response.json({error:"Введите название"},{status:400});
   const id=crypto.randomUUID(),now=Date.now();
   await db.batch([db.insert(chats).values({id,title,kind:"group",createdBy:user.userId,createdAt:now}),db.insert(chatMembers).values({chatId:id,userId:user.userId,role:"owner",joinedAt:now})]);
   for(const userId of [...new Set(p.memberIds||[])].filter(Boolean))await db.insert(chatMembers).values({chatId:id,userId,role:"member",joinedAt:now}).onConflictDoNothing();
   return Response.json({chat:{id,title,kind:"group",createdAt:now}},{status:201});
  }
  if(!p.chatId||!await member(p.chatId,user.userId))return Response.json({error:"Нет доступа к чату"},{status:403});
  if(p.action==="react"&&p.messageId){await db.insert(reactions).values({messageId:p.messageId,userId:user.userId,emoji:p.emoji||"🔥",createdAt:Date.now()}).onConflictDoNothing();return Response.json({ok:true})}
  return Response.json({error:"Неизвестное действие"},{status:400});
 }catch(error){return Response.json({error:error instanceof Error?error.message:"Ошибка сервера"},{status:500})}
}
