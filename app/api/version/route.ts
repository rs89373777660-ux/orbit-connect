import { release } from "../../release";

export async function GET(request:Request){
 const current=new URL(request.url).searchParams.get("current")||"";
 return Response.json({...release,updateAvailable:Boolean(current&&current!==release.build)},{headers:{"cache-control":"no-store"}});
}
