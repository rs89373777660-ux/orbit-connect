import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render(){
 const workerUrl=new URL("../dist/server/index.js",import.meta.url);
 workerUrl.searchParams.set("test",`${process.pid}-${Date.now()}`);
 const {default:worker}=await import(workerUrl.href);
 return worker.fetch(new Request("http://localhost/",{headers:{accept:"text/html"}}),{ASSETS:{fetch:async()=>new Response("Not found",{status:404})}},{waitUntil(){},passThroughOnException(){}});
}

test("server-renders the Orbit Connect entry experience",async()=>{
 const response=await render();
 assert.equal(response.status,200);
 assert.match(response.headers.get("content-type")??"",/^text\/html\b/i);
 const html=await response.text();
 assert.match(html,/<title>Orbit Connect — мессенджер<\/title>/i);
 assert.match(html,/class="entry-intro"/);
 assert.match(html,/ТВОЙ КРУГ СТАНОВИТСЯ БЛИЖЕ/);
 assert.doesNotMatch(html,/codex-preview|Your site is taking shape/i);
});

test("ships message controls and mobile avatar constraints",async()=>{
 const [app,css,schema]=await Promise.all([
  readFile(new URL("../app/messenger-app.tsx",import.meta.url),"utf8"),
  readFile(new URL("../app/globals.css",import.meta.url),"utf8"),
  readFile(new URL("../db/schema.ts",import.meta.url),"utf8")
 ]);
 assert.match(app,/ИИ-помощник/);
 assert.match(app,/Исправлять все ошибки автоматически/);
 assert.match(app,/Удалить у всех/);
 assert.match(app,/прочитано/);
 assert.match(css,/\.person-row>\.orbit-avatar/);
 assert.match(schema,/messageReceipts/);
 assert.match(schema,/messageHidden/);
});
