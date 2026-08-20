import { and, desc, eq } from "drizzle-orm";
import { env } from "cloudflare:workers";
import { getDb } from "../../../db";
import { userAvatars, users } from "../../../db/schema";
import { getAppUser } from "../../server-auth";

function dataBytes(value:string){const match=value.match(/^data:(image\/(?:jpeg|png|webp));base64,(.+)$/);if(!match)return null;const binary=atob(match[2]),bytes=new Uint8Array(binary.length);for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);return {mime:match[1],bytes}}

export async function GET(request:Request){
 const url=new URL(request.url),viewer=await getAppUser(request),db=getDb();
 if(url.searchParams.get("gallery")==="1"){
  if(!viewer)return Response.json({error:"Требуется вход"},{status:401});
  const rows=await db.select({id:userAvatars.id,label:userAvatars.label,createdAt:userAvatars.createdAt}).from(userAvatars).where(eq(userAvatars.userId,viewer.userId)).orderBy(desc(userAvatars.createdAt));
  const [me]=await db.select({avatarAssetId:users.avatarAssetId}).from(users).where(eq(users.id,viewer.userId)).limit(1);
  return Response.json({items:rows.map(row=>({...row,url:`/api/avatar?asset=${row.id}`})),selectedId:me?.avatarAssetId});
 }
 const asset=url.searchParams.get("asset");
 if(asset){
  if(!viewer)return new Response(null,{status:401});const [row]=await db.select().from(userAvatars).where(and(eq(userAvatars.id,asset),eq(userAvatars.userId,viewer.userId))).limit(1);if(!row)return new Response(null,{status:404});const object=await env.FILES.get(row.fileKey);return object?new Response(object.body,{headers:{"content-type":object.httpMetadata?.contentType||"image/jpeg","cache-control":"private, max-age=300"}}):new Response(null,{status:404});
 }
 const id=url.searchParams.get("id");if(!id)return new Response(null,{status:404});
 const [user]=await db.select({avatarData:users.avatarData,avatarAssetId:users.avatarAssetId,privacyPhoto:users.privacyPhoto}).from(users).where(eq(users.id,id)).limit(1);
 if(!user||(!user.privacyPhoto&&viewer?.userId!==id))return new Response(null,{status:404});
 if(user.avatarAssetId){const [row]=await db.select().from(userAvatars).where(eq(userAvatars.id,user.avatarAssetId)).limit(1);if(row){const object=await env.FILES.get(row.fileKey);if(object)return new Response(object.body,{headers:{"content-type":object.httpMetadata?.contentType||"image/jpeg","cache-control":"private, max-age=300"}})}}
 const decoded=user.avatarData?dataBytes(user.avatarData):null;return decoded?new Response(decoded.bytes,{headers:{"content-type":decoded.mime,"cache-control":"private, max-age=300"}}):new Response(null,{status:404});
}

export async function POST(request:Request){
 const me=await getAppUser(request);if(!me)return Response.json({error:"Требуется вход"},{status:401});const db=getDb();
 const body=await request.json() as {action?:"select"|"delete";assetId?:string;avatarData?:string;label?:string};
 if(body.action==="select"){const [row]=await db.select().from(userAvatars).where(and(eq(userAvatars.id,body.assetId||""),eq(userAvatars.userId,me.userId))).limit(1);if(!row)return Response.json({error:"Аватар не найден"},{status:404});await db.update(users).set({avatarAssetId:row.id,avatarPreset:null}).where(eq(users.id,me.userId));return Response.json({ok:true,avatarUrl:`/api/avatar?id=${me.userId}&v=${Date.now()}`})}
 if(body.action==="delete"){const [row]=await db.select().from(userAvatars).where(and(eq(userAvatars.id,body.assetId||""),eq(userAvatars.userId,me.userId))).limit(1);if(!row)return Response.json({error:"Аватар не найден"},{status:404});const [owner]=await db.select({selected:users.avatarAssetId}).from(users).where(eq(users.id,me.userId)).limit(1);if(owner?.selected===row.id)await db.update(users).set({avatarAssetId:null,avatarData:null}).where(eq(users.id,me.userId));await env.FILES.delete(row.fileKey);await db.delete(userAvatars).where(eq(userAvatars.id,row.id));return Response.json({ok:true})}
 const decoded=dataBytes(body.avatarData||"");if(!decoded||decoded.bytes.byteLength>600000)return Response.json({error:"Изображение слишком большое"},{status:400});
 const id=crypto.randomUUID(),key=`avatars/${me.userId}/${id}.jpg`;await env.FILES.put(key,decoded.bytes,{httpMetadata:{contentType:decoded.mime}});await db.batch([db.insert(userAvatars).values({id,userId:me.userId,fileKey:key,label:body.label?.slice(0,80)||"Обработанный аватар",createdAt:Date.now()}),db.update(users).set({avatarAssetId:id,avatarPreset:null,avatarData:null}).where(eq(users.id,me.userId))]);return Response.json({ok:true,assetId:id,avatarUrl:`/api/avatar?id=${encodeURIComponent(me.userId)}&v=${Date.now()}`});
}
