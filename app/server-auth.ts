import { eq } from "drizzle-orm";
import { getDb } from "../db";
import { appSessions, users } from "../db/schema";
import { ensureProfileIdentity } from "./profile-utils";
import { getChatGPTUser } from "./chatgpt-auth";

export type AppUser={userId:string;email:string;displayName:string};
async function hashToken(token:string){const bytes=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(token));return [...new Uint8Array(bytes)].map(x=>x.toString(16).padStart(2,"0")).join("")}
function bytesHex(bytes:Uint8Array){return [...bytes].map(value=>value.toString(16).padStart(2,"0")).join("")}
export async function hashPassword(password:string){const iterations=100000,salt=crypto.getRandomValues(new Uint8Array(16)),key=await crypto.subtle.importKey("raw",new TextEncoder().encode(password),"PBKDF2",false,["deriveBits"]),bits=await crypto.subtle.deriveBits({name:"PBKDF2",hash:"SHA-256",salt,iterations},key,256);return `$pbkdf2$${iterations}$${bytesHex(salt)}$${bytesHex(new Uint8Array(bits))}`}
export async function verifyPassword(password:string,stored:string|null){const parts=(stored||"").split("$");if(parts.length!==5||parts[1]!=="pbkdf2")return false;const iterations=Number(parts[2]),salt=Uint8Array.from(parts[3].match(/.{2}/g)||[],value=>parseInt(value,16)),key=await crypto.subtle.importKey("raw",new TextEncoder().encode(password),"PBKDF2",false,["deriveBits"]),bits=await crypto.subtle.deriveBits({name:"PBKDF2",hash:"SHA-256",salt,iterations},key,256),actual=bytesHex(new Uint8Array(bits));if(actual.length!==parts[4].length)return false;let diff=0;for(let i=0;i<actual.length;i++)diff|=actual.charCodeAt(i)^parts[4].charCodeAt(i);return diff===0}
export async function createSessionForUser(userId:string){const token=`${crypto.randomUUID()}${crypto.randomUUID()}`,tokenHash=await hashToken(token),now=Date.now();await getDb().insert(appSessions).values({tokenHash,userId,createdAt:now,lastSeenAt:now});return token}

export async function getAppUser(request:Request):Promise<AppUser|null>{
 const chatgpt=await getChatGPTUser();
 if(chatgpt)return {userId:chatgpt.userId,email:chatgpt.email,displayName:chatgpt.displayName};
 const authorization=request.headers.get("authorization");
 const cookieToken=request.headers.get("cookie")?.split(";").map(value=>value.trim()).find(value=>value.startsWith("orbit_session="))?.slice("orbit_session=".length);
 const token=authorization?.startsWith("Bearer ")?authorization.slice(7).trim():decodeURIComponent(cookieToken||"");if(token.length<32)return null;
 const tokenHash=await hashToken(token);const db=getDb();
 const [session]=await db.select().from(appSessions).where(eq(appSessions.tokenHash,tokenHash)).limit(1);if(!session)return null;
 const [user]=await db.select().from(users).where(eq(users.id,session.userId)).limit(1);if(!user)return null;
 await db.update(appSessions).set({lastSeenAt:Date.now()}).where(eq(appSessions.tokenHash,tokenHash));
 await ensureProfileIdentity(user.id);
 return {userId:user.id,email:user.email,displayName:user.name};
}

export async function createGuest(name?:string){
 const token=`${crypto.randomUUID()}${crypto.randomUUID()}`;const tokenHash=await hashToken(token);const userId=crypto.randomUUID();const now=Date.now();const displayName=name?.trim().slice(0,50)||`Гость ${userId.slice(0,4).toUpperCase()}`;const db=getDb();
 const publicId=`$${userId.replace(/-/g,"").slice(0,10)}`;
 await db.batch([db.insert(users).values({id:userId,email:`${userId}@guest.orbit`,name:displayName,publicId,handle:publicId,createdAt:now}),db.insert(appSessions).values({tokenHash,userId,createdAt:now,lastSeenAt:now})]);
 return {token,user:{userId,email:`${userId}@guest.orbit`,displayName}};
}
