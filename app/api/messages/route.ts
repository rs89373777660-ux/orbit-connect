import { and, eq, inArray } from "drizzle-orm";
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
  const body=await request.json() as {action?:string;chatId?:string;targetChatId?:string;messageId?:string;messageIds?:string[];body?:string;replyTo?:string;scope?:"me"|"all";kind?:"text"|"sticker"|"location"|"poll"|"checklist"|"contact";optionIndex?:number;itemIndex?:number};
  const action=body.action||"send",db=getDb();

  if(action==="poll-vote"||action==="checklist-toggle"){
   if(!body.messageId)return Response.json({error:"Сообщение не выбрано"},{status:400});
   const [message]=await db.select().from(messages).where(eq(messages.id,body.messageId)).limit(1);
   if(!message||message.deletedAt||!await membership(message.chatId,user.userId))return Response.json({error:"Сообщение недоступно"},{status:404});
   try{
    const payload=JSON.parse(message.body||"{}") as {question?:string;options?:Array<{text:string;voters?:string[]}>;items?:Array<{text:string;checkedBy?:string[]}>};
    if(action==="poll-vote"){
     if(message.kind!=="poll"||!Number.isInteger(body.optionIndex)||!payload.options?.[body.optionIndex!])return Response.json({error:"Вариант опроса не найден"},{status:400});
     const selected=payload.options[body.optionIndex!].voters?.includes(user.userId);
     payload.options=payload.options.map((option,index)=>({...option,voters:(option.voters||[]).filter(id=>id!==user.userId).concat(index===body.optionIndex&&!selected?[user.userId]:[])}));
    }else{
     if(message.kind!=="checklist"||!Number.isInteger(body.itemIndex)||!payload.items?.[body.itemIndex!])return Response.json({error:"Пункт списка не найден"},{status:400});
     const item=payload.items[body.itemIndex!],checked=item.checkedBy?.includes(user.userId);
     payload.items[body.itemIndex!]={...item,checkedBy:checked?(item.checkedBy||[]).filter(id=>id!==user.userId):[...(item.checkedBy||[]),user.userId]};
    }
    await db.update(messages).set({body:JSON.stringify(payload)}).where(eq(messages.id,message.id));
    return Response.json({ok:true});
   }catch{return Response.json({error:"Данные сообщения повреждены"},{status:400})}
  }

  if(action==="mark-read"){
   const ids=[...new Set((body.messageIds||[]).filter(Boolean))].slice(0,200);
   if(!body.chatId||!ids.length||!await membership(body.chatId,user.userId))return Response.json({error:"Нет доступа к сообщениям"},{status:403});
   const roomMessages=await db.select({id:messages.id}).from(messages).where(and(eq(messages.chatId,body.chatId),inArray(messages.id,ids))),allowed=roomMessages.map(item=>item.id);
   if(allowed.length)await db.update(messageReceipts).set({readAt:Date.now()}).where(and(eq(messageReceipts.userId,user.userId),inArray(messageReceipts.messageId,allowed)));
   return Response.json({ok:true,read:allowed.length});
  }

  if(action==="mark-chat-read"){
   if(!body.chatId||!await membership(body.chatId,user.userId))return Response.json({error:"Нет доступа к чату"},{status:403});
   const roomMessages=await db.select({id:messages.id}).from(messages).where(eq(messages.chatId,body.chatId)).limit(500),ids=roomMessages.map(item=>item.id);
   if(ids.length)await db.update(messageReceipts).set({readAt:Date.now()}).where(and(eq(messageReceipts.userId,user.userId),inArray(messageReceipts.messageId,ids)));
   return Response.json({ok:true,read:ids.length});
  }

  if(action==="edit"){
   const text=body.body?.trim().slice(0,10000)||"";
   if(!body.messageId||!text)return Response.json({error:"Пустое сообщение"},{status:400});
   const [message]=await db.select().from(messages).where(eq(messages.id,body.messageId)).limit(1);
   if(!message||message.senderId!==user.userId||message.deletedAt)return Response.json({error:"Сообщение нельзя изменить"},{status:403});
   if(!["text","message"].includes(message.kind))return Response.json({error:"Можно изменить только текст"},{status:400});
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
  const requestedKind=body.kind||"text";
  if(action!=="forward"&&["location","poll","checklist","contact"].includes(requestedKind)){
   try{JSON.parse(text)}catch{return Response.json({error:"Некорректное вложение"},{status:400})}
  }
  const now=Date.now(),message={
   id:crypto.randomUUID(),chatId,senderId:user.userId,body:text||null,
   kind:(source?.kind||(requestedKind==="sticker"&&/^\/emoji\/orbit-[1-9]\.webp$/.test(text)?"sticker":requestedKind)) as "text"|"file"|"photo"|"sticker"|"voice"|"system"|"location"|"poll"|"checklist"|"contact",
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
    kind:message.kind==="file"?"file":"message",body:`${user.displayName}: ${message.kind==="file"?`файл ${message.fileName||""}`:message.kind==="poll"?"опрос":message.kind==="checklist"?"список задач":message.kind==="location"?"геопозиция":message.kind==="contact"?"контакт":(text||"Пересланное сообщение").slice(0,140)}`,createdAt:now
   }))
  ]);
  return Response.json({message,notified:recipients.length},{status:201});
 }catch(error){return Response.json({error:error instanceof Error?error.message:"Ошибка сообщения"},{status:500})}
}
