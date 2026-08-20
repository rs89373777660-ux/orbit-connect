"use client";
import { CSSProperties, ChangeEvent, FormEvent, useEffect, useRef, useState } from "react";
import "./chat-list.css";
import "./theme-refresh.css";

type Privacy={phone:boolean;email:boolean;status:boolean;socials:boolean;photo:boolean};
type Profile={
 id:string;name:string;handle:string;publicId:string;phone?:string|null;phoneLast4?:string|null;
 email?:string|null;birthYear?:number|null;status?:string|null;socials?:Record<string,string>|null;
 avatarUrl?:string|null;avatarPreset?:string|null;hasAvatar?:boolean;registered?:boolean;online?:boolean;isContact?:boolean;
 privacy?:Privacy;syncContactsEnabled?:boolean;autoCorrectEnabled?:boolean
};
type Chat={id:string;name:string;kind:string;createdAt:number;avatarUrl?:string|null;avatarPreset?:string|null;canPost?:boolean;pinnedAt?:number|null;systemPinned?:boolean;unreadCount?:number};
type Message={id:string;senderId:string;body:string|null;kind:string;fileName?:string|null;fileSize?:number|null;fileMime?:string|null;replyTo?:string|null;forwardedFromId?:string|null;editedAt?:number|null;deletedAt?:number|null;deliveryStatus?:"sent"|"delivered"|"read";createdAt:number};
type PhoneEntry={name:string;phone:string};
type AppNotification={id:string;kind:string;body:string;entityId?:string|null;readAt?:number|null;createdAt:number};
type UpdateInfo={build:string;title:string;notes:string[];releasedAt:string;checkIntervalMs:number;apk:{version:string;url:string;sha256:string};nativeUpdate?:boolean};
type AvatarEditState={dataUrl:string;zoom:number;x:number;y:number;enhance:boolean};

function appFetch(input:RequestInfo|URL,init:RequestInit={}){
 const headers=new Headers(init.headers),token=localStorage.getItem("orbit_session");
 if(token)headers.set("authorization",`Bearer ${token}`);
 return fetch(input,{...init,headers});
}
function initials(name:string){return name.split(/\s+/).map(x=>x[0]).join("").slice(0,2).toUpperCase()||"OR"}
function normalizePhone(value:string){const digits=value.replace(/\D/g,"");if(digits.length===10)return `7${digits}`;if(digits.length===11&&digits.startsWith("8"))return `7${digits.slice(1)}`;return digits.slice(-15)}
async function phoneHash(value:string){const bytes=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(normalizePhone(value)));return [...new Uint8Array(bytes)].map(x=>x.toString(16).padStart(2,"0")).join("")}
function compareVersions(left:string,right:string){const a=left.split(".").map(Number),b=right.split(".").map(Number);for(let i=0;i<Math.max(a.length,b.length);i++){const delta=(a[i]||0)-(b[i]||0);if(delta)return delta}return 0}
const AVATAR_PRESETS=["🪐","🚀","🌙","⚡","🌿","🎧","☄️","✦","🦊","🐼","😎","🤖"];
const THEMES=[{id:"lime",name:"Лайм",color:"#cfff3c"},{id:"cyan",name:"Космос",color:"#4eeaff"},{id:"violet",name:"Фиолет",color:"#b08cff"},{id:"coral",name:"Коралл",color:"#ff8075"},{id:"amber",name:"Янтарь",color:"#ffc94a"},{id:"ice",name:"Лёд",color:"#d8f4ff"}];
const COUNTRIES=[
 {iso:"RU",name:"Россия",dial:"7",flag:"🇷🇺"},{iso:"BY",name:"Беларусь",dial:"375",flag:"🇧🇾"},{iso:"KZ",name:"Казахстан",dial:"7",flag:"🇰🇿"},{iso:"UA",name:"Украина",dial:"380",flag:"🇺🇦"},{iso:"AM",name:"Армения",dial:"374",flag:"🇦🇲"},{iso:"AZ",name:"Азербайджан",dial:"994",flag:"🇦🇿"},{iso:"GE",name:"Грузия",dial:"995",flag:"🇬🇪"},{iso:"KG",name:"Кыргызстан",dial:"996",flag:"🇰🇬"},{iso:"UZ",name:"Узбекистан",dial:"998",flag:"🇺🇿"},{iso:"TJ",name:"Таджикистан",dial:"992",flag:"🇹🇯"},{iso:"MD",name:"Молдова",dial:"373",flag:"🇲🇩"},{iso:"TR",name:"Турция",dial:"90",flag:"🇹🇷"},{iso:"IL",name:"Израиль",dial:"972",flag:"🇮🇱"},{iso:"DE",name:"Германия",dial:"49",flag:"🇩🇪"},{iso:"FR",name:"Франция",dial:"33",flag:"🇫🇷"},{iso:"IT",name:"Италия",dial:"39",flag:"🇮🇹"},{iso:"ES",name:"Испания",dial:"34",flag:"🇪🇸"},{iso:"GB",name:"Великобритания",dial:"44",flag:"🇬🇧"},{iso:"US",name:"США",dial:"1",flag:"🇺🇸"},{iso:"CA",name:"Канада",dial:"1",flag:"🇨🇦"},{iso:"AE",name:"ОАЭ",dial:"971",flag:"🇦🇪"},{iso:"IN",name:"Индия",dial:"91",flag:"🇮🇳"},{iso:"CN",name:"Китай",dial:"86",flag:"🇨🇳"},{iso:"JP",name:"Япония",dial:"81",flag:"🇯🇵"},{iso:"KR",name:"Южная Корея",dial:"82",flag:"🇰🇷"},{iso:"BR",name:"Бразилия",dial:"55",flag:"🇧🇷"},{iso:"AU",name:"Австралия",dial:"61",flag:"🇦🇺"}
];
const EMOJI_GROUPS=[{name:"Лица",items:"😀 😃 😄 😁 😂 😊 😍 🤩 😎 🥳 🤔 😴 😭 😡"},{name:"Жесты",items:"👍 👎 👏 🙌 🤝 💪 ✌️ 🤟 👌 🙏"},{name:"Сердца",items:"❤️ 🧡 💛 💚 💙 💜 🖤 🤍 💖 💫 ✨"},{name:"Природа",items:"🌿 🌸 🌞 🌙 ⭐ 🪐 ☄️ 🔥 🌈"}];

export default function MessengerApp(){
 const [ready,setReady]=useState(false),[error,setError]=useState(""),[,setProgress]=useState(""),[intro,setIntro]=useState(true);
 const [profile,setProfile]=useState<Profile|null>(null),[section,setSection]=useState<"chats"|"contacts"|"settings">("chats");
 const [contacts,setContacts]=useState<Profile[]>([]),[searchResults,setSearchResults]=useState<Profile[]>([]);
 const [chats,setChats]=useState<Chat[]>([]),[activeChat,setActiveChat]=useState<Chat|null>(null),[messages,setMessages]=useState<Message[]>([]);
 const [draft,setDraft]=useState(""),[search,setSearch]=useState(""),[composeOpen,setComposeOpen]=useState(false),[profileOpen,setProfileOpen]=useState<Profile|null>(null),[mobileChatOpen,setMobileChatOpen]=useState(false);
 const [messageMenu,setMessageMenu]=useState<Message|null>(null),[editingMessage,setEditingMessage]=useState<Message|null>(null),[replyingTo,setReplyingTo]=useState<Message|null>(null),[deleteMessage,setDeleteMessage]=useState<Message|null>(null),[forwardMessage,setForwardMessage]=useState<Message|null>(null),[aiMenuOpen,setAiMenuOpen]=useState(false),[emojiOpen,setEmojiOpen]=useState(false),[attachmentOpen,setAttachmentOpen]=useState(false);
 const [galleryOpen,setGalleryOpen]=useState(false),[galleryItems,setGalleryItems]=useState<Array<{id:string;kind:string;fileName?:string;url:string}>>([]),[avatarEditor,setAvatarEditor]=useState<AvatarEditState|null>(null),[avatarGallery,setAvatarGallery]=useState<Array<{id:string;url:string;label:string}>>([]);
 const [privacyOpen,setPrivacyOpen]=useState(false),[notificationSettingsOpen,setNotificationSettingsOpen]=useState(false),[toast,setToast]=useState(""),[syncing,setSyncing]=useState(false),[aiWorking,setAiWorking]=useState(false);
 const [notificationsEnabled,setNotificationsEnabled]=useState(true),[soundEnabled,setSoundEnabled]=useState(true),[updateInfo,setUpdateInfo]=useState<UpdateInfo|null>(null),[checkingUpdate,setCheckingUpdate]=useState(false);
 const avatarInput=useRef<HTMLInputElement>(null),fileInput=useRef<HTMLInputElement>(null),photoInput=useRef<HTMLInputElement>(null),plumAudio=useRef<HTMLAudioElement|null>(null),seenNotifications=useRef(new Set<string>());
 const [theme,setTheme]=useState(()=>typeof window!=="undefined"?localStorage.getItem("orbit_theme")||"lime":"lime");
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
  const capacitor=(window as typeof window&{Capacitor?:{isNativePlatform?:()=>boolean}}).Capacitor;
  const installed=Boolean(capacitor?.isNativePlatform?.()||window.matchMedia("(display-mode: standalone)").matches);
  if(!installed)return;
  history.pushState({orbitMain:true},"",location.href);
  const backToMain=()=>{
   setComposeOpen(false);setProfileOpen(null);setPrivacyOpen(false);setNotificationSettingsOpen(false);setUpdateInfo(null);setMessageMenu(null);setForwardMessage(null);setDeleteMessage(null);setGalleryOpen(false);setAvatarEditor(null);setMobileChatOpen(false);setSection("chats");
   history.pushState({orbitMain:true},"",location.href);
  };
  window.addEventListener("popstate",backToMain);
  return()=>window.removeEventListener("popstate",backToMain);
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
  const data=await r.json();setContacts(data.contacts||[]);if(data.profile)setProfile(old=>old?{...old,...data.profile}:data.profile);
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
 async function previewPlum(){
  try{const audio=new Audio(`/orbit-plum.wav?v=2`);audio.volume=1;await audio.play();notify("Звук «плюм» воспроизведён")}
  catch{notify("Не удалось включить звук. Проверьте громкость мультимедиа")}
 }
 async function shareApp(){
  const data={title:"Orbit Connect",text:"Присоединяйтесь ко мне в Orbit Connect — мессенджере для общения, файлов и звонков.",url:"https://tvoy-krug-messenger.rs89373777660.chatgpt.site/"};
  if(navigator.share){try{await navigator.share(data);return}catch(error){if(error instanceof DOMException&&error.name==="AbortError")return}}
  await navigator.clipboard.writeText(`${data.text}\n${data.url}`);notify("Ссылка на приложение скопирована");
 }
 async function searchPeople(value:string){
  const r=await appFetch(`/api/people?q=${encodeURIComponent(value)}`,{cache:"no-store"});
  if(r.ok)setSearchResults((await r.json()).results||[]);
 }
 async function loadChats(){
  const r=await appFetch("/api/sync",{cache:"no-store"});if(!r.ok)return;
  const data=await r.json();const list:Chat[]=(data.chatList||[]).map((room:{id:string;title:string;kind:string;createdAt:number;avatarUrl?:string|null;avatarPreset?:string|null;canPost?:boolean;pinnedAt?:number|null;systemPinned?:boolean;unreadCount?:number})=>({id:room.id,name:room.title,kind:room.kind,createdAt:room.createdAt,avatarUrl:room.avatarUrl,avatarPreset:room.avatarPreset,canPost:room.canPost,pinnedAt:room.pinnedAt,systemPinned:room.systemPinned,unreadCount:Math.min(999,room.unreadCount||0)}));
  setChats(list);
  const current=activeChat?list.find(item=>item.id===activeChat.id):list[0];
  if(current){setActiveChat(current);await loadMessages(current.id,data.user.userId)}
 }
 async function loadMessages(chatId:string,userId=profile?.id){
  const r=await appFetch(`/api/sync?chatId=${encodeURIComponent(chatId)}`,{cache:"no-store"});
  if(r.ok){const data=await r.json();setMessages(data.messages||[]);if(data.chat)setActiveChat(old=>old&&old.id===chatId?{...old,...data.chat}:old);if(!profile?.id&&data.user?.userId)setProfile(old=>old?{...old,id:data.user.userId}:old)}
 }
 async function addContact(person:Profile){
  const r=await appFetch("/api/people",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action:"add-contact",targetUserId:person.id})});
  const data=await r.json().catch(()=>({}));if(!r.ok){notify(data.error||"Не удалось добавить");return}
  await loadPeople();notify("Пользователь добавлен в контакты");
 }
 async function togglePin(chat:Chat){
  if(chat.systemPinned){notify("Этот чат всегда закреплён");return}
  const r=await appFetch("/api/sync",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action:"pin-chat",chatId:chat.id})}),data=await r.json().catch(()=>({}));
  if(!r.ok){notify(data.error||"Не удалось изменить закрепление");return}await loadChats();notify(data.pinnedAt?"Чат закреплён":"Чат откреплён");
 }
 async function openChat(person:Profile){
  setProgress("СОЗДАЁМ ЧАТ…");
  const r=await appFetch("/api/people",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action:"start-direct",targetUserId:person.id})});
  const data=await r.json().catch(()=>({}));setProgress("");
  if(!r.ok){notify(data.error||"Не удалось создать чат");return}
  const chat={id:data.chat.id,name:person.name,kind:"direct",createdAt:data.chat.createdAt};setActiveChat(chat);setComposeOpen(false);setSection("chats");setMobileChatOpen(true);await loadChats();
 }
 async function send(){
  let text=draft.trim();if(!text||!activeChat)return;setProgress(editingMessage?"ИЗМЕНЯЕМ…":"ОТПРАВЛЯЕМ…");
  try{
   if(profile?.autoCorrectEnabled&&!editingMessage){const corrected=await requestAi("correct",text);if(corrected)text=corrected}
   const payload=editingMessage?{action:"edit",messageId:editingMessage.id,body:text}:{chatId:activeChat.id,body:text,replyTo:replyingTo?.id};
   const r=await appFetch("/api/messages",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(payload)});
   const data=await r.json().catch(()=>({}));if(!r.ok){notify(data.error||"Сообщение не отправлено");return}
   setDraft("");setEditingMessage(null);setReplyingTo(null);await loadMessages(activeChat.id);
  }finally{setProgress("")}
 }
 async function attach(event:ChangeEvent<HTMLInputElement>){
  const file=event.target.files?.[0];if(!file||!activeChat)return;setProgress("ЗАГРУЖАЕМ ФАЙЛ…");
  const form=new FormData();form.set("file",file);form.set("chatId",activeChat.id);
  const headers=new Headers(),token=localStorage.getItem("orbit_session");if(token)headers.set("authorization",`Bearer ${token}`);
  const r=await fetch("/api/files",{method:"POST",headers,body:form});setProgress("");setAttachmentOpen(false);if(r.ok)await loadMessages(activeChat.id);else notify((await r.json().catch(()=>({}))).error||"Файл не отправлен");event.target.value="";
 }
 async function sendSticker(url:string){if(!activeChat)return;await appFetch("/api/messages",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({chatId:activeChat.id,body:url,kind:"sticker"})});setEmojiOpen(false);await loadMessages(activeChat.id)}
 async function openGallery(){const r=await appFetch("/api/files?gallery=1",{cache:"no-store"});if(r.ok)setGalleryItems((await r.json()).items||[]);setGalleryOpen(true)}
 async function requestAi(mode:"generate"|"correct"|"emoji",text:string){
  setAiWorking(true);const r=await appFetch("/api/ai",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({mode,text})});
  const data=await r.json().catch(()=>({}));setAiWorking(false);return r.ok?String(data.text||text):null;
 }
 async function ai(mode:"generate"|"correct"|"emoji"){
  setProgress("ИИ ПОМОГАЕТ…");const result=await requestAi(mode,draft);if(result!==null)setDraft(result);else notify("ИИ временно недоступен");setAiMenuOpen(false);setProgress("");
 }
 async function messageAction(action:"edit"|"copy"|"share"|"forward"|"delete",message:Message){
  setMessageMenu(null);
  if(action==="edit"){setEditingMessage(message);setDraft(message.body||"");return}
  if(action==="copy"){await navigator.clipboard.writeText(message.body||"");notify("Сообщение скопировано");return}
  if(action==="share"){
   const text=message.body||message.fileName||"Сообщение Orbit Connect";
   if(navigator.share)await navigator.share({title:"Orbit Connect",text}).catch(()=>undefined);else{await navigator.clipboard.writeText(text);notify("Текст скопирован для отправки")}
   return;
  }
  if(action==="forward"){setForwardMessage(message);return}
  setDeleteMessage(message);
 }
 async function forwardTo(targetChatId:string){
  if(!forwardMessage)return;const r=await appFetch("/api/messages",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action:"forward",messageId:forwardMessage.id,targetChatId})});
  const data=await r.json().catch(()=>({}));if(!r.ok){notify(data.error||"Не удалось переслать");return}setForwardMessage(null);notify("Сообщение переслано");if(activeChat?.id===targetChatId)await loadMessages(targetChatId);
 }
 async function removeMessage(scope:"me"|"all"){
  if(!deleteMessage||!activeChat)return;const r=await appFetch("/api/messages",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action:"delete",messageId:deleteMessage.id,scope})});
  const data=await r.json().catch(()=>({}));if(!r.ok){notify(data.error||"Не удалось удалить");return}setDeleteMessage(null);await loadMessages(activeChat.id);notify(scope==="all"?"Сообщение удалено у всех":"Сообщение удалено у вас");
 }
 async function saveProfile(next:Profile){
  const r=await appFetch("/api/profile",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({name:next.name,email:next.email,birthYear:next.birthYear,handle:next.handle,status:next.status,socials:next.socials,syncContactsEnabled:next.syncContactsEnabled,avatarPreset:next.avatarPreset,autoCorrectEnabled:next.autoCorrectEnabled,privacy:next.privacy})});
  const data=await r.json().catch(()=>({}));if(!r.ok){notify(data.error||"Не удалось сохранить");return false}setProfile(old=>old&&data.profile?{...old,...data.profile}:data.profile||old);notify("Настройки сохранены");return true;
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
   const data=await r.json();await loadPeople();if(!silent)notify(`Справочник синхронизирован: ${unique.length}. Добавлено: ${data.added||0}`);
  }catch(value){if(!silent)notify(value instanceof Error?value.message:"Синхронизация не выполнена")}
  finally{setSyncing(false)}
 }
 async function openProfile(person:Profile){
  const r=await appFetch(`/api/profile?id=${encodeURIComponent(person.id)}`,{cache:"no-store"});
  if(r.ok)setProfileOpen((await r.json()).profile);else notify("Профиль недоступен");
 }
 async function optimizeAvatar(file:File){
  if(!file.type.startsWith("image/"))throw new Error("Выберите фотографию");
  if(file.size>35*1024*1024)throw new Error("Фотография слишком большая — максимум 35 МБ");
  let source:CanvasImageSource,width=0,height=0,close:undefined|(()=>void);
  if("createImageBitmap" in window){const bitmap=await createImageBitmap(file,{imageOrientation:"from-image"});source=bitmap;width=bitmap.width;height=bitmap.height;close=()=>bitmap.close()}
  else{const dataUrl=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=()=>reject(new Error("Фотография не читается"));reader.readAsDataURL(file)});const image=new Image();image.src=dataUrl;await new Promise<void>((resolve,reject)=>{image.onload=()=>resolve();image.onerror=()=>reject(new Error("Фотография повреждена"))});source=image;width=image.naturalWidth;height=image.naturalHeight}
  const maxSide=1600,scale=Math.min(1,maxSide/Math.max(width,height)),canvas=document.createElement("canvas");canvas.width=Math.max(1,Math.round(width*scale));canvas.height=Math.max(1,Math.round(height*scale));const context=canvas.getContext("2d")!;context.imageSmoothingEnabled=true;context.imageSmoothingQuality="high";context.drawImage(source,0,0,canvas.width,canvas.height);close?.();return canvas.toDataURL("image/jpeg",.82)
 }
 async function uploadAvatar(event:ChangeEvent<HTMLInputElement>){const file=event.target.files?.[0];event.target.value="";if(!file)return;notify("Оптимизируем фотографию…");try{const dataUrl=await optimizeAvatar(file);setAvatarEditor({dataUrl,zoom:1,x:0,y:0,enhance:true})}catch(error){notify(error instanceof Error?error.message:"Не удалось открыть фотографию")}}
 async function saveAvatar(){if(!avatarEditor||!profile)return;const image=new Image();image.src=avatarEditor.dataUrl;await new Promise(resolve=>image.onload=resolve);const canvas=document.createElement("canvas"),size=512;canvas.width=size;canvas.height=size;const context=canvas.getContext("2d")!;context.imageSmoothingEnabled=true;context.imageSmoothingQuality="high";if(avatarEditor.enhance)context.filter="contrast(1.08) saturate(1.14) brightness(1.03)";const base=Math.max(size/image.naturalWidth,size/image.naturalHeight)*avatarEditor.zoom,w=image.naturalWidth*base,h=image.naturalHeight*base;context.drawImage(image,(size-w)/2+avatarEditor.x*size,(size-h)/2+avatarEditor.y*size,w,h);const avatarData=canvas.toDataURL("image/jpeg",.84),r=await appFetch("/api/avatar",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({avatarData,label:avatarEditor.enhance?"ИИ-улучшение":"Оригинал"})}),data=await r.json().catch(()=>({}));if(r.ok){setProfile({...profile,avatarUrl:data.avatarUrl,avatarPreset:null,hasAvatar:true});setAvatarEditor(null);notify("Аватар сохранён")}else notify(data.error||"Фото не загружено")}
 async function loadAvatarGallery(){const r=await appFetch("/api/avatar?gallery=1",{cache:"no-store"});if(r.ok)setAvatarGallery((await r.json()).items||[])}
 async function avatarAction(action:"select"|"delete",assetId:string){const r=await appFetch("/api/avatar",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action,assetId})});if(r.ok){await loadAvatarGallery();await loadPeople()}else notify("Не удалось изменить аватар")}

 if(error)return <div className="orbit-auth"><img src="/orbit-connect-icon-192.png" alt="Orbit"/><p>ORBIT / CONNECT</p><h1>Нет соединения</h1><span>{error}</span><button onClick={()=>location.reload()}>Повторить</button></div>;
 if(!ready||intro)return <EntryIntro/>;
 if(profile&&!profile.registered)return <Registration profile={profile} onComplete={value=>{setProfile(value);void loadAll()}} notify={notify}/>;

 const accent=THEMES.find(item=>item.id===theme)?.color||THEMES[0].color;
 return <main className="orbit-v4" data-theme={theme} style={{"--accent":accent,"--accent-ink":"#07100b"} as CSSProperties}>
  <aside className="orbit-nav"><img src="/orbit-connect-icon-192.png" alt="Orbit Connect"/><button className={section==="chats"?"active":""} onClick={()=>setSection("chats")}><i className="nav-glyph">▤</i><span>Чаты</span></button><button className={section==="contacts"?"active":""} onClick={()=>setSection("contacts")}><i className="nav-glyph">♙</i><span>Контакты</span></button><button className={section==="settings"?"active":""} onClick={()=>setSection("settings")}><i className="nav-glyph">⚙</i><span>Настройки</span></button></aside>
  <section className="orbit-list">
   <header><div><small>ORBIT / CONNECT</small><h1>{section==="chats"?"Сообщения":section==="contacts"?"Контакты":"Настройки"}</h1></div>{section!=="settings"&&<button className="compose" aria-label="Создать сообщение" onClick={()=>{setComposeOpen(true);setSearch("")}}>✎</button>}</header>
   {section==="chats"&&<div className="list-scroll"><button className="new-message" onClick={()=>setComposeOpen(true)}>✎ <span><b>Создать сообщение</b><small>Контакт, номер, имя или $никнейм</small></span></button>{chats.map(chat=><div key={chat.id} className={activeChat?.id===chat.id?"person-row selected chat-row":"person-row chat-row"}><button className="person-main" onClick={()=>{setActiveChat(chat);setMobileChatOpen(true);void loadMessages(chat.id)}}><Avatar name={chat.name} url={chat.avatarUrl} preset={chat.avatarPreset}/><span><b>{chat.name}</b><small>{chat.kind==="channel"?"Канал новостей":chat.kind==="group"?"Группа":"Личный чат"}</small></span></button>{Boolean(chat.unreadCount)&&<b className="unread-count" aria-label={`Непрочитанных сообщений: ${chat.unreadCount}`}>{Math.min(999,chat.unreadCount||0)}</b>}<button className={`chat-pin${chat.pinnedAt||chat.systemPinned?" active":""}`} aria-label={chat.systemPinned?"Всегда закреплено":chat.pinnedAt?"Открепить чат":"Закрепить чат"} title={chat.systemPinned?"Всегда закреплено":chat.pinnedAt?"Открепить чат":"Закрепить чат"} onClick={()=>void togglePin(chat)}>⌖</button></div>)}</div>}
   {section==="contacts"&&<div className="list-scroll"><div className="section-label">МОИ КОНТАКТЫ · {contacts.length}</div>{contacts.length===0&&<Empty text="Контактов пока нет. Нажмите «Создать сообщение» и найдите человека."/ >}{contacts.map(person=><div key={person.id} className="person-row"><button className="person-main" onClick={()=>void openProfile(person)}><Avatar name={person.name} url={person.avatarUrl} preset={person.avatarPreset}/><span><b>{person.name}</b><small>{person.handle} {person.online?"· онлайн":""}</small></span></button><button className="write" onClick={()=>void openChat(person)}>Написать</button></div>)}</div>}
   {section==="settings"&&profile&&<Settings profile={profile} setProfile={setProfile} saveProfile={saveProfile} toggleSync={toggleSync} syncing={syncing} syncNow={()=>syncPhonebook(false)} avatarInput={avatarInput} uploadAvatar={uploadAvatar} openPrivacy={()=>setPrivacyOpen(true)} openGallery={()=>void openGallery()} avatarGallery={avatarGallery} loadAvatarGallery={()=>void loadAvatarGallery()} avatarAction={(action,id)=>void avatarAction(action,id)} theme={theme} setTheme={value=>{setTheme(value);localStorage.setItem("orbit_theme",value)}} shareApp={()=>void shareApp()}/>}
   {section==="settings"&&<div className="settings-tools"><button aria-label="Проверить обновления" title="Проверить обновления" disabled={checkingUpdate} onClick={()=>void checkUpdates(true)}><span className="settings-tool-glyph">⟳</span></button><button aria-label="Настройки уведомлений" title="Настройки уведомлений" onClick={()=>setNotificationSettingsOpen(true)}><span className="settings-tool-glyph">♫</span></button></div>}
  </section>
  <section className={mobileChatOpen?"orbit-chat mobile-open":"orbit-chat"}>
   {activeChat?<>
    <header><button className="mobile-chat-back" onClick={()=>setMobileChatOpen(false)}>‹</button><Avatar name={activeChat.name} url={activeChat.avatarUrl} preset={activeChat.avatarPreset}/><div><b>{activeChat.name}</b><small>{activeChat.kind==="channel"?"официальный канал":activeChat.kind==="group"?"группа":"личный чат"}</small></div><button onClick={()=>notify("Аудиозвонок запускается")}>☎</button><button onClick={()=>notify("Видеозвонок запускается")}>▣</button></header>
    <div className="message-scroll">{messages.map(message=><MessageBubble key={message.id} message={message} mine={message.senderId===profile?.id} reply={messages.find(item=>item.id===message.replyTo)} menu={()=>setMessageMenu(message)} answer={()=>setReplyingTo(message)} share={()=>void messageAction("share",message)}/>)}</div>
    {editingMessage&&<div className="editing-bar"><span><b>Редактирование</b><small>{editingMessage.body}</small></span><button onClick={()=>{setEditingMessage(null);setDraft("")}}>×</button></div>}
    {replyingTo&&<div className="editing-bar"><span><b>Ответ на сообщение</b><small>{replyingTo.body||replyingTo.fileName}</small></span><button onClick={()=>setReplyingTo(null)}>×</button></div>}
    {activeChat.kind==="channel"&&!activeChat.canPost?<div className="channel-readonly">📡 Новости публикует только владелец канала</div>:<><div className="ai-row"><button className="tool-icon" aria-label="ИИ-помощник" disabled={aiWorking} onClick={()=>setAiMenuOpen(value=>!value)}>✦</button><button className="tool-icon" aria-label="Эмодзи и стикеры" onClick={()=>setEmojiOpen(value=>!value)}>☺</button>{aiMenuOpen&&<div className="ai-menu"><button disabled={aiWorking} onClick={()=>void ai("generate")}>✦ Написать</button><button disabled={!draft||aiWorking||Boolean(profile?.autoCorrectEnabled)} title={profile?.autoCorrectEnabled?"Исправление включено автоматически":""} onClick={()=>void ai("correct")}>✓ Исправить ошибки</button><button disabled={!draft||aiWorking} onClick={()=>void ai("emoji")}>☺ Расставить эмодзи</button></div>}{emojiOpen&&<EmojiPicker insert={emoji=>setDraft(value=>value+emoji)} sticker={url=>void sendSticker(url)}/>}</div>
    <footer><button onClick={()=>setAttachmentOpen(value=>!value)}>＋</button>{attachmentOpen&&<div className="attachment-menu"><button onClick={()=>photoInput.current?.click()}>▧ Фото из галереи</button><button onClick={()=>fileInput.current?.click()}>⌑ Файл с устройства</button></div>}<input ref={photoInput} type="file" accept="image/*" hidden onChange={attach}/><input ref={fileInput} type="file" hidden onChange={attach}/><textarea rows={1} value={draft} onChange={event=>setDraft(event.target.value)} onKeyDown={event=>{if(event.key==="Enter"&&!event.shiftKey){event.preventDefault();void send()}}} placeholder={editingMessage?"Измените сообщение":"Сообщение"}/><button className="send" onClick={()=>void send()}>{editingMessage?"✓":"↑"}</button></footer></>}
   </>:<Empty text="Выберите чат или создайте новое сообщение"/>}
  </section>
  {composeOpen&&<Compose contacts={contacts} results={searchResults} search={search} setSearch={setSearch} close={()=>setComposeOpen(false)} addContact={addContact} openChat={openChat} openProfile={openProfile}/>}
  {profileOpen&&<ProfileModal profile={profileOpen} close={()=>setProfileOpen(null)} addContact={addContact} openChat={openChat}/>}
  {privacyOpen&&profile&&<PrivacyModal profile={profile} close={()=>setPrivacyOpen(false)} save={async privacy=>{const next={...profile,privacy};setProfile(next);if(await saveProfile(next))setPrivacyOpen(false)}}/>}
  {updateInfo&&<UpdateModal info={updateInfo} close={()=>setUpdateInfo(null)} apply={()=>void applyUpdate()}/>}
  {notificationSettingsOpen&&<NotificationSettings enabled={notificationsEnabled} sound={soundEnabled} close={()=>setNotificationSettingsOpen(false)} setEnabled={value=>void setNotificationPreference(value)} setSound={setSoundPreference} preview={()=>void previewPlum()}/>}
  {messageMenu&&<MessageActions message={messageMenu} mine={messageMenu.senderId===profile?.id} close={()=>setMessageMenu(null)} act={action=>void messageAction(action,messageMenu)}/>}
  {forwardMessage&&<ForwardMessage chats={chats} close={()=>setForwardMessage(null)} forward={chatId=>void forwardTo(chatId)}/>}
  {deleteMessage&&<DeleteMessage mine={deleteMessage.senderId===profile?.id} group={activeChat?.kind==="group"} close={()=>setDeleteMessage(null)} remove={scope=>void removeMessage(scope)}/>}
  {galleryOpen&&<MediaGallery items={galleryItems} close={()=>setGalleryOpen(false)}/>}
  {avatarEditor&&<AvatarEditor value={avatarEditor} setValue={setAvatarEditor} close={()=>setAvatarEditor(null)} save={()=>void saveAvatar()}/>}
  {toast&&<div className="orbit-toast">{toast}</div>}
 </main>
}

function Avatar({name,url,preset}:{name:string;url?:string|null;preset?:string|null}){return <span className={`orbit-avatar${preset&&!url?" preset":""}`} style={url?{backgroundImage:`url(${url})`}:undefined}>{url?"":preset||initials(name)}</span>}
function Empty({text}:{text:string}){return <div className="orbit-empty"><img src="/orbit-connect-logo-v3.png" alt=""/><p>{text}</p></div>}
function EntryIntro(){return <div className="entry-intro"><div className="entry-halo"><img src="/orbit-connect-icon-192.png" alt="Orbit Connect"/><i/><i/></div><div className="entry-word"><b>ORBIT</b><span>CONNECT</span></div><small>ТВОЙ КРУГ СТАНОВИТСЯ БЛИЖЕ</small></div>}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function LegacyRegistration({profile,onComplete,notify}:{profile:Profile;onComplete:(profile:Profile)=>void;notify:(text:string)=>void}){
 const [step,setStep]=useState<"phone"|"login"|"code"|"profile">("phone"),[phone,setPhone]=useState(""),[code,setCode]=useState(""),[loginPassword,setLoginPassword]=useState(""),[demoCode,setDemoCode]=useState("");
 const [form,setForm]=useState({name:"",email:"",birthYear:"",handle:profile.handle||profile.publicId||"",telegram:"",vk:"",website:"",password:"",confirmPassword:""}),[busy,setBusy]=useState(false);
 async function requestCode(){if(busy)return;setBusy(true);try{const r=await appFetch("/api/registration",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action:"request-code",phone})});const data=await r.json().catch(()=>({}));if(r.status===409){setStep("login");notify("Номер уже зарегистрирован — введите пароль");return}if(!r.ok){notify(data.error||"Не удалось отправить код");return}setDemoCode(data.demoCode||"");setStep("code")}catch{notify("Нет связи с сервисом регистрации")}finally{setBusy(false)}}
 async function login(){if(busy)return;setBusy(true);try{const r=await fetch("/api/auth",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action:"login",phone,password:loginPassword})}),data=await r.json().catch(()=>({}));if(!r.ok){notify(data.error||"Не удалось войти");return}localStorage.setItem("orbit_session",data.token);location.reload()}catch{notify("Нет связи с сервером входа")}finally{setBusy(false)}}
 async function verify(){setBusy(true);const r=await appFetch("/api/registration",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action:"verify-code",code})});const data=await r.json().catch(()=>({}));setBusy(false);if(!r.ok){notify(data.error||"Неверный код");return}setStep("profile")}
 async function complete(event:FormEvent){event.preventDefault();if(form.password!==form.confirmPassword){notify("Пароли не совпадают");return}setBusy(true);const r=await appFetch("/api/registration",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action:"complete",name:form.name,email:form.email,birthYear:form.birthYear?Number(form.birthYear):null,handle:form.handle,password:form.password,socials:{telegram:form.telegram,vk:form.vk,website:form.website}})});const data=await r.json().catch(()=>({}));setBusy(false);if(!r.ok){notify(data.error||"Не удалось завершить регистрацию");return}onComplete(data.profile)}
 return <div className="registration-screen"><div className="registration-brand"><img src="/orbit-connect-icon-192.png" alt="Orbit"/><span>ORBIT / CONNECT</span></div><div className="registration-card"><small>РЕГИСТРАЦИЯ · {step==="phone"?"01":step==="code"?"02":"03"}</small>{step==="phone"&&<><h1>Ваш номер</h1><p>Телефон обязателен для защиты аккаунта и поиска знакомых.</p><label>Номер телефона<input autoFocus inputMode="tel" value={phone} onChange={event=>setPhone(event.target.value)} placeholder="+7 999 123-45-67"/></label><button disabled={busy||normalizePhone(phone).length<10} onClick={()=>void requestCode()}>Получить код →</button></>}{step==="code"&&<><h1>Подтверждение</h1><p>Введите шестизначный код из SMS.</p>{demoCode&&<div className="demo-code">Тестовый SMS-код: <b>{demoCode}</b></div>}<label>Код<input autoFocus inputMode="numeric" maxLength={6} value={code} onChange={event=>setCode(event.target.value.replace(/\D/g,""))} placeholder="000000"/></label><button disabled={busy||code.length!==6} onClick={()=>void verify()}>Подтвердить →</button><button className="link-button" onClick={()=>setStep("phone")}>Изменить номер</button></>}{step==="profile"&&<form onSubmit={complete}><h1>Ваш профиль</h1><p>ФИО и email обязательны. Остальное можно изменить позже.</p><label>ФИО<input required autoFocus value={form.name} onChange={event=>setForm({...form,name:event.target.value})} placeholder="Иванов Иван Иванович"/></label><label>Email<input required type="email" value={form.email} onChange={event=>setForm({...form,email:event.target.value})} placeholder="name@example.com"/></label><label>Уникальный никнейм<input required value={form.handle} onChange={event=>setForm({...form,handle:event.target.value.startsWith("$")?event.target.value:`$${event.target.value}`})} placeholder="$orbit_user"/></label><small>Постоянный ID: {profile.publicId}</small><label>Год рождения — по желанию<input inputMode="numeric" maxLength={4} value={form.birthYear} onChange={event=>setForm({...form,birthYear:event.target.value.replace(/\D/g,"")})} placeholder="1990"/></label><label>Telegram<input value={form.telegram} onChange={event=>setForm({...form,telegram:event.target.value})} placeholder="@username"/></label><label>ВКонтакте<input value={form.vk} onChange={event=>setForm({...form,vk:event.target.value})} placeholder="vk.com/username"/></label><label>Сайт<input value={form.website} onChange={event=>setForm({...form,website:event.target.value})} placeholder="https://example.com"/></label><button disabled={busy}>Войти в Orbit →</button></form>}</div></div>
}

function Registration({profile,onComplete,notify}:{profile:Profile;onComplete:(profile:Profile)=>void;notify:(text:string)=>void}){
 const [step,setStep]=useState<"phone"|"login"|"reset"|"code"|"profile">("phone"),[phone,setPhone]=useState(""),[countryIso,setCountryIso]=useState("RU"),[countryDetected,setCountryDetected]=useState(false),[code,setCode]=useState(""),[password,setPassword]=useState(""),[confirm,setConfirm]=useState(""),[demoCode,setDemoCode]=useState(""),[busy,setBusy]=useState(false),[message,setMessage]=useState("");
 const [form,setForm]=useState({name:"",email:"",birthYear:"",handle:profile.handle||profile.publicId||"",telegram:"",vk:"",website:""});
 const country=COUNTRIES.find(item=>item.iso===countryIso)||COUNTRIES[0];
 const fullPhone=`+${country.dial}${phone.replace(/\D/g,"").replace(/^0+/,"")}`;
 useEffect(()=>{let active=true;fetch("/api/country",{cache:"no-store"}).then(response=>response.json()).then(data=>{if(active&&COUNTRIES.some(item=>item.iso===data.country)){setCountryIso(data.country);setCountryDetected(true)}}).catch(()=>undefined);return()=>{active=false}},[]);
 function inputPhone(value:string){if(value.trim().startsWith("+")){const digits=value.replace(/\D/g,"");const detected=[...COUNTRIES].sort((a,b)=>b.dial.length-a.dial.length).find(item=>digits.startsWith(item.dial));if(detected){setCountryIso(detected.iso);setPhone(digits.slice(detected.dial.length));return}}setPhone(value.replace(/\D/g,"").slice(0,14))}
 const show=(text:string)=>{setMessage(text);notify(text)};
 async function requestCode(){setBusy(true);try{const r=await appFetch("/api/registration",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action:"request-code",phone:fullPhone})}),data=await r.json().catch(()=>({}));if(r.status===409){setStep("login");notify("Номер уже зарегистрирован — введите пароль")}else if(!r.ok)notify(data.error||"Не удалось отправить код");else{setDemoCode(data.demoCode||"");setStep("code")}}catch{notify("Нет связи с сервисом регистрации")}finally{setBusy(false)}}
 async function login(){setBusy(true);try{const r=await fetch("/api/auth",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action:"login",phone:fullPhone,password})}),data=await r.json().catch(()=>({}));if(!r.ok){notify(data.error||"Не удалось войти");return}localStorage.setItem("orbit_session",data.token);location.reload()}catch{notify("Нет связи с сервером входа")}finally{setBusy(false)}}
 async function requestReset(){setBusy(true);const r=await fetch("/api/auth",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action:"request-password-code",phone:fullPhone})}),data=await r.json().catch(()=>({}));setBusy(false);if(!r.ok)notify(data.error||"Код не отправлен");else{setDemoCode(data.demoCode||"");setStep("reset")}}
 async function resetPassword(){if(password!==confirm){show("Пароли не совпадают");return}setMessage("");setBusy(true);try{const r=await fetch("/api/auth",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action:"reset-password",phone:fullPhone,code,password})}),data=await r.json().catch(()=>({}));if(!r.ok){show(data.error||"Пароль не установлен");return}localStorage.setItem("orbit_session",data.token);location.reload()}catch{show("Нет связи с сервером. Повторите попытку") }finally{setBusy(false)}}
 async function verify(){setBusy(true);const r=await appFetch("/api/registration",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action:"verify-code",code})}),data=await r.json().catch(()=>({}));setBusy(false);if(!r.ok)notify(data.error||"Неверный код");else setStep("profile")}
 async function complete(event:FormEvent){event.preventDefault();if(password!==confirm){notify("Пароли не совпадают");return}setBusy(true);const r=await appFetch("/api/registration",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action:"complete",...form,birthYear:form.birthYear?Number(form.birthYear):null,password,socials:{telegram:form.telegram,vk:form.vk,website:form.website}})}),data=await r.json().catch(()=>({}));setBusy(false);if(!r.ok)notify(data.error||"Не удалось завершить регистрацию");else onComplete(data.profile)}
 const field=(key:keyof typeof form,label:string,type="text")=><label>{label}<input type={type} value={form[key]} onChange={event=>setForm({...form,[key]:event.target.value})}/></label>;
 return <div className="registration-screen"><div className="registration-brand"><img src="/orbit-connect-icon-192.png" alt="Orbit"/><span>ORBIT / CONNECT</span></div><div className="registration-card"><small>{step==="login"?"ВХОД":`РЕГИСТРАЦИЯ · ${step==="phone"?"01":step==="code"?"02":"03"}`}</small>
 {step==="phone"&&<><h1>Ваш номер</h1><p>Новый пользователь подтверждает телефон. Если аккаунт уже есть — войдите по паролю.</p><label>Страна<select className="country-select" value={countryIso} onChange={event=>{setCountryIso(event.target.value);setCountryDetected(false)}}>{COUNTRIES.map(item=><option value={item.iso} key={item.iso}>{item.flag} {item.name} (+{item.dial})</option>)}</select></label>{countryDetected&&<small className="country-detected">⌖ Страна определена автоматически</small>}<label>Номер телефона<div className="phone-country-field"><b>+{country.dial}</b><input autoFocus inputMode="tel" value={phone} onChange={event=>inputPhone(event.target.value)} placeholder="Номер телефона"/></div></label><button disabled={busy||normalizePhone(fullPhone).length<10} onClick={()=>void requestCode()}>{busy?"Отправляем…":"Получить код →"}</button><button className="link-button" disabled={normalizePhone(fullPhone).length<10} onClick={()=>setStep("login")}>У меня уже есть аккаунт</button></>}
 {step==="login"&&<><h1>Вход по паролю</h1><p>Номер: {fullPhone}</p><label>Пароль<input type="password" value={password} onChange={event=>setPassword(event.target.value)} onKeyDown={event=>{if(event.key==="Enter")void login()}}/></label><button disabled={busy||password.length<6} onClick={()=>void login()}>Войти →</button><button className="link-button" onClick={()=>void requestReset()}>Задать или восстановить пароль по SMS</button><button className="link-button" onClick={()=>setStep("phone")}>Назад</button></>}
 {step==="reset"&&<><h1>Новый пароль</h1><p>Введите код из SMS и новый пароль.</p>{demoCode&&<div className="demo-code">Тестовый SMS-код: <b>{demoCode}</b></div>}<label>Код<input inputMode="numeric" maxLength={6} value={code} onChange={event=>setCode(event.target.value.replace(/\D/g,""))}/></label><label>Новый пароль<input type="password" value={password} onChange={event=>setPassword(event.target.value)}/></label><label>Повторите пароль<input type="password" value={confirm} onChange={event=>setConfirm(event.target.value)}/></label>{message&&<div className="demo-code">{message}</div>}<button disabled={busy||code.length!==6||password.length<6||password!==confirm} onClick={()=>void resetPassword()}>{busy?"Сохраняем…":"Сохранить пароль и войти →"}</button></>}
 {step==="code"&&<><h1>Подтверждение</h1><p>Введите шестизначный код из SMS.</p>{demoCode&&<div className="demo-code">Тестовый SMS-код: <b>{demoCode}</b></div>}<label>Код<input inputMode="numeric" maxLength={6} value={code} onChange={event=>setCode(event.target.value.replace(/\D/g,""))}/></label><button disabled={busy||code.length!==6} onClick={()=>void verify()}>Подтвердить →</button></>}
 {step==="profile"&&<form onSubmit={complete}><h1>Ваш профиль</h1><p>Пароль: минимум 6 знаков, одна буква и одна цифра.</p>{field("name","ФИО")}{field("email","Email","email")}<label>Пароль<input required type="password" minLength={6} value={password} onChange={event=>setPassword(event.target.value)}/></label><label>Повторите пароль<input required type="password" minLength={6} value={confirm} onChange={event=>setConfirm(event.target.value)}/></label>{field("handle","Уникальный $никнейм")}{field("birthYear","Год рождения — по желанию")}{field("telegram","Telegram")}{field("vk","ВКонтакте")}{field("website","Сайт")}<button disabled={busy||password!==confirm||password.length<6}>Завершить регистрацию →</button></form>}</div></div>
}

function Settings({profile,setProfile,saveProfile,toggleSync,syncing,syncNow,avatarInput,uploadAvatar,openPrivacy,openGallery,avatarGallery,loadAvatarGallery,avatarAction,theme,setTheme,shareApp}:{profile:Profile;setProfile:(value:Profile)=>void;saveProfile:(value:Profile)=>Promise<boolean>;toggleSync:(value:boolean)=>Promise<void>;syncing:boolean;syncNow:()=>void;avatarInput:React.RefObject<HTMLInputElement|null>;uploadAvatar:(event:ChangeEvent<HTMLInputElement>)=>void;openPrivacy:()=>void;openGallery:()=>void;avatarGallery:Array<{id:string;url:string;label:string}>;loadAvatarGallery:()=>void;avatarAction:(action:"select"|"delete",id:string)=>void;theme:string;setTheme:(value:string)=>void;shareApp:()=>void}){
 const socials=profile.socials||{};
 return <div className="settings-scroll">
  <button className="profile-photo" onClick={()=>avatarInput.current?.click()}><Avatar name={profile.name} url={profile.avatarUrl} preset={profile.avatarPreset}/><b>Загрузить и настроить фотографию</b></button><input ref={avatarInput} type="file" accept="image/*" hidden onChange={uploadAvatar}/>
  <div className="setting-block avatar-library"><button className="plain-row" onClick={loadAvatarGallery}><span><b>Мои аватары</b><small>Выбрать или удалить ранее загруженные</small></span><b>↻</b></button>{avatarGallery.length>0&&<div className="avatar-history">{avatarGallery.map(item=><div key={item.id}><img src={item.url} alt={item.label}/><button onClick={()=>avatarAction("select",item.id)}>Выбрать</button><button onClick={()=>avatarAction("delete",item.id)}>Удалить</button></div>)}</div>}</div>
  <div className="avatar-presets"><small>ИЛИ ВЫБЕРИТЕ СТАНДАРТНУЮ ИКОНКУ</small><div>{AVATAR_PRESETS.map(item=><button key={item} className={profile.avatarPreset===item?"active":""} onClick={()=>{const next={...profile,avatarPreset:item,avatarUrl:null};setProfile(next);void saveProfile(next)}}>{item}</button>)}</div></div>
  <div className="identity"><b>{profile.name}</b><span>{profile.handle}</span><small>Неизменяемый ID: {profile.publicId}</small></div>
  <div className="setting-block"><h3>Профиль</h3><label>ФИО<input value={profile.name} onChange={event=>setProfile({...profile,name:event.target.value})}/></label><label>Никнейм<input value={profile.handle} onChange={event=>setProfile({...profile,handle:event.target.value.startsWith("$")?event.target.value:`$${event.target.value}`})}/></label><label>Email<input type="email" value={profile.email||""} onChange={event=>setProfile({...profile,email:event.target.value})}/></label><label>Статус<textarea rows={3} maxLength={120} value={profile.status||""} onChange={event=>setProfile({...profile,status:event.target.value})} placeholder="Расскажите, чем вы заняты"/></label><label>Год рождения<input inputMode="numeric" value={profile.birthYear||""} onChange={event=>setProfile({...profile,birthYear:Number(event.target.value)||null})}/></label><label>Telegram<input value={socials.telegram||""} onChange={event=>setProfile({...profile,socials:{...socials,telegram:event.target.value}})}/></label><label>ВКонтакте<input value={socials.vk||""} onChange={event=>setProfile({...profile,socials:{...socials,vk:event.target.value}})}/></label><label>Сайт<input value={socials.website||""} onChange={event=>setProfile({...profile,socials:{...socials,website:event.target.value}})}/></label><button className="primary-action" onClick={()=>void saveProfile(profile)}>Сохранить профиль</button></div>
  <div className="setting-block"><h3>Общие настройки</h3><label className="switch-row"><span><b>Исправлять все ошибки автоматически</b><small>Перед отправкой ИИ проверит орфографию и пунктуацию</small></span><input type="checkbox" role="switch" checked={Boolean(profile.autoCorrectEnabled)} onChange={event=>{const next={...profile,autoCorrectEnabled:event.target.checked};setProfile(next);void saveProfile(next)}}/><i/></label></div>
  <div className="setting-block"><h3>Цвет приложения</h3><div className="theme-grid">{THEMES.map(item=><button key={item.id} className={theme===item.id?"active":""} style={{"--swatch":item.color} as CSSProperties} onClick={()=>setTheme(item.id)}><i/>{item.name}</button>)}</div></div>
  <div className="setting-block"><h3>Контакты</h3><label className="switch-row"><span><b>Постоянная синхронизация</b><small>При открытии приложения и каждые 2 минуты</small></span><input type="checkbox" role="switch" checked={Boolean(profile.syncContactsEnabled)} onChange={event=>void toggleSync(event.target.checked)}/><i/></label><button className="plain-row" disabled={syncing} onClick={syncNow}><span>{syncing?"Синхронизация…":"Синхронизировать сейчас"}</span><b>↻</b></button></div>
  <div className="setting-block"><button className="plain-row" onClick={openGallery}><span><b>Личная галерея</b><small>Все отправленные фотографии и файлы</small></span><b className="row-arrow">›</b></button><button className="plain-row" onClick={openPrivacy}><span><b>Конфиденциальность</b><small>Кто видит данные профиля</small></span><b className="row-arrow">›</b></button></div><button className="app-share-row" onClick={shareApp}><span className="app-share-icon">↗</span><span><b>Поделиться приложением</b><small>Отправить ссылку контакту или в другое приложение</small></span></button>
 </div>
}

function MessageBubble({message,mine,reply,menu,answer,share}:{message:Message;mine:boolean;reply?:Message;menu:()=>void;answer:()=>void;share:()=>void}){
 const start=useRef({x:0,y:0}),timer=useRef<number|undefined>(undefined);
 const status=message.deliveryStatus==="read"?"прочитано":message.deliveryStatus==="delivered"?"доставлено":"отправлено";
 function down(event:React.PointerEvent){start.current={x:event.clientX,y:event.clientY};timer.current=window.setTimeout(menu,550)}
 function up(event:React.PointerEvent){if(timer.current)window.clearTimeout(timer.current);const dx=event.clientX-start.current.x,dy=Math.abs(event.clientY-start.current.y);if(dy<60&&dx>70)answer();if(dy<60&&dx<-70)share()}
 function cancel(){if(timer.current)window.clearTimeout(timer.current)}
 return <div className={`${mine?"msg me":"msg"}${message.deletedAt?" deleted":""}`} onPointerDown={down} onPointerUp={up} onPointerCancel={cancel} onPointerLeave={cancel} onContextMenu={event=>{event.preventDefault();menu()}}>
  {message.forwardedFromId&&<small className="forwarded-label">↗ Пересланное сообщение</small>}
  {reply&&<div className="reply-preview"><b>Ответ</b><span>{reply.body||reply.fileName}</span></div>}
  {message.deletedAt?<p className="deleted-copy">Сообщение удалено</p>:message.kind==="photo"?<a className="photo-message" href={`/api/files?id=${encodeURIComponent(message.id)}`} download><img src={`/api/files?id=${encodeURIComponent(message.id)}&inline=1`} alt={message.fileName||"Фото"}/><span>↓ Скачать фото</span></a>:message.kind==="file"?<a className="file-message" href={`/api/files?id=${encodeURIComponent(message.id)}`} download><b>⌑</b><span><strong>{message.fileName||"Файл"}</strong><small>{message.fileSize?Math.ceil(message.fileSize/1024)+" КБ":""} · Скачать</small></span></a>:message.kind==="sticker"?<img className="orbit-sticker" src={message.body||""} alt="Стикер"/>:<p>{message.body}</p>}
  <div className="message-meta">{message.editedAt&&<span>изменено</span>}<time>{new Date(message.createdAt).toLocaleTimeString("ru-RU",{hour:"2-digit",minute:"2-digit"})}</time>{mine&&!message.deletedAt&&<span className={`delivery ${message.deliveryStatus||"sent"}`} title={status}>{message.deliveryStatus==="read"?"✓✓":"✓"} {status}</span>}</div>
 </div>
}

function EmojiPicker({insert,sticker}:{insert:(value:string)=>void;sticker:(url:string)=>void}){
 const [tab,setTab]=useState<"classic"|"live"|"stickers">("classic");
 return <div className="emoji-picker"><nav><button className={tab==="classic"?"active":""} onClick={()=>setTab("classic")}>Классические</button><button className={tab==="live"?"active":""} onClick={()=>setTab("live")}>Живые</button><button className={tab==="stickers"?"active":""} onClick={()=>setTab("stickers")}>Стикеры</button></nav>{tab==="classic"&&EMOJI_GROUPS.map(group=><section key={group.name}><small>{group.name}</small><div>{group.items.split(" ").map((emoji,index)=><button key={`${emoji}-${index}`} onClick={()=>insert(emoji)}>{emoji}</button>)}</div></section>)}{tab==="live"&&<section><small>Живые эмоции Orbit</small><div className="live-emojis">{"🥳 🤩 😂 😍 🔥 ✨ 🪐 💫".split(" ").map(emoji=><button key={emoji} onClick={()=>insert(emoji)}>{emoji}</button>)}</div></section>}{tab==="stickers"&&<section><small>Orbit · настроение</small><div className="sticker-grid">{[1,2,3,4,5,6,7,8,9].map(id=><button key={id} onClick={()=>sticker(`/emoji/orbit-${id}.webp`)}><img src={`/emoji/orbit-${id}.webp`} alt={`Стикер ${id}`}/></button>)}</div></section>}</div>
}

function MediaGallery({items,close}:{items:Array<{id:string;kind:string;fileName?:string;url:string}>;close:()=>void}){return <div className="modal-back"><div className="media-gallery"><header><div><small>ЛИЧНОЕ ХРАНИЛИЩЕ</small><h2>Фото и медиа</h2></div><button onClick={close}>×</button></header><div>{items.length===0?<p>Вы ещё не отправляли файлы.</p>:items.map(item=><a key={item.id} href={item.url} download>{item.kind==="photo"?<img src={`${item.url}&inline=1`} alt={item.fileName||"Фото"}/>:<b>⌑</b>}<span>{item.fileName||"Файл"}</span></a>)}</div></div></div>}

function AvatarEditor({value,setValue,close,save}:{value:AvatarEditState;setValue:(value:AvatarEditState)=>void;close:()=>void;save:()=>void}){
 const pointers=useRef(new Map<number,{x:number;y:number}>()),latest=useRef(value),gesture=useRef({distance:0,centerX:0,centerY:0});
 useEffect(()=>{latest.current=value},[value]);
 const update=(next:AvatarEditState)=>{latest.current=next;setValue(next)};
 const center=()=>{const items=[...pointers.current.values()];return{x:items.reduce((sum,item)=>sum+item.x,0)/items.length,y:items.reduce((sum,item)=>sum+item.y,0)/items.length}};
 const distance=()=>{const [a,b]=[...pointers.current.values()];return a&&b?Math.hypot(a.x-b.x,a.y-b.y):0};
 function pointerDown(event:React.PointerEvent<HTMLDivElement>){event.currentTarget.setPointerCapture(event.pointerId);pointers.current.set(event.pointerId,{x:event.clientX,y:event.clientY});const point=center();gesture.current={distance:distance(),centerX:point.x,centerY:point.y}}
 function pointerMove(event:React.PointerEvent<HTMLDivElement>){if(!pointers.current.has(event.pointerId))return;event.preventDefault();pointers.current.set(event.pointerId,{x:event.clientX,y:event.clientY});const point=center(),rect=event.currentTarget.getBoundingClientRect(),last=latest.current;let zoom=last.zoom;if(pointers.current.size>1&&gesture.current.distance>0)zoom=Math.max(1,Math.min(4,last.zoom*(distance()/gesture.current.distance)));const maxShift=.55*Math.max(1,zoom),x=Math.max(-maxShift,Math.min(maxShift,last.x+(point.x-gesture.current.centerX)/rect.width)),y=Math.max(-maxShift,Math.min(maxShift,last.y+(point.y-gesture.current.centerY)/rect.height));update({...last,zoom,x,y});gesture.current={distance:distance(),centerX:point.x,centerY:point.y}}
 function pointerUp(event:React.PointerEvent<HTMLDivElement>){pointers.current.delete(event.pointerId);if(pointers.current.size){const point=center();gesture.current={distance:distance(),centerX:point.x,centerY:point.y}}}
 return <div className="modal-back"><div className="avatar-editor"><header><div><small>РЕДАКТОР АВАТАРА</small><h2>Выберите кадр 1:1</h2></div><button onClick={close}>×</button></header><div className="avatar-crop" onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={pointerUp}><img draggable={false} src={value.dataUrl} alt="Новый аватар" style={{transform:`translate3d(${value.x*100}%,${value.y*100}%,0) scale(${value.zoom})`,filter:value.enhance?"contrast(1.08) saturate(1.14) brightness(1.03)":"none"}}/><i className="avatar-circle-guide"/></div><p className="avatar-gesture-hint"><b>Одним пальцем</b> двигайте фото · <b>двумя</b> увеличивайте</p><button className="avatar-reset" onClick={()=>update({...value,zoom:1,x:0,y:0})}>Вернуть исходный кадр</button><label className="switch-row"><span><b>Автоулучшение ИИ</b><small>Свет, цвет и выразительность портрета</small></span><input type="checkbox" checked={value.enhance} onChange={event=>update({...value,enhance:event.target.checked})}/><i/></label><button className="primary-action" onClick={save}>Сохранить аватар</button></div></div>
}

function Compose({contacts,results,search,setSearch,close,addContact,openChat,openProfile}:{contacts:Profile[];results:Profile[];search:string;setSearch:(value:string)=>void;close:()=>void;addContact:(person:Profile)=>Promise<void>;openChat:(person:Profile)=>Promise<void>;openProfile:(person:Profile)=>Promise<void>}){
 const list=search.trim()?results:contacts;return <div className="modal-back"><div className="compose-modal"><header><div><small>НОВОЕ СООБЩЕНИЕ</small><h2>Кому написать?</h2></div><button onClick={close}>×</button></header><label className="people-search">⌕<input autoFocus value={search} onChange={event=>setSearch(event.target.value)} placeholder="Имя, номер телефона или $никнейм"/></label><p>{search.trim()?"НАЙДЕННЫЕ ПОЛЬЗОВАТЕЛИ":"ВАШИ КОНТАКТЫ"}</p><div className="people-list">{list.length===0&&<Empty text={search?"Пользователь не найден":"Контактов пока нет"}/>} {list.map(person=><div key={person.id} className="person-row"><button className="person-main" onClick={()=>void openProfile(person)}><Avatar name={person.name} url={person.avatarUrl} preset={person.avatarPreset}/><span><b>{person.name}</b><small>{person.handle}</small></span></button>{!person.isContact&&<button className="write" onClick={()=>void addContact(person)}>Добавить</button>}<button className="write solid" onClick={()=>void openChat(person)}>Написать</button></div>)}</div></div></div>
}

function ProfileModal({profile,close,addContact,openChat}:{profile:Profile;close:()=>void;addContact:(person:Profile)=>Promise<void>;openChat:(person:Profile)=>Promise<void>}){
 return <div className="modal-back"><div className="profile-modal"><button className="modal-close" onClick={close}>×</button><Avatar name={profile.name} url={profile.avatarUrl} preset={profile.avatarPreset}/><h2>{profile.name}</h2><b>{profile.handle}</b><small>ID: {profile.publicId}</small>{profile.status&&<p className="profile-status">{profile.status}</p>}<dl>{profile.phone&&<><dt>Телефон</dt><dd>{profile.phone}</dd></>}{profile.email&&<><dt>Email</dt><dd>{profile.email}</dd></>}{Object.entries(profile.socials||{}).map(([key,value])=><div key={key}><dt>{key}</dt><dd>{value}</dd></div>)}</dl><div className="profile-actions">{!profile.isContact&&<button onClick={()=>void addContact(profile)}>Добавить контакт</button>}<button className="solid" onClick={()=>void openChat(profile)}>Написать</button></div></div></div>
}

function MessageActions({message,mine,close,act}:{message:Message;mine:boolean;close:()=>void;act:(action:"edit"|"copy"|"share"|"forward"|"delete")=>void}){
 return <div className="modal-back action-back" onClick={close}><div className="message-actions" onClick={event=>event.stopPropagation()}><header><small>ДЕЙСТВИЯ С СООБЩЕНИЕМ</small><button onClick={close}>×</button></header>{mine&&message.kind==="text"&&<button onClick={()=>act("edit")}>✎ <span><b>Редактировать</b><small>Изменить текст сообщения</small></span></button>}<button onClick={()=>act("copy")} disabled={!message.body}>▣ <span><b>Копировать</b><small>Сохранить текст в буфер обмена</small></span></button><button onClick={()=>act("share")}>↗ <span><b>Поделиться</b><small>Отправить через другое приложение</small></span></button><button onClick={()=>act("forward")}>⇢ <span><b>Переслать</b><small>Выбрать другой чат Orbit</small></span></button><button className="danger" onClick={()=>act("delete")}>⌫ <span><b>Удалить</b><small>У себя или у всех участников</small></span></button></div></div>
}

function ForwardMessage({chats,close,forward}:{chats:Chat[];close:()=>void;forward:(chatId:string)=>void}){
 return <div className="modal-back"><div className="compose-modal"><header><div><small>ПЕРЕСЛАТЬ</small><h2>Выберите чат</h2></div><button onClick={close}>×</button></header><div className="people-list">{chats.map(chat=><button className="person-row" key={chat.id} onClick={()=>forward(chat.id)}><Avatar name={chat.name} url={chat.avatarUrl} preset={chat.avatarPreset}/><span><b>{chat.name}</b><small>{chat.kind==="group"?"Группа":"Личный чат"}</small></span><b>⇢</b></button>)}</div></div></div>
}

function DeleteMessage({mine,group,close,remove}:{mine:boolean;group:boolean;close:()=>void;remove:(scope:"me"|"all")=>void}){
 return <div className="modal-back"><div className="delete-modal"><small>УДАЛЕНИЕ СООБЩЕНИЯ</small><h2>Где удалить?</h2><p>Выберите, у кого сообщение должно исчезнуть.</p><button onClick={()=>remove("me")}><b>Удалить только у меня</b><small>У остальных сообщение останется</small></button>{mine&&<button className="danger" onClick={()=>remove("all")}><b>Удалить у всех</b><small>{group?"У всех членов группы или сообщества":"У вас и у собеседника"}</small></button>}<button className="cancel-delete" onClick={close}>Отмена</button></div></div>
}

function PrivacyModal({profile,close,save}:{profile:Profile;close:()=>void;save:(privacy:Privacy)=>Promise<void>}){
 const [value,setValue]=useState<Privacy>(profile.privacy||{phone:false,email:false,status:true,socials:true,photo:true});
 const items:[keyof Privacy,string,string][]=[["phone","Номер телефона","Показывать подтверждённый номер"],["email","Email","Показывать адрес электронной почты"],["status","Статус","Показывать текст статуса"],["socials","Социальные сети","Показывать Telegram, VK и сайт"],["photo","Фотография","Показывать аватар другим пользователям"]];
 return <div className="modal-back"><div className="privacy-modal"><header><div><small>НАСТРОЙКИ</small><h2>Конфиденциальность</h2></div><button onClick={close}>×</button></header>{items.map(([key,title,description])=><label className="switch-row" key={key}><span><b>{title}</b><small>{description}</small></span><input type="checkbox" role="switch" checked={value[key]} onChange={event=>setValue({...value,[key]:event.target.checked})}/><i/></label>)}<button className="primary-action" onClick={()=>void save(value)}>Сохранить</button></div></div>
}

function UpdateModal({info,close,apply}:{info:UpdateInfo;close:()=>void;apply:()=>void}){
 return <div className="modal-back"><div className="update-modal"><button className="modal-close" onClick={close}>×</button><div className="update-logo"><img src="/orbit-connect-icon-192.png" alt="Orbit Connect"/><i>↻</i></div><small>ДОСТУПНО ОБНОВЛЕНИЕ</small><h2>{info.title}</h2><p>Новая версия уже готова. Обновление займёт несколько секунд и не удалит ваши сообщения.</p><ul>{info.notes.map(note=><li key={note}>{note}</li>)}</ul><button className="primary-action" onClick={apply}>Обновить внутри приложения →</button><button className="update-later" onClick={close}>Напомнить позже</button></div></div>
}

function NotificationSettings({enabled,sound,close,setEnabled,setSound,preview}:{enabled:boolean;sound:boolean;close:()=>void;setEnabled:(value:boolean)=>void;setSound:(value:boolean)=>void;preview:()=>void}){
 return <div className="modal-back"><div className="privacy-modal"><header><div><small>СООБЩЕНИЯ</small><h2>Уведомления</h2></div><button onClick={close}>×</button></header><label className="switch-row"><span><b>Уведомления о сообщениях</b><small>Показывать имя отправителя и текст</small></span><input type="checkbox" role="switch" checked={enabled} onChange={event=>setEnabled(event.target.checked)}/><i/></label><label className="switch-row"><span><b>Фирменный звук «плюм»</b><small>Короткий мягкий сигнал Orbit</small></span><input type="checkbox" role="switch" checked={sound} onChange={event=>setSound(event.target.checked)}/><i/></label><button className="plum-preview" onClick={preview}>▶ Прослушать «плюм»</button><button className="primary-action" onClick={close}>Готово</button></div></div>
}
