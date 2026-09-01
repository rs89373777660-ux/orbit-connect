"use client";
import { CSSProperties, ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import QRCode from "qrcode";
import "./chat-list.css";
import "./theme-refresh.css";

type Privacy={phone:boolean;email:boolean;status:boolean;socials:boolean;photo:boolean};
type Profile={
 id:string;name:string;handle:string;publicId:string;phone?:string|null;phoneLast4?:string|null;
 email?:string|null;birthYear?:number|null;status?:string|null;socials?:Record<string,string>|null;
 avatarUrl?:string|null;avatarPreset?:string|null;hasAvatar?:boolean;registered?:boolean;online?:boolean;isContact?:boolean;
 privacy?:Privacy;syncContactsEnabled?:boolean;autoCorrectEnabled?:boolean
};
type Chat={id:string;name:string;kind:string;createdAt:number;userId?:string|null;avatarUrl?:string|null;avatarPreset?:string|null;canPost?:boolean;pinnedAt?:number|null;systemPinned?:boolean;unreadCount?:number;online?:boolean;lastSeenAt?:number|null};
type MessageAttachment={id:string;messageId?:string;fileName?:string;fileSize?:number;fileMime?:string;position:number;previewUrl?:string;progress?:number;uploaded?:boolean};
type MessageReaction={messageId:string;userId:string;emoji:string;createdAt:number};
type Message={id:string;senderId:string;body:string|null;kind:string;fileName?:string|null;fileSize?:number|null;fileMime?:string|null;attachments?:MessageAttachment[];reactions?:MessageReaction[];pinnedAt?:number|null;replyTo?:string|null;forwardedFromId?:string|null;editedAt?:number|null;deletedAt?:number|null;deliveryStatus?:"sent"|"delivered"|"read"|"failed";failed?:boolean;createdAt:number};
type PhoneEntry={name:string;phone:string};
type AppNotification={id:string;kind:string;body:string;entityId?:string|null;readAt?:number|null;createdAt:number};
type UpdateInfo={build:string;title:string;notes:string[];releasedAt:string;checkIntervalMs:number;apk:{version:string;url:string;sha256:string};nativeUpdate?:boolean};
type AvatarEditState={dataUrl:string;zoom:number;x:number;y:number;enhance:boolean};
type RichAttachmentKind="poll"|"checklist"|"contact";
type PendingAttachment={id:string;file:File;kind:"photo"|"file";previewUrl?:string};
type DeviceSession={id:string;current:boolean;deviceName:string;platform:string;browser?:string|null;createdAt:number;lastSeenAt:number};

async function appFetch(input:RequestInfo|URL,init:RequestInit={}){
 const headers=new Headers(init.headers),token=localStorage.getItem("orbit_session");
 if(token)headers.set("authorization",`Bearer ${token}`);
 const response=await fetch(input,{...init,headers});
 // Never force-reload WebView from a secondary API request. Several parallel
 // requests can briefly return 401 while a session is being renewed; reloading
 // here caused an Android navigation loop ending on chrome-error://chromewebdata.
 if(response.status===401&&token&&!String(input).includes("/api/registration"))localStorage.removeItem("orbit_session");
 return response;
}
function initials(name:string){return name.split(/\s+/).map(x=>x[0]).join("").slice(0,2).toUpperCase()||"OR"}
function normalizePhone(value:string){const digits=value.replace(/\D/g,"");if(digits.length===10)return `7${digits}`;if(digits.length===11&&digits.startsWith("8"))return `7${digits.slice(1)}`;return digits.slice(-15)}
async function phoneHash(value:string){const bytes=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(normalizePhone(value)));return [...new Uint8Array(bytes)].map(x=>x.toString(16).padStart(2,"0")).join("")}
function compareVersions(left:string,right:string){const a=left.split(".").map(Number),b=right.split(".").map(Number);for(let i=0;i<Math.max(a.length,b.length);i++){const delta=(a[i]||0)-(b[i]||0);if(delta)return delta}return 0}
function isNativeApp(){const capacitor=(window as typeof window&{Capacitor?:{isNativePlatform?:()=>boolean;getPlatform?:()=>string;Plugins?:{PhoneContacts?:unknown}}}).Capacitor;return Boolean(capacitor?.isNativePlatform?.()||capacitor?.getPlatform?.()==="android"||capacitor?.getPlatform?.()==="ios"||capacitor?.Plugins?.PhoneContacts||/OrbitConnectNative|\bwv\b/i.test(navigator.userAgent))}
function OrbitIcon({name,className=""}:{name:string;className?:string}){return <svg className={`orbit-glyph ${className}`} aria-hidden="true" focusable="false"><use href={`/orbit-ui-icons.svg?v=34#${name}`}/></svg>}
function messagesEqual(left:Message[]|undefined,right:Message[]){return Boolean(left&&left.length===right.length&&right.every((message,index)=>{const old=left[index];return old.id===message.id&&old.body===message.body&&old.editedAt===message.editedAt&&old.deletedAt===message.deletedAt&&old.deliveryStatus===message.deliveryStatus&&old.fileName===message.fileName&&old.fileSize===message.fileSize&&old.replyTo===message.replyTo&&old.pinnedAt===message.pinnedAt&&JSON.stringify(old.attachments||[])===JSON.stringify(message.attachments||[])&&JSON.stringify(old.reactions||[])===JSON.stringify(message.reactions||[])}))}
const AVATAR_PRESETS=["🪐","🚀","🌙","⚡","🌿","🎧","☄️","✦","🦊","🐼","😎","🤖"];
const THEMES=[{id:"lime",name:"Лайм",color:"#cfff3c"},{id:"cyan",name:"Космос",color:"#4eeaff"},{id:"violet",name:"Фиолет",color:"#b08cff"},{id:"coral",name:"Коралл",color:"#ff8075"},{id:"amber",name:"Янтарь",color:"#ffc94a"},{id:"ice",name:"Лёд",color:"#d8f4ff"}];
const COUNTRIES=[
 {iso:"RU",name:"Россия",dial:"7",flag:"🇷🇺"},{iso:"BY",name:"Беларусь",dial:"375",flag:"🇧🇾"},{iso:"KZ",name:"Казахстан",dial:"7",flag:"🇰🇿"},{iso:"UA",name:"Украина",dial:"380",flag:"🇺🇦"},{iso:"AM",name:"Армения",dial:"374",flag:"🇦🇲"},{iso:"AZ",name:"Азербайджан",dial:"994",flag:"🇦🇿"},{iso:"GE",name:"Грузия",dial:"995",flag:"🇬🇪"},{iso:"KG",name:"Кыргызстан",dial:"996",flag:"🇰🇬"},{iso:"UZ",name:"Узбекистан",dial:"998",flag:"🇺🇿"},{iso:"TJ",name:"Таджикистан",dial:"992",flag:"🇹🇯"},{iso:"MD",name:"Молдова",dial:"373",flag:"🇲🇩"},{iso:"TR",name:"Турция",dial:"90",flag:"🇹🇷"},{iso:"IL",name:"Израиль",dial:"972",flag:"🇮🇱"},{iso:"DE",name:"Германия",dial:"49",flag:"🇩🇪"},{iso:"FR",name:"Франция",dial:"33",flag:"🇫🇷"},{iso:"IT",name:"Италия",dial:"39",flag:"🇮🇹"},{iso:"ES",name:"Испания",dial:"34",flag:"🇪🇸"},{iso:"GB",name:"Великобритания",dial:"44",flag:"🇬🇧"},{iso:"US",name:"США",dial:"1",flag:"🇺🇸"},{iso:"CA",name:"Канада",dial:"1",flag:"🇨🇦"},{iso:"AE",name:"ОАЭ",dial:"971",flag:"🇦🇪"},{iso:"IN",name:"Индия",dial:"91",flag:"🇮🇳"},{iso:"CN",name:"Китай",dial:"86",flag:"🇨🇳"},{iso:"JP",name:"Япония",dial:"81",flag:"🇯🇵"},{iso:"KR",name:"Южная Корея",dial:"82",flag:"🇰🇷"},{iso:"BR",name:"Бразилия",dial:"55",flag:"🇧🇷"},{iso:"AU",name:"Австралия",dial:"61",flag:"🇦🇺"}
];
function emojiRange(start:number,end:number){return Array.from({length:end-start+1},(_,index)=>String.fromCodePoint(start+index)).filter((_,index)=>{const code=start+index;return code<0x1f3fb||code>0x1f3ff})}
const EMOJI_GROUPS=[
 {name:"Лица и эмоции",keywords:"лица эмоции радость смех грусть злость любовь настроение",items:emojiRange(0x1f600,0x1f64f)},
 {name:"Люди и жесты",keywords:"люди жесты руки работа человек привет спасибо",items:[...emojiRange(0x1f440,0x1f487),...emojiRange(0x1f900,0x1f9ff)]},
 {name:"Животные и природа",keywords:"животные природа цветы погода космос растения",items:[...emojiRange(0x1f300,0x1f344),...emojiRange(0x1f400,0x1f43e)]},
 {name:"Еда и напитки",keywords:"еда напитки ресторан кофе фрукты праздник",items:[...emojiRange(0x1f345,0x1f37f),...emojiRange(0x1f950,0x1f96b)]},
 {name:"Путешествия и места",keywords:"путешествия транспорт машина самолет поезд город спорт",items:emojiRange(0x1f680,0x1f6ff)},
 {name:"Предметы и символы",keywords:"предметы символы сердце подарок телефон деньги музыка офис",items:emojiRange(0x1f4a0,0x1f5ff)}
];
const LIVE_REACTIONS="😀 😂 🤣 😍 🥰 🤩 🥳 😎 😭 😡 🤯 😱 🤔 🙏 👍 👏 💪 ❤️ 💔 🔥 ✨ 💫 🎉 🚀 🪐 👀 💚 😴 🤝 🙌".split(" ");
const STICKER_PACKS=[
 {name:"Настроение",keywords:"радость смех любовь грусть злость удивление",items:[["😂","До слёз"],["😍","Влюблён"],["🥳","Праздник"],["😭","Печаль"],["😡","Сердит"],["🤯","Вот это да"]]},
 {name:"Общение",keywords:"привет пока спасибо согласен нет да общение",items:[["👋","Привет"],["🙏","Спасибо"],["👍","Согласен"],["🙅","Нет"],["🤝","Договорились"],["🫡","Принято"]]},
 {name:"Работа",keywords:"работа офис дело готово деньги идея успех",items:[["💼","В работе"],["✅","Готово"],["💡","Есть идея"],["📈","Рост"],["💸","Деньги"],["🚀","Запускаем"]]},
 {name:"Отдых",keywords:"отдых еда кофе сон музыка путешествие",items:[["☕","Кофе"],["🍕","Вкусно"],["😴","Сплю"],["🎧","Музыка"],["🏝️","Отпуск"],["✈️","В путь"]]},
 {name:"Orbit",keywords:"орбит космос фирменные планета звезда ракета",items:[["🪐","На орбите"],["🌙","Ночь"],["☄️","Мчусь"],["👽","Я здесь"],["🤖","Orbit AI"],["🌌","Космос"]]}
] as const;
const GREETING_STICKERS=[
 ["👋","Привет!"],["🚀","На связи!"],["🪐","Встречаемся на орбите"],["🙌","Рад встрече!"],["🤝","Будем знакомы"],["✨","Добро пожаловать"],["😎","Привет из Orbit"],["🌟","Отличного общения"],["🫡","Я на связи"],["🥳","Ура, новый чат!"]
] as const;

export default function MessengerApp(){
 const [ready,setReady]=useState(false),[error,setError]=useState(""),[,setProgress]=useState(""),[intro,setIntro]=useState(true);
 const [profile,setProfile]=useState<Profile|null>(null),[section,setSection]=useState<"chats"|"contacts"|"settings">("chats");
 const [contacts,setContacts]=useState<Profile[]>([]),[searchResults,setSearchResults]=useState<Profile[]>([]);
 const [chats,setChats]=useState<Chat[]>([]),[activeChat,setActiveChat]=useState<Chat|null>(null),[messages,setMessages]=useState<Message[]>([]);
 const [draft,setDraft]=useState(""),[search,setSearch]=useState(""),[composeOpen,setComposeOpen]=useState(false),[profileOpen,setProfileOpen]=useState<Profile|null>(null),[mobileChatOpen,setMobileChatOpen]=useState(false),[greetingOffer,setGreetingOffer]=useState<{chatId:string;emoji:string;label:string}|null>(null);
 const [messageMenu,setMessageMenu]=useState<Message|null>(null),[editingMessage,setEditingMessage]=useState<Message|null>(null),[replyingTo,setReplyingTo]=useState<Message|null>(null),[deleteMessage,setDeleteMessage]=useState<Message|null>(null),[forwardMessages,setForwardMessages]=useState<Message[]>([]),[selectedMessageIds,setSelectedMessageIds]=useState<Set<string>>(()=>new Set()),[batchDeleteOpen,setBatchDeleteOpen]=useState(false),[aiMenuOpen,setAiMenuOpen]=useState(false),[emojiOpen,setEmojiOpen]=useState(false),[attachmentOpen,setAttachmentOpen]=useState(false),[richAttachment,setRichAttachment]=useState<RichAttachmentKind|null>(null),[pendingAttachments,setPendingAttachments]=useState<PendingAttachment[]>([]),[compressImages,setCompressImages]=useState(true),[attachmentPreview,setAttachmentPreview]=useState<{src:string;name:string}|null>(null),[uploading,setUploading]=useState(false);
 const [galleryOpen,setGalleryOpen]=useState(false),[galleryItems,setGalleryItems]=useState<Array<{id:string;kind:string;fileName?:string;url:string}>>([]),[avatarEditor,setAvatarEditor]=useState<AvatarEditState|null>(null),[avatarGallery,setAvatarGallery]=useState<Array<{id:string;url:string;label:string}>>([]);
 const [privacyOpen,setPrivacyOpen]=useState(false),[notificationSettingsOpen,setNotificationSettingsOpen]=useState(false),[devicesOpen,setDevicesOpen]=useState(false),[browserPairing,setBrowserPairing]=useState(false),[toast,setToast]=useState(""),[syncing,setSyncing]=useState(false),[aiWorking,setAiWorking]=useState(false);
 const [notificationsEnabled,setNotificationsEnabled]=useState(true),[soundEnabled,setSoundEnabled]=useState(true),[updateInfo,setUpdateInfo]=useState<UpdateInfo|null>(null),[checkingUpdate,setCheckingUpdate]=useState(false);
 const [connectionOnline,setConnectionOnline]=useState(()=>typeof navigator==="undefined"?true:navigator.onLine),[nativeShell,setNativeShell]=useState(false);
 const avatarInput=useRef<HTMLInputElement>(null),fileInput=useRef<HTMLInputElement>(null),photoInput=useRef<HTMLInputElement>(null),composerInputRef=useRef<HTMLTextAreaElement>(null),messageScrollRef=useRef<HTMLDivElement|null>(null),scrollRequest=useRef<"auto"|"smooth"|null>(null),plumAudio=useRef<HTMLAudioElement|null>(null),seenNotifications=useRef(new Set<string>()),readQueue=useRef(new Set<string>()),readFlushTimer=useRef<number|undefined>(undefined);
 const activeChatIdRef=useRef<string|null>(null),profileIdRef=useRef<string|null>(null),messageCache=useRef(new Map<string,Message[]>()),messageLoadToken=useRef(0),chatsLoading=useRef(false),chatsRef=useRef<Chat[]>([]),pendingOpenChatId=useRef<string|null>(null),hasOlderByChat=useRef(new Map<string,boolean>()),olderBeforeByChat=useRef(new Map<string,number>()),loadingOlder=useRef(new Set<string>());
 const pinRequests=useRef(new Set<string>()),lastBackHandledAt=useRef(0);
 const messageById=useMemo(()=>new Map(messages.map(message=>[message.id,message])),[messages]);
 const pinnedMessages=useMemo(()=>messages.filter(message=>message.pinnedAt&&!message.deletedAt).sort((a,b)=>(b.pinnedAt||0)-(a.pinnedAt||0)).slice(0,10),[messages]);
 const [theme,setTheme]=useState(()=>typeof window!=="undefined"?localStorage.getItem("orbit_theme")||"lime":"lime");
 const notify=(text:string)=>{setToast(text);window.setTimeout(()=>setToast(""),2500)};

 useEffect(()=>{setNativeShell(isNativeApp());void boot()},[]);
 useEffect(()=>{
  setNotificationsEnabled(localStorage.getItem("orbit_notifications")!=="off");
  setSoundEnabled(localStorage.getItem("orbit_sound")!=="off");
  const audio=new Audio("/orbit-plum.wav?v=3");audio.preload="auto";plumAudio.current=audio;
  const unlock=()=>{audio.volume=.001;void audio.play().then(()=>{audio.pause();audio.currentTime=0;audio.volume=.85}).catch(()=>undefined)};
  document.addEventListener("pointerdown",unlock,{once:true});
  return()=>document.removeEventListener("pointerdown",unlock);
 },[]);
 useEffect(()=>{
  if(!aiMenuOpen&&!emojiOpen&&!attachmentOpen)return;
  const closePopovers=()=>{setAiMenuOpen(false);setEmojiOpen(false);setAttachmentOpen(false)};
  const outside=(event:PointerEvent)=>{
   const target=event.target instanceof Element?event.target:null;if(!target)return;
   if(target.closest(".attachment-menu"))return;
   if(target.closest('[aria-label="Прикрепить"]')){setAiMenuOpen(false);setEmojiOpen(false);return}
   if(target.closest(".ai-menu"))return;
   if(target.closest('[aria-label="ИИ-помощник"]')){setEmojiOpen(false);setAttachmentOpen(false);return}
   if(target.closest(".emoji-picker"))return;
   if(target.closest('[aria-label="Эмодзи и стикеры"]')){setAiMenuOpen(false);setAttachmentOpen(false);return}
   const blockNextClick=(click:MouseEvent)=>{click.preventDefault();click.stopPropagation();document.removeEventListener("click",blockNextClick,true)};
   document.addEventListener("click",blockNextClick,true);window.setTimeout(()=>document.removeEventListener("click",blockNextClick,true),450);
   event.preventDefault();event.stopPropagation();closePopovers();
  };
  const escape=(event:KeyboardEvent)=>{if(event.key==="Escape")closePopovers()};
  document.addEventListener("pointerdown",outside,true);document.addEventListener("keydown",escape);
  return()=>{document.removeEventListener("pointerdown",outside,true);document.removeEventListener("keydown",escape)};
 },[aiMenuOpen,emojiOpen,attachmentOpen]);
 useEffect(()=>{
  const viewport=window.visualViewport;
  const resize=()=>document.documentElement.style.setProperty("--orbit-vh",`${viewport?.height||window.innerHeight}px`);
  const focus=(event:FocusEvent)=>{const target=event.target as HTMLElement;if(target.matches("input,textarea"))window.setTimeout(()=>target.scrollIntoView({block:"center",behavior:"smooth"}),250)};
  resize();viewport?.addEventListener("resize",resize);document.addEventListener("focusin",focus);
  return()=>{viewport?.removeEventListener("resize",resize);document.removeEventListener("focusin",focus)};
 },[]);
 useEffect(()=>{const online=()=>setConnectionOnline(true),offline=()=>setConnectionOnline(false);window.addEventListener("online",online);window.addEventListener("offline",offline);return()=>{window.removeEventListener("online",online);window.removeEventListener("offline",offline)}},[]);
 useEffect(()=>{activeChatIdRef.current=activeChat?.id||null},[activeChat?.id]);
 useEffect(()=>{
  const input=composerInputRef.current;if(!input)return;
  input.style.height="auto";
  const computed=window.getComputedStyle(input),lineHeight=parseFloat(computed.lineHeight)||20,padding=(parseFloat(computed.paddingTop)||0)+(parseFloat(computed.paddingBottom)||0),border=(parseFloat(computed.borderTopWidth)||0)+(parseFloat(computed.borderBottomWidth)||0),maximum=Math.ceil(lineHeight*6+padding+border);
  input.style.height=`${Math.min(input.scrollHeight,maximum)}px`;input.style.overflowY=input.scrollHeight>maximum?"auto":"hidden";
 },[draft,editingMessage?.id,replyingTo?.id]);
 useEffect(()=>{chatsRef.current=chats},[chats]);
 useEffect(()=>{if(!activeChat?.id)return;messageCache.current.set(activeChat.id,messages);persistRecentMessages(activeChat.id,messages)},[activeChat?.id,messages,profile?.id]);
 useEffect(()=>{
  const mode=scrollRequest.current,element=messageScrollRef.current;if(!mode||!element||!mobileChatOpen)return;
  scrollRequest.current=null;
  const scroll=()=>{const bottom=element.scrollHeight-element.clientHeight;element.scrollTo({top:Math.max(0,bottom),behavior:mode})};
  scroll();
  const frame=window.requestAnimationFrame(scroll),imageTimer=window.setTimeout(scroll,180),lateTimer=window.setTimeout(scroll,650),finalTimer=window.setTimeout(scroll,1200);
  return()=>{window.cancelAnimationFrame(frame);window.clearTimeout(imageTimer);window.clearTimeout(lateTimer);window.clearTimeout(finalTimer)};
 },[messages,mobileChatOpen,activeChat?.id]);
 useEffect(()=>{
  const capacitor=(window as typeof window&{Capacitor?:{isNativePlatform?:()=>boolean}}).Capacitor;
  const installed=Boolean(capacitor?.isNativePlatform?.()||window.matchMedia("(display-mode: standalone)").matches);
  if(installed)history.pushState({orbitMain:true},"",location.href);
 },[]);
 useEffect(()=>{
  const back=()=>{
   const now=Date.now();if(now-lastBackHandledAt.current<350)return true;lastBackHandledAt.current=now;
   if(messageMenu){setMessageMenu(null);return true}
   if(greetingOffer){setGreetingOffer(null);return true}
   if(aiMenuOpen||emojiOpen||attachmentOpen){setAiMenuOpen(false);setEmojiOpen(false);setAttachmentOpen(false);return true}
   if(deleteMessage){setDeleteMessage(null);return true}
   if(batchDeleteOpen){setBatchDeleteOpen(false);return true}
   if(forwardMessages.length){setForwardMessages([]);return true}
   if(richAttachment){setRichAttachment(null);return true}
   if(composeOpen){setComposeOpen(false);return true}
   if(profileOpen){setProfileOpen(null);return true}
   if(privacyOpen){setPrivacyOpen(false);return true}
   if(notificationSettingsOpen){setNotificationSettingsOpen(false);return true}
   if(devicesOpen){setDevicesOpen(false);return true}
   if(updateInfo){setUpdateInfo(null);return true}
   if(galleryOpen){setGalleryOpen(false);return true}
   if(avatarEditor){setAvatarEditor(null);return true}
   if(selectedMessageIds.size){setSelectedMessageIds(new Set());return true}
   if(editingMessage){setEditingMessage(null);setDraft("");return true}
   if(replyingTo){setReplyingTo(null);return true}
   if(mobileChatOpen){setMobileChatOpen(false);setSection("chats");return true}
   if(section!=="chats"){setSection("chats");return true}
   return false;
  };
  const orbitWindow=window as typeof window&{orbitHandleBack?:()=>boolean};
  const nativeBack=(event:Event)=>{if(back())event.preventDefault()};
  const browserBack=()=>{if(back())history.pushState({orbitMain:true},"",location.href)};
  orbitWindow.orbitHandleBack=back;
  window.addEventListener("orbit:back",nativeBack);window.addEventListener("popstate",browserBack);
  return()=>{if(orbitWindow.orbitHandleBack===back)delete orbitWindow.orbitHandleBack;window.removeEventListener("orbit:back",nativeBack);window.removeEventListener("popstate",browserBack)};
 },[messageMenu,greetingOffer,aiMenuOpen,emojiOpen,attachmentOpen,deleteMessage,batchDeleteOpen,forwardMessages.length,richAttachment,composeOpen,profileOpen,privacyOpen,notificationSettingsOpen,devicesOpen,updateInfo,galleryOpen,avatarEditor,selectedMessageIds.size,editingMessage,replyingTo,mobileChatOpen,section]);
 useEffect(()=>{
  type ListenerHandle={remove:()=>Promise<void>|void};
  const native=(window as typeof window&{Capacitor?:{Plugins?:{PhoneContacts?:{
   getLaunchAction?:()=>Promise<{chatId?:string}>;
   addListener?:(name:string,callback:(value:{chatId?:string})=>void)=>ListenerHandle|Promise<ListenerHandle>
  }}}}).Capacitor?.Plugins?.PhoneContacts;
  if(!ready||!native)return;
  let listener:ListenerHandle|undefined,active=true;
  const open=(value:{chatId?:string})=>{if(value.chatId)openChatById(value.chatId)};
  void native.getLaunchAction?.().then(value=>{if(active)open(value)}).catch(()=>undefined);
  const pending=native.addListener?.("notificationAction",open);
  if(pending)void Promise.resolve(pending).then(value=>{if(active)listener=value;else void value.remove()}).catch(()=>undefined);
  return()=>{active=false;void listener?.remove()}
 },[ready]);
 useEffect(()=>{
  if(!ready||!profile?.registered)return;
  const poll=window.setInterval(()=>void loadChats(),3000);
  return()=>window.clearInterval(poll);
 },[ready,profile?.registered]);
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
    if(!isNativeApp()){setBrowserPairing(true);setReady(true);return}
    const created=await fetch("/api/auth",{method:"POST",headers:{"content-type":"application/json"},body:"{}"});
    if(!created.ok)throw new Error("Не удалось создать защищённую сессию");
    const session=await created.json();localStorage.setItem("orbit_session",session.token);
    auth=await appFetch("/api/registration",{cache:"no-store"});
   }
   if(!auth.ok)throw new Error("Сервер временно недоступен");
   const data=await auth.json();profileIdRef.current=data.profile?.id||null;setProfile(data.profile);
   if(data.profile.registered)await loadAll();
   setReady(true);
  }catch(value){setError(value instanceof Error?value.message:"Нет соединения")}
  finally{setProgress("");setIntro(false)}
 }
 async function loadAll(){await Promise.all([loadPeople(),loadChats()])}
 async function loadPeople(){
  const r=await appFetch("/api/people",{cache:"no-store"});if(!r.ok)return;
  const data=await r.json();setContacts(data.contacts||[]);if(data.profile){profileIdRef.current=data.profile.id||profileIdRef.current;setProfile(old=>old?{...old,...data.profile}:data.profile)}
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
   const native=(window as typeof window&{Capacitor?:{Plugins?:{PhoneContacts?:{showNotification:(value:{title:string;body:string;chatId?:string;token?:string})=>Promise<void>}}}}).Capacitor?.Plugins?.PhoneContacts;
   if(native)await native.showNotification({title:"Orbit Connect",body:latest.body,chatId:latest.entityId||"",token:localStorage.getItem("orbit_session")||""}).catch(()=>undefined);
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
   const dismissed=localStorage.getItem("orbit_update_dismissed");
   if((data.updateAvailable||nativeUpdate)&&(manual||dismissed!==data.build))setUpdateInfo({...data,nativeUpdate});
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
  try{const audio=new Audio(`/orbit-plum.wav?v=3`);audio.volume=1;await audio.play();notify("Звук «плюм» воспроизведён")}
  catch{notify("Не удалось включить звук. Проверьте громкость мультимедиа")}
 }
 async function shareApp(){
  let apkPath="/orbit-connect-v9.apk";try{const response=await fetch(`/api/version?t=${Date.now()}`,{cache:"no-store"});if(response.ok)apkPath=(await response.json()).apk?.url||apkPath}catch{}
  const data={title:"Orbit Connect для Android",text:"Скачайте актуальную версию Orbit Connect для Android — мессенджера для общения, файлов и звонков.",url:new URL(apkPath,location.origin).href};
  if(navigator.share){try{await navigator.share(data);return}catch(error){if(error instanceof DOMException&&error.name==="AbortError")return}}
  await navigator.clipboard.writeText(`${data.text}\n${data.url}`);notify("Ссылка на приложение скопирована");
 }
 async function searchPeople(value:string){
  const r=await appFetch(`/api/people?q=${encodeURIComponent(value)}`,{cache:"no-store"});
  if(r.ok)setSearchResults((await r.json()).results||[]);
 }
 function localMessageKey(chatId:string){return `orbit_recent_${profileIdRef.current||profile?.id||"self"}_${chatId}`}
 function cachedMessages(chatId:string){const memory=messageCache.current.get(chatId);if(memory)return memory;try{const parsed=JSON.parse(localStorage.getItem(localMessageKey(chatId))||"[]") as Message[];if(Array.isArray(parsed)&&parsed.length){messageCache.current.set(chatId,parsed);return parsed}}catch{}return []}
 function persistRecentMessages(chatId:string,list:Message[]){try{let recent=list.filter(message=>!message.id.startsWith("upload-")).slice(-50),serialized=JSON.stringify(recent);if(serialized.length>700000){recent=recent.slice(-20);serialized=JSON.stringify(recent)}localStorage.setItem(localMessageKey(chatId),serialized)}catch{}}
 function mergeMessageLists(...lists:Message[][]){const byId=new Map<string,Message>();for(const list of lists)for(const message of list)byId.set(message.id,message);return [...byId.values()].sort((a,b)=>a.createdAt-b.createdAt||a.id.localeCompare(b.id))}
 async function preloadMessages(chatId:string){if(cachedMessages(chatId).length)return;try{const r=await appFetch(`/api/sync?chatId=${encodeURIComponent(chatId)}&limit=30`,{cache:"no-store"});if(!r.ok)return;const data=await r.json(),list:Message[]=data.messages||[];messageCache.current.set(chatId,list);persistRecentMessages(chatId,list);hasOlderByChat.current.set(chatId,Boolean(data.hasMore));if(data.nextBefore)olderBeforeByChat.current.set(chatId,Number(data.nextBefore))}catch{}}
 function openChatById(chatId:string){
  const chat=chatsRef.current.find(item=>item.id===chatId);if(!chat){pendingOpenChatId.current=chatId;void loadChats();return}pendingOpenChatId.current=null;activeChatIdRef.current=chat.id;messageLoadToken.current++;scrollRequest.current="auto";setSelectedMessageIds(new Set());setActiveChat(chat);setMessages(cachedMessages(chat.id));setSection("chats");setMobileChatOpen(true);void loadMessages(chat.id)
 }
 async function loadChats(){
  if(chatsLoading.current)return;chatsLoading.current=true;
  try{
   const r=await appFetch("/api/sync",{cache:"no-store"});if(!r.ok){setConnectionOnline(navigator.onLine&&r.status<500);return}
   setConnectionOnline(true);const data=await r.json();const list:Chat[]=(data.chatList||[]).map((room:{id:string;title:string;kind:string;createdAt:number;userId?:string|null;avatarUrl?:string|null;avatarPreset?:string|null;canPost?:boolean;pinnedAt?:number|null;systemPinned?:boolean;unreadCount?:number;online?:boolean;lastSeenAt?:number|null})=>({id:room.id,name:room.title,kind:room.kind,createdAt:room.createdAt,userId:room.userId,avatarUrl:room.avatarUrl,avatarPreset:room.avatarPreset,canPost:room.canPost,pinnedAt:room.pinnedAt,systemPinned:room.systemPinned,unreadCount:Math.min(999,room.unreadCount||0),online:room.online,lastSeenAt:room.lastSeenAt}));
   setChats(list);
   const requestedId=pendingOpenChatId.current,selectedId=requestedId||activeChatIdRef.current,current=(selectedId?list.find(item=>item.id===selectedId):null)||list[0];
   if(current){
    if(requestedId&&current.id===requestedId){pendingOpenChatId.current=null;setSection("chats");setMobileChatOpen(true)}
    const switched=activeChatIdRef.current!==current.id;activeChatIdRef.current=current.id;setActiveChat(old=>old?.id===current.id&&old.online===current.online&&old.lastSeenAt===current.lastSeenAt&&old.unreadCount===current.unreadCount?old:current);
    if(switched){setMessages(cachedMessages(current.id));scrollRequest.current="auto"}
    await loadMessages(current.id,data.user.userId);
   }
   list.filter(chat=>chat.id!==current?.id).slice(0,12).forEach(chat=>void preloadMessages(chat.id));
  }finally{chatsLoading.current=false}
 }
 async function loadMessages(chatId:string,userId=profile?.id,mode:"latest"|"older"="latest"){
  if(mode==="older"&&loadingOlder.current.has(chatId))return;
  const cached=cachedMessages(chatId),before=mode==="older"?olderBeforeByChat.current.get(chatId)||0:0;if(mode==="older"&&!before)return;
  const token=mode==="latest"?++messageLoadToken.current:messageLoadToken.current,element=messageScrollRef.current,oldHeight=element?.scrollHeight||0,oldTop=element?.scrollTop||0;
  if(mode==="older")loadingOlder.current.add(chatId);
  try{
   const query=new URLSearchParams({chatId,limit:"50"});if(before)query.set("before",String(before));
   const r=await appFetch(`/api/sync?${query}`,{cache:"no-store"});if(!r.ok)return;
   const data=await r.json(),received:Message[]=data.messages||[],nextMessages=mergeMessageLists(cached,received);hasOlderByChat.current.set(chatId,Boolean(data.hasMore));if(data.hasMore&&data.nextBefore)olderBeforeByChat.current.set(chatId,Number(data.nextBefore));else olderBeforeByChat.current.delete(chatId);messageCache.current.set(chatId,nextMessages);persistRecentMessages(chatId,nextMessages);
   if(token!==messageLoadToken.current||activeChatIdRef.current!==chatId)return;
   setMessages(current=>{const uploads=current.filter(message=>message.id.startsWith("upload-")),visible=uploads.length?mergeMessageLists(nextMessages,uploads):nextMessages;return messagesEqual(current,visible)?current:visible});
   if(mode==="older")window.requestAnimationFrame(()=>{const currentElement=messageScrollRef.current;if(currentElement)currentElement.scrollTop=oldTop+Math.max(0,currentElement.scrollHeight-oldHeight)});
   if(data.chat)setActiveChat(old=>old&&old.id===chatId?{...old,...data.chat}:old);if(!userId&&data.user?.userId){profileIdRef.current=data.user.userId;setProfile(old=>old?{...old,id:data.user.userId}:old)}
  }finally{if(mode==="older")loadingOlder.current.delete(chatId)}
 }
 function loadOlderMessages(){const chatId=activeChatIdRef.current;if(!chatId||hasOlderByChat.current.get(chatId)===false)return;void loadMessages(chatId,profile?.id,"older")}
 async function addContact(person:Profile){
  const r=await appFetch("/api/people",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action:"add-contact",targetUserId:person.id})});
  const data=await r.json().catch(()=>({}));if(!r.ok){notify(data.error||"Не удалось добавить");return}
  await loadPeople();notify("Пользователь добавлен в контакты");
 }
 async function togglePin(chat:Chat){
  if(chat.systemPinned){notify("Этот чат всегда закреплён");return}
  if(pinRequests.current.has(chat.id))return;
  pinRequests.current.add(chat.id);
  const previous=chat.pinnedAt||null,nextPinned=previous?null:Date.now();
  const reorder=(items:Chat[],pinnedAt:number|null)=>{const order=new Map(items.map((item,index)=>[item.id,index]));return items.map(item=>item.id===chat.id?{...item,pinnedAt}:item).sort((a,b)=>Number(Boolean(b.systemPinned))-Number(Boolean(a.systemPinned))||Number(Boolean(b.pinnedAt))-Number(Boolean(a.pinnedAt))||(a.pinnedAt&&b.pinnedAt?b.pinnedAt-a.pinnedAt:0)||(order.get(a.id)||0)-(order.get(b.id)||0))};
  setChats(items=>reorder(items,nextPinned));setActiveChat(value=>value?.id===chat.id?{...value,pinnedAt:nextPinned}:value);notify(nextPinned?"Чат закреплён":"Чат откреплён");
  try{
   const r=await appFetch("/api/sync",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action:"pin-chat",chatId:chat.id})}),data=await r.json().catch(()=>({}));
   if(!r.ok)throw new Error(data.error||"Не удалось изменить закрепление");
   const confirmed=data.pinnedAt||null;setChats(items=>reorder(items,confirmed));setActiveChat(value=>value?.id===chat.id?{...value,pinnedAt:confirmed}:value);
  }catch(error){setChats(items=>reorder(items,previous));setActiveChat(value=>value?.id===chat.id?{...value,pinnedAt:previous}:value);notify(error instanceof Error?error.message:"Не удалось изменить закрепление")}
  finally{pinRequests.current.delete(chat.id)}
 }
 async function openChat(person:Profile){
  setProgress("СОЗДАЁМ ЧАТ…");
  const r=await appFetch("/api/people",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action:"start-direct",targetUserId:person.id})});
  const data=await r.json().catch(()=>({}));setProgress("");
  if(!r.ok){notify(data.error||"Не удалось создать чат");return}
  const chat:Chat={id:data.chat.id,name:person.name,kind:"direct",createdAt:data.chat.createdAt,userId:person.id,avatarUrl:person.avatarUrl,avatarPreset:person.avatarPreset};activeChatIdRef.current=chat.id;scrollRequest.current="auto";setActiveChat(chat);setMessages(cachedMessages(chat.id));setComposeOpen(false);setSection("chats");setMobileChatOpen(true);
  if(data.created){const previous=localStorage.getItem("orbit_last_greeting")||"",available=GREETING_STICKERS.filter(item=>item[0]!==previous),choice=available[Math.floor(Math.random()*available.length)]||GREETING_STICKERS[0];localStorage.setItem("orbit_last_greeting",choice[0]);setGreetingOffer({chatId:chat.id,emoji:choice[0],label:choice[1]})}else setGreetingOffer(null);
  void loadMessages(chat.id);void loadChats();
 }
 async function send(){
  let text=draft.trim();if(!text||!activeChat||!profile)return;const originalText=text,chatId=activeChat.id,replyToId=replyingTo?.id||null,temporaryId=`pending-${Date.now()}-${Math.random()}`,editingOriginal=editingMessage?messages.find(message=>message.id===editingMessage.id):null;
  scrollRequest.current="smooth";if(editingMessage)setMessages(current=>current.map(message=>message.id===editingMessage.id?{...message,body:text,editedAt:Date.now()}:message));else setMessages(current=>[...current,{id:temporaryId,senderId:profile.id,body:text,kind:"text",replyTo:replyingTo?.id||null,deliveryStatus:"sent",createdAt:Date.now()}]);
  setDraft("");setReplyingTo(null);
  try{
   const payload=editingMessage?{action:"edit",messageId:editingMessage.id,body:text}:{chatId,body:text,replyTo:replyToId};
   const r=await appFetch("/api/messages",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(payload)});
   const data=await r.json().catch(()=>({}));if(!r.ok){setMessages(current=>editingOriginal?current.map(message=>message.id===editingOriginal.id?editingOriginal:message):current.map(message=>message.id===temporaryId?{...message,deliveryStatus:"failed",failed:true}:message));if(editingOriginal)setDraft(originalText);notify(data.error||"Сообщение не отправлено");setConnectionOnline(navigator.onLine);return}
   setEditingMessage(null);setConnectionOnline(true);
   if(editingOriginal){messageCache.current.delete(chatId)}else if(data.message){setMessages(current=>current.map(message=>message.id===temporaryId?{...message,...data.message,deliveryStatus:"delivered",failed:false}:message))}
   window.setTimeout(()=>void loadChats(),0);
   if(profile.autoCorrectEnabled&&!editingOriginal&&data.message?.id){void requestAi("correct",originalText).then(async corrected=>{if(!corrected||corrected===originalText)return;const edit=await appFetch("/api/messages",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action:"edit",messageId:data.message.id,body:corrected})});if(edit.ok)setMessages(current=>current.map(message=>message.id===data.message.id?{...message,body:corrected,editedAt:Date.now()}:message))}).catch(()=>undefined)}
   window.setTimeout(()=>void loadMessages(chatId),1200);
  }catch{setMessages(current=>editingOriginal?current.map(message=>message.id===editingOriginal.id?editingOriginal:message):current.map(message=>message.id===temporaryId?{...message,deliveryStatus:"failed",failed:true}:message));if(editingOriginal)setDraft(originalText);setConnectionOnline(false);notify("Нет соединения — нажмите повтор рядом с сообщением")}
 }
 async function retryMessage(message:Message){if(!activeChat||!message.body)return;const chatId=activeChat.id;scrollRequest.current="smooth";setMessages(current=>current.map(item=>item.id===message.id?{...item,deliveryStatus:"sent",failed:false}:item));try{const r=await appFetch("/api/messages",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({chatId,body:message.body,replyTo:message.replyTo})}),data=await r.json().catch(()=>({}));if(!r.ok)throw new Error();if(data.message)setMessages(current=>current.map(item=>item.id===message.id?{...item,...data.message,deliveryStatus:"delivered",failed:false}:item));setConnectionOnline(true);window.setTimeout(()=>void loadMessages(chatId),1200)}catch{setMessages(current=>current.map(item=>item.id===message.id?{...item,deliveryStatus:"failed",failed:true}:item));setConnectionOnline(false);notify("Повторная отправка не удалась")}}
 function markMessageSeen(messageId:string){
  if(messageId.startsWith("pending-"))return;readQueue.current.add(messageId);if(readFlushTimer.current)window.clearTimeout(readFlushTimer.current);const chatId=activeChat?.id;readFlushTimer.current=window.setTimeout(async()=>{const messageIds=[...readQueue.current];readQueue.current.clear();if(!chatId||!messageIds.length)return;await appFetch("/api/messages",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action:"mark-read",chatId,messageIds})}).catch(()=>undefined)},220)
 }
 function clearPendingAttachments(){setPendingAttachments(current=>{current.forEach(item=>{if(item.previewUrl)URL.revokeObjectURL(item.previewUrl)});return []})}
 function removePendingAttachment(id:string){setPendingAttachments(current=>current.filter(item=>{if(item.id===id&&item.previewUrl)URL.revokeObjectURL(item.previewUrl);return item.id!==id}))}
 function prepareAttachment(event:ChangeEvent<HTMLInputElement>){
  const files=Array.from(event.target.files||[]);event.target.value="";if(!files.length)return;const photos=files.filter(file=>file.type.startsWith("image/"));
  if(photos.length===files.length){setPendingAttachments(current=>{const existing=current.filter(item=>item.kind==="photo"),available=Math.max(0,10-existing.length),chosen=photos.slice(0,available);if(photos.length>available)window.setTimeout(()=>notify("Можно прикрепить не более 10 изображений"),0);return [...existing,...chosen.map(file=>({id:crypto.randomUUID(),file,kind:"photo" as const,previewUrl:URL.createObjectURL(file)}))]})}
  else{clearPendingAttachments();const file=files[0];setPendingAttachments([{id:crypto.randomUUID(),file,kind:"file"}])}setAttachmentOpen(false)
 }
 async function compressPhoto(file:File){if(!compressImages||/gif|svg/i.test(file.type))return file;try{const bitmap=await createImageBitmap(file),scale=Math.min(1,1920/Math.max(bitmap.width,bitmap.height)),canvas=document.createElement("canvas");canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));canvas.getContext("2d")?.drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close();const blob=await new Promise<Blob|null>(resolve=>canvas.toBlob(resolve,"image/webp",.8));if(!blob||blob.size>=file.size)return file;return new File([blob],file.name.replace(/\.[^.]+$/,"")+".webp",{type:"image/webp",lastModified:Date.now()})}catch{return file}}
 async function sendPendingAttachments(){
  if(!pendingAttachments.length||!activeChat||!profile)return;const batch=[...pendingAttachments],chatId=activeChat.id,temporaryId=`upload-${crypto.randomUUID()}`,caption=draft.trim(),localAttachments=batch.map((item,index)=>({id:item.id,position:index,fileName:item.file.name,fileSize:item.file.size,fileMime:item.file.type,previewUrl:item.previewUrl,progress:0,uploaded:false}));
  const optimistic:Message={id:temporaryId,senderId:profile.id,body:caption||null,kind:batch.every(item=>item.kind==="photo")?"album":"file",attachments:localAttachments,deliveryStatus:"sent",createdAt:Date.now()};setMessages(current=>[...current,optimistic]);setPendingAttachments([]);setDraft("");scrollRequest.current="smooth";setUploading(true);
  try{const prepared=await Promise.all(batch.map(item=>item.kind==="photo"?compressPhoto(item.file):Promise.resolve(item.file))),form=new FormData();prepared.forEach(file=>form.append("files",file));form.set("chatId",chatId);form.set("caption",caption);const total=prepared.reduce((sum,file)=>sum+file.size,0)||1;
   const data=await new Promise<{message?:Message;error?:string}>((resolve,reject)=>{const xhr=new XMLHttpRequest();xhr.open("POST","/api/files");const token=localStorage.getItem("orbit_session");if(token)xhr.setRequestHeader("authorization",`Bearer ${token}`);xhr.upload.onprogress=event=>{const loaded=event.lengthComputable?event.loaded:0;let offset=0;setMessages(current=>current.map(message=>message.id!==temporaryId?message:{...message,attachments:message.attachments?.map((attachment,index)=>{const size=prepared[index]?.size||0,progress=Math.max(0,Math.min(100,Math.round((loaded-offset)/Math.max(1,size)*100)));offset+=size;return {...attachment,progress,uploaded:progress>=100}})}))};xhr.onload=()=>{try{const value=JSON.parse(xhr.responseText||"{}");if(xhr.status>=200&&xhr.status<300)resolve(value);else reject(new Error(value.error||"Фотографии не отправлены"))}catch{reject(new Error("Фотографии не отправлены"))}};xhr.onerror=()=>reject(new Error("Нет соединения"));xhr.send(form)});
   if(!data.message)throw new Error(data.error||"Фотографии не отправлены");setMessages(current=>current.some(message=>message.id===temporaryId)?current.map(message=>message.id===temporaryId?{...data.message!,deliveryStatus:"delivered"}:message):mergeMessageLists(current,[{...data.message!,deliveryStatus:"delivered"}]));batch.forEach(item=>{if(item.previewUrl)window.setTimeout(()=>URL.revokeObjectURL(item.previewUrl!),1200)});window.setTimeout(()=>void loadMessages(chatId),250);notify(batch.length===1?"Фотография отправлена":`Отправлено фотографий: ${batch.length}`)
  }catch(value){setMessages(current=>current.filter(message=>message.id!==temporaryId));setPendingAttachments(batch);notify(`${value instanceof Error?value.message:"Фотографии не отправлены"}. Вложения возвращены для повтора`)}finally{setUploading(false)}
 }
 async function sendComposer(){if(pendingAttachments.length)await sendPendingAttachments();else await send()}
 async function sendStructured(kind:"location"|RichAttachmentKind,payload:unknown){
  if(!activeChat)return false;const r=await appFetch("/api/messages",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({chatId:activeChat.id,kind,body:JSON.stringify(payload)})}),data=await r.json().catch(()=>({}));
  if(!r.ok){notify(data.error||"Вложение не отправлено");return false}setAttachmentOpen(false);setRichAttachment(null);scrollRequest.current="smooth";await loadMessages(activeChat.id);return true
 }
 async function attachLocation(){
  setAttachmentOpen(false);if(!navigator.geolocation){notify("Геопозиция недоступна на этом устройстве");return}
  notify("Определяем геопозицию…");navigator.geolocation.getCurrentPosition(position=>void sendStructured("location",{latitude:position.coords.latitude,longitude:position.coords.longitude,accuracy:Math.round(position.coords.accuracy),label:"Моя геопозиция"}),error=>notify(error.code===1?"Разрешите приложению доступ к геопозиции":"Не удалось определить геопозицию"),{enableHighAccuracy:true,timeout:12000,maximumAge:30000})
 }
 async function structuredAction(message:Message,action:"poll-vote"|"checklist-toggle",index:number){
  const body=action==="poll-vote"?{action,messageId:message.id,optionIndex:index}:{action,messageId:message.id,itemIndex:index};const r=await appFetch("/api/messages",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body)});if(!r.ok){notify("Не удалось обновить вложение");return}if(activeChat)await loadMessages(activeChat.id)
 }
 async function reactMessage(message:Message,emoji:string){
  if(message.id.startsWith("upload-")||message.id.startsWith("pending-"))return;const existing=message.reactions?.some(item=>item.userId===profile?.id&&item.emoji===emoji),reaction:MessageReaction={messageId:message.id,userId:profile?.id||"",emoji,createdAt:Date.now()};setMessages(current=>current.map(item=>item.id!==message.id?item:{...item,reactions:existing?(item.reactions||[]).filter(value=>!(value.userId===profile?.id&&value.emoji===emoji)):[...(item.reactions||[]),reaction]}));const r=await appFetch("/api/sync",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action:"react",chatId:activeChat?.id,messageId:message.id,emoji})});if(!r.ok&&activeChat)void loadMessages(activeChat.id)
 }
 async function sendSticker(url:string){if(!activeChat)return;scrollRequest.current="smooth";await appFetch("/api/messages",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({chatId:activeChat.id,body:url,kind:"sticker"})});setEmojiOpen(false);await loadMessages(activeChat.id)}
 async function openGallery(){const r=await appFetch("/api/files?gallery=1",{cache:"no-store"});if(r.ok)setGalleryItems((await r.json()).items||[]);setGalleryOpen(true)}
 async function requestAi(mode:"generate"|"correct"|"emoji",text:string){
  const context=messages.slice(-6).filter(message=>!message.deletedAt&&message.body&&(message.kind==="text"||message.kind==="message")).map(message=>`${message.senderId===profile?.id?"Я":"Собеседник"}: ${message.body}`);setAiWorking(true);const r=await appFetch("/api/ai",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({mode,text,context})});
  const data=await r.json().catch(()=>({}));setAiWorking(false);return r.ok?String(data.text||text):null;
 }
 async function ai(mode:"generate"|"correct"|"emoji"){
  setProgress("ИИ ПОМОГАЕТ…");const result=await requestAi(mode,draft);if(result!==null)setDraft(result);else notify("ИИ временно недоступен");setAiMenuOpen(false);setProgress("");
 }
 function scrollToMessage(messageId:string){const element=document.querySelector<HTMLElement>(`[data-message-id="${CSS.escape(messageId)}"]`);if(!element){notify("Сообщение находится выше — прокрутите историю");return}element.scrollIntoView({behavior:"smooth",block:"center"});element.classList.add("message-highlight");window.setTimeout(()=>element.classList.remove("message-highlight"),1600)}
 async function messageAction(action:"reply"|"view-reply"|"copy"|"copy-link"|"share"|"forward"|"pin"|"delete",message:Message){
  setMessageMenu(null);
  if(action==="reply"){setReplyingTo(message);window.setTimeout(()=>composerInputRef.current?.focus(),0);return}
  if(action==="view-reply"&&message.replyTo){scrollToMessage(message.replyTo);return}
  if(action==="copy"){await navigator.clipboard.writeText(message.body||"");notify("Сообщение скопировано");return}
  if(action==="copy-link"){if(!activeChat)return;await navigator.clipboard.writeText(`${location.origin}/?chat=${encodeURIComponent(activeChat.id)}&message=${encodeURIComponent(message.id)}`);notify("Ссылка на сообщение скопирована");return}
  if(action==="share"){
   const text=message.body||message.fileName||"Сообщение Orbit Connect";
   const shareData:ShareData={title:"Orbit Connect",text};
   if((message.kind==="photo"||message.kind==="file")&&message.fileName){try{const response=await appFetch(`/api/files?id=${encodeURIComponent(message.id)}`,{cache:"no-store"});if(response.ok){const blob=await response.blob(),file=new File([blob],message.fileName,{type:message.fileMime||blob.type||"application/octet-stream"});if(navigator.canShare?.({files:[file]}))shareData.files=[file]}}catch{}}
   const native=(window as typeof window&{Capacitor?:{Plugins?:{PhoneContacts?:{shareText?:(value:{title:string;text:string})=>Promise<void>}}}}).Capacitor?.Plugins?.PhoneContacts;if(native?.shareText){await native.shareText({title:"Orbit Connect",text}).catch(()=>notify("Не удалось открыть системное меню"));return}if(navigator.share)await navigator.share(shareData).catch(error=>{if(!(error instanceof DOMException&&error.name==="AbortError"))notify("Не удалось открыть системное меню")});else notify("Системное меню отправки недоступно в этом браузере");
   return;
  }
  if(action==="forward"){setForwardMessages([message]);return}
  if(action==="pin"&&activeChat){const r=await appFetch("/api/sync",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action:"pin-message",chatId:activeChat.id,messageId:message.id})}),data=await r.json().catch(()=>({}));if(!r.ok){notify(data.error||"Не удалось закрепить");return}setMessages(current=>current.map(item=>item.id===message.id?{...item,pinnedAt:data.pinned?data.createdAt:null}:item));notify(data.pinned?"Сообщение закреплено":"Сообщение откреплено");return}
  setDeleteMessage(message);
 }
 async function forwardTo(targetChatId:string){
  if(!forwardMessages.length)return;let sent=0;for(const message of forwardMessages){const r=await appFetch("/api/messages",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action:"forward",messageId:message.id,targetChatId})});if(r.ok)sent++}setForwardMessages([]);setSelectedMessageIds(new Set());notify(sent===1?"Сообщение переслано":`Переслано сообщений: ${sent}`);if(activeChat?.id===targetChatId)await loadMessages(targetChatId);
 }
 function selectMessage(message:Message){if(message.deletedAt)return;setMessageMenu(null);setSelectedMessageIds(current=>{const next=new Set(current);next.add(message.id);return next});navigator.vibrate?.(28)}
 function toggleMessage(message:Message){if(message.deletedAt)return;setSelectedMessageIds(current=>{const next=new Set(current);if(next.has(message.id))next.delete(message.id);else next.add(message.id);return next})}
 function clearMessageSelection(){setSelectedMessageIds(new Set());setBatchDeleteOpen(false)}
 function selectedMessages(){return messages.filter(message=>selectedMessageIds.has(message.id))}
 async function copySelected(){const text=selectedMessages().map(message=>message.body||message.fileName||"Сообщение").join("\n\n");await navigator.clipboard.writeText(text);notify(`Скопировано сообщений: ${selectedMessageIds.size}`);clearMessageSelection()}
 function forwardSelected(){setForwardMessages(selectedMessages())}
 async function favoriteSelected(){const favorite=chats.find(chat=>chat.kind==="direct"&&chat.systemPinned);if(!favorite){notify("Чат «Избранное» не найден");return}setForwardMessages(selectedMessages());const list=selectedMessages();let sent=0;for(const message of list){const r=await appFetch("/api/messages",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action:"forward",messageId:message.id,targetChatId:favorite.id})});if(r.ok)sent++}setForwardMessages([]);clearMessageSelection();notify(`Сохранено в Избранное: ${sent}`)}
 async function removeSelected(scope:"me"|"all"){if(!activeChat)return;let removed=0;for(const message of selectedMessages()){const r=await appFetch("/api/messages",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action:"delete",messageId:message.id,scope})});if(r.ok)removed++}clearMessageSelection();await loadMessages(activeChat.id);notify(`Удалено сообщений: ${removed}`)}
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
 async function openProfileById(userId:string){
  const r=await appFetch(`/api/profile?id=${encodeURIComponent(userId)}`,{cache:"no-store"});
  if(r.ok)setProfileOpen((await r.json()).profile);else notify("Профиль недоступен");
 }
 async function openProfile(person:Profile){await openProfileById(person.id)}
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
 if(browserPairing)return <BrowserQrLogin/>;
 if(profile&&!profile.registered)return <Registration profile={profile} onComplete={value=>{profileIdRef.current=value.id||null;setProfile(value);void loadAll()}} notify={notify}/>;

 const accent=THEMES.find(item=>item.id===theme)?.color||THEMES[0].color;
 const selectionMode=selectedMessageIds.size>0,canDeleteSelectedForAll=selectionMode&&selectedMessages().every(message=>message.senderId===profile?.id);
 return <main className="orbit-v4" data-theme={theme} style={{"--accent":accent,"--accent-ink":"#07100b"} as CSSProperties}>
  <aside className="orbit-nav"><img src="/orbit-connect-icon-192.png" alt="Orbit Connect"/><button className={section==="chats"?"active":""} onClick={()=>setSection("chats")}><OrbitIcon name="chats" className="nav-glyph"/><span>Чаты</span></button><button className={section==="contacts"?"active":""} onClick={()=>setSection("contacts")}><OrbitIcon name="contacts" className="nav-glyph"/><span>Контакты</span></button><button className={section==="settings"?"active":""} onClick={()=>setSection("settings")}><OrbitIcon name="settings" className="nav-glyph"/><span>Настройки</span></button></aside>
  <section className="orbit-list">
   <header><div><small>ORBIT / CONNECT <i className={`connection-mini${connectionOnline?" online":" offline"}`}>{connectionOnline?"● подключено":"● нет соединения"}</i></small><h1>{section==="chats"?"Сообщения":section==="contacts"?"Контакты":"Настройки"}</h1></div>{section!=="settings"&&<button className="compose" aria-label="Создать сообщение" onClick={()=>{setComposeOpen(true);setSearch("")}}><OrbitIcon name="compose"/></button>}</header>
  {section==="chats"&&<div className="list-scroll"><button className="new-message" onClick={()=>setComposeOpen(true)}><OrbitIcon name="compose"/> <span><b>Создать сообщение</b><small>Контакт, номер, имя или $никнейм</small></span></button>{chats.map(chat=><div key={chat.id} className={activeChat?.id===chat.id?"person-row selected chat-row":"person-row chat-row"} onPointerEnter={()=>void preloadMessages(chat.id)} onPointerDown={()=>void preloadMessages(chat.id)}><button className="person-main" onClick={()=>{activeChatIdRef.current=chat.id;messageLoadToken.current++;scrollRequest.current="auto";setSelectedMessageIds(new Set());setActiveChat(chat);setMessages(cachedMessages(chat.id));setMobileChatOpen(true);void loadMessages(chat.id)}}><Avatar name={chat.name} url={chat.avatarUrl} preset={chat.avatarPreset}/><span><b>{chat.name}</b><small>{chat.kind==="channel"?"Канал новостей":chat.kind==="group"?"Группа":"Личный чат"}</small></span></button>{Boolean(chat.unreadCount)&&<b className="unread-count" aria-label={`Непрочитанных сообщений: ${chat.unreadCount}`}>{Math.min(999,chat.unreadCount||0)}</b>}<button className={`chat-pin${chat.pinnedAt||chat.systemPinned?" active":""}`} aria-label={chat.systemPinned?"Всегда закреплено":chat.pinnedAt?"Открепить чат":"Закрепить чат"} title={chat.systemPinned?"Всегда закреплено":chat.pinnedAt?"Открепить чат":"Закрепить чат"} onClick={()=>void togglePin(chat)}><OrbitIcon name={chat.pinnedAt||chat.systemPinned?"pin":"pin-open"}/></button></div>)}</div>}
   {section==="contacts"&&<div className="list-scroll"><div className="section-label">МОИ КОНТАКТЫ · {contacts.length}</div>{contacts.length===0&&<Empty text="Контактов пока нет. Нажмите «Создать сообщение» и найдите человека."/ >}{contacts.map(person=><div key={person.id} className="person-row contact-row"><button className="contact-avatar-button" aria-label={`Открыть профиль ${person.name}`} title="Открыть профиль" onClick={()=>void openProfile(person)}><Avatar name={person.name} url={person.avatarUrl} preset={person.avatarPreset}/></button><button className="contact-name-button" aria-label={`Открыть чат с ${person.name}`} onClick={()=>void openChat(person)}><span><b>{person.name}</b><small>{person.handle} {person.online?"· онлайн":""}</small></span><OrbitIcon name="compose"/></button></div>)}</div>}
   {section==="settings"&&profile&&<Settings profile={profile} setProfile={setProfile} saveProfile={saveProfile} toggleSync={toggleSync} syncing={syncing} syncNow={()=>syncPhonebook(false)} avatarInput={avatarInput} uploadAvatar={uploadAvatar} openPrivacy={()=>setPrivacyOpen(true)} openDevices={()=>setDevicesOpen(true)} openGallery={()=>void openGallery()} avatarGallery={avatarGallery} loadAvatarGallery={()=>void loadAvatarGallery()} avatarAction={(action,id)=>void avatarAction(action,id)} theme={theme} setTheme={value=>{setTheme(value);localStorage.setItem("orbit_theme",value)}} shareApp={()=>void shareApp()}/>}
   {section==="settings"&&<div className="settings-tools"><button aria-label="Проверить обновления" title="Проверить обновления" disabled={checkingUpdate} onClick={()=>void checkUpdates(true)}><OrbitIcon name="update" className="settings-tool-glyph"/></button><button aria-label="Настройки уведомлений" title="Настройки уведомлений" onClick={()=>setNotificationSettingsOpen(true)}><OrbitIcon name="notify" className="settings-tool-glyph"/></button></div>}
  </section>
  <section className={mobileChatOpen?"orbit-chat mobile-open":"orbit-chat"}>
   {activeChat?<>
    {selectionMode?<div className="message-selection-bar"><button className="selection-close" aria-label="Отменить выбор" title="Отменить выбор" onClick={clearMessageSelection}>×</button><b className="selection-count">{selectedMessageIds.size}</b><span>выбрано</span><div><button aria-label="Копировать выбранные" title="Копировать" onClick={()=>void copySelected()}><b className="bulk-symbol">⧉</b><small>Копировать</small></button><button aria-label="Переслать выбранные" title="Переслать" onClick={forwardSelected}><b className="bulk-symbol">↗</b><small>Переслать</small></button><button aria-label="Удалить выбранные" title="Удалить" onClick={()=>setBatchDeleteOpen(true)}><b className="bulk-symbol">♲</b><small>Удалить</small></button><button aria-label="Отправить выбранные в избранное" title="В избранное" onClick={()=>void favoriteSelected()}><b className="bulk-symbol">☆</b><small>В избранное</small></button></div></div>:<header>{!nativeShell&&<button className="mobile-chat-back" aria-label="Назад" onClick={()=>setMobileChatOpen(false)}><OrbitIcon name="back"/></button>}<button className="chat-profile-avatar" aria-label={activeChat.kind==="direct"?`Открыть профиль ${activeChat.name}`:"Аватар чата"} title={activeChat.kind==="direct"?"Открыть профиль":""} disabled={activeChat.kind!=="direct"||!activeChat.userId} onClick={()=>activeChat.userId&&void openProfileById(activeChat.userId)}><Avatar name={activeChat.name} url={activeChat.avatarUrl} preset={activeChat.avatarPreset}/></button><div><b>{activeChat.name}</b><small>{activeChat.kind==="direct"?(activeChat.online?"● в сети":activeChat.lastSeenAt?`не в сети · ${new Date(activeChat.lastSeenAt).toLocaleTimeString("ru-RU",{hour:"2-digit",minute:"2-digit"})}`:"не в сети"):activeChat.kind==="channel"?"официальный канал":"группа"}</small></div><button aria-label="Аудиозвонок" onClick={()=>notify("Аудиозвонок запускается")}><OrbitIcon name="phone"/></button><button aria-label="Видеозвонок" onClick={()=>notify("Видеозвонок запускается")}><OrbitIcon name="video"/></button></header>}
    {pinnedMessages.length>0&&<div className="pinned-message-strip"><OrbitIcon name="pin"/><div>{pinnedMessages.map((message,index)=><button key={message.id} onClick={()=>scrollToMessage(message.id)}><b>{index+1}</b><span>{message.body||`${message.attachments?.length||1} фото`}</span></button>)}</div></div>}
    <div ref={messageScrollRef} onScroll={event=>{if(event.currentTarget.scrollTop<120)loadOlderMessages()}} className={`message-scroll${selectionMode?" selecting":""}`}>{messages.map(message=><MessageBubble key={message.id} message={message} mine={message.senderId===profile?.id} currentUserId={profile?.id||""} reply={message.replyTo?messageById.get(message.replyTo):undefined} selectionMode={selectionMode} selected={selectedMessageIds.has(message.id)} menu={()=>setMessageMenu(message)} select={()=>selectMessage(message)} toggle={()=>toggleMessage(message)} answer={()=>setReplyingTo(message)} share={()=>void messageAction("share",message)} retry={()=>void retryMessage(message)} seen={()=>markMessageSeen(message.id)} structured={(action,index)=>void structuredAction(message,action,index)}/>)}</div>
    {editingMessage&&<div className="editing-bar"><span><b>Редактирование</b><small>{editingMessage.body}</small></span><button onClick={()=>{setEditingMessage(null);setDraft("")}}>×</button></div>}
    {replyingTo&&<div className="editing-bar"><span><b>Ответ на сообщение</b><small>{replyingTo.body||replyingTo.fileName}</small></span><button onClick={()=>setReplyingTo(null)}>×</button></div>}
    {activeChat.kind==="channel"&&!activeChat.canPost?<div className="channel-readonly">Новости публикует только владелец канала</div>:<>{greetingOffer?.chatId===activeChat.id&&<div className="greeting-offer"><span><small>ПРИВЕТСТВЕННЫЙ СТИКЕР</small><b>{greetingOffer.label}</b></span><button className="greeting-sticker" aria-label={`Отправить стикер ${greetingOffer.label}`} onClick={()=>{void sendSticker(`orbit:sticker:${greetingOffer.emoji}:theme-5:${greetingOffer.label}`);setGreetingOffer(null)}}>{greetingOffer.emoji}</button><button className="greeting-skip" aria-label="Закрыть предложение" onClick={()=>setGreetingOffer(null)}>×</button></div>}<div className={`ai-row${aiMenuOpen?" expanded":""}`}>{aiMenuOpen?<div className="ai-menu" role="menu" aria-label="ИИ-помощник"><button aria-label="Написать сообщение" title="Написать сообщение" disabled={aiWorking} onClick={()=>void ai("generate")}><b aria-hidden="true">✦</b></button><button aria-label="Исправить ошибки" title={profile?.autoCorrectEnabled?"Исправление выполняется автоматически":"Исправить ошибки"} disabled={!draft||aiWorking||Boolean(profile?.autoCorrectEnabled)} onClick={()=>void ai("correct")}><b aria-hidden="true">✓</b></button><button aria-label="Расставить эмодзи" title="Расставить эмодзи" disabled={!draft||aiWorking} onClick={()=>void ai("emoji")}><b aria-hidden="true">☺</b></button></div>:<><button className="tool-icon" aria-label="ИИ-помощник" title="ИИ-помощник" disabled={aiWorking} onClick={()=>{setEmojiOpen(false);setAiMenuOpen(true)}}><OrbitIcon name="ai"/></button><button className="tool-icon" aria-label="Эмодзи и стикеры" title="Эмодзи и стикеры" onClick={()=>{setAiMenuOpen(false);setEmojiOpen(value=>!value)}}><OrbitIcon name="emoji"/></button></>}</div>
    {pendingAttachments.length>0&&<div className="pending-attachments"><header><b>{pendingAttachments.every(item=>item.kind==="photo")?`Изображений: ${pendingAttachments.length}`:"Вложение"}</b>{pendingAttachments.every(item=>item.kind==="photo")&&<label className="compression-toggle"><input type="checkbox" checked={compressImages} onChange={event=>setCompressImages(event.target.checked)}/><i/><span>{compressImages?"Сжимать":"Оригиналы"}</span></label>}</header><div>{pendingAttachments.map(item=><article key={item.id}>{item.kind==="photo"&&item.previewUrl?<button className="pending-preview" aria-label="Открыть фотографию" onClick={()=>setAttachmentPreview({src:item.previewUrl!,name:"Предпросмотр фотографии"})}><img src={item.previewUrl} alt=""/></button>:<span className="pending-file"><OrbitIcon name="file"/></span>}{item.kind==="file"&&<small>{item.file.name}</small>}<button className="pending-remove" aria-label="Убрать вложение" onClick={()=>removePendingAttachment(item.id)}>×</button></article>)}</div></div>}
    <footer><button aria-label="Прикрепить" disabled={uploading} onClick={()=>setAttachmentOpen(value=>!value)}>{uploading?"…":<OrbitIcon name="attach"/>}</button>{attachmentOpen&&<div className="attachment-menu" role="menu" aria-label="Добавить вложение"><button role="menuitem" aria-label="Фото из галереи" title="Фото из галереи" data-tooltip="Фото" onClick={()=>{setAttachmentOpen(false);window.setTimeout(()=>photoInput.current?.click(),0)}}><OrbitIcon name="photo"/></button><button role="menuitem" aria-label="Файл с устройства" title="Файл с устройства" data-tooltip="Файл" onClick={()=>{setAttachmentOpen(false);window.setTimeout(()=>fileInput.current?.click(),0)}}><OrbitIcon name="file"/></button><button role="menuitem" aria-label="Геопозиция" title="Геопозиция" data-tooltip="Место" onClick={()=>void attachLocation()}><OrbitIcon name="location"/></button><button role="menuitem" aria-label="Создать опрос" title="Создать опрос" data-tooltip="Опрос" onClick={()=>{setAttachmentOpen(false);setRichAttachment("poll")}}><OrbitIcon name="poll"/></button><button role="menuitem" aria-label="Создать список задач" title="Создать список задач" data-tooltip="Список" onClick={()=>{setAttachmentOpen(false);setRichAttachment("checklist")}}><OrbitIcon name="checklist"/></button><button role="menuitem" aria-label="Прикрепить контакт" title="Прикрепить контакт" data-tooltip="Контакт" onClick={()=>{setAttachmentOpen(false);setRichAttachment("contact")}}><OrbitIcon name="contact-card"/></button></div>}<input ref={photoInput} type="file" accept="image/*" multiple hidden onChange={prepareAttachment}/><input ref={fileInput} type="file" accept="*/*" hidden onChange={prepareAttachment}/><textarea ref={composerInputRef} rows={1} value={draft} onChange={event=>setDraft(event.target.value)} onKeyDown={event=>{if(event.key==="Enter"&&!event.shiftKey){event.preventDefault();void sendComposer()}}} placeholder={uploading?"Загружаем вложения…":pendingAttachments.length?"Добавьте подпись к вложениям":editingMessage?"Измените сообщение":"Сообщение"}/><button className="send" aria-label={editingMessage?"Сохранить":"Отправить"} disabled={uploading||(!pendingAttachments.length&&!draft.trim())} onClick={()=>void sendComposer()}><OrbitIcon name={editingMessage?"read":"send"}/></button></footer>{emojiOpen&&<EmojiPicker insert={emoji=>setDraft(value=>value+emoji)} sticker={url=>void sendSticker(url)} notify={notify}/>}</>}
   </>:<Empty text="Выберите чат или создайте новое сообщение"/>}
  </section>
  {composeOpen&&<Compose contacts={contacts} results={searchResults} search={search} setSearch={setSearch} close={()=>setComposeOpen(false)} addContact={addContact} openChat={openChat} openProfile={openProfile}/>}
  {profileOpen&&<ProfileModal profile={profileOpen} close={()=>setProfileOpen(null)} addContact={addContact} openChat={openChat}/>}
  {privacyOpen&&profile&&<PrivacyModal profile={profile} close={()=>setPrivacyOpen(false)} save={async privacy=>{const next={...profile,privacy};setProfile(next);if(await saveProfile(next))setPrivacyOpen(false)}}/>}
  {devicesOpen&&<DevicesPage close={()=>setDevicesOpen(false)} notify={notify}/>}
  {updateInfo&&<UpdateModal info={updateInfo} close={()=>{localStorage.setItem("orbit_update_dismissed",updateInfo.build);setUpdateInfo(null)}} apply={()=>void applyUpdate()}/>}
  {notificationSettingsOpen&&<NotificationSettings enabled={notificationsEnabled} sound={soundEnabled} close={()=>setNotificationSettingsOpen(false)} setEnabled={value=>void setNotificationPreference(value)} setSound={setSoundPreference} preview={()=>void previewPlum()}/>}
  {messageMenu&&<MessageActions message={messageMenu} currentUserId={profile?.id||""} close={()=>setMessageMenu(null)} act={action=>void messageAction(action,messageMenu)} react={emoji=>void reactMessage(messageMenu,emoji)}/>}
  {forwardMessages.length>0&&<ForwardMessage chats={chats} count={forwardMessages.length} close={()=>setForwardMessages([])} forward={chatId=>void forwardTo(chatId)}/>}
  {deleteMessage&&<DeleteMessage mine={deleteMessage.senderId===profile?.id} group={activeChat?.kind==="group"} close={()=>setDeleteMessage(null)} remove={scope=>void removeMessage(scope)}/>}
  {batchDeleteOpen&&<BatchDelete count={selectedMessageIds.size} canDeleteAll={canDeleteSelectedForAll} group={activeChat?.kind==="group"} close={()=>setBatchDeleteOpen(false)} remove={scope=>void removeSelected(scope)}/>}
  {galleryOpen&&<MediaGallery items={galleryItems} close={()=>setGalleryOpen(false)}/>}
  {avatarEditor&&<AvatarEditor value={avatarEditor} setValue={setAvatarEditor} close={()=>setAvatarEditor(null)} save={()=>void saveAvatar()}/>}
  {richAttachment&&<RichAttachmentModal kind={richAttachment} contacts={contacts} close={()=>setRichAttachment(null)} send={(kind,payload)=>sendStructured(kind,payload)}/>}
  {attachmentPreview&&<ImageViewer src={attachmentPreview.src} name={attachmentPreview.name} close={()=>setAttachmentPreview(null)}/>}
  {toast&&<div className="orbit-toast">{toast}</div>}
 </main>
}

function BrowserQrLogin(){
 const [pair,setPair]=useState<{id:string;secret:string;code:string;expiresAt:number}|null>(null),[image,setImage]=useState(""),[error,setError]=useState("");
 useEffect(()=>{let active=true,timer:number|undefined;async function create(){try{const response=await fetch("/api/pairing",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action:"create"})}),data=await response.json();if(!response.ok)throw new Error(data.error||"QR недоступен");if(!active)return;setPair(data);setImage(await QRCode.toDataURL(data.code,{width:320,margin:2,color:{dark:"#07100b",light:"#cfff3c"}}));timer=window.setInterval(async()=>{const status=await fetch("/api/pairing",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action:"status",id:data.id,secret:data.secret})}),result=await status.json().catch(()=>({}));if(result.status==="approved"&&result.token){localStorage.setItem("orbit_session",result.token);location.reload()}else if(result.status==="expired"){window.clearInterval(timer);void create()}},1600)}catch(value){setError(value instanceof Error?value.message:"Не удалось создать QR")}}void create();return()=>{active=false;if(timer)window.clearInterval(timer)}},[]);
 return <div className="browser-qr-login"><header><img src="/orbit-connect-icon-192.png" alt="Orbit"/><b>ORBIT / CONNECT</b></header><main><small>БЕЗОПАСНЫЙ ВХОД</small><h1>Откройте Orbit<br/>на телефоне</h1><p>Настройки → Устройства → Подключить новое устройство. Отсканируйте этот одноразовый QR-код.</p>{image&&<div className="browser-qr-code"><img src={image} alt="QR-код для входа в Orbit Connect"/><i/><i/><i/><i/></div>}{!image&&!error&&<div className="qr-loading">Создаём защищённый код…</div>}{error&&<div className="auth-message error">{error}</div>}<b className="qr-waiting"><span/> Ожидаем подтверждение в приложении</b><small>Код действует 3 минуты · пароль и сообщения в QR не передаются</small></main></div>
}

function DeviceIcon({platform}:{platform:string}){return <span className="device-orbit-icon" data-platform={platform}><i/><i/><i/></span>}
function DevicesPage({close,notify}:{close:()=>void;notify:(value:string)=>void}){
 const [devices,setDevices]=useState<DeviceSession[]>([]),[selected,setSelected]=useState<DeviceSession|null>(null),[scanner,setScanner]=useState(false),[manual,setManual]=useState(""),video=useRef<HTMLVideoElement|null>(null),scanBusy=useRef(false);
 async function load(){const response=await appFetch("/api/devices",{cache:"no-store"});if(response.ok)setDevices((await response.json()).devices||[])}
 useEffect(()=>{void load()},[]);
 useEffect(()=>{if(!scanner)return;let stream:MediaStream|undefined,frame=0,stopped=false;async function start(){try{stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:"environment"}}});if(video.current){video.current.srcObject=stream;await video.current.play()}const Detector=(window as typeof window&{BarcodeDetector?:new(options:{formats:string[]})=>{detect:(source:CanvasImageSource)=>Promise<Array<{rawValue:string}>>}}).BarcodeDetector;if(!Detector)throw new Error("Автосканер недоступен — вставьте код вручную");const detector=new Detector({formats:["qr_code"]});async function tick(){if(stopped||!video.current)return;if(!scanBusy.current&&video.current.readyState>=2){scanBusy.current=true;try{const result=await detector.detect(video.current);if(result[0]?.rawValue){stopped=true;await approve(result[0].rawValue)}}finally{scanBusy.current=false}}frame=requestAnimationFrame(tick)}void tick()}catch(value){notify(value instanceof Error?value.message:"Не удалось открыть камеру")}}void start();return()=>{stopped=true;cancelAnimationFrame(frame);stream?.getTracks().forEach(track=>track.stop())}},[scanner]);
 async function approve(code:string){const response=await appFetch("/api/pairing",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action:"approve",code})}),data=await response.json().catch(()=>({}));if(!response.ok){notify(data.error||"QR-код не принят");return}setScanner(false);notify(`Подключено: ${data.deviceName}`);void load()}
 async function terminate(device:DeviceSession){const response=await appFetch("/api/devices",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action:"terminate",id:device.id})});if(!response.ok)return;setSelected(null);if(device.current){localStorage.removeItem("orbit_session");location.reload();return}notify("Сеанс завершён");void load()}
 async function terminateAll(){await appFetch("/api/devices",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action:"terminate-all"})});notify("Все остальные сеансы завершены");void load()}
 const current=devices.find(item=>item.current),others=devices.filter(item=>!item.current);
 return <div className="modal-back devices-back"><div className="devices-page"><header><button onClick={close}>‹</button><div><small>БЕЗОПАСНОСТЬ</small><h2>Устройства</h2></div></header><button className="connect-device" onClick={()=>setScanner(true)}><span>⌁</span><div><b>Подключить новое устройство</b><small>Открыть камеру и отсканировать QR в браузере</small></div></button>{current&&<section><small>ЭТО УСТРОЙСТВО</small><button className="device-row" onClick={()=>setSelected(current)}><DeviceIcon platform={current.platform}/><span><b>{current.deviceName}</b><small>Orbit Connect · активно сейчас</small></span><i>›</i></button></section>}<button className="terminate-all" disabled={!others.length} onClick={()=>void terminateAll()}>Завершить все другие сеансы</button><section><small>АКТИВНЫЕ СЕАНСЫ · {others.length}</small>{others.length?others.map(device=><button className="device-row" key={device.id} onClick={()=>setSelected(device)}><DeviceIcon platform={device.platform}/><span><b>{device.deviceName}</b><small>Был в сети {new Date(device.lastSeenAt).toLocaleString("ru-RU")}</small></span><i>›</i></button>):<p className="no-sessions">Других подключённых устройств нет</p>}</section></div>{selected&&<div className="device-detail"><header><button onClick={()=>setSelected(null)}>‹</button><small>СВЕДЕНИЯ О СЕАНСЕ</small></header><DeviceIcon platform={selected.platform}/><h2>{selected.deviceName}</h2><p>{selected.current?"Текущее устройство":"Подключённое устройство"}</p><dl><div><dt>Система</dt><dd>{selected.platform}</dd></div><div><dt>Браузер</dt><dd>{selected.browser||"Приложение Orbit"}</dd></div><div><dt>Первый вход</dt><dd>{new Date(selected.createdAt).toLocaleString("ru-RU")}</dd></div><div><dt>Последняя активность</dt><dd>{new Date(selected.lastSeenAt).toLocaleString("ru-RU")}</dd></div></dl><button className="danger-session" onClick={()=>void terminate(selected)}>Завершить сеанс</button></div>}{scanner&&<div className="qr-scanner"><header><button onClick={()=>setScanner(false)}>×</button><div><small>НОВОЕ УСТРОЙСТВО</small><h2>Наведите на QR-код</h2></div></header><div className="scanner-window"><video ref={video} playsInline muted/><i/><i/><i/><i/><span/></div><p>QR-код отображается на странице входа в веб-версию Orbit Connect.</p><label>Или вставьте код вручную<input value={manual} onChange={event=>setManual(event.target.value)} placeholder="orbit-connect://pair/…"/></label><button className="primary-action" disabled={!manual.trim()} onClick={()=>void approve(manual.trim())}>Подключить</button></div>}</div>
}

function Avatar({name,url,preset}:{name:string;url?:string|null;preset?:string|null}){return <span className={`orbit-avatar${preset&&!url?" preset":""}`} style={url?{backgroundImage:`url(${url})`}:undefined}>{url?"":preset||initials(name)}</span>}
function Empty({text}:{text:string}){return <div className="orbit-empty"><img src="/orbit-connect-logo-v3.png" alt=""/><p>{text}</p></div>}
function EntryIntro(){return <div className="entry-intro" role="status" aria-label="Orbit Connect загружается"><div className="entry-halo"><img src="/orbit-connect-icon-192.png" alt="Orbit Connect"/><i/><i/><i/></div><div className="entry-word"><b>ORBIT</b><span>CONNECT</span></div><small>ТВОЙ КРУГ СТАНОВИТСЯ БЛИЖЕ</small><div className="entry-dots" aria-hidden="true"><span/><span/><span/></div></div>}

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
 const [step,setStep]=useState<"phone"|"login"|"login-code"|"reset"|"code"|"profile">("phone"),[phone,setPhone]=useState(""),[countryIso,setCountryIso]=useState("RU"),[countryDetected,setCountryDetected]=useState(false),[code,setCode]=useState(""),[password,setPassword]=useState(""),[confirm,setConfirm]=useState(""),[demoCode,setDemoCode]=useState(""),[busy,setBusy]=useState(false),[message,setMessage]=useState("");
 const [form,setForm]=useState({name:"",email:"",birthYear:"",handle:profile.handle||profile.publicId||"",telegram:"",vk:"",website:""});
 const country=COUNTRIES.find(item=>item.iso===countryIso)||COUNTRIES[0];
 const fullPhone=`+${country.dial}${phone.replace(/\D/g,"").replace(/^0+/,"")}`;
 useEffect(()=>{let active=true;fetch("/api/country",{cache:"no-store"}).then(response=>response.json()).then(data=>{if(active&&COUNTRIES.some(item=>item.iso===data.country)){setCountryIso(data.country);setCountryDetected(true)}}).catch(()=>undefined);return()=>{active=false}},[]);
 function inputPhone(value:string){if(value.trim().startsWith("+")){const digits=value.replace(/\D/g,"");const detected=[...COUNTRIES].sort((a,b)=>b.dial.length-a.dial.length).find(item=>digits.startsWith(item.dial));if(detected){setCountryIso(detected.iso);setPhone(digits.slice(detected.dial.length));return}}setPhone(value.replace(/\D/g,"").slice(0,14))}
 const show=(text:string)=>{setMessage(text);notify(text)};
 async function requestCode(){setBusy(true);setMessage("");try{const r=await appFetch("/api/registration",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action:"request-code",phone:fullPhone})}),data=await r.json().catch(()=>({}));if(r.status===409){const loginResponse=await fetch("/api/auth",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action:"request-login-code",phone:fullPhone})}),loginData=await loginResponse.json().catch(()=>({}));if(!loginResponse.ok){show(loginData.error||"Не удалось отправить код для входа");return}setDemoCode(loginData.demoCode||"");setCode("");setStep("login-code");notify("Код для входа отправлен")}else if(!r.ok)show(data.error||"Не удалось отправить код");else{setDemoCode(data.demoCode||"");setCode("");setStep("code")}}catch{show("Нет связи с сервисом регистрации")}finally{setBusy(false)}}
 async function login(){setBusy(true);setMessage("");try{const r=await fetch("/api/auth",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action:"login",phone:fullPhone,password})}),data=await r.json().catch(()=>({}));if(!r.ok){show(data.error||"Не удалось войти");return}localStorage.setItem("orbit_session",data.token);location.reload()}catch{show("Нет связи с сервером входа")}finally{setBusy(false)}}
 async function loginByCode(){setBusy(true);setMessage("");try{const r=await fetch("/api/auth",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action:"login-code",phone:fullPhone,code})}),data=await r.json().catch(()=>({}));if(!r.ok){show(data.error||"Не удалось войти по коду");return}localStorage.setItem("orbit_session",data.token);location.reload()}catch{show("Нет связи с сервером входа")}finally{setBusy(false)}}
 async function requestReset(){setBusy(true);const r=await fetch("/api/auth",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action:"request-password-code",phone:fullPhone})}),data=await r.json().catch(()=>({}));setBusy(false);if(!r.ok)notify(data.error||"Код не отправлен");else{setDemoCode(data.demoCode||"");setStep("reset")}}
 async function resetPassword(){if(password!==confirm){show("Пароли не совпадают");return}setMessage("");setBusy(true);try{const r=await fetch("/api/auth",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action:"reset-password",phone:fullPhone,code,password})}),data=await r.json().catch(()=>({}));if(!r.ok){show(data.error||"Пароль не установлен");return}localStorage.setItem("orbit_session",data.token);location.reload()}catch{show("Нет связи с сервером. Повторите попытку") }finally{setBusy(false)}}
 async function verify(){setBusy(true);const r=await appFetch("/api/registration",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action:"verify-code",code})}),data=await r.json().catch(()=>({}));setBusy(false);if(!r.ok)notify(data.error||"Неверный код");else setStep("profile")}
 async function complete(event:FormEvent){event.preventDefault();if(password!==confirm){notify("Пароли не совпадают");return}setBusy(true);const r=await appFetch("/api/registration",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action:"complete",...form,birthYear:form.birthYear?Number(form.birthYear):null,password,socials:{telegram:form.telegram,vk:form.vk,website:form.website}})}),data=await r.json().catch(()=>({}));setBusy(false);if(!r.ok)notify(data.error||"Не удалось завершить регистрацию");else onComplete(data.profile)}
 const field=(key:keyof typeof form,label:string,type="text")=><label>{label}<input type={type} value={form[key]} onChange={event=>setForm({...form,[key]:event.target.value})}/></label>;
 return <div className="registration-screen"><div className="registration-brand"><img src="/orbit-connect-icon-192.png" alt="Orbit"/><span>ORBIT / CONNECT</span></div><div className="registration-card"><small>{step==="login"||step==="login-code"?"ВХОД":`РЕГИСТРАЦИЯ · ${step==="phone"?"01":step==="code"?"02":"03"}`}</small>
 {step==="phone"&&<><h1>Ваш номер</h1><p>Получите SMS-код. Новый номер перейдёт к регистрации, существующий — сразу ко входу.</p><label>Страна<select className="country-select" value={countryIso} onChange={event=>{setCountryIso(event.target.value);setCountryDetected(false)}}>{COUNTRIES.map(item=><option value={item.iso} key={item.iso}>{item.flag} {item.name} (+{item.dial})</option>)}</select></label>{countryDetected&&<small className="country-detected">⌖ Страна определена автоматически</small>}<label>Номер телефона<div className="phone-country-field"><b>+{country.dial}</b><input autoFocus inputMode="tel" value={phone} onChange={event=>inputPhone(event.target.value)} placeholder="Номер телефона"/></div></label>{message&&<div className="auth-message">{message}</div>}<button disabled={busy||normalizePhone(fullPhone).length<10} onClick={()=>void requestCode()}>{busy?"Отправляем…":"Получить SMS-код →"}</button><button className="link-button" disabled={normalizePhone(fullPhone).length<10} onClick={()=>{setMessage("");setStep("login")}}>Войти по паролю</button></>}
 {step==="login"&&<><h1>Вход по паролю</h1><p>Номер: {fullPhone}</p><label>Пароль<input type="password" value={password} onChange={event=>setPassword(event.target.value)} onKeyDown={event=>{if(event.key==="Enter")void login()}}/></label>{message&&<div className="auth-message error">{message}</div>}<button disabled={busy||password.length<6} onClick={()=>void login()}>Войти →</button><button className="link-button" onClick={()=>void requestCode()}>Войти по SMS-коду</button><button className="link-button" onClick={()=>void requestReset()}>Задать или восстановить пароль по SMS</button><button className="link-button" onClick={()=>setStep("phone")}>Назад</button></>}
 {step==="login-code"&&<><h1>Код для входа</h1><p>Мы отправили шестизначный код на номер {fullPhone}.</p>{demoCode&&<div className="demo-code">Тестовый SMS-код: <b>{demoCode}</b></div>}<label>SMS-код<input autoFocus inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={event=>setCode(event.target.value.replace(/\D/g,""))} onKeyDown={event=>{if(event.key==="Enter"&&code.length===6)void loginByCode()}}/></label>{message&&<div className="auth-message error">{message}</div>}<button disabled={busy||code.length!==6} onClick={()=>void loginByCode()}>{busy?"Проверяем…":"Войти →"}</button><button className="link-button" onClick={()=>void requestCode()}>Отправить код ещё раз</button><button className="link-button" onClick={()=>setStep("phone")}>Изменить номер</button></>}
 {step==="reset"&&<><h1>Новый пароль</h1><p>Введите код из SMS и новый пароль.</p>{demoCode&&<div className="demo-code">Тестовый SMS-код: <b>{demoCode}</b></div>}<label>Код<input inputMode="numeric" maxLength={6} value={code} onChange={event=>setCode(event.target.value.replace(/\D/g,""))}/></label><label>Новый пароль<input type="password" value={password} onChange={event=>setPassword(event.target.value)}/></label><label>Повторите пароль<input type="password" value={confirm} onChange={event=>setConfirm(event.target.value)}/></label>{message&&<div className="demo-code">{message}</div>}<button disabled={busy||code.length!==6||password.length<6||password!==confirm} onClick={()=>void resetPassword()}>{busy?"Сохраняем…":"Сохранить пароль и войти →"}</button></>}
 {step==="code"&&<><h1>Подтверждение</h1><p>Введите шестизначный код из SMS.</p>{demoCode&&<div className="demo-code">Тестовый SMS-код: <b>{demoCode}</b></div>}<label>Код<input inputMode="numeric" maxLength={6} value={code} onChange={event=>setCode(event.target.value.replace(/\D/g,""))}/></label><button disabled={busy||code.length!==6} onClick={()=>void verify()}>Подтвердить →</button></>}
 {step==="profile"&&<form onSubmit={complete}><h1>Ваш профиль</h1><p>Пароль: минимум 6 знаков, одна буква и одна цифра.</p>{field("name","ФИО")}{field("email","Email","email")}<label>Пароль<input required type="password" minLength={6} value={password} onChange={event=>setPassword(event.target.value)}/></label><label>Повторите пароль<input required type="password" minLength={6} value={confirm} onChange={event=>setConfirm(event.target.value)}/></label>{field("handle","Уникальный $никнейм")}{field("birthYear","Год рождения — по желанию")}{field("telegram","Telegram")}{field("vk","ВКонтакте")}{field("website","Сайт")}<button disabled={busy||password!==confirm||password.length<6}>Завершить регистрацию →</button></form>}</div></div>
}

function Settings({profile,setProfile,saveProfile,toggleSync,syncing,syncNow,avatarInput,uploadAvatar,openPrivacy,openDevices,openGallery,avatarGallery,loadAvatarGallery,avatarAction,theme,setTheme,shareApp}:{profile:Profile;setProfile:(value:Profile)=>void;saveProfile:(value:Profile)=>Promise<boolean>;toggleSync:(value:boolean)=>Promise<void>;syncing:boolean;syncNow:()=>void;avatarInput:React.RefObject<HTMLInputElement|null>;uploadAvatar:(event:ChangeEvent<HTMLInputElement>)=>void;openPrivacy:()=>void;openDevices:()=>void;openGallery:()=>void;avatarGallery:Array<{id:string;url:string;label:string}>;loadAvatarGallery:()=>void;avatarAction:(action:"select"|"delete",id:string)=>void;theme:string;setTheme:(value:string)=>void;shareApp:()=>void}){
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
  <div className="setting-block"><button className="plain-row" onClick={openDevices}><span className="settings-device-mark"><i/><span><b>Устройства</b><small>QR-вход и активные сеансы</small></span></span><b className="row-arrow">›</b></button><button className="plain-row" onClick={openGallery}><span><b>Личная галерея</b><small>Все отправленные фотографии и файлы</small></span><b className="row-arrow">›</b></button><button className="plain-row" onClick={openPrivacy}><span><b>Конфиденциальность</b><small>Кто видит данные профиля</small></span><b className="row-arrow">›</b></button></div><button className="app-share-row" onClick={shareApp}><span className="app-share-icon">↗</span><span><b>Поделиться приложением</b><small>Отправить ссылку контакту или в другое приложение</small></span></button>
 </div>
}

function MessageBubble({message,mine,currentUserId,reply,selectionMode,selected,menu,select,toggle,answer,share,retry,seen,structured}:{message:Message;mine:boolean;currentUserId:string;reply?:Message;selectionMode:boolean;selected:boolean;menu:()=>void;select:()=>void;toggle:()=>void;answer:()=>void;share:()=>void;retry:()=>void;seen:()=>void;structured:(action:"poll-vote"|"checklist-toggle",index:number)=>void}){
 const start=useRef({x:0,y:0}),timer=useRef<number|undefined>(undefined),longPressed=useRef(false),moved=useRef(false),suppressClick=useRef(false),bubbleRef=useRef<HTMLDivElement|null>(null),seenOnce=useRef(false);const [dragX,setDragX]=useState(0),[dragging,setDragging]=useState(false);
 const status=message.deliveryStatus==="failed"?"не отправлено":message.deliveryStatus==="read"?"прочитано":message.deliveryStatus==="delivered"?"доставлено":"отправлено";
 useEffect(()=>{if(mine||message.deletedAt||message.failed||seenOnce.current||!bubbleRef.current||!("IntersectionObserver" in window))return;let visibleTimer:number|undefined;const observer=new IntersectionObserver(entries=>{const visible=entries.some(entry=>entry.isIntersecting&&entry.intersectionRatio>=.65)&&document.visibilityState==="visible";if(visible&&!visibleTimer)visibleTimer=window.setTimeout(()=>{seenOnce.current=true;seen();observer.disconnect()},3000);else if(!visible&&visibleTimer){window.clearTimeout(visibleTimer);visibleTimer=undefined}},{threshold:[0,.65,1]});observer.observe(bubbleRef.current);return()=>{observer.disconnect();if(visibleTimer)window.clearTimeout(visibleTimer)}},[message.id,mine,message.deletedAt,message.failed]);
 function down(event:React.PointerEvent<HTMLDivElement>){if(message.deletedAt)return;event.currentTarget.setPointerCapture(event.pointerId);start.current={x:event.clientX,y:event.clientY};longPressed.current=false;moved.current=false;suppressClick.current=false;setDragging(true);timer.current=window.setTimeout(()=>{longPressed.current=true;suppressClick.current=true;setDragX(0);select()},560)}
 function move(event:React.PointerEvent<HTMLDivElement>){if(!dragging||longPressed.current)return;const dx=event.clientX-start.current.x,dy=event.clientY-start.current.y;if(Math.abs(dx)>8){moved.current=true;suppressClick.current=true;if(timer.current)window.clearTimeout(timer.current)}if(Math.abs(dx)>Math.abs(dy)){event.preventDefault();setDragX(Math.max(-108,Math.min(108,dx)))} }
 function up(event:React.PointerEvent<HTMLDivElement>){if(timer.current)window.clearTimeout(timer.current);const dx=event.clientX-start.current.x,dy=Math.abs(event.clientY-start.current.y);setDragging(false);setDragX(0);if(longPressed.current)return;if(selectionMode){suppressClick.current=true;toggle();return}if(dy<58&&dx>74){suppressClick.current=true;answer();navigator.vibrate?.(18);return}if(dy<58&&dx<-74){suppressClick.current=true;share();navigator.vibrate?.(18);return}}
 function cancel(){if(timer.current)window.clearTimeout(timer.current);setDragging(false);setDragX(0)}
 function openMenu(){document.documentElement.style.setProperty("--message-menu-left","12px");document.documentElement.style.setProperty("--message-menu-top","50%");document.documentElement.style.setProperty("--message-menu-bottom","auto");menu()}
 const cueOpacity=Math.min(1,Math.abs(dragX)/70);
 return <div className={`message-choice-row${mine?" mine":""}${selected?" selected":""}`}>
  {selectionMode&&<button className={`message-select-check${selected?" checked":""}`} aria-label={selected?"Убрать сообщение из выбранных":"Выбрать сообщение"} onClick={toggle}>{selected?"✓":""}</button>}
  <div className="message-swipe-shell"><span className="swipe-cue reply-cue" style={{opacity:dragX>0?cueOpacity:0}}>↩ <small>Ответить</small></span><span className="swipe-cue share-cue" style={{opacity:dragX<0?cueOpacity:0}}><small>Поделиться</small> ↗</span><div ref={bubbleRef} data-message-id={message.id} className={`${mine?"msg me":"msg"}${message.deletedAt?" deleted":""}${message.failed?" failed":""}${dragging?" dragging":""}${message.pinnedAt?" pinned-message":""}`} style={{transform:`translate3d(${dragX}px,0,0)`}} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={cancel} onLostPointerCapture={cancel} onClick={event=>{if((event.target as HTMLElement).closest("button,a"))return;if(!suppressClick.current&&!selectionMode)openMenu();suppressClick.current=false}} onContextMenu={event=>{event.preventDefault();select()}}>
  {message.forwardedFromId&&<small className="forwarded-label">↗ Пересланное сообщение</small>}
  {reply&&<div className="reply-preview"><b>Ответ</b><span>{reply.body||reply.fileName}</span></div>}
  {message.deletedAt?<p className="deleted-copy">Сообщение удалено</p>:message.kind==="album"?<AlbumAttachment message={message}/>:message.kind==="photo"||message.kind==="file"?<SecureAttachment message={message}/>:message.kind==="location"||message.kind==="poll"||message.kind==="checklist"||message.kind==="contact"?<StructuredMessage message={message} currentUserId={currentUserId} act={structured}/>:message.kind==="sticker"?<OrbitSticker value={message.body||""}/>:<p>{message.body}</p>}
  {!message.deletedAt&&Boolean(message.reactions?.length)&&<div className="message-reactions">{[...new Set((message.reactions||[]).map(item=>item.emoji))].map(emoji=>{const items=(message.reactions||[]).filter(item=>item.emoji===emoji),mineReaction=items.some(item=>item.userId===currentUserId);return <span key={emoji} className={mineReaction?"mine-reaction":""}>{emoji}<small>{items.length}</small></span>})}</div>}
  <div className="message-meta">{message.editedAt&&<span>изменено</span>}<time>{new Date(message.createdAt).toLocaleTimeString("ru-RU",{hour:"2-digit",minute:"2-digit"})}</time>{mine&&!message.deletedAt&&<span className={`delivery ${message.deliveryStatus||"sent"}`} title={status}>{message.deliveryStatus==="failed"?"!":message.deliveryStatus==="read"?"✓✓":"✓"} {status}</span>}</div>
  </div></div>
  {message.failed&&<button className="message-retry" aria-label="Повторить отправку" title="Повторить отправку" onClick={retry}><OrbitIcon name="retry"/></button>}
 </div>
}

function OrbitSticker({value}:{value:string}){
 if(value.startsWith("orbit:live:")){const emoji=decodeURIComponent(value.slice("orbit:live:".length)||"✨");return <div className="emoji-sticker live-sticker-message" data-theme="theme-4"><span>{emoji}</span></div>}
 if(value.startsWith("orbit:sticker:")){const [, , emoji="✨",theme="orbit",label="Orbit"]=value.split(":");return <div className="emoji-sticker" data-theme={theme}><span>{decodeURIComponent(emoji)}</span><b>{decodeURIComponent(label)}</b></div>}
 return <img className="orbit-sticker" src={value} alt="Стикер"/>;
}

function parseMessageBody<T>(message:Message,fallback:T):T{try{return JSON.parse(message.body||"") as T}catch{return fallback}}
function AlbumAttachment({message}:{message:Message}){
 const attachments=message.attachments||[],[sources,setSources]=useState<Record<string,string>>({}),[openIndex,setOpenIndex]=useState<number|null>(null);
 useEffect(()=>{let active=true;const created:string[]=[];setSources(Object.fromEntries(attachments.filter(item=>item.previewUrl).map(item=>[item.id,item.previewUrl!]))) ;attachments.filter(item=>!item.previewUrl).forEach(item=>{appFetch(`/api/files?attachment=${encodeURIComponent(item.id)}&inline=1`).then(async response=>{if(!response.ok)throw new Error();const url=URL.createObjectURL(await response.blob());created.push(url);if(active)setSources(current=>({...current,[item.id]:url}))}).catch(()=>undefined)});return()=>{active=false;created.forEach(url=>URL.revokeObjectURL(url))}},[message.id,attachments.map(item=>item.id).join(",")]);
 const available=attachments.map(item=>({item,src:sources[item.id]||item.previewUrl||""}));
 return <div className="album-with-caption" onPointerDown={event=>event.stopPropagation()}><div className={`album-grid count-${Math.min(attachments.length,10)}`}>{available.map(({item,src},index)=><button key={item.id} aria-label={`Открыть фотографию ${index+1} из ${attachments.length}`} onClick={()=>src&&setOpenIndex(index)}>{src?<img src={src} alt=""/>:<span className="album-placeholder"/>}{item.uploaded?<i className="upload-check">✓</i>:typeof item.progress==="number"&&item.progress<100?<i className="upload-progress" style={{"--progress":`${item.progress*3.6}deg`} as CSSProperties}><b>{item.progress}%</b></i>:null}</button>)}</div>{message.body&&<p className="attachment-caption">{message.body}</p>}{openIndex!==null&&<AlbumViewer items={available} index={openIndex} setIndex={setOpenIndex} close={()=>setOpenIndex(null)}/>}</div>
}

function AlbumViewer({items,index,setIndex,close}:{items:Array<{item:MessageAttachment;src:string}>;index:number;setIndex:(value:number)=>void;close:()=>void}){
 const current=items[index];function download(){if(!current?.src)return;const anchor=document.createElement("a");anchor.href=current.src;anchor.download=current.item.fileName||`photo-${index+1}`;document.body.appendChild(anchor);anchor.click();anchor.remove()}
 return createPortal(<div className="image-viewer-back album-viewer" role="dialog" aria-modal="true" onPointerDown={event=>{event.stopPropagation();if(event.target===event.currentTarget)close()}}><div className="image-viewer-card" onPointerDown={event=>event.stopPropagation()}><header><b>{index+1} из {items.length}</b><button aria-label="Закрыть" onClick={close}>×</button></header><div className="album-viewer-stage">{items.length>1&&<button className="album-arrow previous" aria-label="Предыдущая фотография" onClick={()=>setIndex((index-1+items.length)%items.length)}>‹</button>}<img src={current?.src} alt={`Фотография ${index+1}`}/>{items.length>1&&<button className="album-arrow next" aria-label="Следующая фотография" onClick={()=>setIndex((index+1)%items.length)}>›</button>}</div><div className="album-viewer-dots">{items.map((_,itemIndex)=><button key={itemIndex} className={itemIndex===index?"active":""} aria-label={`Фотография ${itemIndex+1}`} onClick={()=>setIndex(itemIndex)}/>)}</div><button className="image-viewer-download" onClick={download}><OrbitIcon name="download"/> Скачать</button></div></div>,document.body)
}

function SecureAttachment({message}:{message:Message}){
 const [preview,setPreview]=useState(""),[busy,setBusy]=useState(false),[viewerOpen,setViewerOpen]=useState(false);
 useEffect(()=>{if(message.kind!=="photo")return;let active=true,url="";appFetch(`/api/files?id=${encodeURIComponent(message.id)}&inline=1`).then(async response=>{if(!response.ok)throw new Error();url=URL.createObjectURL(await response.blob());if(active)setPreview(url)}).catch(()=>undefined);return()=>{active=false;if(url)URL.revokeObjectURL(url)}},[message.id,message.kind]);
 async function download(){if(busy)return;setBusy(true);try{const response=await appFetch(`/api/files?id=${encodeURIComponent(message.id)}`);if(!response.ok)throw new Error();const url=URL.createObjectURL(await response.blob()),anchor=document.createElement("a");anchor.href=url;anchor.download=message.fileName||"file";document.body.appendChild(anchor);anchor.click();anchor.remove();window.setTimeout(()=>URL.revokeObjectURL(url),1000)}finally{setBusy(false)}}
 return <div className="attachment-with-caption"><button className={message.kind==="photo"?"photo-message secure-attachment":"file-message secure-attachment"} onPointerDown={event=>event.stopPropagation()} onClick={event=>{event.stopPropagation();if(message.kind==="photo"&&preview)setViewerOpen(true);else void download()}}>{message.kind==="photo"?(preview?<img src={preview} alt={message.fileName||"Фото"}/>:<span className="attachment-loading">Загружаем фото…</span>):<b>⌑</b>}<span>{message.kind==="file"&&<strong>{message.fileName||"Файл"}</strong>}<small>{message.fileSize?Math.ceil(message.fileSize/1024)+" КБ · ":""}{message.kind==="photo"?"Открыть":busy?"Скачиваем…":"↓ Скачать"}</small></span></button>{message.body&&<p className="attachment-caption">{message.body}</p>}{viewerOpen&&preview&&<ImageViewer src={preview} name={message.fileName||"Фото"} close={()=>setViewerOpen(false)} download={()=>void download()}/>}</div>
}

function ImageViewer({src,name,close,download}:{src:string;name:string;close:()=>void;download?:()=>void}){
 function saveLocal(){const anchor=document.createElement("a");anchor.href=src;anchor.download=name||"photo";document.body.appendChild(anchor);anchor.click();anchor.remove()}
 return createPortal(<div className="image-viewer-back" role="dialog" aria-modal="true" aria-label={`Просмотр ${name}`} onPointerDown={event=>{event.stopPropagation();if(event.target===event.currentTarget)close()}}><div className="image-viewer-card" onPointerDown={event=>event.stopPropagation()}><header><b>{name}</b><button aria-label="Закрыть" onClick={close}>×</button></header><img src={src} alt={name}/><button className="image-viewer-download" onClick={download||saveLocal}><OrbitIcon name="download"/> Скачать</button></div></div>,document.body)
}
function StructuredMessage({message,currentUserId,act}:{message:Message;currentUserId:string;act:(action:"poll-vote"|"checklist-toggle",index:number)=>void}){
 if(message.kind==="location"){
  const value=parseMessageBody(message,{latitude:0,longitude:0,accuracy:0,label:"Геопозиция"});const href=`https://www.openstreetmap.org/?mlat=${encodeURIComponent(value.latitude)}&mlon=${encodeURIComponent(value.longitude)}#map=16/${encodeURIComponent(value.latitude)}/${encodeURIComponent(value.longitude)}`;
  return <a className="location-card" href={href} target="_blank" rel="noreferrer" onPointerDown={event=>event.stopPropagation()}><b>⌖</b><span><strong>{value.label||"Геопозиция"}</strong><small>Точность около {value.accuracy||0} м · Открыть карту</small></span></a>
 }
 if(message.kind==="poll"){
  const value=parseMessageBody(message,{question:"Опрос",options:[] as Array<{text:string;voters?:string[]}>});const total=value.options.reduce((sum,option)=>sum+(option.voters?.length||0),0);
  return <div className="poll-card" onPointerDown={event=>event.stopPropagation()}><strong>◉ {value.question}</strong>{value.options.map((option,index)=>{const selected=option.voters?.includes(currentUserId),count=option.voters?.length||0,percent=total?Math.round(count/total*100):0;return <button key={index} className={selected?"selected":""} onClick={()=>act("poll-vote",index)}><span>{selected?"✓":"○"} {option.text}</span><small>{percent}% · {count}</small><i style={{width:`${percent}%`}}/></button>})}<small>Голосов: {total}</small></div>
 }
 if(message.kind==="checklist"){
  const value=parseMessageBody(message,{title:"Список",items:[] as Array<{text:string;checkedBy?:string[]}>});return <div className="checklist-card" onPointerDown={event=>event.stopPropagation()}><strong>☑ {value.title}</strong>{value.items.map((item,index)=>{const done=Boolean(item.checkedBy?.length),mine=item.checkedBy?.includes(currentUserId);return <button key={index} className={done?"done":""} onClick={()=>act("checklist-toggle",index)}><i>{mine?"✓":done?"✓":""}</i><span>{item.text}</span></button>})}</div>
 }
 const value=parseMessageBody(message,{id:"",name:"Контакт",handle:""});return <div className="contact-card"><Avatar name={value.name}/><span><strong>{value.name}</strong><small>{value.handle||"Контакт Orbit"}</small></span></div>
}

function RichAttachmentModal({kind,contacts,close,send}:{kind:RichAttachmentKind;contacts:Profile[];close:()=>void;send:(kind:RichAttachmentKind,payload:unknown)=>Promise<boolean>}){
 const [title,setTitle]=useState(""),[rows,setRows]=useState(["",""]),[busy,setBusy]=useState(false);
 const heading=kind==="poll"?"Новый опрос":kind==="checklist"?"Новый список задач":"Прикрепить контакт";
 async function submit(event:FormEvent){event.preventDefault();const clean=rows.map(item=>item.trim()).filter(Boolean);if(!title.trim()||clean.length<(kind==="poll"?2:1))return;setBusy(true);await send(kind,kind==="poll"?{question:title.trim(),options:clean.map(text=>({text,voters:[]}))}:{title:title.trim(),items:clean.map(text=>({text,checkedBy:[]}))});setBusy(false)}
 return <div className="modal-back"><div className="rich-attachment-modal"><header><div><small>ВЛОЖЕНИЕ</small><h2>{heading}</h2></div><button onClick={close}>×</button></header>{kind==="contact"?<div className="contact-attach-list">{contacts.length===0?<p>Сначала добавьте пользователя в контакты.</p>:contacts.map(person=><button key={person.id} disabled={busy} onClick={async()=>{setBusy(true);await send("contact",{id:person.id,name:person.name,handle:person.handle,avatarUrl:person.avatarUrl||null});setBusy(false)}}><Avatar name={person.name} url={person.avatarUrl} preset={person.avatarPreset}/><span><b>{person.name}</b><small>{person.handle}</small></span><i>＋</i></button>)}</div>:<form onSubmit={submit}><label>{kind==="poll"?"Вопрос":"Название списка"}<input autoFocus maxLength={180} value={title} onChange={event=>setTitle(event.target.value)} placeholder={kind==="poll"?"О чём спросить?":"Например, Подготовка к поездке"}/></label><div className="rich-rows">{rows.map((row,index)=><label key={index}>{kind==="poll"?`Вариант ${index+1}`:`Пункт ${index+1}`}<span><input maxLength={160} value={row} onChange={event=>setRows(current=>current.map((item,i)=>i===index?event.target.value:item))}/>{rows.length>2&&<button type="button" onClick={()=>setRows(current=>current.filter((_,i)=>i!==index))}>×</button>}</span></label>)}</div><button type="button" className="add-rich-row" onClick={()=>setRows(current=>current.length<10?[...current,""]:current)}>＋ Добавить {kind==="poll"?"вариант":"пункт"}</button><button className="primary-action" disabled={busy||!title.trim()||rows.filter(item=>item.trim()).length<(kind==="poll"?2:1)}>{busy?"Отправляем…":"Прикрепить"}</button></form>}</div></div>
}

function EmojiPicker({insert,sticker,notify}:{insert:(value:string)=>void;sticker:(url:string)=>void;notify:(value:string)=>void}){
 const [tab,setTab]=useState<"classic"|"live"|"stickers"|"generate">("classic"),[query,setQuery]=useState(""),[prompt,setPrompt]=useState(""),[generating,setGenerating]=useState(false);
 const normalized=query.trim().toLocaleLowerCase("ru-RU");
 const groups=useMemo(()=>normalized?EMOJI_GROUPS.filter(group=>group.name.toLocaleLowerCase("ru-RU").includes(normalized)||group.keywords.includes(normalized)):EMOJI_GROUPS,[normalized]);
 const packs=useMemo(()=>normalized?STICKER_PACKS.map(pack=>({...pack,items:pack.items.filter(item=>pack.keywords.includes(normalized)||item[1].toLocaleLowerCase("ru-RU").includes(normalized))})).filter(pack=>pack.items.length):STICKER_PACKS,[normalized]);
 async function generate(){const text=prompt.trim();if(!text||generating)return;setGenerating(true);try{const response=await appFetch("/api/ai-sticker",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({prompt:text})}),data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(data.error||"Стикер не создан");sticker(data.url)}catch(value){notify(value instanceof Error?value.message:"Стикер не создан")}finally{setGenerating(false)}}
 return <div className="emoji-picker" role="dialog" aria-label="Эмодзи, реакции и стикеры"><header><label><OrbitIcon name="search"/><input value={query} onChange={event=>setQuery(event.target.value)} placeholder="Поиск: радость, любовь, работа…"/></label><small>{EMOJI_GROUPS.reduce((sum,group)=>sum+group.items.length,0)} эмодзи</small></header><nav><button className={tab==="classic"?"active":""} onClick={()=>setTab("classic")}>😀<span>Эмодзи</span></button><button className={tab==="live"?"active":""} onClick={()=>setTab("live")}>✨<span>Живые</span></button><button className={tab==="stickers"?"active":""} onClick={()=>setTab("stickers")}>🪐<span>Стикеры</span></button><button className={tab==="generate"?"active":""} onClick={()=>setTab("generate")}><OrbitIcon name="ai"/><span>Создать</span></button></nav><div className="emoji-content">{tab==="classic"&&groups.map(group=><section key={group.name}><small>{group.name}</small><div>{group.items.map((emoji,index)=><button key={`${group.name}-${index}`} title={group.name} onClick={()=>insert(emoji)}>{emoji}</button>)}</div></section>)}{tab==="classic"&&!groups.length&&<p className="emoji-empty">По такой реакции ничего не найдено</p>}{tab==="live"&&<section><small>Анимированные реакции Orbit</small><div className="live-emojis">{LIVE_REACTIONS.filter(()=>!normalized||"эмоции реакция живые радость любовь огонь праздник".includes(normalized)).map((emoji,index)=><button className={`live-${index%4}`} key={emoji} onClick={()=>sticker(`orbit:live:${encodeURIComponent(emoji)}`)}><span>{emoji}</span></button>)}</div></section>}{tab==="stickers"&&packs.map((pack,packIndex)=><section key={pack.name}><small>{pack.name}</small><div className="sticker-grid">{pack.items.map(([emoji,label])=><button key={label} title={label} onClick={()=>sticker(`orbit:sticker:${encodeURIComponent(emoji)}:theme-${packIndex%5}:${encodeURIComponent(label)}`)}><span>{emoji}</span><b>{label}</b></button>)}</div></section>)}{tab==="generate"&&<section className="sticker-generator"><div className="generator-orbit"><OrbitIcon name="ai"/><i/><i/></div><h3>ИИ-стикер</h3><p>Опишите эмоцию, персонажа или ситуацию. ИИ создаст квадратный стикер с прозрачным фоном.</p><textarea maxLength={400} value={prompt} onChange={event=>setPrompt(event.target.value)} placeholder="Например: весёлый зелёный космонавт машет рукой"/><button disabled={!prompt.trim()||generating} onClick={()=>void generate()}>{generating?"Создаём…":"Создать и отправить"}</button></section>}</div></div>
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
 const list=search.trim()?results:contacts;return <div className="modal-back"><div className="compose-modal"><header><div><small>НОВОЕ СООБЩЕНИЕ</small><h2>Кому написать?</h2></div><button onClick={close}>×</button></header><label className="people-search"><OrbitIcon name="search"/><input autoFocus value={search} onChange={event=>setSearch(event.target.value)} placeholder="Имя, номер телефона или $никнейм"/></label><p>{search.trim()?"НАЙДЕННЫЕ ПОЛЬЗОВАТЕЛИ":"ВАШИ КОНТАКТЫ"}</p><div className="people-list">{list.length===0&&<Empty text={search?"Пользователь не найден":"Контактов пока нет"}/>} {list.map(person=><div key={person.id} className="person-row"><button className="person-main" onClick={()=>void openProfile(person)}><Avatar name={person.name} url={person.avatarUrl} preset={person.avatarPreset}/><span><b>{person.name}</b><small>{person.handle}</small></span></button>{!person.isContact&&<button className="write" onClick={()=>void addContact(person)}>Добавить</button>}<button className="write solid write-icon" aria-label={`Написать ${person.name}`} title="Написать" onClick={()=>void openChat(person)}><OrbitIcon name="compose"/></button></div>)}</div></div></div>
}

function ProfileModal({profile,close,addContact,openChat}:{profile:Profile;close:()=>void;addContact:(person:Profile)=>Promise<void>;openChat:(person:Profile)=>Promise<void>}){
 return <div className="modal-back"><div className="profile-modal"><button className="modal-close" onClick={close}>×</button><Avatar name={profile.name} url={profile.avatarUrl} preset={profile.avatarPreset}/><h2>{profile.name}</h2><b>{profile.handle}</b><small>ID: {profile.publicId}</small>{profile.status&&<p className="profile-status">{profile.status}</p>}<dl>{profile.phone&&<><dt>Телефон</dt><dd>{profile.phone}</dd></>}{profile.email&&<><dt>Email</dt><dd>{profile.email}</dd></>}{Object.entries(profile.socials||{}).map(([key,value])=><div key={key}><dt>{key}</dt><dd>{value}</dd></div>)}</dl><div className="profile-actions">{!profile.isContact&&<button onClick={()=>void addContact(profile)}>Добавить контакт</button>}<button className="solid write-icon" aria-label={`Написать ${profile.name}`} title="Написать" onClick={()=>void openChat(profile)}>✎</button></div></div></div>
}

function MessageActions({message,currentUserId,close,act,react}:{message:Message;currentUserId:string;close:()=>void;act:(action:"reply"|"view-reply"|"copy"|"copy-link"|"share"|"forward"|"pin"|"delete")=>void;react:(emoji:string)=>void}){
 const [allReactions,setAllReactions]=useState(false),frequent=["👍","❤️","😂","🔥","😮","🙏"],allEmoji=useMemo(()=>[...new Set(EMOJI_GROUPS.flatMap(group=>group.items))],[message.id]);
 function choose(emoji:string){react(emoji);close()}
 return <div className="modal-back action-back" onClick={close}><div className={`context-menu-cluster${allReactions?" all-open":""}`} onClick={event=>event.stopPropagation()}>{allReactions?<><div className="all-reactions-menu">{allEmoji.map((emoji,index)=><button key={`${emoji}-${index}`} onClick={()=>choose(emoji)}>{emoji}</button>)}</div><button className="reaction-menu-toggle" aria-label="Вернуться к действиям" title="Вернуться к действиям" onClick={()=>setAllReactions(false)}>⌃</button></>:<><div className="message-actions"><button onClick={()=>act("reply")}><OrbitIcon name="reply"/><b>Ответить</b></button>{message.replyTo&&<button onClick={()=>act("view-reply")}><OrbitIcon name="back"/><b>Просмотреть ответ</b></button>}<button onClick={()=>act("copy")} disabled={!message.body}><OrbitIcon name="copy"/><b>Копировать</b></button><button onClick={()=>act("copy-link")}><OrbitIcon name="external"/><b>Копировать ссылку</b></button><button onClick={()=>act("share")}><OrbitIcon name="share"/><b>Поделиться</b></button><button onClick={()=>act("forward")}><OrbitIcon name="forward"/><b>Переслать</b></button><button onClick={()=>act("pin")}><OrbitIcon name={message.pinnedAt?"pin-open":"pin"}/><b>{message.pinnedAt?"Открепить":"Закрепить"}</b></button><button className="danger" onClick={()=>act("delete")}><OrbitIcon name="delete"/><b>Удалить</b></button></div><div className="context-reaction-rail" aria-label="Частые реакции">{frequent.map(emoji=><button className={(message.reactions||[]).some(item=>item.userId===currentUserId&&item.emoji===emoji)?"active":""} key={emoji} onClick={()=>choose(emoji)}>{emoji}</button>)}<button className="reaction-menu-toggle" aria-label="Все реакции" title="Все реакции" onClick={()=>setAllReactions(true)}>⌄</button></div></>}</div></div>
}

function ForwardMessage({chats,count,close,forward}:{chats:Chat[];count:number;close:()=>void;forward:(chatId:string)=>void}){
 return <div className="modal-back"><div className="compose-modal"><header><div><small>ПЕРЕСЛАТЬ · {count}</small><h2>Выберите чат</h2></div><button onClick={close}>×</button></header><div className="people-list">{chats.map(chat=><button className="person-row" key={chat.id} onClick={()=>forward(chat.id)}><Avatar name={chat.name} url={chat.avatarUrl} preset={chat.avatarPreset}/><span><b>{chat.name}</b><small>{chat.kind==="group"?"Группа":chat.kind==="channel"?"Канал":"Личный чат"}</small></span><b>⇢</b></button>)}</div></div></div>
}

function DeleteMessage({mine,group,close,remove}:{mine:boolean;group:boolean;close:()=>void;remove:(scope:"me"|"all")=>void}){
 return <div className="modal-back"><div className="delete-modal"><small>УДАЛЕНИЕ СООБЩЕНИЯ</small><h2>Где удалить?</h2><p>Выберите, у кого сообщение должно исчезнуть.</p><button onClick={()=>remove("me")}><b>Удалить только у меня</b><small>У остальных сообщение останется</small></button>{mine&&<button className="danger" onClick={()=>remove("all")}><b>Удалить у всех</b><small>{group?"У всех членов группы или сообщества":"У вас и у собеседника"}</small></button>}<button className="cancel-delete" onClick={close}>Отмена</button></div></div>
}

function BatchDelete({count,canDeleteAll,group,close,remove}:{count:number;canDeleteAll:boolean;group:boolean;close:()=>void;remove:(scope:"me"|"all")=>void}){
 return <div className="modal-back"><div className="delete-modal"><small>ВЫБРАНО СООБЩЕНИЙ · {count}</small><h2>Удалить выбранные?</h2><p>Выберите, у кого должны исчезнуть эти сообщения.</p><button onClick={()=>remove("me")}><b>Удалить только у меня</b><small>Сообщения останутся у остальных участников</small></button>{canDeleteAll&&<button className="danger" onClick={()=>remove("all")}><b>Удалить у всех</b><small>{group?"У всех членов группы или сообщества":"У вас и у собеседника"}</small></button>}<button className="cancel-delete" onClick={close}>Отмена</button></div></div>
}

function PrivacyModal({profile,close,save}:{profile:Profile;close:()=>void;save:(privacy:Privacy)=>Promise<void>}){
 const [value,setValue]=useState<Privacy>(profile.privacy||{phone:false,email:false,status:true,socials:true,photo:true});
 const items:[keyof Privacy,string,string][]=[["phone","Номер телефона","Показывать подтверждённый номер"],["email","Email","Показывать адрес электронной почты"],["status","Статус","Показывать текст статуса"],["socials","Социальные сети","Показывать Telegram, VK и сайт"],["photo","Фотография","Показывать аватар другим пользователям"]];
 return <div className="modal-back"><div className="privacy-modal"><header><div><small>НАСТРОЙКИ</small><h2>Конфиденциальность</h2></div><button onClick={close}>×</button></header>{items.map(([key,title,description])=><label className="switch-row" key={key}><span><b>{title}</b><small>{description}</small></span><input type="checkbox" role="switch" checked={value[key]} onChange={event=>setValue({...value,[key]:event.target.checked})}/><i/></label>)}<button className="primary-action" onClick={()=>void save(value)}>Сохранить</button></div></div>
}

function UpdateModal({info,close,apply}:{info:UpdateInfo;close:()=>void;apply:()=>void}){
 return <div className="modal-back"><div className="update-modal"><button className="modal-close" onClick={close}>×</button><div className="update-logo"><img src="/orbit-connect-icon-192.png" alt="Orbit Connect"/><i>↻</i></div><small>{info.nativeUpdate?"ДОСТУПНО ОБНОВЛЕНИЕ":"ЧТО НОВОГО В ORBIT"}</small><h2>{info.title}</h2><p>{info.nativeUpdate?"Новая версия приложения уже готова. Обновление не удалит ваши сообщения.":"Браузерная версия обновляется автоматически — устанавливать ничего не нужно."}</p><ul>{info.notes.map(note=><li key={note}>{note}</li>)}</ul>{info.nativeUpdate&&<button className="primary-action" onClick={apply}>Обновить приложение →</button>}<button className="update-later" onClick={close}>{info.nativeUpdate?"Напомнить позже":"Понятно"}</button></div></div>
}

function NotificationSettings({enabled,sound,close,setEnabled,setSound,preview}:{enabled:boolean;sound:boolean;close:()=>void;setEnabled:(value:boolean)=>void;setSound:(value:boolean)=>void;preview:()=>void}){
 return <div className="modal-back"><div className="privacy-modal"><header><div><small>СООБЩЕНИЯ</small><h2>Уведомления</h2></div><button onClick={close}>×</button></header><label className="switch-row"><span><b>Уведомления о сообщениях</b><small>Показывать имя отправителя и текст</small></span><input type="checkbox" role="switch" checked={enabled} onChange={event=>setEnabled(event.target.checked)}/><i/></label><label className="switch-row"><span><b>Фирменный звук «плюм»</b><small>Короткий мягкий сигнал Orbit</small></span><input type="checkbox" role="switch" checked={sound} onChange={event=>setSound(event.target.checked)}/><i/></label><button className="plum-preview" onClick={preview}>▶ Прослушать «плюм»</button><button className="primary-action" onClick={close}>Готово</button></div></div>
}
