import { and, eq, lt } from "drizzle-orm";
import { getDb } from "../../../db";
import { devicePairings } from "../../../db/schema";
import { createSessionForUser, getAppUser, hashToken } from "../../server-auth";

const cookie=(token:string)=>`orbit_session=${encodeURIComponent(token)}; Path=/; Max-Age=31536000; HttpOnly; Secure; SameSite=Lax`;
const noStore={"cache-control":"no-store, max-age=0"};
function clientInfo(request:Request){
 const ua=request.headers.get("user-agent")||"Browser";
 const platform=/Windows/i.test(ua)?"windows":/Macintosh|Mac OS/i.test(ua)?"macos":/Linux/i.test(ua)?"linux":/Android/i.test(ua)?"android":/iPhone|iPad/i.test(ua)?"ios":"browser";
 const browser=/Edg/i.test(ua)?"Edge":/Firefox/i.test(ua)?"Firefox":/Chrome/i.test(ua)?"Chrome":/Safari/i.test(ua)?"Safari":"Браузер";
 return {platform,browser,deviceName:`${browser} · ${platform==="macos"?"macOS":platform==="windows"?"Windows":platform==="linux"?"Linux":platform}`};
}

export async function POST(request:Request){
 try{
  const body=await request.json().catch(()=>({})) as {action?:string;code?:string;id?:string;secret?:string},db=getDb(),now=Date.now();
  await db.delete(devicePairings).where(lt(devicePairings.expiresAt,now));
  if(body.action==="create"){
   const id=crypto.randomUUID(),secret=`${crypto.randomUUID()}${crypto.randomUUID()}`,info=clientInfo(request);
   await db.insert(devicePairings).values({id,secretHash:await hashToken(secret),deviceName:info.deviceName,platform:info.platform,browser:info.browser,status:"pending",createdAt:now,expiresAt:now+180000});
   return Response.json({id,secret,code:`orbit-connect://pair/${id}/${secret}`,expiresAt:now+180000},{headers:noStore});
  }
  if(body.action==="approve"){
   const user=await getAppUser(request);if(!user)return Response.json({error:"Войдите в приложение"},{status:401});
   const match=(body.code||"").match(/orbit-connect:\/\/pair\/([^/]+)\/([^/?#]+)/);if(!match)return Response.json({error:"Это не QR-код Orbit"},{status:400});
   const [pairing]=await db.select().from(devicePairings).where(and(eq(devicePairings.id,match[1]),eq(devicePairings.secretHash,await hashToken(match[2])))).limit(1);
   if(!pairing||pairing.expiresAt<now||pairing.status!=="pending")return Response.json({error:"QR-код истёк или уже использован"},{status:410});
   const token=await createSessionForUser(user.userId,{deviceName:pairing.deviceName,platform:pairing.platform,browser:pairing.browser||undefined});
   await db.update(devicePairings).set({userId:user.userId,sessionToken:token,status:"approved",expiresAt:now+60000}).where(eq(devicePairings.id,pairing.id));
   return Response.json({ok:true,deviceName:pairing.deviceName},{headers:noStore});
  }
  if(body.action==="status"){
   if(!body.id||!body.secret)return Response.json({error:"Нет данных QR"},{status:400});
   const [pairing]=await db.select().from(devicePairings).where(and(eq(devicePairings.id,body.id),eq(devicePairings.secretHash,await hashToken(body.secret)))).limit(1);
   if(!pairing||pairing.expiresAt<now)return Response.json({status:"expired"},{status:410,headers:noStore});
   if(pairing.status!=="approved"||!pairing.sessionToken)return Response.json({status:"pending",expiresAt:pairing.expiresAt},{headers:noStore});
   const token=pairing.sessionToken;await db.delete(devicePairings).where(eq(devicePairings.id,pairing.id));
   return Response.json({status:"approved",token},{headers:{...noStore,"set-cookie":cookie(token)}});
  }
  return Response.json({error:"Неизвестное действие"},{status:400});
 }catch(error){return Response.json({error:error instanceof Error?error.message:"Ошибка QR-входа"},{status:500,headers:noStore})}
}
