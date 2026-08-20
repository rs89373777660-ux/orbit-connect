const release={
 build:"2026.08.20.1",
 releasedAt:"2026-08-20T12:00:00+03:00",
 checkIntervalMs:8*60*60*1000,
 title:"Обновление Orbit Connect",
 notes:[
  "Новая анимация входа без индикатора прогресса",
  "Автоматическая проверка обновлений три раза в день",
  "Уведомления о сообщениях и фирменный звук «плюм»"
 ],
 apk:{version:"1.2.0",url:"/orbit-connect-v5.apk",sha256:"A1877CABAD2052C149E842BEBAF11E3EF044783164583AB2B9C0531671C1D316"}
};

export async function GET(request:Request){
 const current=new URL(request.url).searchParams.get("current")||"";
 return Response.json({...release,updateAvailable:Boolean(current&&current!==release.build)},{headers:{"cache-control":"no-store"}});
}
