import { eq } from "drizzle-orm";
import { getDb } from "../db";
import { users } from "../db/schema";

export function normalizePhone(value:string){
 const digits=value.replace(/\D/g,"");
 if(digits.length===10)return `7${digits}`;
 if(digits.length===11&&digits.startsWith("8"))return `7${digits.slice(1)}`;
 return digits.slice(-15);
}

export async function sha256(value:string){
 const bytes=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value));
 return [...new Uint8Array(bytes)].map(x=>x.toString(16).padStart(2,"0")).join("");
}

export async function hashPhone(value:string){
 const normalized=normalizePhone(value);
 return normalized.length>=10?sha256(normalized):null;
}

export function normalizeHandle(value:string){
 let handle=value.trim().toLocaleLowerCase("ru-RU").replace(/^\$+/,"");
 handle=handle.replace(/[^a-zа-яё0-9_]/giu,"").slice(0,24);
 return handle.length>=3?`$${handle}`:null;
}

export async function ensureProfileIdentity(userId:string){
 const db=getDb();
 const [row]=await db.select().from(users).where(eq(users.id,userId)).limit(1);
 if(!row)return null;
 if(row.publicId&&row.handle)return row;
 const suffix=userId.replace(/-/g,"").slice(0,10).toLowerCase();
 const publicId=`$${suffix}`;
 await db.update(users).set({publicId,handle:row.handle||publicId}).where(eq(users.id,userId));
 return {...row,publicId,handle:row.handle||publicId};
}

export function parseSocials(value:string|null){
 try{
  const parsed=JSON.parse(value||"{}") as Record<string,string>;
  return Object.fromEntries(Object.entries(parsed).filter(([,item])=>typeof item==="string"&&item.trim()).slice(0,8));
 }catch{return {}}
}

export function publicProfile(row:typeof users.$inferSelect,isOwn=false){
 const show=(allowed:boolean,value:unknown)=>isOwn||allowed?value:null;
 return {
  id:row.id,
  name:row.name,
  handle:row.handle||row.publicId,
  publicId:row.publicId,
  phone:show(row.privacyPhone,row.phone),
  phoneLast4:row.phoneLast4,
  email:show(row.privacyEmail,row.email),
  birthYear:isOwn?row.birthYear:null,
  status:show(row.privacyStatus,row.status),
  socials:show(row.privacySocials,parseSocials(row.socialsJson)),
  avatarUrl:show(row.privacyPhoto&&Boolean(row.avatarData)&&!row.avatarPreset,row.avatarData&&!row.avatarPreset?`/api/avatar?id=${encodeURIComponent(row.id)}`:null),
  hasAvatar:Boolean(row.avatarData),
  avatarPreset:row.avatarPreset,
  autoCorrectEnabled:isOwn?row.autoCorrectEnabled:undefined,
  registered:row.registrationCompleted,
  privacy:isOwn?{
   phone:row.privacyPhone,email:row.privacyEmail,status:row.privacyStatus,
   socials:row.privacySocials,photo:row.privacyPhoto
  }:undefined,
  syncContactsEnabled:isOwn?row.syncContactsEnabled:undefined
 };
}
