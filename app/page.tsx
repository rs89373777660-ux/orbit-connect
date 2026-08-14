"use client";

import { ChangeEvent, KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";

type Chat = { id:number; name:string; initials:string; color:string; preview:string; time:string; unread?:number; online?:boolean; group?:boolean };
type Message = { id:number; from:"me"|"them"; text?:string; time:string; file?:{ name:string; size:string; kind:string }; reaction?:string; reply?:string };

const chats: Chat[] = [
  { id:1,name:"Команда продукта",initials:"КП",color:"violet",preview:"Лена: Макеты уже в чате",time:"12:41",unread:4,group:true },
  { id:2,name:"Анна Волкова",initials:"АВ",color:"coral",preview:"Отлично, созвонимся вечером",time:"11:20",online:true },
  { id:3,name:"Семья",initials:"С",color:"green",preview:"Мама: Ждём вас в субботу ❤️",time:"10:04",unread:2,group:true },
  { id:4,name:"Михаил Орлов",initials:"МО",color:"blue",preview:"Документ готов",time:"вчера" },
  { id:5,name:"Поездка в Грузию",initials:"Г",color:"amber",preview:"Ира: Билеты стали дешевле",time:"вчера",group:true },
];
const starterMessages: Message[] = [
  { id:1,from:"them",text:"Доброе утро! Собрала финальные экраны приложения.",time:"12:28" },
  { id:2,from:"them",file:{name:"Мобильное приложение.fig",size:"18,4 МБ",kind:"FIG"},time:"12:29" },
  { id:3,from:"me",text:"Супер. Особенно нравится экран звонка — всё очень чисто.",time:"12:34" },
  { id:4,from:"them",text:"Спасибо! Макеты уже в чате. Посмотрите ещё тёмную тему 👀",time:"12:41",reaction:"🔥 3" },
];

function Avatar({chat,small=false}:{chat:Chat;small?:boolean}) { return <div className={`avatar ${chat.color} ${small?"small":""}`}>{chat.initials}</div> }

export default function Home() {
  const [activeChat,setActiveChat]=useState(chats[0]); const [messages,setMessages]=useState(starterMessages); const [draft,setDraft]=useState("");
  const [section,setSection]=useState<"chats"|"contacts"|"calls"|"settings">("chats"); const [call,setCall]=useState<null|"audio"|"video">(null);
  const [muted,setMuted]=useState(false); const [camera,setCamera]=useState(true); const [search,setSearch]=useState(""); const [details,setDetails]=useState(false); const fileInput=useRef<HTMLInputElement>(null);
  const [folder,setFolder]=useState<"all"|"unread"|"groups">("all"); const [reply,setReply]=useState<Message|null>(null); const [newGroup,setNewGroup]=useState(false); const [groupName,setGroupName]=useState("");
  useEffect(()=>{if("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(()=>undefined)},[]);
  const filteredChats=useMemo(()=>chats.filter(c=>c.name.toLowerCase().includes(search.toLowerCase())&&(folder==="all"||(folder==="unread"&&c.unread)||(folder==="groups"&&c.group))),[search,folder]);
  function sendMessage(){const text=draft.trim();if(!text)return;setMessages(m=>[...m,{id:Date.now(),from:"me",text,reply:reply?.text||reply?.file?.name,time:new Date().toLocaleTimeString("ru-RU",{hour:"2-digit",minute:"2-digit"})}]);setDraft("");setReply(null)}
  function attachFile(e:ChangeEvent<HTMLInputElement>){const f=e.target.files?.[0];if(!f)return;const size=f.size>1048576?`${(f.size/1048576).toFixed(1)} МБ`:`${Math.ceil(f.size/1024)} КБ`;setMessages(m=>[...m,{id:Date.now(),from:"me",file:{name:f.name,size,kind:f.name.split(".").pop()?.toUpperCase()||"FILE"},time:"сейчас"}]);e.target.value=""}
  function selectChat(c:Chat){setActiveChat(c);setSection("chats");if(c.id!==1)setMessages([{id:c.id,from:"them",text:c.preview.replace(/^.*?: /,""),time:c.time}])}
  const key=(e:KeyboardEvent<HTMLInputElement>)=>{if(e.key==="Enter")sendMessage()};

  return <main className="app-shell">
    <aside className="rail"><div className="brand">o/</div><nav>
      <button className={section==="chats"?"active":""} onClick={()=>setSection("chats")}><span>◫</span><b>Чаты</b></button>
      <button className={section==="contacts"?"active":""} onClick={()=>setSection("contacts")}><span>♙</span><b>Контакты</b></button>
      <button className={section==="calls"?"active":""} onClick={()=>setSection("calls")}><span>⌕</span><b>Звонки</b></button>
      <button className={section==="settings"?"active":""} onClick={()=>setSection("settings")}><span>⚙</span><b>Настройки</b></button>
    </nav><div className="profile-dot">МК</div></aside>
    <section className="inbox"><header className="inbox-head"><div><p>ORBIT / CONNECT</p><h1>{section==="chats"?"Сообщения":section==="contacts"?"Контакты":section==="calls"?"Звонки":"Настройки"}</h1></div><button className="round primary" onClick={()=>setNewGroup(true)}>＋</button></header>
      <label className="search"><span>⌕</span><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Поиск"/></label>
      {section==="chats"&&<><div className="folders"><button className={folder==="all"?"active":""} onClick={()=>setFolder("all")}>Все</button><button className={folder==="unread"?"active":""} onClick={()=>setFolder("unread")}>Новые</button><button className={folder==="groups"?"active":""} onClick={()=>setFolder("groups")}>Группы</button></div><div className="chat-list with-folders"><p className="eyebrow">ЧАТЫ · {filteredChats.length}</p>{filteredChats.map((c,i)=><button key={c.id} className={`chat-row ${activeChat.id===c.id?"selected":""}`} onClick={()=>selectChat(c)}><div className="avatar-wrap"><Avatar chat={c}/>{c.online&&<i/>}</div><div className="chat-copy"><strong>{i===0&&"⌁ "}{c.name}</strong><span>{c.preview}</span></div><div className="chat-meta"><time>{c.time}</time>{c.unread&&<em>{c.unread}</em>}</div></button>)}</div></>}
      {section==="contacts"&&<div className="simple-list"><p className="eyebrow">ЛЮДИ</p>{chats.filter(c=>!c.group).map(c=><button key={c.id} className="chat-row" onClick={()=>selectChat(c)}><Avatar chat={c}/><div className="chat-copy"><strong>{c.name}</strong><span>{c.online?"в сети":"был(а) недавно"}</span></div></button>)}</div>}
      {section==="calls"&&<div className="simple-list"><p className="eyebrow">НЕДАВНИЕ</p>{chats.slice(1,4).map((c,i)=><button key={c.id} className="chat-row" onClick={()=>{setActiveChat(c);setCall(i===1?"video":"audio")}}><Avatar chat={c}/><div className="chat-copy"><strong>{c.name}</strong><span>{i===2?"Пропущенный":"Исходящий"} · {c.time}</span></div><span className="call-glyph">↗</span></button>)}</div>}
      {section==="settings"&&<div className="settings-card"><div className="profile-large">МК</div><h2>Максим Крылов</h2><p>@maxim · +7 999 123-45-67</p><button>Уведомления <span>Включены ›</span></button><button>Конфиденциальность <span>›</span></button><button>Оформление <span>Системное ›</span></button></div>}
    </section>
    <section className="conversation"><header className="conversation-head"><button className="mobile-back">‹</button><div className="avatar-wrap"><Avatar chat={activeChat} small/>{activeChat.online&&<i/>}</div><div className="title"><strong>{activeChat.name}</strong><span>{activeChat.group?"8 участников, 3 в сети":activeChat.online?"в сети":"был(а) недавно"}</span></div><div className="head-actions"><button onClick={()=>setCall("audio")}>☎</button><button onClick={()=>setCall("video")}>▣</button><button onClick={()=>setDetails(!details)}>•••</button></div></header>
      <div className="pinned"><b>ЗАКРЕПЛЕНО</b><span>Макеты приложения и план запуска</span><button>×</button></div>
      <div className="messages"><div className="day"><span>Сегодня</span></div>{messages.map(m=><div key={m.id} className={`message-line ${m.from}`}>{m.from==="them"&&<Avatar chat={activeChat} small/>}<div className={`bubble ${m.file?"file":""}`} onDoubleClick={()=>setReply(m)}>{m.reply&&<div className="reply-quote">{m.reply}</div>}{m.text&&<p>{m.text}</p>}{m.file&&<div className="file-card"><div className="file-icon">{m.file.kind}</div><div><strong>{m.file.name}</strong><span>{m.file.size} · Файл</span></div><button>↓</button></div>}<time>{m.time} {m.from==="me"&&"✓✓"}</time>{m.reaction&&<button className="reaction" onClick={()=>setMessages(x=>x.map(y=>y.id===m.id?{...y,reaction:"🔥 4"}:y))}>{m.reaction}</button>}</div></div>)}</div>
      {reply&&<div className="reply-bar"><b>ОТВЕТ</b><span>{reply.text||reply.file?.name}</span><button onClick={()=>setReply(null)}>×</button></div>}
      <footer className="composer"><button onClick={()=>fileInput.current?.click()}>＋</button><input ref={fileInput} type="file" hidden onChange={attachFile}/><input value={draft} onChange={e=>setDraft(e.target.value)} onKeyDown={key} placeholder="Сообщение"/><button>☺</button><button className={draft.trim()?"send ready":"send"} onClick={draft.trim()?sendMessage:()=>setDraft("Голосовое сообщение · 0:03")}>{draft.trim()?"↑":"●"}</button></footer>
    </section>
    {details&&<aside className="details-panel"><button className="close" onClick={()=>setDetails(false)}>×</button><Avatar chat={activeChat}/><h2>{activeChat.name}</h2><p>{activeChat.group?"8 участников":"@anna_volkova"}</p><div className="detail-actions"><button>🔔<span>Звук</span></button><button>⌕<span>Поиск</span></button><button>♡<span>Избранное</span></button></div><h3>Файлы и медиа</h3><div className="media-grid"><span>FIG</span><span>PDF</span><span>JPG</span></div></aside>}
    {call&&<div className="call-screen"><div className="call-noise"/><div className="call-person"><Avatar chat={activeChat}/><h2>{activeChat.name}</h2><p>{call==="video"?"Видеозвонок":"Защищённый аудиозвонок"} · соединение…</p></div>{call==="video"&&camera&&<div className="self-video"><span>Вы</span></div>}<div className="call-controls"><button className={muted?"off":""} onClick={()=>setMuted(!muted)}><b>{muted?"×":"♬"}</b><span>Микрофон</span></button><button className="hangup" onClick={()=>setCall(null)}><b>☎</b><span>Завершить</span></button><button className={!camera?"off":""} onClick={()=>setCamera(!camera)}><b>▣</b><span>Камера</span></button></div></div>}
    {newGroup&&<div className="modal-back"><div className="group-modal"><p>НОВОЕ СООБЩЕСТВО / 01</p><h2>Создать группу</h2><label>Название<input autoFocus value={groupName} onChange={e=>setGroupName(e.target.value)} placeholder="Например, Команда продаж"/></label><span>Выберите участников</span><div className="member-picks">{chats.filter(c=>!c.group).map(c=><label key={c.id}><input type="checkbox"/><Avatar chat={c} small/><b>{c.name}</b></label>)}</div><div className="modal-actions"><button onClick={()=>setNewGroup(false)}>Отмена</button><button className="confirm" disabled={!groupName.trim()} onClick={()=>{setNewGroup(false);setGroupName("")}}>Создать ↗</button></div></div></div>}
  </main>
}
