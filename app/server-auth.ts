import { eq } from "drizzle-orm";
import { getDb } from "../db";
import { appSessions, users } from "../db/schema";
import { ensureProfileIdentity } from "./profile-utils";

export type AppUser={userId:string;email:string;displayName:string};
export async function hashToken(token:string){const bytes=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(token));return [...new Uint8Array(bytes)].map(x=>x.toString(16).padStart(2,"0")).join("")}
function bytesHex(bytes:Uint8Array){return [...bytes].map(value=>value.toString(16).padStart(2,"0")).join("")}
export async function hashPassword(password:string){const iterations=100000,salt=crypto.getRandomValues(new Uint8Array(16)),key=await crypto.subtle.importKey("raw",new TextEncoder().encode(password),"PBKDF2",false,["deriveBits"]),bits=await crypto.subtle.deriveBits({name:"PBKDF2",hash:"SHA-256",salt,iterations},key,256);return `$pbkdf2$${iterations}$${bytesHex(salt)}$${bytesHex(new Uint8Array(bits))}`}
export async function verifyPassword(password:string,stored:string|null){const parts=(stored||"").split("$");if(parts.length!==5||parts[1]!=="pbkdf2")return false;const iterations=Number(parts[2]),salt=Uint8Array.from(parts[3].match(/.{2}/g)||[],value=>parseInt(value,16)),key=await crypto.subtle.importKey("raw",new TextEncoder().encode(password),"PBKDF2",false,["deriveBits"]),bits=await crypto.subtle.deriveBits({name:"PBKDF2",hash:"SHA-256",salt,iterations},key,256),actual=bytesHex(new Uint8Array(bits));if(actual.length!==parts[4].length)return false;let diff=0;for(let i=0;i<actual.length;i++)diff|=actual.charCodeAt(i)^parts[4].charCodeAt(i);return diff===0}
export type SessionMeta={deviceId?:string;deviceName?:string;platform?:string;browser?:string};
export async function createSessionForUser(userId:string,meta:SessionMeta={}){const token=`${crypto.randomUUID()}${crypto.randomUUID()}`,tokenHash=await hashToken(token),now=Date.now();await getDb().insert(appSessions).values({tokenHash,userId,deviceId:meta.deviceId||crypto.randomUUID(),deviceName:meta.deviceName||"Orbit Connect",platform:meta.platform||"unknown",browser:meta.browser||null,createdAt:now,lastSeenAt:now});return token}
export function requestSessionToken(request:Request){const authorization=request.headers.get("authorization"),cookieToken=request.headers.get("cookie")?.split(";").map(value=>value.trim()).find(value=>value.startsWith("orbit_session="))?.slice("orbit_session=".length);return authorization?.startsWith("Bearer ")?authorization.slice(7).trim():decodeURIComponent(cookieToken||"")}
export async function requestSessionHash(request:Request){const token=requestSessionToken(request);return token.length>=32?hashToken(token):null}

export async function getAppUser(request:Request):Promise<AppUser|null>{
 const token=requestSessionToken(request);
 if(token.length>=32){
  const tokenHash=await hashToken(token);const db=getDb();
  const [session]=await db.select().from(appSessions).where(eq(appSessions.tokenHash,tokenHash)).limit(1);
  if(session){
   const [user]=await db.select().from(users).where(eq(users.id,session.userId)).limit(1);
   if(user){
    await db.update(appSessions).set({lastSeenAt:Date.now()}).where(eq(appSessions.tokenHash,tokenHash));
    await ensureProfileIdentity(user.id);
    return {userId:user.id,email:user.email,displayName:user.name};
   }
  }
 }
 return null;
}

export async function createGuest(name?:string){
 const token=`${crypto.randomUUID()}${crypto.randomUUID()}`;const tokenHash=await hashToken(token);const userId=crypto.randomUUID();const now=Date.now();const displayName=name?.trim().slice(0,50)||`Гость ${userId.slice(0,4).toUpperCase()}`;const db=getDb();
 const publicId=`$${userId.replace(/-/g,"").slice(0,10)}`;
 await db.batch([db.insert(users).values({id:userId,email:`${userId}@guest.orbit`,name:displayName,publicId,handle:publicId,createdAt:now}),db.insert(appSessions).values({tokenHash,userId,createdAt:now,lastSeenAt:now})]);
 return {token,user:{userId,email:`${userId}@guest.orbit`,displayName}};
}
