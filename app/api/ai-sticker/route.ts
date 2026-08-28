import { env } from "cloudflare:workers";
import { getAppUser } from "../../server-auth";

const idPattern=/^[0-9a-f-]{36}$/i;

export async function POST(request:Request){
 const user=await getAppUser(request);if(!user)return Response.json({error:"Требуется вход"},{status:401});
 const body=await request.json().catch(()=>({})) as {prompt?:string},prompt=(body.prompt||"").trim().slice(0,400),key=process.env.OPENAI_API_KEY;
 if(!prompt)return Response.json({error:"Опишите будущий стикер"},{status:400});
 if(!key)return Response.json({error:"Генератор стикеров пока не подключён к ИИ"},{status:503});
 try{
  const response=await fetch("https://api.openai.com/v1/images/generations",{method:"POST",headers:{authorization:`Bearer ${key}`,"content-type":"application/json"},body:JSON.stringify({model:process.env.OPENAI_IMAGE_MODEL||"gpt-image-2",prompt:`Create one expressive messenger sticker: ${prompt}. Orbit Connect visual language, bold clean silhouette, dark green and electric lime accents, friendly contemporary character design, centered subject, no frame, no watermark, no small text, transparent background.`,size:"1024x1024",quality:"low",background:"transparent",output_format:"png"})});
  const result=await response.json().catch(()=>({})) as {data?:Array<{b64_json?:string}>;error?:{message?:string}};
  if(!response.ok||!result.data?.[0]?.b64_json)throw new Error(result.error?.message||"ИИ не вернул изображение");
  const binary=atob(result.data[0].b64_json),bytes=new Uint8Array(binary.length);for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);
  const id=crypto.randomUUID(),objectKey=`ai-stickers/${user.userId}/${id}.png`;
  await env.FILES.put(objectKey,bytes,{httpMetadata:{contentType:"image/png"},customMetadata:{owner:user.userId}});
  return Response.json({url:`/api/ai-sticker?id=${encodeURIComponent(id)}&owner=${encodeURIComponent(user.userId)}`});
 }catch(error){return Response.json({error:error instanceof Error?`Не удалось создать стикер: ${error.message}`:"Не удалось создать стикер"},{status:502})}
}

export async function GET(request:Request){
 const url=new URL(request.url),id=url.searchParams.get("id")||"",owner=url.searchParams.get("owner")||"";
 if(!idPattern.test(id)||!idPattern.test(owner))return new Response("Not found",{status:404});
 const object=await env.FILES.get(`ai-stickers/${owner}/${id}.png`);if(!object)return new Response("Not found",{status:404});
 return new Response(object.body,{headers:{"content-type":"image/png","cache-control":"public, max-age=31536000, immutable"}});
}
