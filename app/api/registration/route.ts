import { and, eq, ne } from "drizzle-orm";
import { getDb } from "../../../db";
import { phoneVerifications, users } from "../../../db/schema";
import { getAppUser } from "../../server-auth";
import { ensureProfileIdentity, hashPhone, normalizeHandle, normalizePhone, parseSocials, publicProfile, sha256 } from "../../profile-utils";
import { hashPassword } from "../../server-auth";

async function current(request:Request){
 const auth=await getAppUser(request);
 if(!auth)return null;
 await getDb().insert(users).values({id:auth.userId,email:auth.email,name:auth.displayName,createdAt:Date.now()}).onConflictDoNothing();
 return ensureProfileIdentity(auth.userId);
}

export async function GET(request:Request){
 const user=await current(request);
 return user?Response.json({profile:publicProfile(user,true)}):Response.json({error:"Требуется вход"},{status:401});
}

export async function POST(request:Request){
 try{
  const user=await current(request);
  if(!user)return Response.json({error:"Требуется вход"},{status:401});
  const body=await request.json() as {
   action?:string;phone?:string;code?:string;name?:string;email?:string;
   birthYear?:number|null;handle?:string;socials?:Record<string,string>;password?:string
  };
  const db=getDb();

  if(body.action==="request-code"){
   const phone=normalizePhone(body.phone||"");
   const phoneHash=await hashPhone(phone);
   if(!phoneHash)return Response.json({error:"Введите корректный номер телефона"},{status:400});
   const [busy]=await db.select({id:users.id}).from(users).where(and(eq(users.phoneHash,phoneHash),ne(users.id,user.id))).limit(1);
   if(busy)return Response.json({error:"Этот номер уже зарегистрирован"},{status:409});
   const random=new Uint32Array(1);crypto.getRandomValues(random);
   const code=String(100000+(random[0]%900000));
   const codeHash=await sha256(`${user.id}:${phone}:${code}`);
   const now=Date.now();
   await db.insert(phoneVerifications).values({userId:user.id,phone,phoneHash,codeHash,expiresAt:now+10*60_000,attempts:0,createdAt:now})
    .onConflictDoUpdate({target:phoneVerifications.userId,set:{phone,phoneHash,codeHash,expiresAt:now+10*60_000,attempts:0,createdAt:now}});
   const smsUrl=process.env.SMS_PROVIDER_URL;
   if(smsUrl){
    const response=await fetch(smsUrl,{method:"POST",headers:{"content-type":"application/json",...(process.env.SMS_PROVIDER_TOKEN?{"authorization":`Bearer ${process.env.SMS_PROVIDER_TOKEN}`}:{})},body:JSON.stringify({phone,code,message:`Orbit Connect: код подтверждения ${code}`})});
    if(!response.ok)return Response.json({error:"Сервис SMS временно недоступен"},{status:502});
    return Response.json({ok:true,provider:"sms"});
   }
   return Response.json({ok:true,provider:"demo",demoCode:code});
  }

  if(body.action==="verify-code"){
   const [verification]=await db.select().from(phoneVerifications).where(eq(phoneVerifications.userId,user.id)).limit(1);
   if(!verification||verification.expiresAt<Date.now())return Response.json({error:"Код истёк. Запросите новый"},{status:400});
   if(verification.attempts>=5)return Response.json({error:"Слишком много попыток. Запросите новый код"},{status:429});
   const codeHash=await sha256(`${user.id}:${verification.phone}:${body.code||""}`);
   if(codeHash!==verification.codeHash){
    await db.update(phoneVerifications).set({attempts:verification.attempts+1}).where(eq(phoneVerifications.userId,user.id));
    return Response.json({error:"Неверный код"},{status:400});
   }
   await db.batch([
    db.update(users).set({phone:verification.phone,phoneHash:verification.phoneHash,phoneLast4:verification.phone.slice(-4),phoneVerifiedAt:Date.now()}).where(eq(users.id,user.id)),
    db.delete(phoneVerifications).where(eq(phoneVerifications.userId,user.id))
   ]);
   return Response.json({ok:true,last4:verification.phone.slice(-4)});
  }

  if(body.action==="complete"){
   const [fresh]=await db.select().from(users).where(eq(users.id,user.id)).limit(1);
   if(!fresh?.phoneVerifiedAt)return Response.json({error:"Сначала подтвердите номер телефона"},{status:400});
   const name=(body.name||"").trim().replace(/\s+/g," ").slice(0,100);
   const email=(body.email||"").trim().toLowerCase().slice(0,160);
   const handle=normalizeHandle(body.handle||fresh.handle||fresh.publicId||"");
   const year=body.birthYear?Number(body.birthYear):null;
   if(name.length<3)return Response.json({error:"Укажите ФИО"},{status:400});
   if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return Response.json({error:"Укажите корректный email"},{status:400});
   if(!handle)return Response.json({error:"Никнейм: минимум 3 символа после $"},{status:400});
   const password=body.password||"";
   if(password.length<6||!/[\p{L}]/u.test(password)||!/[0-9]/.test(password))return Response.json({error:"Пароль: минимум 6 знаков, хотя бы одна буква и одна цифра"},{status:400});
   if(year&&(year<1900||year>new Date().getFullYear()-10))return Response.json({error:"Проверьте год рождения"},{status:400});
   const [taken]=await db.select({id:users.id}).from(users).where(and(eq(users.handle,handle),ne(users.id,user.id))).limit(1);
   if(taken)return Response.json({error:"Такой никнейм уже занят"},{status:409});
   const socials=Object.fromEntries(Object.entries(body.socials||{}).map(([key,value])=>[key.slice(0,30),String(value).trim().slice(0,180)]).filter(([,value])=>value).slice(0,8));
   await db.update(users).set({name,email,handle,birthYear:year,socialsJson:JSON.stringify(socials),passwordHash:await hashPassword(password),registrationCompleted:true}).where(eq(users.id,user.id));
   const [updated]=await db.select().from(users).where(eq(users.id,user.id)).limit(1);
   return Response.json({ok:true,profile:publicProfile(updated,true)});
  }

  return Response.json({error:"Неизвестное действие"},{status:400});
 }catch(error){
  return Response.json({error:error instanceof Error?error.message:"Ошибка регистрации"},{status:500});
 }
}
