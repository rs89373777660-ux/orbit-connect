import { and, asc, desc, eq, gt, inArray, isNull, lt } from "drizzle-orm";
import { getDb } from "../../../db";
import { appSessions, chatMembers, chats, messageHidden, messageReceipts, messages, reactions, users } from "../../../db/schema";
import { getAppUser } from "../../server-auth";
import { release } from "../../release";

async function identity(request:Request){
 const user=await getAppUser(request);if(!user)return null;
 const db=getDb();
 await db.insert(users).values({id:user.userId,email:user.email,name:user.displayName,createdAt:Date.now()}).onConflictDoUpdate({target:users.id,set:{email:user.email,name:user.displayName}});
 const existing=await db.select().from(chatMembers).where(eq(chatMembers.userId,user.userId)).limit(1);
 if(!existing.length){
  const id=crypto.randomUUID(),now=Date.now();
  await db.batch([
   db.insert(chats).values({id,title:"Избранное",kind:"direct",createdBy:user.userId,createdAt:now}),
   db.insert(chatMembers).values({chatId:id,userId:user.userId,role:"owner",pinnedAt:now,joinedAt:now}),
   db.insert(messages).values({id:crypto.randomUUID(),chatId:id,senderId:user.userId,body:"Это ваш личный чат. Здесь можно хранить сообщения и файлы.",kind:"system",createdAt:now})
  ]);
 }
 await ensureCommunity(user.userId);
 return user;
}
async function member(chatId:string,userId:string){return (await getDb().select().from(chatMembers).where(and(eq(chatMembers.chatId,chatId),eq(chatMembers.userId,userId))).limit(1)).length>0}

const COMMUNITY_ID="orbit-connect-community";
const RELEASE_ID=`orbit-release-${release.build}`;
const CURRENT_RELEASE_NOTES=`${release.title}\n\n${release.notes.map(note=>`• ${note}`).join("\n")}\n\nВерсия Android: ${release.apk.version}`;
const RELEASE_NOTES=`Большое обновление Orbit Connect

🔐 Вход и безопасность
• Добавлен вход по номеру телефона и паролю.
• При регистрации нужно создать пароль: минимум 6 знаков, одна буква и одна цифра.
• Для старых аккаунтов доступна установка и восстановление пароля по SMS.
• Пароли защищены PBKDF2-хешированием с индивидуальной солью.
• Ошибки отправки и проверки кода теперь отображаются понятно.

📇 Контакты и пользователи
• Исправлена синхронизация больших телефонных справочников.
• Найденные зарегистрированные пользователи автоматически добавляются в контакты.
• Устранён каскад повторных запросов, вызывавший ошибки сервера.

📡 Официальный канал
• Создан канал «Orbit Connect · Новости».
• Все зарегистрированные пользователи добавляются в него автоматически.
• Публиковать новости может только владелец приложения.

💬 Сообщения
• Долгое нажатие открывает контекстное меню.
• Свайп вправо создаёт ответ на сообщение, свайп влево открывает отправку в другие сервисы.
• Работают редактирование, копирование, пересылка, системный обмен и удаление у себя или у всех.
• Отображаются статусы: отправлено, доставлено, прочитано и изменено.
• Исправлено переполнение карточки длинным названием файла.

📎 Фото, файлы и галерея
• Кнопка вложения разделена на «Фото из галереи» и «Файл с устройства».
• Фотографии показываются эскизом прямо в чате и скачиваются отдельной кнопкой.
• Файлы отображают безопасное имя, размер и ссылку скачивания.
• Добавлена личная галерея всех отправленных фотографий и медиа.

👤 Аватары
• Добавлен редактор кадрирования: масштаб и положение фотографии.
• Можно сохранять несколько аватаров, повторно выбирать и удалять их.
• Добавлено автоматическое улучшение света, цвета и выразительности изображения.

✦ ИИ, эмодзи и стикеры
• ИИ-кнопка стала компактной и обозначена одной звёздочкой.
• В меню доступны генерация текста, исправление ошибок и расстановка эмодзи.
• При включённой автокоррекции ручная проверка остаётся видимой, но становится неактивной.
• Классические и живые эмодзи разделены по категориям.
• Добавлены тематические стикеры Orbit.

🎨 Интерфейс и исправления
• Кнопки и поля получили овальную форму.
• Добавлено шесть цветовых тем приложения.
• Исправлен чёрный экран после включения автоматического исправления ошибок.
• Настройки профиля теперь сохраняются без потери данных и закрытия экрана.`;
async function ensureCommunity(userId:string){
 const db=getDb(),now=Date.now();
 const [registered]=await db.select({id:users.id}).from(users).where(eq(users.registrationCompleted,true)).orderBy(asc(users.createdAt)).limit(1);
 if(!registered)return;
 await db.insert(chats).values({id:COMMUNITY_ID,title:"Orbit Connect · Новости",kind:"channel",createdBy:registered.id,createdAt:now}).onConflictDoNothing();
 await db.insert(chatMembers).values({chatId:COMMUNITY_ID,userId,role:userId===registered.id?"owner":"member",pinnedAt:now,joinedAt:now}).onConflictDoNothing();
 await db.insert(messages).values({id:RELEASE_ID,chatId:COMMUNITY_ID,senderId:registered.id,kind:"system",body:CURRENT_RELEASE_NOTES,createdAt:new Date(release.releasedAt).getTime()}).onConflictDoNothing();
 if(userId!==registered.id)await db.insert(messageReceipts).values({messageId:RELEASE_ID,userId,deliveredAt:now}).onConflictDoNothing();
}

export async function GET(request:Request){
 try{
  const user=await identity(request);if(!user)return Response.json({error:"Требуется вход"},{status:401});
  const db=getDb(),url=new URL(request.url),chatId=url.searchParams.get("chatId"),after=Number(url.searchParams.get("after")||0),before=Number(url.searchParams.get("before")||0),limit=Math.max(20,Math.min(100,Number(url.searchParams.get("limit")||50)));
  if(chatId){
   if(!await member(chatId,user.userId))return Response.json({error:"Нет доступа"},{status:403});
   const condition=after?and(eq(messages.chatId,chatId),gt(messages.createdAt,after)):before?and(eq(messages.chatId,chatId),lt(messages.createdAt,before)):eq(messages.chatId,chatId);
   const selected=after?await db.select().from(messages).where(condition).orderBy(asc(messages.createdAt)).limit(limit):await db.select().from(messages).where(condition).orderBy(desc(messages.createdAt)).limit(limit);
   const allRows=after?selected:[...selected].reverse();
   const allIds=allRows.map(item=>item.id);
   const hidden=allIds.length?await db.select({messageId:messageHidden.messageId}).from(messageHidden).where(and(eq(messageHidden.userId,user.userId),inArray(messageHidden.messageId,allIds))):[];
   const hiddenIds=new Set(hidden.map(item=>item.messageId)),rows=allRows.filter(item=>!hiddenIds.has(item.id)),ids=rows.map(item=>item.id);
   const receiptRows=ids.length?await db.select().from(messageReceipts).where(inArray(messageReceipts.messageId,ids)):[];
   const rs=ids.length?await db.select().from(reactions).where(inArray(reactions.messageId,ids)):[];
   const members=await db.select({userId:chatMembers.userId}).from(chatMembers).where(eq(chatMembers.chatId,chatId));
   const enriched=rows.map(message=>{
    const receipts=receiptRows.filter(item=>item.messageId===message.id),recipientCount=Math.max(0,members.length-1);
    const deliveryStatus=recipientCount===0||receipts.length>=recipientCount&&receipts.every(item=>Boolean(item.readAt))?"read":receipts.length>=recipientCount&&receipts.every(item=>Boolean(item.deliveredAt))?"delivered":"sent";
    return {...message,body:message.deletedAt?null:message.body,fileName:message.deletedAt?null:message.fileName,deliveryStatus};
   });
   const [room]=await db.select().from(chats).where(eq(chats.id,chatId)).limit(1);
   return Response.json({messages:enriched,reactions:rs,serverTime:Date.now(),user,hasMore:allRows.length===limit,nextBefore:allRows[0]?.createdAt||null,chat:{kind:room?.kind,canPost:room?.kind!=="channel"||room.createdBy===user.userId}});
  }
  const memberships=await db.select().from(chatMembers).where(eq(chatMembers.userId,user.userId));
  const membershipMap=new Map(memberships.map(item=>[item.chatId,item]));
  const ids=memberships.map(item=>item.chatId);
  const roomRows=ids.length?await db.select().from(chats).where(inArray(chats.id,ids)).orderBy(desc(chats.createdAt)):[];
  const chatListUnsorted=await Promise.all(roomRows.map(async room=>{
   const membershipRow=membershipMap.get(room.id),unreadRows=await db.select({id:messageReceipts.messageId}).from(messageReceipts).innerJoin(messages,eq(messageReceipts.messageId,messages.id)).where(and(eq(messageReceipts.userId,user.userId),isNull(messageReceipts.readAt),eq(messages.chatId,room.id))).limit(999);
   const base={...room,pinnedAt:membershipRow?.pinnedAt||null,unreadCount:unreadRows.length,systemPinned:room.id===COMMUNITY_ID};
   if(room.kind==="channel")return {...base,avatarPreset:"📡",canPost:room.createdBy===user.userId,systemPinned:true};
   if(room.kind!=="direct")return {...base,avatarPreset:"👥"};
   const roomMembers=await db.select().from(chatMembers).where(eq(chatMembers.chatId,room.id));
   const other=roomMembers.find(item=>item.userId!==user.userId);
   if(!other)return {...base,avatarPreset:"⭐",systemPinned:true};
   const [person]=await db.select({id:users.id,name:users.name,avatarData:users.avatarData,avatarPreset:users.avatarPreset,privacyPhoto:users.privacyPhoto}).from(users).where(eq(users.id,other.userId)).limit(1);
   const [session]=await db.select({lastSeenAt:appSessions.lastSeenAt}).from(appSessions).where(eq(appSessions.userId,other.userId)).orderBy(desc(appSessions.lastSeenAt)).limit(1),lastSeenAt=session?.lastSeenAt||null;
   return person?{...base,userId:person.id,title:person.name,avatarPreset:person.avatarPreset,avatarUrl:person.avatarData&&person.privacyPhoto?`/api/avatar?id=${encodeURIComponent(person.id)}`:null,lastSeenAt,online:Boolean(lastSeenAt&&lastSeenAt>Date.now()-15_000)}:base;
  }));
  const chatList=chatListUnsorted.sort((a,b)=>{
   const systemRank=(item:typeof a)=>item.id===COMMUNITY_ID?2:item.systemPinned?1:0,diff=systemRank(b)-systemRank(a);if(diff)return diff;
   const pinDiff=Number(Boolean(b.pinnedAt))-Number(Boolean(a.pinnedAt));if(pinDiff)return pinDiff;
   if(a.pinnedAt&&b.pinnedAt&&a.pinnedAt!==b.pinnedAt)return b.pinnedAt-a.pinnedAt;
   return b.createdAt-a.createdAt;
  });
  const directory=await db.select({id:users.id,name:users.name,email:users.email}).from(users).orderBy(asc(users.name)).limit(100);
  return Response.json({user,chatList,memberships,directory});
 }catch(error){return Response.json({error:error instanceof Error?error.message:"Ошибка сервера"},{status:500})}
}

export async function POST(request:Request){
 try{
  const user=await identity(request);if(!user)return Response.json({error:"Требуется вход"},{status:401});
  const p=await request.json() as {action?:string;chatId?:string;title?:string;body?:string;memberIds?:string[];replyTo?:string;messageId?:string;emoji?:string};
  const db=getDb();
  if(p.action==="pin-chat"){
   if(!p.chatId||!await member(p.chatId,user.userId))return Response.json({error:"Чат не найден"},{status:404});
   const [room]=await db.select().from(chats).where(eq(chats.id,p.chatId)).limit(1),roomMembers=await db.select().from(chatMembers).where(eq(chatMembers.chatId,p.chatId));
   const systemPinned=p.chatId===COMMUNITY_ID||room?.kind==="direct"&&room.createdBy===user.userId&&roomMembers.length===1;
   if(systemPinned)return Response.json({ok:true,systemPinned:true});
   const membershipRow=roomMembers.find(item=>item.userId===user.userId),pinnedAt=membershipRow?.pinnedAt?null:Date.now();
   await db.update(chatMembers).set({pinnedAt}).where(and(eq(chatMembers.chatId,p.chatId),eq(chatMembers.userId,user.userId)));
   return Response.json({ok:true,pinnedAt});
  }
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
