import { and, desc, eq, isNotNull } from "drizzle-orm";
import { env } from "cloudflare:workers";
import { getDb } from "../../../db";
import { chatMembers, messageHidden, messageReceipts, messages, notifications } from "../../../db/schema";
import { getAppUser } from "../../server-auth";

async function allowed(chatId:string,userId:string){return (await getDb().select().from(chatMembers).where(and(eq(chatMembers.chatId,chatId),eq(chatMembers.userId,userId))).limit(1)).length>0}

export async function POST(request:Request){
 const user=await getAppUser(request);if(!user)return Response.json({error:"Требуется вход"},{status:401});
 const form=await request.formData(),file=form.get("file"),chatId=String(form.get("chatId")||""),caption=String(form.get("caption")||"").trim().slice(0,2000);
 if(!(file instanceof File)||!chatId)return Response.json({error:"Нужны файл и chatId"},{status:400});
 if(file.size>100*1024*1024)return Response.json({error:"Максимум 100 МБ"},{status:413});
 if(!await allowed(chatId,user.userId))return Response.json({error:"Нет доступа"},{status:403});
 const safeName=(file.name||"file").replace(/[^a-zA-Z0-9._-]/g,"_").slice(-120),key=`${chatId}/${crypto.randomUUID()}/${safeName}`;
 const bytes=await file.arrayBuffer();
 await env.FILES.put(key,bytes,{httpMetadata:{contentType:file.type||"application/octet-stream"}});
 const now=Date.now(),photo=file.type.startsWith("image/"),row={id:crypto.randomUUID(),chatId,senderId:user.userId,body:caption||null,kind:(photo?"photo":"file") as "photo"|"file",fileKey:key,fileName:file.name.slice(0,240),fileSize:file.size,fileMime:file.type||"application/octet-stream",createdAt:now};
 const db=getDb(),members=await db.select({userId:chatMembers.userId}).from(chatMembers).where(eq(chatMembers.chatId,chatId)),recipients=members.filter(item=>item.userId!==user.userId);
 await db.batch([db.insert(messages).values(row),...recipients.map(item=>db.insert(messageReceipts).values({messageId:row.id,userId:item.userId,deliveredAt:now})),...recipients.map(item=>db.insert(notifications).values({id:crypto.randomUUID(),userId:item.userId,actorId:user.userId,entityId:chatId,kind:photo?"photo":"file",body:`${user.displayName}: ${photo?"фотография":"файл"} ${file.name.slice(0,100)}`,createdAt:now}))]);
 return Response.json({message:row},{status:201});
}

export async function GET(request:Request){
 const user=await getAppUser(request);if(!user)return new Response("Unauthorized",{status:401});
 const url=new URL(request.url),db=getDb();
 if(url.searchParams.get("gallery")==="1"){
  const rows=await db.select({id:messages.id,chatId:messages.chatId,kind:messages.kind,fileName:messages.fileName,fileSize:messages.fileSize,fileMime:messages.fileMime,createdAt:messages.createdAt}).from(messages).where(and(eq(messages.senderId,user.userId),isNotNull(messages.fileKey))).orderBy(desc(messages.createdAt)).limit(200);
  return Response.json({items:rows.map(item=>({...item,url:`/api/files?id=${encodeURIComponent(item.id)}`}))});
 }
 const id=url.searchParams.get("id");if(!id)return new Response("Missing id",{status:400});
 const [msg]=await db.select().from(messages).where(eq(messages.id,id)).limit(1);
 if(!msg?.fileKey||msg.deletedAt||!await allowed(msg.chatId,user.userId))return new Response("Not found",{status:404});
 const [hidden]=await db.select().from(messageHidden).where(and(eq(messageHidden.messageId,id),eq(messageHidden.userId,user.userId))).limit(1);if(hidden)return new Response("Not found",{status:404});
 const object=await env.FILES.get(msg.fileKey);if(!object)return new Response("Not found",{status:404});
 const inline=url.searchParams.get("inline")==="1"&&Boolean(msg.fileMime?.startsWith("image/"));
 return new Response(object.body,{headers:{"content-type":msg.fileMime||object.httpMetadata?.contentType||"application/octet-stream","content-disposition":`${inline?"inline":"attachment"}; filename*=UTF-8''${encodeURIComponent(msg.fileName||"file")}`,"cache-control":"private, max-age=300"}});
}
