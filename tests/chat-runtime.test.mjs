import test from 'node:test'
import assert from 'node:assert/strict'
import {existsSync} from 'node:fs'
import {EventEmitter} from 'node:events'
import {createChatState,sendText} from '../src/shared/chat-state.mjs'
async function moduleAt(path){const p=new URL(path,import.meta.url);assert.ok(existsSync(p),'聊天运行时尚未实现');return import(p)}
test('chat boss covers visible windows and late windows without hiding or opacity changes',async()=>{
  const {createChatWindowController}=await moduleAt('../src/main/chat-window-controls.mjs')
  const values=new Map(),store={get:k=>values.get(k),set:(k,v)=>values.set(k,v)},screen={getAllDisplays:()=>[{workArea:{x:0,y:0,width:1920,height:1080}}]}
  const win=()=>{const w=new EventEmitter();let destroyed=false;w.sent=[];w.getBounds=()=>({x:20,y:20,width:980,height:760});w.isDestroyed=()=>destroyed;w.webContents={isDestroyed:()=>destroyed,send:(...a)=>w.sent.push(a)};w.show=()=>{};w.setBounds=()=>{};w.getOpacity=()=>1;w.setOpacity=()=>{throw Error('老板键不能改变不透明度')};w.hide=()=>{throw Error('老板键不能隐藏聊天窗口')};w.close=()=>{w.emit('close');destroyed=true;w.emit('closed')};return w}
  const c=createChatWindowController({store,screen}),a=win();c.attach('wechat',a)
  assert.equal(c.toggleBoss(),true);assert.equal(c.state('wechat').covered,true);assert.deepEqual(a.sent.at(-1),['chat-mode:boss',true])
  a.close();assert.throws(()=>c.state('wechat'));assert.throws(()=>c.state('unknown'),/聊天窗口不存在/);const b=win();c.attach('wechat',b);assert.equal(c.state('wechat').covered,true)
  c.restore('wechat');assert.equal(c.state('wechat').covered,true);c.toggleBoss();assert.equal(c.state('wechat').covered,false)
})
test('client queues rapid updates against committed revisions and ignores old broadcasts',async()=>{
  const {createChatController}=await moduleAt('../src/renderer/src/features/chat/controller.mjs');let saved=createChatState(),calls=[],published
  const api={get:async()=>structuredClone(saved),save:async(next,revision)=>{calls.push(revision);await new Promise(r=>setTimeout(r,5));assert.equal(revision,saved.revision);saved={...structuredClone(next),revision:revision+1};return saved}}
  const c=createChatController({api,onState:s=>published=s});await c.load()
  await Promise.all([c.update(s=>sendText(s,'第一条')),c.update(s=>sendText(s,'第二条'))]);assert.deepEqual(calls,[0,1]);assert.equal(published.revision,2)
  c.accept(createChatState());assert.equal(published.revision,2);assert.equal(published.conversations.find(x=>x.id==='group').messages.length,5)
  c.dispose();await assert.rejects(c.update(s=>sendText(s,'已销毁')),/关闭/)
})
test('failed client save retains committed data and next update still works',async()=>{
  const {createChatController}=await moduleAt('../src/renderer/src/features/chat/controller.mjs');let saved=createChatState(),fail=true,published,errors=[]
  const c=createChatController({api:{get:async()=>structuredClone(saved),save:async(n,r)=>{if(fail){fail=false;throw Error('磁盘写入失败')}saved={...n,revision:r+1};return saved}},onState:s=>published=s,onError:e=>errors.push(e.message)})
  await c.load();await assert.rejects(c.update(s=>sendText(s,'失败消息')),/磁盘/);assert.equal(published.revision,0)
  await c.update(s=>sendText(s,'成功消息'));assert.equal(published.revision,1);assert.equal(published.conversations.find(x=>x.id==='group').messages.at(-1).text,'成功消息');assert.equal(errors.length,1)
})
test('boot applies covered runtime before publishing chat with restored player',async()=>{
  const {loadChatRuntime}=await moduleAt('../src/renderer/src/features/chat/controller.mjs');assert.equal(typeof loadChatRuntime,'function')
  const calls=[];let covered=false
  await loadChatRuntime({load:async()=>{assert.equal(covered,true);calls.push('load')}},{getRuntime:async()=>{calls.push('runtime');return {covered:true,warning:''}}},s=>{covered=s.covered})
  assert.deepEqual(calls,['runtime','load','runtime'])
})
test('wechat dingtalk and feishu share cover but persist independent bounds',async()=>{
  const {createChatWindowController}=await moduleAt('../src/main/chat-window-controls.mjs');const values=new Map(),store={get:k=>values.get(k),set:(k,v)=>values.set(k,v)},screen={getAllDisplays:()=>[{workArea:{x:0,y:0,width:1600,height:900}}]}
  const make=(x)=>{const w=new EventEmitter();w.sent=[];w.isDestroyed=()=>false;w.getBounds=()=>({x,y:20,width:960,height:700});w.setBounds=()=>{};w.show=()=>{};w.close=()=>{};w.getOpacity=()=>1;w.setOpacity=()=>{};w.webContents={isDestroyed:()=>false,send:(...v)=>w.sent.push(v)};return w}
  const c=createChatWindowController({store,screen}),wx=make(10),ding=make(60),fei=make(110);c.attach('wechat',wx);c.attach('dingtalk',ding);c.attach('feishu',fei);c.toggleBoss()
  for(const w of [wx,ding,fei])assert.deepEqual(w.sent.at(-1),['chat-mode:boss',true]);fei.emit('move');assert.equal(values.get('chatWindows.feishu').bounds.x,110);assert.equal(values.has('chatWindows.wechat'),false)
})
test('composite chat windows persist bounds independently while legacy storage stays unchanged',async()=>{
  const {createChatWindowController}=await moduleAt('../src/main/chat-window-controls.mjs')
  const values=new Map(),store={get:key=>values.get(key),set:(key,value)=>values.set(key,value)},screen={getAllDisplays:()=>[{workArea:{x:0,y:0,width:1600,height:900}}]}
  const make=x=>{const w=new EventEmitter();w.isDestroyed=()=>false;w.getBounds=()=>({x,y:10,width:980,height:760});w.setBounds=()=>{};w.show=()=>{};w.close=()=>{};w.setOpacity=()=>{};w.webContents={isDestroyed:()=>false,send:()=>{}};return w}
  const controller=createChatWindowController({store,screen}),legacy=make(5),bilibili=make(10),huya=make(70)
  controller.attach('wechat',legacy);controller.attach('chat-bilibili-wechat',bilibili);controller.attach('chat-huya-wechat',huya)
  legacy.emit('move');bilibili.emit('move');huya.emit('move')
  assert.equal(values.get('chatWindows.wechat').bounds.x,5)
  assert.equal(values.get('chatWindows.chat-bilibili-wechat').bounds.x,10)
  assert.equal(values.get('chatWindows.chat-huya-wechat').bounds.x,70)
})
test('legacy dingding identity restores and persists the existing dingtalk storage key',async()=>{
  const {createChatWindowController}=await moduleAt('../src/main/chat-window-controls.mjs')
  const saved={x:25,y:30,width:900,height:700},values=new Map([['chatWindows.dingtalk',{bounds:saved}]]),store={get:key=>values.get(key),set:(key,value)=>values.set(key,value)},screen={getAllDisplays:()=>[{workArea:{x:0,y:0,width:1600,height:900}}]}
  const win=new EventEmitter();let restored;win.isDestroyed=()=>false;win.setBounds=value=>{restored=value};win.getBounds=()=>({x:55,y:30,width:900,height:700});win.show=()=>{};win.close=()=>{};win.setOpacity=()=>{};win.webContents={isDestroyed:()=>false,send:()=>{}}
  const controller=createChatWindowController({store,screen});controller.attach('dingding',win)
  assert.deepEqual(restored,saved);win.emit('move')
  assert.equal(values.get('chatWindows.dingtalk').bounds.x,55);assert.equal(values.has('chatWindows.dingding'),false)
})
test('replaced canonical chat windows ignore stale lifecycle events',async()=>{
  const {createChatWindowController}=await moduleAt('../src/main/chat-window-controls.mjs')
  const values=new Map(),store={get:key=>values.get(key),set:(key,value)=>values.set(key,value)},screen={getAllDisplays:()=>[{workArea:{x:0,y:0,width:1600,height:900}}]}
  const make=x=>{const win=new EventEmitter();win.isDestroyed=()=>false;win.setBounds=()=>{};win.getBounds=()=>({x,y:20,width:900,height:700});win.show=()=>{};win.close=()=>{};win.setOpacity=()=>{};win.webContents={isDestroyed:()=>false,send:()=>{}};return win}
  const controller=createChatWindowController({store,screen}),oldWindow=make(10),newWindow=make(70)
  controller.attach('dingtalk',oldWindow);controller.attach('dingding',newWindow);newWindow.emit('move');oldWindow.emit('move');oldWindow.emit('close');oldWindow.emit('closed')
  assert.equal(values.get('chatWindows.dingtalk').bounds.x,70);assert.equal(controller.state('dingding').bounds.x,70)
})
test('client accepts a platform-specific validator',async()=>{
  const {createChatController}=await moduleAt('../src/renderer/src/features/chat/controller.mjs');const {validateChatState}=await import('../src/shared/chat-state.mjs');let saved=createChatState('dingtalk'),published
  const api={get:async()=>structuredClone(saved),save:async(n,r)=>saved={...n,revision:r+1}}
  const c=createChatController({api,validate:raw=>validateChatState(raw,'dingtalk'),onState:s=>published=s});await c.load();await c.update(s=>sendText(s,'钉钉消息'));assert.equal(published.conversations.length,5);assert.equal(published.revision,1)
})
