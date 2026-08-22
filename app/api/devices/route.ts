import { and, eq, ne } from "drizzle-orm";
import { getDb } from "../../../db";
import { appSessions } from "../../../db/schema";
import { getAppUser, requestSessionHash } from "../../server-auth";

export async function GET(request:Request){
 const user=await getAppUser(request),current=await requestSessionHash(request);if(!user)return Response.json({error:"Не авторизован"},{status:401});
 const rows=await getDb().select().from(appSessions).where(eq(appSessions.userId,user.userId));
 return Response.json({devices:rows.sort((a,b)=>b.lastSeenAt-a.lastSeenAt).map(item=>({id:item.tokenHash,current:item.tokenHash===current,deviceName:item.deviceName||"Устройство Orbit",platform:item.platform||"unknown",browser:item.browser,createdAt:item.createdAt,lastSeenAt:item.lastSeenAt}))},{headers:{"cache-control":"no-store"}});
}

export async function POST(request:Request){
 const user=await getAppUser(request),current=await requestSessionHash(request);if(!user||!current)return Response.json({error:"Не авторизован"},{status:401});
 const body=await request.json().catch(()=>({})) as {action?:string;id?:string},db=getDb();
 if(body.action==="terminate-all"){await db.delete(appSessions).where(and(eq(appSessions.userId,user.userId),ne(appSessions.tokenHash,current)));return Response.json({ok:true})}
 if(body.action==="terminate"&&body.id){await db.delete(appSessions).where(and(eq(appSessions.userId,user.userId),eq(appSessions.tokenHash,body.id)));return Response.json({ok:true,current:body.id===current})}
 return Response.json({error:"Неизвестное действие"},{status:400});
}
