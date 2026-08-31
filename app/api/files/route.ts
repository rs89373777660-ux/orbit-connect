import { and, desc, eq, isNotNull } from "drizzle-orm";
import { env } from "cloudflare:workers";
import { getDb } from "../../../db";
import { chatMembers, messageAttachments, messageHidden, messageReceipts, messages, notifications } from "../../../db/schema";
import { getAppUser } from "../../server-auth";

async function allowed(chatId:string,userId:string){return (await getDb().select().from(chatMembers).where(and(eq(chatMembers.chatId,chatId),eq(chatMembers.userId,userId))).limit(1)).length>0}

export async function POST(request:Request){
 const user=await getAppUser(request);if(!user)return Response.json({error:"Требуется вход"},{status:401});
 const form=await request.formData(),files=form.getAll("files").filter((value):value is File=>value instanceof File),legacy=form.get("file"),chatId=String(form.get("chatId")||""),caption=String(form.get("caption")||"").trim().slice(0,2000),uploads=files.length?files:legacy instanceof File?[legacy]:[];
 if(!uploads.length||!chatId)return Response.json({error:"Нужны файлы и chatId"},{status:400});
 if(uploads.length>10)return Response.json({error:"Максимум 10 фотографий"},{status:400});
 if(uploads.some(file=>file.size>100*1024*1024))return Response.json({error:"Максимум 100 МБ на файл"},{status:413});
 if(uploads.length>1&&uploads.some(file=>!file.type.startsWith("image/")))return Response.json({error:"В альбом можно добавить только изображения"},{status:400});
 if(!await allowed(chatId,user.userId))return Response.json({error:"Нет доступа"},{status:403});
 const now=Date.now(),photo=uploads.every(file=>file.type.startsWith("image/")),messageId=crypto.randomUUID(),stored=[] as Array<{id:string;messageId:string;fileKey:string;fileName:string;fileSize:number;fileMime:string;position:number;createdAt:number}>;
 for(const [position,file] of uploads.entries()){const safeName=(file.name||"file").replace(/[^a-zA-Z0-9._-]/g,"_").slice(-120),fileKey=`${chatId}/${messageId}/${position}-${safeName}`;await env.FILES.put(fileKey,await file.arrayBuffer(),{httpMetadata:{contentType:file.type||"application/octet-stream"}});stored.push({id:crypto.randomUUID(),messageId,fileKey,fileName:file.name.slice(0,240),fileSize:file.size,fileMime:file.type||"application/octet-stream",position,createdAt:now})}
 const first=stored[0],row={id:messageId,chatId,senderId:user.userId,body:caption||null,kind:(photo?"album":"file") as "album"|"file",fileKey:photo?null:first.fileKey,fileName:photo?null:first.fileName,fileSize:photo?null:first.fileSize,fileMime:photo?null:first.fileMime,createdAt:now};
 const db=getDb(),members=await db.select({userId:chatMembers.userId}).from(chatMembers).where(eq(chatMembers.chatId,chatId)),recipients=members.filter(item=>item.userId!==user.userId);
 await db.batch([db.insert(messages).values(row),...(photo?stored.map(item=>db.insert(messageAttachments).values(item)):[]),...recipients.map(item=>db.insert(messageReceipts).values({messageId:row.id,userId:item.userId,deliveredAt:now})),...recipients.map(item=>db.insert(notifications).values({id:crypto.randomUUID(),userId:item.userId,actorId:user.userId,entityId:chatId,kind:photo?"photo":"file",body:`${user.displayName}: ${photo?uploads.length===1?"фотография":`фотографии (${uploads.length})`:"файл"}`,createdAt:now}))]);
 return Response.json({message:{...row,attachments:photo?stored.map(({fileKey,...item})=>item):[]}},{status:201});
}

export async function GET(request:Request){
 const user=await getAppUser(request);if(!user)return new Response("Unauthorized",{status:401});
 const url=new URL(request.url),db=getDb();
 if(url.searchParams.get("gallery")==="1"){
  const rows=await db.select({id:messages.id,chatId:messages.chatId,kind:messages.kind,fileName:messages.fileName,fileSize:messages.fileSize,fileMime:messages.fileMime,createdAt:messages.createdAt}).from(messages).where(and(eq(messages.senderId,user.userId),isNotNull(messages.fileKey))).orderBy(desc(messages.createdAt)).limit(200);
  const albumRows=await db.select({id:messageAttachments.id,messageId:messageAttachments.messageId,fileName:messageAttachments.fileName,fileSize:messageAttachments.fileSize,fileMime:messageAttachments.fileMime,createdAt:messageAttachments.createdAt}).from(messageAttachments).innerJoin(messages,eq(messageAttachments.messageId,messages.id)).where(eq(messages.senderId,user.userId)).orderBy(desc(messageAttachments.createdAt)).limit(200);
  return Response.json({items:[...rows.map(item=>({...item,url:`/api/files?id=${encodeURIComponent(item.id)}`})),...albumRows.map(item=>({...item,kind:"photo",url:`/api/files?attachment=${encodeURIComponent(item.id)}`}))].sort((a,b)=>b.createdAt-a.createdAt).slice(0,200)});
 }
 const attachmentId=url.searchParams.get("attachment");if(attachmentId){const [attachment]=await db.select().from(messageAttachments).where(eq(messageAttachments.id,attachmentId)).limit(1);if(!attachment)return new Response("Not found",{status:404});const [parent]=await db.select().from(messages).where(eq(messages.id,attachment.messageId)).limit(1);if(!parent||parent.deletedAt||!await allowed(parent.chatId,user.userId))return new Response("Not found",{status:404});const [hidden]=await db.select().from(messageHidden).where(and(eq(messageHidden.messageId,parent.id),eq(messageHidden.userId,user.userId))).limit(1);if(hidden)return new Response("Not found",{status:404});const object=await env.FILES.get(attachment.fileKey);if(!object)return new Response("Not found",{status:404});const inline=url.searchParams.get("inline")==="1";return new Response(object.body,{headers:{"content-type":attachment.fileMime||object.httpMetadata?.contentType||"image/jpeg","content-disposition":`${inline?"inline":"attachment"}; filename*=UTF-8''${encodeURIComponent(attachment.fileName)}`,"cache-control":"private, max-age=300"}})}
 const id=url.searchParams.get("id");if(!id)return new Response("Missing id",{status:400});
 const [msg]=await db.select().from(messages).where(eq(messages.id,id)).limit(1);
 if(!msg?.fileKey||msg.deletedAt||!await allowed(msg.chatId,user.userId))return new Response("Not found",{status:404});
 const [hidden]=await db.select().from(messageHidden).where(and(eq(messageHidden.messageId,id),eq(messageHidden.userId,user.userId))).limit(1);if(hidden)return new Response("Not found",{status:404});
 const object=await env.FILES.get(msg.fileKey);if(!object)return new Response("Not found",{status:404});
 const inline=url.searchParams.get("inline")==="1"&&Boolean(msg.fileMime?.startsWith("image/"));
 return new Response(object.body,{headers:{"content-type":msg.fileMime||object.httpMetadata?.contentType||"application/octet-stream","content-disposition":`${inline?"inline":"attachment"}; filename*=UTF-8''${encodeURIComponent(msg.fileName||"file")}`,"cache-control":"private, max-age=300"}});
}
