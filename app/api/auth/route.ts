import { and, eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { phoneVerifications, users } from "../../../db/schema";
import { hashPhone, normalizePhone, sha256 } from "../../profile-utils";
import { createGuest, createSessionForUser, getAppUser, hashPassword, verifyPassword } from "../../server-auth";

const cookie=(token:string)=>`orbit_session=${encodeURIComponent(token)}; Path=/; Max-Age=31536000; HttpOnly; Secure; SameSite=Lax`;

async function registeredUser(phone:string){
 const phoneHash=await hashPhone(phone);if(!phoneHash)return null;
 return (await getDb().select().from(users).where(and(eq(users.phoneHash,phoneHash),eq(users.registrationCompleted,true))).limit(1))[0]||null;
}

async function issueCode(phoneValue:string,purpose:"login"|"password"){
 const phone=normalizePhone(phoneValue),phoneHash=await hashPhone(phone);if(!phoneHash)return Response.json({error:"Введите корректный номер"},{status:400});
 const user=await registeredUser(phone);if(!user)return Response.json({error:"Аккаунт с таким номером не найден"},{status:404});
 const random=new Uint32Array(1);crypto.getRandomValues(random);const code=String(100000+random[0]%900000),now=Date.now(),codeHash=await sha256(`${user.id}:${phone}:${code}`),db=getDb();
 await db.insert(phoneVerifications).values({userId:user.id,phone,phoneHash,codeHash,expiresAt:now+600000,attempts:0,createdAt:now}).onConflictDoUpdate({target:phoneVerifications.userId,set:{phone,phoneHash,codeHash,expiresAt:now+600000,attempts:0,createdAt:now}});
 if(process.env.SMS_PROVIDER_URL){const sent=await fetch(process.env.SMS_PROVIDER_URL,{method:"POST",headers:{"content-type":"application/json",...(process.env.SMS_PROVIDER_TOKEN?{"authorization":`Bearer ${process.env.SMS_PROVIDER_TOKEN}`}:{})},body:JSON.stringify({phone,code,message:purpose==="login"?`Orbit Connect: код для входа ${code}`:`Orbit Connect: код для установки пароля ${code}`})});if(!sent.ok)return Response.json({error:"Сервис SMS временно недоступен"},{status:502})}
 return Response.json({ok:true,demoCode:process.env.SMS_PROVIDER_URL?undefined:code});
}

export async function POST(request:Request){
 try{
  const body=await request.json().catch(()=>({})) as {action?:string;name?:string;phone?:string;password?:string;code?:string},db=getDb(),phone=normalizePhone(body.phone||"");
  if(body.action==="login"){
   const user=await registeredUser(phone);if(!user||!await verifyPassword(body.password||"",user.passwordHash))return Response.json({error:user&&!user.passwordHash?"Для старого аккаунта войдите по SMS-коду":"Неверный номер или пароль"},{status:401});
   const token=await createSessionForUser(user.id);return Response.json({token,user:{userId:user.id,email:user.email,displayName:user.name}},{headers:{"set-cookie":cookie(token)}});
  }
  if(body.action==="request-login-code")return issueCode(phone,"login");
  if(body.action==="request-password-code")return issueCode(phone,"password");
  if(body.action==="login-code"){
   const user=await registeredUser(phone),verification=user?(await db.select().from(phoneVerifications).where(eq(phoneVerifications.userId,user.id)).limit(1))[0]:null;
   if(!user||!verification||verification.expiresAt<Date.now()||verification.attempts>=8)return Response.json({error:"Код истёк. Запросите новый"},{status:400});
   const valid=await sha256(`${user.id}:${phone}:${body.code||""}`)===verification.codeHash;
   if(!valid){await db.update(phoneVerifications).set({attempts:verification.attempts+1}).where(eq(phoneVerifications.userId,user.id));return Response.json({error:"Неверный SMS-код"},{status:400})}
   await db.delete(phoneVerifications).where(eq(phoneVerifications.userId,user.id));const token=await createSessionForUser(user.id);return Response.json({token,user:{userId:user.id,email:user.email,displayName:user.name}},{headers:{"set-cookie":cookie(token)}});
  }
  if(body.action==="reset-password"){
   const phoneHash=await hashPhone(phone);if(!phoneHash)return Response.json({error:"Некорректный номер"},{status:400});const [user]=await db.select().from(users).where(eq(users.phoneHash,phoneHash)).limit(1),[verification]=user?await db.select().from(phoneVerifications).where(eq(phoneVerifications.userId,user.id)).limit(1):[];
   if(!user||!verification||verification.expiresAt<Date.now()||await sha256(`${user.id}:${phone}:${body.code||""}`)!==verification.codeHash)return Response.json({error:"Неверный или истёкший код"},{status:400});const password=body.password||"";if(password.length<6||!/[\p{L}]/u.test(password)||!/[0-9]/.test(password))return Response.json({error:"Пароль: минимум 6 знаков, буква и цифра"},{status:400});
   await db.batch([db.update(users).set({passwordHash:await hashPassword(password)}).where(eq(users.id,user.id)),db.delete(phoneVerifications).where(eq(phoneVerifications.userId,user.id))]);const token=await createSessionForUser(user.id);return Response.json({token},{headers:{"set-cookie":cookie(token)}});
  }
  const session=await createGuest(body.name);return Response.json(session,{status:201,headers:{"set-cookie":cookie(session.token)}});
 }catch(error){return Response.json({error:error instanceof Error?error.message:"Ошибка регистрации"},{status:500})}
}

export async function GET(request:Request){const user=await getAppUser(request);return user?Response.json({user}):Response.json({error:"Сессия недействительна"},{status:401})}
