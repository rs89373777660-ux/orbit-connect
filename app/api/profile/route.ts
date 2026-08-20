import { and, eq, ne } from "drizzle-orm";
import { getDb } from "../../../db";
import { users } from "../../../db/schema";
import { getAppUser } from "../../server-auth";
import { ensureProfileIdentity, normalizeHandle, publicProfile } from "../../profile-utils";

export async function GET(request:Request){
 const me=await getAppUser(request);
 if(!me)return Response.json({error:"Требуется вход"},{status:401});
 const db=getDb();await db.insert(users).values({id:me.userId,email:me.email,name:me.displayName,createdAt:Date.now()}).onConflictDoNothing();await ensureProfileIdentity(me.userId);
 const id=new URL(request.url).searchParams.get("id")||me.userId;
 const [row]=await db.select().from(users).where(eq(users.id,id)).limit(1);
 if(!row||(!row.registrationCompleted&&id!==me.userId))return Response.json({error:"Пользователь не найден"},{status:404});
 return Response.json({profile:publicProfile(row,id===me.userId)});
}

export async function POST(request:Request){
 try{
  const me=await getAppUser(request);
  if(!me)return Response.json({error:"Требуется вход"},{status:401});
  await getDb().insert(users).values({id:me.userId,email:me.email,name:me.displayName,createdAt:Date.now()}).onConflictDoNothing();
  await ensureProfileIdentity(me.userId);
  const body=await request.json() as {
   name?:string;email?:string;birthYear?:number|null;handle?:string;status?:string;
   socials?:Record<string,string>;syncContactsEnabled?:boolean;avatarPreset?:string|null;autoCorrectEnabled?:boolean;
   privacy?:{phone?:boolean;email?:boolean;status?:boolean;socials?:boolean;photo?:boolean}
  };
  const db=getDb();
  const [row]=await db.select().from(users).where(eq(users.id,me.userId)).limit(1);
  if(!row)return Response.json({error:"Профиль не найден"},{status:404});
  const handle=body.handle===undefined?row.handle:normalizeHandle(body.handle);
  if(!handle)return Response.json({error:"Никнейм должен начинаться с $ и содержать минимум 3 символа"},{status:400});
  const [taken]=await db.select({id:users.id}).from(users).where(and(eq(users.handle,handle),ne(users.id,me.userId))).limit(1);
  if(taken)return Response.json({error:"Такой никнейм уже занят"},{status:409});
  const name=body.name===undefined?row.name:body.name.trim().replace(/\s+/g," ").slice(0,100);
  const email=body.email===undefined?row.email:body.email.trim().toLowerCase().slice(0,160);
  if(name.length<3||!email.includes("@"))return Response.json({error:"Проверьте ФИО и email"},{status:400});
  const socials=body.socials===undefined?row.socialsJson:JSON.stringify(Object.fromEntries(Object.entries(body.socials).map(([key,value])=>[key.slice(0,30),String(value).trim().slice(0,180)]).filter(([,value])=>value).slice(0,8)));
  await db.update(users).set({
   name,email,handle,status:body.status===undefined?row.status:body.status.trim().slice(0,120)||null,
   birthYear:body.birthYear===undefined?row.birthYear:body.birthYear||null,socialsJson:socials,
   avatarPreset:body.avatarPreset===undefined?row.avatarPreset:(body.avatarPreset||null),
   autoCorrectEnabled:body.autoCorrectEnabled??row.autoCorrectEnabled,
   syncContactsEnabled:body.syncContactsEnabled??row.syncContactsEnabled,
   privacyPhone:body.privacy?.phone??row.privacyPhone,privacyEmail:body.privacy?.email??row.privacyEmail,
   privacyStatus:body.privacy?.status??row.privacyStatus,privacySocials:body.privacy?.socials??row.privacySocials,
   privacyPhoto:body.privacy?.photo??row.privacyPhoto
  }).where(eq(users.id,me.userId));
  const [updated]=await db.select().from(users).where(eq(users.id,me.userId)).limit(1);
  return Response.json({ok:true,profile:publicProfile(updated,true)});
 }catch(error){return Response.json({error:error instanceof Error?error.message:"Ошибка профиля"},{status:500})}
}
