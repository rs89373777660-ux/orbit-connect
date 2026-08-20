import { and, eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { chatMembers, messages, notifications } from "../../../db/schema";
import { getAppUser } from "../../server-auth";

export async function POST(request:Request){
 try{
  const user=await getAppUser(request);
  if(!user)return Response.json({error:"Требуется вход"},{status:401});
  const body=await request.json() as {chatId?:string;body?:string;replyTo?:string};
  const chatId=body.chatId||"",text=body.body?.trim().slice(0,10000)||"";
  if(!chatId||!text)return Response.json({error:"Пустое сообщение"},{status:400});
  const db=getDb();
  const [membership]=await db.select().from(chatMembers).where(and(eq(chatMembers.chatId,chatId),eq(chatMembers.userId,user.userId))).limit(1);
  if(!membership)return Response.json({error:"Нет доступа к чату"},{status:403});
  const now=Date.now(),message={id:crypto.randomUUID(),chatId,senderId:user.userId,body:text,kind:"text" as const,replyTo:body.replyTo||null,createdAt:now};
  const members=await db.select({userId:chatMembers.userId}).from(chatMembers).where(eq(chatMembers.chatId,chatId));
  const recipients=members.filter(item=>item.userId!==user.userId);
  await db.batch([
   db.insert(messages).values(message),
   ...recipients.map(recipient=>db.insert(notifications).values({
    id:crypto.randomUUID(),userId:recipient.userId,actorId:user.userId,entityId:chatId,
    kind:"message",body:`${user.displayName}: ${text.slice(0,140)}`,createdAt:now
   }))
  ]);
  return Response.json({message,notified:recipients.length},{status:201});
 }catch(error){return Response.json({error:error instanceof Error?error.message:"Ошибка отправки"},{status:500})}
}
