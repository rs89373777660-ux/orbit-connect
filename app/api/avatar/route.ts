import { eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { users } from "../../../db/schema";
import { getAppUser } from "../../server-auth";

export async function GET(request:Request){const id=new URL(request.url).searchParams.get("id");if(!id)return new Response(null,{status:404});const [user]=await getDb().select({avatarData:users.avatarData}).from(users).where(eq(users.id,id)).limit(1);if(!user?.avatarData)return new Response(null,{status:404});const match=user.avatarData.match(/^data:(image\/(?:jpeg|png|webp));base64,(.+)$/);if(!match)return new Response(null,{status:404});const binary=atob(match[2]),bytes=new Uint8Array(binary.length);for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);return new Response(bytes,{headers:{"content-type":match[1],"cache-control":"public, max-age=300"}})}

export async function POST(request:Request){const me=await getAppUser(request);if(!me)return Response.json({error:"Требуется вход"},{status:401});const body=await request.json() as {avatarData?:string};const avatar=body.avatarData||"";if(!/^data:image\/(jpeg|png|webp);base64,/.test(avatar)||avatar.length>400000)return Response.json({error:"Изображение слишком большое"},{status:400});await getDb().update(users).set({avatarData:avatar}).where(eq(users.id,me.userId));return Response.json({ok:true,avatarUrl:`/api/avatar?id=${encodeURIComponent(me.userId)}&v=${Date.now()}`})}
