"use client";
import { ChangeEvent, FormEvent, useEffect, useRef, useState } from "react";

type Privacy={phone:boolean;email:boolean;status:boolean;socials:boolean;photo:boolean};
type Profile={
 id:string;name:string;handle:string;publicId:string;phone?:string|null;phoneLast4?:string|null;
 email?:string|null;birthYear?:number|null;status?:string|null;socials?:Record<string,string>|null;
 avatarUrl?:string|null;hasAvatar?:boolean;registered?:boolean;online?:boolean;isContact?:boolean;
 privacy?:Privacy;syncContactsEnabled?:boolean
};
type Chat={id:string;name:string;kind:string;createdAt:number};
type Message={id:string;senderId:string;body:string|null;kind:string;fileName?:string|null;fileSize?:number|null;createdAt:number};
type PhoneEntry={name:string;phone:string};
type AppNotification={id:string;kind:string;body:string;entityId?:string|null;readAt?:number|null;createdAt:number};
type UpdateInfo={build:string;title:string;notes:string[];releasedAt:string;checkIntervalMs:number;apk:{version:string;url:string;sha256:string};nativeUpdate?:boolean};

function appFetch(input:RequestInfo|URL,init:RequestInit={}){
 const headers=new Headers(init.headers),token=localStorage.getItem("orbit_session");
 if(token)headers.set("authorization",`Bearer ${token}`);
 return fetch(input,{...init,headers});
}
function initials(name:string){return name.split(/\s+/).map(x=>x[0]).join("").slice(0,2).toUpperCase()||"OR"}
function normalizePhone(value:string){const digits=value.replace(/\D/g,"");if(digits.length===10)return `7${digits}`;if(digits.length===11&&digits.startsWith("8"))return `7${digits.slice(1)}`;return digits.slice(-15)}
async function phoneHash(value:string){const bytes=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(normalizePhone(value)));return [...new Uint8Array(bytes)].map(x=>x.toString(16).padStart(2,"0")).join("")}
function compareVersions(left:string,right:string){const a=left.split(".").map(Number),b=right.split(".").map(Number);for(let i=0;i<Math.max(a.length,b.length);i++){const delta=(a[i]||0)-(b[i]||0);if(delta)return delta}return 0}

export default function MessengerApp(){
 const [ready,setReady]=useState(false),[error,setError]=useState(""),[,setProgress]=useState(""),[intro,setIntro]=useState(true);
 const [profile,setProfile]=useState<Profile|null>(null),[section,setSection]=useState<"chats"|"contacts"|"settings">("chats");
 const [contacts,setContacts]=useState<Profile[]>([]),[searchResults,setSearchResults]=useState<Profile[]>([]);
 const [chats,setChats]=useState<Chat[]>([]),[activeChat,setActiveChat]=useState<Chat|null>(null),[messages,setMessages]=useState<Message[]>([]);
 const [draft,setDraft]=useState(""),[search,setSearch]=useState(""),[composeOpen,setComposeOpen]=useState(false),[profileOpen,setProfileOpen]=useState<Profile|null>(null),[mobileChatOpen,setMobileChatOpen]=useState(false);
 const [privacyOpen,setPrivacyOpen]=useState(false),[notificationSettingsOpen,setNotificationSettingsOpen]=useState(false),[toast,setToast]=useState(""),[syncing,setSyncing]=useState(false),[aiWorking,setAiWorking]=useState(false);
 const [notificationsEnabled,setNotificationsEnabled]=useState(true),[soundEnabled,setSoundEnabled]=useState(true),[updateInfo,setUpdateInfo]=useState<UpdateInfo|null>(null),[checkingUpdate,setCheckingUpdate]=useState(false);
 const avatarInput=useRef<HTMLInputElement>(null),fileInput=useRef<HTMLInputElement>(null),plumAudio=useRef<HTMLAudioElement|null>(null),seenNotifications=useRef(new Set<string>());
 const notify=(text:string)=>{setToast(text);window.setTimeout(()=>setToast(""),2500)};

 useEffect(()=>{void boot();const timer=window.setTimeout(()=>setIntro(false),1800);return()=>window.clearTimeout(timer)},[]);
 useEffect(()=>{
  setNotificationsEnabled(localStorage.getItem("orbit_notifications")!=="off");
  setSoundEnabled(localStorage.getItem("orbit_sound")!=="off");
  const audio=new Audio("/orbit-plum.wav");audio.preload="auto";plumAudio.current=audio;
  const unlock=()=>{audio.volume=.001;void audio.play().then(()=>{audio.pause();audio.currentTime=0;audio.volume=.85}).catch(()=>undefined)};
  document.addEventListener("pointerdown",unlock,{once:true});
  return()=>document.removeEventListener("pointerdown",unlock);
 },[]);
 useEffect(()=>{
  const viewport=window.visualViewport;
  const resize=()=>document.documentElement.style.setProperty("--orbit-vh",`${viewport?.height||window.innerHeight}px`);
  const focus=(event:FocusEvent)=>{const target=event.target as HTMLElement;if(target.matches("input,textarea"))window.setTimeout(()=>target.scrollIntoView({block:"center",behavior:"smooth"}),250)};
  resize();viewport?.addEventListener("resize",resize);document.addEventListener("focusin",focus);
  return()=>{viewport?.removeEventListener("resize",resize);document.removeEventListener("focusin",focus)};
 },[]);
 useEffect(()=>{
  if(!ready||!profile?.registered)return;
  const poll=window.setInterval(()=>void loadChats(),3000);
  return()=>window.clearInterval(poll);
 },[ready,profile?.registered,activeChat?.id]);
 useEffect(()=>{
  if(!ready||!profile?.syncContactsEnabled)return;
  void syncPhonebook(true);
  const timer=window.setInterval(()=>void syncPhonebook(true),120000);
  const visible=()=>{if(document.visibilityState==="visible")void syncPhonebook(true)};
  document.addEventListener("visibilitychange",visible);
  return()=>{window.clearInterval(timer);document.removeEventListener("visibilitychange",visible)};
 },[ready,profile?.syncContactsEnabled]);
 useEffect(()=>{
  if(!composeOpen||!search.trim()){setSearchResults([]);return}
  const timer=window.setTimeout(()=>void searchPeople(search),300);
  return()=>window.clearTimeout(timer);
 },[search,composeOpen]);
 useEffect(()=>{
  if(!ready||!profile?.registered)return;
  void checkNotifications();void checkUpdates(false);
  const notificationsTimer=window.setInterval(()=>void checkNotifications(),10000);
  const updateTimer=window.setInterval(()=>void checkUpdates(false),8*60*60*1000);
  const visible=()=>{if(document.visibilityState!=="visible")return;void checkNotifications();const last=Number(localStorage.getItem("orbit_update_checked_at")||0);if(Date.now()-last>=8*60*60*1000)void checkUpdates(false)};
  document.addEventListener("visibilitychange",visible);
  return()=>{window.clearInterval(notificationsTimer);window.clearInterval(updateTimer);document.removeEventListener("visibilitychange",visible)};
 },[ready,profile?.registered,notificationsEnabled,soundEnabled]);

 async function boot(){
  setProgress("ПОДКЛЮЧАЕМ…");
  try{
   let auth=await appFetch("/api/registration",{cache:"no-store"});
   if(auth.status===401){
    const created=await fetch("/api/auth",{method:"POST",headers:{"content-type":"application/json"},body:"{}"});
    if(!created.ok)throw new Error("Не удалось создать защищённую сессию");
    const session=await created.json();localStorage.setItem("orbit_session",session.token);
    auth=await appFetch("/api/registration",{cache:"no-store"});
   }
   if(!auth.ok)throw new Error("Сервер временно недоступен");
   const data=await auth.json();setProfile(data.profile);
   if(data.profile.registered)await loadAll();
   setReady(true);
  }catch(value){setError(value instanceof Error?value.message:"Нет соединения")}
  finally{setProgress("")}
 }
 async function loadAll(){await Promise.all([loadPeople(),loadChats()])}
 async function loadPeople(){
  const r=await appFetch("/api/people",{cache:"no-store"});if(!r.ok)return;
  const data=await r.json();setContacts(data.contacts||[]);if(data.profile)setProfile(data.profile);
 }
 async function checkNotifications(){
  if(!notificationsEnabled)return;
  const r=await appFetch("/api/people",{cache:"no-store"});if(!r.ok)return;
  const data=await r.json(),unread=(data.notifications||[]).filter((item:AppNotification)=>!item.readAt&&!seenNotifications.current.has(item.id)) as AppNotification[];
  if(!unread.length)return;
  unread.forEach(item=>seenNotifications.current.add(item.id));
  const latest=unread[0],isMessage=latest.kind==="message"||latest.kind==="file";
  notify(latest.body);
  if(isMessage&&soundEnabled){const audio=plumAudio.current;if(audio){audio.currentTime=0;audio.volume=.85;void audio.play().catch(()=>undefined)}}
  if(isMessage){
   const native=(window as typeof window&{Capacitor?:{Plugins?:{PhoneContacts?:{showNotification:(value:{title:string;body:string})=>Promise<void>}}}}).Capacitor?.Plugins?.PhoneContacts;
   if(native)await native.showNotification({title:"Orbit Connect",body:latest.body}).catch(()=>undefined);
   else if("Notification" in window&&Notification.permission==="granted"&&document.hidden)new Notification("Orbit Connect",{body:latest.body,icon:"/orbit-connect-icon-192.png"});
  }
  await appFetch("/api/people",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action:"read-notifications"})});
  if(latest.entityId)await loadChats();
 }
 async function checkUpdates(manual:boolean){
  if(checkingUpdate)return;setCheckingUpdate(true);
  try{
   const current=localStorage.getItem("orbit_build")||"2026.08.16.1";
   const r=await fetch(`/api/version?current=${encodeURIComponent(current)}&t=${Date.now()}`,{cache:"no-store"});
   if(!r.ok)throw new Error("Проверка недоступна");
   const data=await r.json() as UpdateInfo&{updateAvailable:boolean};
   const capacitor=(window as typeof window&{Capacitor?:{isNativePlatform?:()=>boolean;getPlatform?:()=>string;Plugins?:{PhoneContacts?:{getAppInfo?:()=>Promise<{versionName:string}>}}}}).Capacitor;
   const native=capacitor?.Plugins?.PhoneContacts;
   const appInfo=native?.getAppInfo?await native.getAppInfo().catch(()=>null):null;
   const isNative=Boolean(capacitor?.isNativePlatform?.()||capacitor?.getPlatform?.()==="android");
   const installedVersion=appInfo?.versionName||(isNative?"1.1.0":null);
   const nativeUpdate=Boolean(installedVersion&&compareVersions(installedVersion,data.apk.version)<0);
   localStorage.setItem("orbit_update_checked_at",String(Date.now()));
   if(data.updateAvailable||nativeUpdate)setUpdateInfo({...data,nativeUpdate});
   else if(manual)notify("Установлена последняя версия");
  }catch{if(manual)notify("Не удалось проверить обновления")}
  finally{setCheckingUpdate(false)}
 }
 async function applyUpdate(){
  if(!updateInfo)return;
  localStorage.setItem("orbit_build",updateInfo.build);
  localStorage.setItem("orbit_update_checked_at",String(Date.now()));
  if(updateInfo.nativeUpdate){
   const native=(window as typeof window&{Capacitor?:{Plugins?:{PhoneContacts?:{installUpdate?:(value:{url:string})=>Promise<unknown>}}}}).Capacitor?.Plugins?.PhoneContacts;
   const apkUrl=new URL(updateInfo.apk.url,location.origin).href;
   if(native?.installUpdate){try{await native.installUpdate({url:apkUrl});return}catch{location.href=apkUrl;return}}
   location.href=apkUrl;return;
  }
  if("serviceWorker" in navigator){const registrations=await navigator.serviceWorker.getRegistrations();await Promise.all(registrations.map(item=>item.update().catch(()=>undefined)));registrations.forEach(item=>item.waiting?.postMessage("SKIP_WAITING"))}
  if("caches" in window){const keys=await caches.keys();await Promise.all(keys.map(key=>caches.delete(key)))}
  location.reload();
 }
 async function setNotificationPreference(enabled:boolean){
  setNotificationsEnabled(enabled);localStorage.setItem("orbit_notifications",enabled?"on":"off");
  if(enabled&&"Notification" in window&&Notification.permission==="default")await Notification.requestPermission();
 }
 function setSoundPreference(enabled:boolean){setSoundEnabled(enabled);localStorage.setItem("orbit_sound",enabled?"on":"off");if(enabled){const audio=plumAudio.current;if(audio){audio.currentTime=0;void audio.play().catch(()=>undefined)}}}
 async function searchPeople(value:string){
  const r=await appFetch(`/api/people?q=${encodeURIComponent(value)}`,{cache:"no-store"});
  if(r.ok)setSearchResults((await r.json()).results||[]);
 }
 async function loadChats(){
  const r=await appFetch("/api/sync",{cache:"no-store"});if(!r.ok)return;
  const data=await r.json();const list:Chat[]=(data.chatList||[]).map((room:{id:string;title:string;kind:string;createdAt:number})=>({id:room.id,name:room.title,kind:room.kind,createdAt:room.createdAt}));
  setChats(list);
  const current=activeChat?list.find(item=>item.id===activeChat.id):list[0];
  if(current){setActiveChat(current);await loadMessages(current.id,data.user.userId)}
 }
 async function loadMessages(chatId:string,userId=profile?.id){
  const r=await appFetch(`/api/sync?chatId=${encodeURIComponent(chatId)}`,{cache:"no-store"});
  if(r.ok){const data=await r.json();setMessages(data.messages||[]);if(!profile?.id&&data.user?.userId)setProfile(old=>old?{...old,id:data.user.userId}:old)}
 }
 async function addContact(person:Profile){
  const r=await appFetch("/api/people",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action:"add-contact",targetUserId:person.id})});
  const data=await r.json().catch(()=>({}));if(!r.ok){notify(data.error||"Не удалось добавить");return}
  await loadPeople();notify("Пользователь добавлен в контакты");
 }
 async function openChat(person:Profile){
  setProgress("СОЗДАЁМ ЧАТ…");
  const r=await appFetch("/api/people",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action:"start-direct",targetUserId:person.id})});
  const data=await r.json().catch(()=>({}));setProgress("");
  if(!r.ok){notify(data.error||"Не удалось создать чат");return}
  const chat={id:data.chat.id,name:person.name,kind:"direct",createdAt:data.chat.createdAt};setActiveChat(chat);setComposeOpen(false);setSection("chats");setMobileChatOpen(true);await loadChats();
 }
 async function send(){
  const text=draft.trim();if(!text||!activeChat)return;setProgress("ОТПРАВЛЯЕМ…");
  try{
   const r=await appFetch("/api/messages",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({chatId:activeChat.id,body:text})});
   if(!r.ok){notify("Сообщение не отправлено");return}setDraft("");await loadMessages(activeChat.id);
  }finally{setProgress("")}
 }
 async function attach(event:ChangeEvent<HTMLInputElement>){
  const file=event.target.files?.[0];if(!file||!activeChat)return;setProgress("ЗАГРУЖАЕМ ФАЙЛ…");
  const form=new FormData();form.set("file",file);form.set("chatId",activeChat.id);
  const headers=new Headers(),token=localStorage.getItem("orbit_session");if(token)headers.set("authorization",`Bearer ${token}`);
  const r=await fetch("/api/files",{method:"POST",headers,body:form});setProgress("");if(r.ok)await loadMessages(activeChat.id);else notify("Файл не отправлен");event.target.value="";
 }
 async function ai(mode:"generate"|"correct"|"emoji"){
  setAiWorking(true);setProgress("ИИ ПОМОГАЕТ…");
  const r=await appFetch("/api/ai",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({mode,text:draft})});
  const data=await r.json().catch(()=>({}));if(r.ok)setDraft(data.text||draft);else notify("ИИ временно недоступен");setAiWorking(false);setProgress("");
 }
 async function saveProfile(next:Profile){
  const r=await appFetch("/api/profile",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({name:next.name,email:next.email,birthYear:next.birthYear,handle:next.handle,status:next.status,socials:next.socials,syncContactsEnabled:next.syncContactsEnabled,privacy:next.privacy})});
  const data=await r.json().catch(()=>({}));if(!r.ok){notify(data.error||"Не удалось сохранить");return false}setProfile(data.profile);notify("Настройки сохранены");return true;
 }
 async function toggleSync(enabled:boolean){
  if(!profile)return;const next={...profile,syncContactsEnabled:enabled};setProfile(next);await saveProfile(next);if(enabled)await syncPhonebook(false);
 }
 async function syncPhonebook(silent=false){
  if(syncing)return;setSyncing(true);
  try{
   const native=(window as typeof window&{Capacitor?:{Plugins?:{PhoneContacts?:{getContacts:()=>Promise<{contacts:PhoneEntry[]}>}}}}).Capacitor?.Plugins?.PhoneContacts;
   let entries:PhoneEntry[]=[];
   if(native)entries=(await native.getContacts()).contacts||[];
   else{
    const api=navigator as Navigator&{contacts?:{select:(fields:string[],options:{multiple:boolean})=>Promise<Array<{name?:string[];tel?:string[]}>>}};
    if(!api.contacts){if(!silent)notify("Автосинхронизация доступна в мобильном приложении");return}
    const picked=await api.contacts.select(["name","tel"],{multiple:true});entries=picked.flatMap(item=>(item.tel||[]).map(phone=>({name:item.name?.[0]||phone,phone})));
   }
   const unique=[...new Map(entries.map(item=>[normalizePhone(item.phone),item])).entries()].filter(([phone])=>phone.length>=10);
   const hashes=await Promise.all(unique.map(([phone])=>phoneHash(phone)));
   const r=await appFetch("/api/people",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action:"sync-phonebook",phoneHashes:hashes})});
   if(!r.ok)throw new Error("Ошибка синхронизации");
   const data=await r.json();for(const match of data.matches||[])if(!match.isContact)await addContact(match);
   await loadPeople();if(!silent)notify(`Справочник синхронизирован: ${unique.length}`);
  }catch(value){if(!silent)notify(value instanceof Error?value.message:"Синхронизация не выполнена")}
  finally{setSyncing(false)}
 }
 async function openProfile(person:Profile){
  const r=await appFetch(`/api/profile?id=${encodeURIComponent(person.id)}`,{cache:"no-store"});
  if(r.ok)setProfileOpen((await r.json()).profile);else notify("Профиль недоступен");
 }
 async function uploadAvatar(event:ChangeEvent<HTMLInputElement>){
  const file=event.target.files?.[0];if(!file||!profile)return;
  const bitmap=await createImageBitmap(file),canvas=document.createElement("canvas"),size=360;canvas.width=size;canvas.height=size;
  const scale=Math.max(size/bitmap.width,size/bitmap.height),w=bitmap.width*scale,h=bitmap.height*scale;
  canvas.getContext("2d")!.drawImage(bitmap,(size-w)/2,(size-h)/2,w,h);
  const avatarData=canvas.toDataURL("image/jpeg",.82),r=await appFetch("/api/avatar",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({avatarData})});
  const data=await r.json().catch(()=>({}));if(r.ok)setProfile({...profile,avatarUrl:data.avatarUrl,hasAvatar:true});else notify(data.error||"Фото не загружено");event.target.value="";
 }

 if(error)return <div className="orbit-auth"><img src="/orbit-connect-icon-192.png" alt="Orbit"/><p>ORBIT / CONNECT</p><h1>Нет соединения</h1><span>{error}</span><button onClick={()=>location.reload()}>Повторить</button></div>;
 if(!ready||intro)return <EntryIntro/>;
 if(profile&&!profile.registered)return <Registration profile={profile} onComplete={value=>{setProfile(value);void loadAll()}} notify={notify}/>;

 return <main className="orbit-v4">
  <aside className="orbit-nav"><img src="/orbit-connect-icon-192.png" alt="Orbit Connect"/><button className={section==="chats"?"active":""} onClick={()=>setSection("chats")}>▤<span>Чаты</span></button><button className={section==="contacts"?"active":""} onClick={()=>setSection("contacts")}>♙<span>Контакты</span></button><button className={section==="settings"?"active":""} onClick={()=>setSection("settings")}>⚙<span>Настройки</span></button></aside>
  <section className="orbit-list">
   <header><div><small>ORBIT / CONNECT</small><h1>{section==="chats"?"Сообщения":section==="contacts"?"Контакты":"Настройки"}</h1></div>{section!=="settings"&&<button className="compose" aria-label="Создать сообщение" onClick={()=>{setComposeOpen(true);setSearch("")}}>✎</button>}</header>
   {section==="chats"&&<div className="list-scroll"><button className="new-message" onClick={()=>setComposeOpen(true)}>✎ <span><b>Создать сообщение</b><small>Контакт, номер, имя или $никнейм</small></span></button>{chats.map(chat=><button key={chat.id} className={activeChat?.id===chat.id?"person-row selected":"person-row"} onClick={()=>{setActiveChat(chat);setMobileChatOpen(true);void loadMessages(chat.id)}}><Avatar name={chat.name}/><span><b>{chat.name}</b><small>{chat.kind==="group"?"Группа":"Личный чат"}</small></span></button>)}</div>}
   {section==="contacts"&&<div className="list-scroll"><div className="section-label">МОИ КОНТАКТЫ · {contacts.length}</div>{contacts.length===0&&<Empty text="Контактов пока нет. Нажмите «Создать сообщение» и найдите человека."/ >}{contacts.map(person=><div key={person.id} className="person-row"><button className="person-main" onClick={()=>void openProfile(person)}><Avatar name={person.name} url={person.avatarUrl}/><span><b>{person.name}</b><small>{person.handle} {person.online?"· онлайн":""}</small></span></button><button className="write" onClick={()=>void openChat(person)}>Написать</button></div>)}</div>}
   {section==="settings"&&profile&&<Settings profile={profile} setProfile={setProfile} saveProfile={saveProfile} toggleSync={toggleSync} syncing={syncing} syncNow={()=>syncPhonebook(false)} avatarInput={avatarInput} uploadAvatar={uploadAvatar} openPrivacy={()=>setPrivacyOpen(true)}/>}
   {section==="settings"&&<div className="settings-tools"><button title="Проверить обновления" disabled={checkingUpdate} onClick={()=>void checkUpdates(true)}>↻</button><button title="Настройки уведомлений" onClick={()=>setNotificationSettingsOpen(true)}>♬</button></div>}
  </section>
  <section className={mobileChatOpen?"orbit-chat mobile-open":"orbit-chat"}>
   {activeChat?<><header><button className="mobile-chat-back" onClick={()=>setMobileChatOpen(false)}>‹</button><Avatar name={activeChat.name}/><div><b>{activeChat.name}</b><small>{activeChat.kind==="group"?"группа":"личный чат"}</small></div><button onClick={()=>notify("Аудиозвонок запускается")}>☎</button><button onClick={()=>notify("Видеозвонок запускается")}>▣</button></header><div className="message-scroll">{messages.map(message=><div key={message.id} className={message.senderId===profile?.id?"msg me":"msg"}>{message.kind==="file"?<a href={`/api/files?id=${encodeURIComponent(message.id)}`}><b>{message.fileName||"Файл"}</b><span>{message.fileSize?Math.ceil(message.fileSize/1024)+" КБ":""}</span></a>:<p>{message.body}</p>}<time>{new Date(message.createdAt).toLocaleTimeString("ru-RU",{hour:"2-digit",minute:"2-digit"})}</time></div>)}</div><div className="ai-row"><button disabled={aiWorking} onClick={()=>void ai("generate")}>✦ Написать</button><button disabled={!draft||aiWorking} onClick={()=>void ai("correct")}>✓ Исправить</button><button disabled={!draft||aiWorking} onClick={()=>void ai("emoji")}>☺ Эмодзи</button></div><footer><button onClick={()=>fileInput.current?.click()}>＋</button><input ref={fileInput} type="file" hidden onChange={attach}/><textarea rows={1} value={draft} onChange={event=>setDraft(event.target.value)} onKeyDown={event=>{if(event.key==="Enter"&&!event.shiftKey){event.preventDefault();void send()}}} placeholder="Сообщение"/><button className="send" onClick={()=>void send()}>↑</button></footer></>:<Empty text="Выберите чат или создайте новое сообщение"/>}
  </section>
  {composeOpen&&<Compose contacts={contacts} results={searchResults} search={search} setSearch={setSearch} close={()=>setComposeOpen(false)} addContact={addContact} openChat={openChat} openProfile={openProfile}/>}
  {profileOpen&&<ProfileModal profile={profileOpen} close={()=>setProfileOpen(null)} addContact={addContact} openChat={openChat}/>}
  {privacyOpen&&profile&&<PrivacyModal profile={profile} close={()=>setPrivacyOpen(false)} save={async privacy=>{const next={...profile,privacy};setProfile(next);if(await saveProfile(next))setPrivacyOpen(false)}}/>}
  {updateInfo&&<UpdateModal info={updateInfo} close={()=>setUpdateInfo(null)} apply={()=>void applyUpdate()}/>}
  {notificationSettingsOpen&&<NotificationSettings enabled={notificationsEnabled} sound={soundEnabled} close={()=>setNotificationSettingsOpen(false)} setEnabled={value=>void setNotificationPreference(value)} setSound={setSoundPreference}/>}
  {toast&&<div className="orbit-toast">{toast}</div>}
 </main>
}

function Avatar({name,url}:{name:string;url?:string|null}){return <span className="orbit-avatar" style={url?{backgroundImage:`url(${url})`}:undefined}>{url?"":initials(name)}</span>}
function Empty({text}:{text:string}){return <div className="orbit-empty"><img src="/orbit-connect-logo-v3.png" alt=""/><p>{text}</p></div>}
function EntryIntro(){return <div className="entry-intro"><div className="entry-halo"><img src="/orbit-connect-icon-192.png" alt="Orbit Connect"/><i/><i/></div><div className="entry-word"><b>ORBIT</b><span>CONNECT</span></div><small>ТВОЙ КРУГ СТАНОВИТСЯ БЛИЖЕ</small></div>}

function Registration({profile,onComplete,notify}:{profile:Profile;onComplete:(profile:Profile)=>void;notify:(text:string)=>void}){
 const [step,setStep]=useState<"phone"|"code"|"profile">("phone"),[phone,setPhone]=useState(""),[code,setCode]=useState(""),[demoCode,setDemoCode]=useState("");
 const [form,setForm]=useState({name:"",email:"",birthYear:"",handle:profile.handle||profile.publicId||"",telegram:"",vk:"",website:""}),[busy,setBusy]=useState(false);
 async function requestCode(){setBusy(true);const r=await appFetch("/api/registration",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action:"request-code",phone})});const data=await r.json().catch(()=>({}));setBusy(false);if(!r.ok){notify(data.error||"Не удалось отправить код");return}setDemoCode(data.demoCode||"");setStep("code")}
 async function verify(){setBusy(true);const r=await appFetch("/api/registration",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action:"verify-code",code})});const data=await r.json().catch(()=>({}));setBusy(false);if(!r.ok){notify(data.error||"Неверный код");return}setStep("profile")}
 async function complete(event:FormEvent){event.preventDefault();setBusy(true);const r=await appFetch("/api/registration",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action:"complete",name:form.name,email:form.email,birthYear:form.birthYear?Number(form.birthYear):null,handle:form.handle,socials:{telegram:form.telegram,vk:form.vk,website:form.website}})});const data=await r.json().catch(()=>({}));setBusy(false);if(!r.ok){notify(data.error||"Не удалось завершить регистрацию");return}onComplete(data.profile)}
 return <div className="registration-screen"><div className="registration-brand"><img src="/orbit-connect-icon-192.png" alt="Orbit"/><span>ORBIT / CONNECT</span></div><div className="registration-card"><small>РЕГИСТРАЦИЯ · {step==="phone"?"01":step==="code"?"02":"03"}</small>{step==="phone"&&<><h1>Ваш номер</h1><p>Телефон обязателен для защиты аккаунта и поиска знакомых.</p><label>Номер телефона<input autoFocus inputMode="tel" value={phone} onChange={event=>setPhone(event.target.value)} placeholder="+7 999 123-45-67"/></label><button disabled={busy||normalizePhone(phone).length<10} onClick={()=>void requestCode()}>Получить код →</button></>}{step==="code"&&<><h1>Подтверждение</h1><p>Введите шестизначный код из SMS.</p>{demoCode&&<div className="demo-code">Тестовый SMS-код: <b>{demoCode}</b></div>}<label>Код<input autoFocus inputMode="numeric" maxLength={6} value={code} onChange={event=>setCode(event.target.value.replace(/\D/g,""))} placeholder="000000"/></label><button disabled={busy||code.length!==6} onClick={()=>void verify()}>Подтвердить →</button><button className="link-button" onClick={()=>setStep("phone")}>Изменить номер</button></>}{step==="profile"&&<form onSubmit={complete}><h1>Ваш профиль</h1><p>ФИО и email обязательны. Остальное можно изменить позже.</p><label>ФИО<input required autoFocus value={form.name} onChange={event=>setForm({...form,name:event.target.value})} placeholder="Иванов Иван Иванович"/></label><label>Email<input required type="email" value={form.email} onChange={event=>setForm({...form,email:event.target.value})} placeholder="name@example.com"/></label><label>Уникальный никнейм<input required value={form.handle} onChange={event=>setForm({...form,handle:event.target.value.startsWith("$")?event.target.value:`$${event.target.value}`})} placeholder="$orbit_user"/></label><small>Постоянный ID: {profile.publicId}</small><label>Год рождения — по желанию<input inputMode="numeric" maxLength={4} value={form.birthYear} onChange={event=>setForm({...form,birthYear:event.target.value.replace(/\D/g,"")})} placeholder="1990"/></label><label>Telegram<input value={form.telegram} onChange={event=>setForm({...form,telegram:event.target.value})} placeholder="@username"/></label><label>ВКонтакте<input value={form.vk} onChange={event=>setForm({...form,vk:event.target.value})} placeholder="vk.com/username"/></label><label>Сайт<input value={form.website} onChange={event=>setForm({...form,website:event.target.value})} placeholder="https://example.com"/></label><button disabled={busy}>Войти в Orbit →</button></form>}</div></div>
}

function Settings({profile,setProfile,saveProfile,toggleSync,syncing,syncNow,avatarInput,uploadAvatar,openPrivacy}:{profile:Profile;setProfile:(value:Profile)=>void;saveProfile:(value:Profile)=>Promise<boolean>;toggleSync:(value:boolean)=>Promise<void>;syncing:boolean;syncNow:()=>void;avatarInput:React.RefObject<HTMLInputElement|null>;uploadAvatar:(event:ChangeEvent<HTMLInputElement>)=>void;openPrivacy:()=>void}){
 const socials=profile.socials||{};return <div className="settings-scroll"><button className="profile-photo" onClick={()=>avatarInput.current?.click()}><Avatar name={profile.name} url={profile.avatarUrl}/><b>Сменить фотографию</b></button><input ref={avatarInput} type="file" accept="image/*" hidden onChange={uploadAvatar}/><div className="identity"><b>{profile.name}</b><span>{profile.handle}</span><small>Неизменяемый ID: {profile.publicId}</small></div><div className="setting-block"><h3>Профиль</h3><label>ФИО<input value={profile.name} onChange={event=>setProfile({...profile,name:event.target.value})}/></label><label>Никнейм<input value={profile.handle} onChange={event=>setProfile({...profile,handle:event.target.value.startsWith("$")?event.target.value:`$${event.target.value}`})}/></label><label>Email<input type="email" value={profile.email||""} onChange={event=>setProfile({...profile,email:event.target.value})}/></label><label>Статус<textarea rows={3} maxLength={120} value={profile.status||""} onChange={event=>setProfile({...profile,status:event.target.value})} placeholder="Расскажите, чем вы заняты"/></label><label>Год рождения<input inputMode="numeric" value={profile.birthYear||""} onChange={event=>setProfile({...profile,birthYear:Number(event.target.value)||null})}/></label><label>Telegram<input value={socials.telegram||""} onChange={event=>setProfile({...profile,socials:{...socials,telegram:event.target.value}})}/></label><label>ВКонтакте<input value={socials.vk||""} onChange={event=>setProfile({...profile,socials:{...socials,vk:event.target.value}})}/></label><label>Сайт<input value={socials.website||""} onChange={event=>setProfile({...profile,socials:{...socials,website:event.target.value}})}/></label><button className="primary-action" onClick={()=>void saveProfile(profile)}>Сохранить профиль</button></div><div className="setting-block"><h3>Контакты</h3><label className="switch-row"><span><b>Постоянная синхронизация</b><small>При открытии приложения и каждые 2 минуты</small></span><input type="checkbox" role="switch" checked={Boolean(profile.syncContactsEnabled)} onChange={event=>void toggleSync(event.target.checked)}/><i/></label><button className="plain-row" disabled={syncing} onClick={syncNow}><span>{syncing?"Синхронизация…":"Синхронизировать сейчас"}</span><b>↻</b></button></div><div className="setting-block"><button className="plain-row" onClick={openPrivacy}><span><b>Конфиденциальность</b><small>Кто видит данные профиля</small></span><b>›</b></button></div><a className="download-row" href="/orbit-connect-v5.apk" download>Скачать APK 1.2.0 для Android ↗</a></div>
}

function Compose({contacts,results,search,setSearch,close,addContact,openChat,openProfile}:{contacts:Profile[];results:Profile[];search:string;setSearch:(value:string)=>void;close:()=>void;addContact:(person:Profile)=>Promise<void>;openChat:(person:Profile)=>Promise<void>;openProfile:(person:Profile)=>Promise<void>}){
 const list=search.trim()?results:contacts;return <div className="modal-back"><div className="compose-modal"><header><div><small>НОВОЕ СООБЩЕНИЕ</small><h2>Кому написать?</h2></div><button onClick={close}>×</button></header><label className="people-search">⌕<input autoFocus value={search} onChange={event=>setSearch(event.target.value)} placeholder="Имя, номер телефона или $никнейм"/></label><p>{search.trim()?"НАЙДЕННЫЕ ПОЛЬЗОВАТЕЛИ":"ВАШИ КОНТАКТЫ"}</p><div className="people-list">{list.length===0&&<Empty text={search?"Пользователь не найден":"Контактов пока нет"}/>} {list.map(person=><div key={person.id} className="person-row"><button className="person-main" onClick={()=>void openProfile(person)}><Avatar name={person.name} url={person.avatarUrl}/><span><b>{person.name}</b><small>{person.handle}</small></span></button>{!person.isContact&&<button className="write" onClick={()=>void addContact(person)}>Добавить</button>}<button className="write solid" onClick={()=>void openChat(person)}>Написать</button></div>)}</div></div></div>
}

function ProfileModal({profile,close,addContact,openChat}:{profile:Profile;close:()=>void;addContact:(person:Profile)=>Promise<void>;openChat:(person:Profile)=>Promise<void>}){
 return <div className="modal-back"><div className="profile-modal"><button className="modal-close" onClick={close}>×</button><Avatar name={profile.name} url={profile.avatarUrl}/><h2>{profile.name}</h2><b>{profile.handle}</b><small>ID: {profile.publicId}</small>{profile.status&&<p className="profile-status">{profile.status}</p>}<dl>{profile.phone&&<><dt>Телефон</dt><dd>{profile.phone}</dd></>}{profile.email&&<><dt>Email</dt><dd>{profile.email}</dd></>}{Object.entries(profile.socials||{}).map(([key,value])=><div key={key}><dt>{key}</dt><dd>{value}</dd></div>)}</dl><div className="profile-actions">{!profile.isContact&&<button onClick={()=>void addContact(profile)}>Добавить контакт</button>}<button className="solid" onClick={()=>void openChat(profile)}>Написать</button></div></div></div>
}

function PrivacyModal({profile,close,save}:{profile:Profile;close:()=>void;save:(privacy:Privacy)=>Promise<void>}){
 const [value,setValue]=useState<Privacy>(profile.privacy||{phone:false,email:false,status:true,socials:true,photo:true});
 const items:[keyof Privacy,string,string][]=[["phone","Номер телефона","Показывать подтверждённый номер"],["email","Email","Показывать адрес электронной почты"],["status","Статус","Показывать текст статуса"],["socials","Социальные сети","Показывать Telegram, VK и сайт"],["photo","Фотография","Показывать аватар другим пользователям"]];
 return <div className="modal-back"><div className="privacy-modal"><header><div><small>НАСТРОЙКИ</small><h2>Конфиденциальность</h2></div><button onClick={close}>×</button></header>{items.map(([key,title,description])=><label className="switch-row" key={key}><span><b>{title}</b><small>{description}</small></span><input type="checkbox" role="switch" checked={value[key]} onChange={event=>setValue({...value,[key]:event.target.checked})}/><i/></label>)}<button className="primary-action" onClick={()=>void save(value)}>Сохранить</button></div></div>
}

function UpdateModal({info,close,apply}:{info:UpdateInfo;close:()=>void;apply:()=>void}){
 return <div className="modal-back"><div className="update-modal"><button className="modal-close" onClick={close}>×</button><div className="update-logo"><img src="/orbit-connect-icon-192.png" alt="Orbit Connect"/><i>↻</i></div><small>ДОСТУПНО ОБНОВЛЕНИЕ</small><h2>{info.title}</h2><p>Новая версия уже готова. Обновление займёт несколько секунд и не удалит ваши сообщения.</p><ul>{info.notes.map(note=><li key={note}>{note}</li>)}</ul><button className="primary-action" onClick={apply}>Обновить внутри приложения →</button><button className="update-later" onClick={close}>Напомнить позже</button></div></div>
}

function NotificationSettings({enabled,sound,close,setEnabled,setSound}:{enabled:boolean;sound:boolean;close:()=>void;setEnabled:(value:boolean)=>void;setSound:(value:boolean)=>void}){
 return <div className="modal-back"><div className="privacy-modal"><header><div><small>СООБЩЕНИЯ</small><h2>Уведомления</h2></div><button onClick={close}>×</button></header><label className="switch-row"><span><b>Уведомления о сообщениях</b><small>Показывать имя отправителя и текст</small></span><input type="checkbox" role="switch" checked={enabled} onChange={event=>setEnabled(event.target.checked)}/><i/></label><label className="switch-row"><span><b>Фирменный звук «плюм»</b><small>Короткий мягкий сигнал Orbit</small></span><input type="checkbox" role="switch" checked={sound} onChange={event=>setSound(event.target.checked)}/><i/></label><button className="plum-preview" onClick={()=>setSound(true)}>▶ Прослушать «плюм»</button><button className="primary-action" onClick={close}>Готово</button></div></div>
}
