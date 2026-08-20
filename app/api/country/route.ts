const SUPPORTED=new Set(["RU","BY","KZ","UA","AM","AZ","GE","KG","UZ","TJ","MD","TR","IL","DE","FR","IT","ES","GB","US","CA","AE","IN","CN","JP","KR","BR","AU"]);

export async function GET(request:Request){
 const headers=request.headers;
 const edgeCountry=(headers.get("cf-ipcountry")||headers.get("x-vercel-ip-country")||headers.get("cloudfront-viewer-country")||"").toUpperCase();
 const language=headers.get("accept-language")||"";
 const localeCountry=language.match(/[-_]([A-Za-z]{2})(?:[,;]|$)/)?.[1]?.toUpperCase()||"";
 const country=SUPPORTED.has(edgeCountry)?edgeCountry:SUPPORTED.has(localeCountry)?localeCountry:"RU";
 return Response.json({country,source:SUPPORTED.has(edgeCountry)?"network":SUPPORTED.has(localeCountry)?"locale":"default"},{headers:{"cache-control":"private, max-age=3600"}});
}
