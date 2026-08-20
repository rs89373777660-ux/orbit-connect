import { and, eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { chatMembers, chats, messageHidden, messageReceipts, messages, notifications } from "../../../db/schema";
import { getAppUser } from "../../server-auth";

async function membership(chatId:string,userId:string){
 return (await getDb().select().from(chatMembers).where(and(eq(chatMembers.chatId,chatId),eq(chatMembers.userId,userId))).limit(1))[0]||null;
}

export async function POST(request:Request){
 try{
  const user=await getAppUser(request);
  if(!user)return Response.json({error:"Требуется вход"},{status:401});
  const body=await request.json() as {action?:string;chatId?:string;targetChatId?:string;messageId?:string;body?:string;replyTo?:string;scope?:"me"|"all";kind?:"text"|"sticker"};
  const action=body.action||"send",db=getDb();

  if(action==="edit"){
   const text=body.body?.trim().slice(0,10000)||"";
   if(!body.messageId||!text)return Response.json({error:"Пустое сообщение"},{status:400});
   const [message]=await db.select().from(messages).where(eq(messages.id,body.messageId)).limit(1);
   if(!message||message.senderId!==user.userId||message.deletedAt)return Response.json({error:"Сообщение нельзя изменить"},{status:403});
   if(message.kind!=="text")return Response.json({error:"Можно изменить только текст"},{status:400});
   await db.update(messages).set({body:text,editedAt:Date.now()}).where(eq(messages.id,message.id));
   return Response.json({ok:true});
  }

  if(action==="delete"){
   if(!body.messageId)return Response.json({error:"Не выбрано сообщение"},{status:400});
   const [message]=await db.select().from(messages).where(eq(messages.id,body.messageId)).limit(1);
   if(!message||!await membership(message.chatId,user.userId))return Response.json({error:"Сообщение не найдено"},{status:404});
   if(body.scope==="all"){
    if(message.senderId!==user.userId)return Response.json({error:"Удалить для всех может только отправитель"},{status:403});
    await db.update(messages).set({deletedAt:Date.now()}).where(eq(messages.id,message.id));
   }else{
    await db.insert(messageHidden).values({messageId:message.id,userId:user.userId,hiddenAt:Date.now()}).onConflictDoUpdate({target:[messageHidden.messageId,messageHidden.userId],set:{hiddenAt:Date.now()}});
   }
   return Response.json({ok:true});
  }

  let chatId=body.chatId||"",source:null|typeof messages.$inferSelect=null;
  if(action==="forward"){
   if(!body.messageId||!body.targetChatId)return Response.json({error:"Выберите чат"},{status:400});
   [source]=await db.select().from(messages).where(eq(messages.id,body.messageId)).limit(1);
   if(!source||source.deletedAt||!await membership(source.chatId,user.userId))return Response.json({error:"Сообщение недоступно"},{status:404});
   chatId=body.targetChatId;
  }
  if(!chatId||!await membership(chatId,user.userId))return Response.json({error:"Нет доступа к чату"},{status:403});
  const [room]=await db.select().from(chats).where(eq(chats.id,chatId)).limit(1);
  if(room?.kind==="channel"&&room.createdBy!==user.userId)return Response.json({error:"Публиковать новости может только владелец канала"},{status:403});

  const text=action==="forward"?(source?.body||""):body.body?.trim().slice(0,10000)||"";
  if(action!=="forward"&&!text)return Response.json({error:"Пустое сообщение"},{status:400});
  const now=Date.now(),message={
   id:crypto.randomUUID(),chatId,senderId:user.userId,body:text||null,
   kind:(source?.kind||(body.kind==="sticker"&&/^\/emoji\/orbit-[1-9]\.webp$/.test(text)?"sticker":"text")) as "text"|"file"|"photo"|"sticker"|"voice"|"system",
   fileKey:source?.fileKey||null,fileName:source?.fileName||null,fileSize:source?.fileSize||null,fileMime:source?.fileMime||null,
   replyTo:action==="forward"?null:(body.replyTo||null),forwardedFromId:source?.id||null,createdAt:now
  };
  const members=await db.select({userId:chatMembers.userId}).from(chatMembers).where(eq(chatMembers.chatId,chatId));
  const recipients=members.filter(item=>item.userId!==user.userId);
  await db.batch([
   db.insert(messages).values(message),
   ...recipients.map(recipient=>db.insert(messageReceipts).values({messageId:message.id,userId:recipient.userId,deliveredAt:now})),
   ...recipients.map(recipient=>db.insert(notifications).values({
    id:crypto.randomUUID(),userId:recipient.userId,actorId:user.userId,entityId:chatId,
    kind:message.kind==="file"?"file":"message",body:`${user.displayName}: ${message.kind==="file"?`файл ${message.fileName||""}`:(text||"Пересланное сообщение").slice(0,140)}`,createdAt:now
   }))
  ]);
  return Response.json({message,notified:recipients.length},{status:201});
 }catch(error){return Response.json({error:error instanceof Error?error.message:"Ошибка сообщения"},{status:500})}
}
