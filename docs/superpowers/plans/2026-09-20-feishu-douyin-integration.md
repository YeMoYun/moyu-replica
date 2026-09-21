# Feishu Douyin Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将已验收的飞书三栏 UI 正式接入独立持久化、真实抖音气泡、老板键和安全隔离，同时保持微信、钉钉及透明模式不变。

**Architecture:** 扩展现有平台化聊天内核，使 `feishu` 成为第三个显式 profile；新增飞书专属 Vue 视图、图标与作用域样式。主进程为飞书提供来源受限 IPC、独立窗口状态和固定 WebView partition；默认媒体卡片纯本地，只有用户主动点击“＋”才创建真实抖音 guest。

**Tech Stack:** Vue 3、Electron 31、ES modules、现有 JSON store、Node `node:test`、隔离 Electron smoke。

---

当前目录不是 Git 工作区，因此不创建 worktree、不提交；每个任务以测试结果和文档记录作为检查点。只读源 `D:\MoYuMaster-1.0.0-win` 不写入。

## 文件结构

- Modify `src/shared/chat-profiles.mjs`：增加飞书头像词表和 10 个默认会话。
- Modify `src/shared/chat-state.mjs`：支持飞书 `media-card` 和公告 UI 状态，保持微信/钉钉返回结构不变。
- Modify `src/main/chat-service.mjs`：为飞书启用损坏状态备份与默认恢复。
- Modify `src/main/chat-window-controls.mjs`、`src/main/chat-guest-policy.mjs`：允许飞书逻辑窗口并绑定专属 partition。
- Modify `src/main/index.js`、`src/preload/index.js`：注册飞书 service、IPC、窗口和桥接。
- Create `src/renderer/src/features/chat/FeishuIcon.vue`：飞书专属本地图标，避免改动微信/钉钉图标。
- Create `src/renderer/src/views/FeishuView.vue`、`src/renderer/src/features/chat/feishu.css`：正式飞书 UI 与交互。
- Modify `src/renderer/src/router/index.js`、`src/renderer/src/views/HomeView.vue`、`src/main/window-definitions.mjs`：正式入口。
- Create `tests/feishu-chat.test.mjs`、`tests/feishu-wiring.test.mjs`：模型、恢复、安全与静态结构测试。
- Modify `tests/chat-runtime.test.mjs`、`tests/settings-guard.test.mjs`：三窗口老板键与通用 IPC 保护。
- Create `scripts/feishu-smoke.cjs`、`scripts/run-feishu-smoke.mjs`：实际 Electron 验证。
- Create `docs/feishu-douyin-acceptance.md`、`docs/2026-09-20-feishu-douyin-verification.md`：人工验收与证据。

## Task 1：锁定保护基线并写飞书模型失败测试

**Files:**
- Create: `tests/feishu-chat.test.mjs`
- Read only: `src/renderer/src/views/WechatView.vue`
- Read only: `src/renderer/src/views/DingTalkView.vue`
- Read only: `src/renderer/src/views/*OpacityView.vue`

- [ ] **Step 1: 记录受保护文件和只读源哈希**

Run:

```powershell
$protected = @(
  'src/renderer/src/views/WechatView.vue',
  'src/renderer/src/views/DingTalkView.vue',
  'src/renderer/src/views/DouyinOpacityView.vue',
  'src/renderer/src/views/VideoOpacityView.vue',
  'src/renderer/src/features/video-opacity/controller.mjs',
  'src/renderer/src/features/video-opacity/page-scripts.mjs',
  'D:\MoYuMaster-1.0.0-win\resources\app.asar'
)
Get-FileHash -Algorithm SHA256 -LiteralPath $protected | Select-Object Hash,Path
```

Expected: 七个路径都有 SHA256；把结果原样写入最终验证记录，不编辑这些文件。

- [ ] **Step 2: 创建飞书默认状态、静态媒体卡片和跨平台拒绝测试**

Create `tests/feishu-chat.test.mjs`:

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import {createChatState,validateChatState,insertPlayer} from '../src/shared/chat-state.mjs'

test('feishu starts with approved ten conversations and a local card but no web player',()=>{
  const state=createChatState('feishu')
  assert.deepEqual(state.conversations.map(c=>c.name),[
    '质检组','林晓','设计讨论组','陈晨','云文档助手',
    '打卡提醒群','小叶的飞书助手','标注临时任务群','考勤通知','协作机器人'
  ])
  assert.equal(state.selectedId,'group')
  assert.equal(state.conversations[0].memberCount,16)
  assert.equal(state.conversations.flatMap(c=>c.messages).filter(m=>m.type==='media-card').length,1)
  assert.equal(state.conversations.flatMap(c=>c.messages).some(m=>m.type==='player'),false)
  assert.deepEqual(state.ui,{hiddenAnnouncements:[]})
  assert.deepEqual(validateChatState(state,'feishu'),state)
})

test('feishu media cards are local, bounded and forbidden in other profiles',()=>{
  const state=createChatState('feishu'),card=state.conversations[0].messages.find(m=>m.type==='media-card')
  assert.deepEqual(Object.keys(card).sort(),['description','id','sender','time','title','type'])
  const wx=createChatState();wx.conversations[0].messages.push(card)
  assert.throws(()=>validateChatState(wx),/消息类型/)
  card.title='x'.repeat(81)
  assert.throws(()=>validateChatState(state,'feishu'),/媒体卡片标题/)
})

test('feishu announcements reference existing conversations and player stays unique',()=>{
  const state=createChatState('feishu');state.ui.hiddenAnnouncements=['group']
  assert.deepEqual(validateChatState(state,'feishu').ui.hiddenAnnouncements,['group'])
  state.ui.hiddenAnnouncements=['missing']
  assert.throws(()=>validateChatState(state,'feishu'),/公告/)
  state.ui.hiddenAnnouncements=[];const first=insertPlayer(state),second=insertPlayer(state);assert.equal(second.id,first.id)
})

test('wechat and dingtalk default structures remain unchanged',()=>{
  assert.equal(createChatState().conversations.length,7)
  assert.equal(createChatState('dingtalk').conversations.length,5)
  assert.equal(Object.hasOwn(createChatState(),'ui'),false)
  assert.equal(Object.hasOwn(createChatState('dingtalk'),'ui'),false)
})
```

- [ ] **Step 3: 运行失败测试**

Run:

```powershell
node --test tests/feishu-chat.test.mjs
```

Expected: FAIL with `聊天平台不支持` because `feishu` profile does not exist. Do not weaken assertions.

## Task 2：实现飞书 profile、媒体卡片和公告状态

**Files:**
- Modify: `src/shared/chat-profiles.mjs`
- Modify: `src/shared/chat-state.mjs`
- Test: `tests/feishu-chat.test.mjs`
- Test: `tests/chat-state.test.mjs`
- Test: `tests/dingtalk-chat.test.mjs`

- [ ] **Step 1: 在 profile 中加入飞书词表和完整默认会话工厂**

Add to `CHAT_PROFILES`:

```js
feishu:Object.freeze({key:'feishu',avatars:Object.freeze(['blue','green','purple','orange','bot','self'])})
```

Add this export to `src/shared/chat-profiles.mjs`:

```js
export function createFeishuConversations(msg){return [
  {id:'group',name:'质检组',contact:'林晓',avatar:'green',memberCount:16,unread:0,messages:[
    msg(1,'other','确认现在使用新版检查清单，采集完成后记得更新共享文档。','15:38','林晓'),
    msg(2,'other','界面检查已完成，操作演示放在下面，大家可以对照查看。','15:42','陈晨'),
    {id:'m4',type:'media-card',sender:'other',time:'15:48',title:'本地操作演示',description:'这是本地占位卡片；点击输入栏“＋”后才加载真实抖音网页。'}
  ]},
  {id:'lin',name:'林晓',contact:'林晓',avatar:'orange',memberCount:0,unread:1,messages:[msg(5,'other','下午一起核对一下验收记录。','11:59')]},
  {id:'design',name:'设计讨论组',contact:'陈晨',avatar:'purple',memberCount:5,unread:0,messages:[msg(6,'other','新版界面已发到文档，麻烦大家看一下。','08:18','陈晨')]},
  {id:'chen',name:'陈晨',contact:'陈晨',avatar:'blue',memberCount:0,unread:0,messages:[msg(7,'other','这版的间距看起来舒服一些。','昨天')]},
  {id:'file',name:'云文档助手',contact:'助手',avatar:'bot',memberCount:0,unread:0,messages:[msg(8,'other','文档权限已更新。','9月16日')]},
  {id:'reminder',name:'打卡提醒群',contact:'小李',avatar:'purple',memberCount:12,unread:0,messages:[msg(9,'other','今天的记录已整理。','9月16日')]},
  {id:'assistant',name:'小叶的飞书助手',contact:'助手',avatar:'bot',memberCount:0,unread:1,messages:[msg(10,'other','这里展示本地提醒消息。','9月15日')]},
  {id:'task',name:'标注临时任务群',contact:'小周',avatar:'blue',memberCount:9,unread:0,messages:[msg(11,'other','本周待办已更新。','9月15日')]},
  {id:'attendance',name:'考勤通知',contact:'小李',avatar:'purple',memberCount:6,unread:0,messages:[msg(12,'other','请核对本周的演示记录。','9月11日')]},
  {id:'bot',name:'协作机器人',contact:'机器人',avatar:'bot',memberCount:0,unread:0,messages:[msg(13,'other','今日任务汇总 · 演示数据。','9月10日')]}
]}
```

- [ ] **Step 2: 让状态创建和验证支持飞书专属字段**

Change the import:

```js
import {chatProfile,createDingTalkConversations,createFeishuConversations} from './chat-profiles.mjs'
```

Add the Feishu early return immediately after the message factory in `createChatState`:

```js
if(platform==='feishu')return {
  version:1,revision:0,selfName:'小叶',selectedId:'group',drafts:{},
  settings:{site:'douyin',orientation:'landscape',scale:140,sender:'self',mask:false,address:DOUYIN_HOME},
  ui:{hiddenAnnouncements:[]},conversations:createFeishuConversations(msg)
}
```

Replace the message-type validation inside `validateChatState` with:

```js
const allowedTypes=platform==='feishu'?['text','media-card','player']:['text','player']
if(!allowedTypes.includes(m.type)||!['self','other'].includes(m.sender))throw Error('消息类型或发送方无效')
const result={id:messageId,type:m.type,sender:m.sender,time:text(m.time,'时间',40)}
if(m.type==='text')result.text=text(m.text,'消息',2000)
else if(m.type==='media-card'){
  result.title=text(m.title,'媒体卡片标题',80)
  result.description=text(m.description,'媒体卡片说明',300)
}else{
  if(++players>1)throw Error('每个会话最多一个播放器')
  result.address=validateChatUrl(m.address)
}
```

Before the final return, normalize Feishu UI state without adding a field to the other profiles:

```js
const result={version:1,revision,selfName,selectedId,drafts,settings:normalizedSettings,conversations}
if(platform==='feishu'){
  const ui=object(raw.ui)
  if(!Array.isArray(ui.hiddenAnnouncements))throw Error('公告状态无效')
  const hidden=[...new Set(ui.hiddenAnnouncements.map(id))]
  if(hidden.some(value=>!chatIds.has(value)))throw Error('公告会话不存在')
  result.ui={hiddenAnnouncements:hidden}
}
return result
```

Keep `insertPlayer` unchanged; its existing `type==='player'` lookup permits the local card and still enforces one real player.

- [ ] **Step 3: 运行模型回归**

Run:

```powershell
node --test tests/feishu-chat.test.mjs tests/chat-state.test.mjs tests/dingtalk-chat.test.mjs
```

Expected: all PASS; WeChat remains seven conversations and DingTalk remains five.

## Task 3：实现损坏状态恢复、三窗口控制和设置隔离

**Files:**
- Modify: `tests/feishu-chat.test.mjs`
- Modify: `tests/chat-runtime.test.mjs`
- Modify: `tests/settings-guard.test.mjs`
- Modify: `src/main/chat-service.mjs`
- Modify: `src/main/chat-window-controls.mjs`

- [ ] **Step 1: 写损坏状态恢复失败测试**

Append to `tests/feishu-chat.test.mjs`:

```js
test('invalid saved feishu state is backed up and atomically replaced by defaults',async()=>{
  const {createChatService}=await import('../src/main/chat-service.mjs')
  const invalid={version:1,revision:3,conversations:'broken'},values=new Map([['chatModes.feishu',invalid]])
  const clone=v=>v===undefined?undefined:structuredClone(v)
  const store={
    get:key=>clone(values.get(key)),
    set:(key,value)=>values.set(key,clone(value)),
    setMany:entries=>Object.entries(entries).forEach(([key,value])=>values.set(key,clone(value)))
  }
  const service=createChatService({store,key:'feishu',profile:'feishu',legacyKey:null,recoverInvalidSaved:true})
  const state=service.get(),backup=values.get('chatMigration.feishu')
  assert.equal(state.conversations.length,10)
  assert.deepEqual(backup.invalidSaved,invalid)
  assert.match(backup.warning,/已恢复默认/)
  assert.match(service.getWarning(),/已恢复默认/)
})
```

- [ ] **Step 2: 写三窗口老板键与独立位置失败测试**

Replace the two-window test in `tests/chat-runtime.test.mjs` with a three-window assertion:

```js
test('wechat dingtalk and feishu share cover but persist independent bounds',async()=>{
  const {createChatWindowController}=await moduleAt('../src/main/chat-window-controls.mjs')
  const values=new Map(),store={get:k=>values.get(k),set:(k,v)=>values.set(k,v)}
  const screen={getAllDisplays:()=>[{workArea:{x:0,y:0,width:1600,height:900}}]}
  const make=x=>{const w=new EventEmitter();w.sent=[];w.isDestroyed=()=>false;w.getBounds=()=>({x,y:20,width:960,height:700});w.setBounds=()=>{};w.show=()=>{};w.close=()=>{};w.getOpacity=()=>1;w.setOpacity=()=>{};w.webContents={isDestroyed:()=>false,send:(...v)=>w.sent.push(v)};return w}
  const c=createChatWindowController({store,screen}),wx=make(10),ding=make(60),fei=make(110)
  c.attach('wechat',wx);c.attach('dingtalk',ding);c.attach('feishu',fei);c.toggleBoss()
  for(const w of [wx,ding,fei])assert.deepEqual(w.sent.at(-1),['chat-mode:boss',true])
  fei.emit('move');assert.equal(values.get('chatWindows.feishu').bounds.x,110)
  assert.equal(values.has('chatWindows.wechat'),false)
})
```

- [ ] **Step 3: 扩展通用设置保护测试**

Add Feishu keys to `tests/settings-guard.test.mjs`:

```js
assert.throws(()=>validateUnmanagedSettings({'chatModes.feishu':{}}),/专用/)
assert.throws(()=>validateUnmanagedSettingRead('chatMigration.feishu'),/专用/)
const sanitized=sanitizeUnmanagedSettings({chatModes:{feishu:{secret:true}},chatWindows:{feishu:{x:1}},theme:'light'})
assert.deepEqual(sanitized,{theme:'light'})
```

- [ ] **Step 4: 实现可选的损坏状态恢复**

Change the service signature:

```js
export function createChatService({store,notify=()=>{},key='wechat',profile=key,
  legacyKey=key==='wechat'?'wechatConfig':'dingdingConfig',legacySiteKey,recoverInvalidSaved=false})
```

Replace the saved-state branch with:

```js
const saved=store.get(stateKey)
if(saved!==undefined){
  try{return validateChatState(saved,profile)}
  catch(error){
    if(!recoverInvalidSaved)throw error
    const state=createChatState(profile)
    warning=`已保存的聊天配置无效，已恢复默认数据：${error.message}`
    store.setMany({
      [stateKey]:state,
      [migrationKey]:{invalidSaved:saved,warning,date:new Date().toISOString()}
    })
    return structuredClone(state)
  }
}
```

Guard legacy reads so `legacyKey:null` performs no store lookup:

```js
const legacy=legacyKey?store.get(legacyKey):undefined
```

- [ ] **Step 5: 允许飞书窗口逻辑键**

In `src/main/chat-window-controls.mjs`, change:

```js
if(!['wechat','dingtalk','feishu'].includes(key))throw Error('聊天窗口类型不支持')
```

No other boss-key logic changes are required; its controller-level `covered` remains shared.

- [ ] **Step 6: 运行服务、窗口和设置测试**

Run:

```powershell
node --test tests/feishu-chat.test.mjs tests/chat-runtime.test.mjs tests/settings-guard.test.mjs
```

Expected: all PASS, including exact invalid-state backup and `chatWindows.feishu` persistence.

## Task 4：接入飞书窗口、IPC、preload、路由和首页

**Files:**
- Create: `tests/feishu-wiring.test.mjs`
- Modify: `src/main/chat-guest-policy.mjs`
- Modify: `src/main/window-definitions.mjs`
- Modify: `src/main/index.js`
- Modify: `src/preload/index.js`
- Modify: `src/renderer/src/router/index.js`
- Modify: `src/renderer/src/views/HomeView.vue`

- [ ] **Step 1: 创建接线失败测试**

Create `tests/feishu-wiring.test.mjs`:

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8')

test('formal feishu has an isolated route bridge service and guest partition',()=>{
  const routes=read('src/renderer/src/router/index.js'),preload=read('src/preload/index.js')
  const main=read('src/main/index.js'),home=read('src/renderer/src/views/HomeView.vue')
  assert.match(routes,/path: '\/feishu'.*FeishuView\.vue/)
  assert.match(preload,/exposeInMainWorld\('feishuModeControl'/)
  assert.match(main,/feishu-mode:get/)
  assert.match(main,/createChatService\(\{store,key:'feishu',profile:'feishu'/s)
  assert.match(home,/飞书模式/)
})

test('feishu webview policy requires its own fixed session',async()=>{
  const {validateChatGuestAttachment}=await import('../src/main/chat-guest-policy.mjs')
  assert.equal(validateChatGuestAttachment('feishu',{src:'https://www.douyin.com/',partition:'persist:moyu-chat-feishu'}).partition,'persist:moyu-chat-feishu')
  assert.throws(()=>validateChatGuestAttachment('feishu',{src:'https://www.douyin.com/',partition:'persist:moyu-chat-dingtalk'}),/分区/)
})
```

- [ ] **Step 2: 运行接线测试并确认失败**

Run:

```powershell
node --test tests/feishu-wiring.test.mjs
```

Expected: FAIL because `FeishuView.vue`, route, bridge and partition are absent.

- [ ] **Step 3: 增加窗口定义和 partition**

Add to `SITE_ROUTES`:

```js
feishu: definition('/feishu',1200,800,{webSecurity:false}),
```

Add to the `partitions` object in `chat-guest-policy.mjs`:

```js
feishu: 'persist:moyu-chat-feishu'
```

- [ ] **Step 4: 暴露飞书 preload API**

Add near the other mode controls in `src/preload/index.js`:

```js
contextBridge.exposeInMainWorld('feishuModeControl', {
  open: address => ipcRenderer.invoke('feishu-mode:open', address),
  get: () => ipcRenderer.invoke('feishu-mode:get'),
  save: (state, revision) => ipcRenderer.invoke('feishu-mode:save', state, revision),
  getRuntime: () => ipcRenderer.invoke('feishu-mode:state'),
  close: () => ipcRenderer.invoke('feishu-mode:close'),
  onState: on('feishu-mode:updated'),
  onBoss: on('chat-mode:boss'),
  onError: on('chat-mode:error')
})
```

- [ ] **Step 5: 泛化主进程聊天窗口映射**

Add top-level constants to `src/main/index.js`:

```js
const CHAT_WINDOW_TO_PROFILE=Object.freeze({wechat:'wechat',dingding:'dingtalk',feishu:'feishu'})
const CHAT_WINDOW_KEYS=new Set(Object.keys(CHAT_WINDOW_TO_PROFILE))
```

Replace all `['wechat','dingding'].includes(key)` branches in `makeWindow`, `focus`, and shortcut opacity handling with `CHAT_WINDOW_KEYS.has(key)`, and replace the ternary mapping with:

```js
CHAT_WINDOW_TO_PROFILE[key]
```

The webview attach branch must call `validateChatGuestAttachment(key,params)` for all three actual window keys.

- [ ] **Step 6: 注册飞书 service 和来源受限 IPC**

Declare:

```js
let feishuService = null
```

Initialize after `dingtalkService`:

```js
feishuService=createChatService({store,key:'feishu',profile:'feishu',legacyKey:null,recoverInvalidSaved:true,notify:state=>{
  const win=windows.get('feishu')
  if(win&&!win.isDestroyed()&&!win.webContents.isDestroyed())win.webContents.send('feishu-mode:updated',state)
}})
```

Register inside `registerIpc`:

```js
const requireFeishu=event=>{if(keyFromSender(event)!=='feishu')throw Error('仅飞书窗口可操作聊天配置')}
handle('feishu-mode:get',event=>{requireFeishu(event);return feishuService.get()})
handle('feishu-mode:save',(event,state,revision)=>{requireFeishu(event);return feishuService.save(state,revision)})
handle('feishu-mode:state',event=>{requireFeishu(event);return {...chatWindowControls.state('feishu'),warning:feishuService.getWarning()}})
handle('feishu-mode:close',event=>{requireFeishu(event);return chatWindowControls.close('feishu')})
handle('feishu-mode:open',(event,address)=>{
  if(keyFromSender(event)!=='main')throw Error('仅主窗口可打开飞书模式')
  if(address!==undefined){
    const url=validateChatUrl(address),state=feishuService.get();state.settings.address=url
    const player=state.conversations.find(c=>c.id===state.selectedId)?.messages.find(m=>m.type==='player')
    if(player)player.address=url
    feishuService.save(state,state.revision)
  }
  openSite('feishu');return true
})
```

Add `feishu:'feishu'` to the creators map and `'close-feishu-window':'feishu'` to close channels for compatibility with the generic home bridge.

- [ ] **Step 7: 添加路由和首页入口**

Add to routes:

```js
{ path: '/feishu', name: 'Feishu', component: () => import('../views/FeishuView.vue'), meta: { kind: 'feishu' } },
```

Add beside the other disguise tiles:

```vue
<button class="tile" @click="open('feishu')">飞书模式</button>
```

Add to `calls`:

```js
feishu: () => window.feishuModeControl.open().catch(error=>{ appError.value=error.message }),
```

- [ ] **Step 8: 运行接线和现有聊天测试**

Run:

```powershell
node --test tests/feishu-wiring.test.mjs tests/dingtalk-wiring.test.mjs tests/chat-wiring.test.mjs tests/chat-runtime.test.mjs
```

Expected: partition and IPC assertions PASS; formal view structure assertions remain for Task 5.

## Task 5：迁移已验收飞书 UI 并接入正式状态控制器

**Files:**
- Create: `src/renderer/src/features/chat/FeishuIcon.vue`
- Create: `src/renderer/src/views/FeishuView.vue`
- Create: `src/renderer/src/features/chat/feishu.css`
- Modify: `tests/feishu-wiring.test.mjs`
- Reuse: `src/renderer/src/features/chat/ChatPlayer.vue`
- Reuse: `src/renderer/src/features/chat/controller.mjs`
- Reference: `previews/chat-ui/app.js`
- Reference: `previews/chat-ui/styles.css`

- [ ] **Step 1: 增加正式视图结构失败断言**

Append to `tests/feishu-wiring.test.mjs`:

```js
test('approved feishu structure is local-first and mounts stable real guests only for players',()=>{
  const view=read('src/renderer/src/views/FeishuView.vue'),css=read('src/renderer/src/features/chat/feishu.css')
  assert.match(view,/class="feishu formal-feishu"/)
  assert.match(view,/class="quick-conversations"/)
  assert.match(view,/class="chat-tabs"/)
  assert.match(view,/class="group-announcement"/)
  assert.match(view,/m\.type==='media-card'/)
  assert.match(view,/v-show="c\.id === state\.selectedId"/)
  assert.match(view,/partition="persist:moyu-chat-feishu"/)
  assert.match(view,/window\.feishuModeControl/)
  assert.doesNotMatch(view,/window\.(chatModeControl|dingtalkModeControl)/)
  assert.match(css,/\.formal-feishu \.navigation\{[^}]*width:176px/)
  assert.match(css,/\.formal-feishu \.composer\{[^}]*height:52px/)
  assert.match(css,/-webkit-app-region:drag/)
  assert.doesNotMatch(css,/(^|})\.(chat-startup|navigation|composer)\{/)
})
```

Run:

```powershell
node --test tests/feishu-wiring.test.mjs
```

Expected: FAIL until the dedicated template and stylesheet exist.

- [ ] **Step 2: 创建飞书专属图标组件**

Create `FeishuIcon.vue` with a local name-to-path map and no network assets:

```vue
<template>
  <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path v-for="(path,index) in paths[name]||paths.more" :key="index" :d="path"/>
  </svg>
</template>
<script setup>
defineProps({name:String})
const paths={
  search:['M21 21l-4.4-4.4','M19 11a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z'],
  chat:['M4 4h16v12H8l-4 4V4Z'],calendar:['M4 5h16v16H4V5Z','M8 2v6M16 2v6M4 10h16'],
  doc:['M6 2h9l4 4v16H6V2Z','M14 2v5h5M9 12h6M9 16h6'],work:['M3 7h18v14H3V7Z','M8 7V3h8v4'],
  users:['M8 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z','M1 22a7 7 0 0 1 14 0M17 11a3 3 0 1 0 0-6M16 16a6 6 0 0 1 7 6'],
  smile:['M3 12a9 9 0 1 0 18 0 9 9 0 0 0-18 0Z','M8 14s1.5 2 4 2 4-2 4-2M8 9h.01M16 9h.01'],
  at:['M16 8v7a3 3 0 0 0 6 0v-3a10 10 0 1 0-4 8'],cut:['M8 8 21 21M8 16 21 3','M6 3a3 3 0 1 0 0 6 3 3 0 0 0 0-6ZM6 15a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z'],
  plus:['M12 4v16M4 12h16'],settings:['M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z','M19 12a7 7 0 0 0-.1-1l2-2-2-3-2.7 1A8 8 0 0 0 14 6l-.5-3h-3L10 6a8 8 0 0 0-2.2 1L5 6 3 9l2 2a7 7 0 0 0 0 2l-2 2 2 3 2.8-1A8 8 0 0 0 10 18l.5 3h3l.5-3a8 8 0 0 0 2.2-1l2.8 1 2-3-2-2Z'],
  send:['M3 3l18 9-18 9 4-9-4-9Z','M7 12h14'],more:['M5 12h.01M12 12h.01M19 12h.01'],close:['M5 5l14 14M19 5 5 19'],menu:['M4 6h16M4 12h16M4 18h16']
}
</script>
```

- [ ] **Step 3: 创建正式 FeishuView 数据流**

Create `FeishuView.vue` with these exact imports and controller binding:

```vue
<script setup>
import {ref,computed,onMounted,onBeforeUnmount,watch,nextTick} from 'vue'
import FeishuIcon from '../features/chat/FeishuIcon.vue'
import ChatPlayer from '../features/chat/ChatPlayer.vue'
import {createChatController,loadChatRuntime} from '../features/chat/controller.mjs'
import {createChatState,currentChat,sendText,insertPlayer,validateChatState,validateChatUrl} from '../../../shared/chat-state.mjs'
import '../features/chat/feishu.css'
const api=window.feishuModeControl,state=ref(null),covered=ref(false),search=ref(''),draft=ref(''),error=ref(''),dialog=ref(''),showList=ref(false),activeTab=ref('消息'),addressInput=ref(''),editConfig=ref(null),editId=ref(''),jsonInput=ref(''),configError=ref('')
const unsubs=[];let disposed=false,bossRevision=0
const controller=createChatController({api,validate:raw=>validateChatState(raw,'feishu'),onState:value=>state.value=value,onError:value=>error.value=value.message})
const chat=computed(()=>state.value?currentChat(state.value):null)
const filtered=computed(()=>state.value?.conversations.filter(c=>c.name.toLowerCase().includes(search.value.trim().toLowerCase()))||[])
const quick=computed(()=>state.value?.conversations.slice(0,3)||[]),avatars=['blue','green','purple','orange','bot','self']
const hiddenAnnouncement=computed(()=>state.value?.ui.hiddenAnnouncements.includes(state.value.selectedId))
const editChat=computed(()=>editConfig.value?.conversations.find(c=>c.id===editId.value))
const update=mutation=>controller.update(mutation).catch(()=>null)
function keydown(event){if(event.key!=='Enter'||event.isComposing||event.keyCode===229)return;if(event.shiftKey||event.ctrlKey)return;event.preventDefault();send()}
async function send(){const value=draft.value,id=state.value.selectedId;if(!value.trim())return;const ok=await update(s=>{const selected=s.selectedId;s.selectedId=id;sendText(s,value);s.selectedId=selected;s.drafts[id]=''});if(ok&&state.value.selectedId===id)draft.value=''}
function draftInput(event){draft.value=event.target.value;const id=state.value.selectedId,value=draft.value;update(s=>{s.drafts[id]=value})}
function select(id){const old=state.value.selectedId,value=draft.value;showList.value=false;activeTab.value='消息';update(s=>{s.drafts[old]=value;s.selectedId=id;s.conversations.find(c=>c.id===id).unread=0})}
function announcement(hidden){const id=state.value.selectedId;update(s=>{const values=new Set(s.ui.hiddenAnnouncements);hidden?values.add(id):values.delete(id);s.ui.hiddenAnnouncements=[...values]})}
function tab(name){activeTab.value=name;if(name==='群公告')announcement(false);else if(name!=='消息')error.value=`${name}功能未接入，仅保留飞书外观。`}
async function insert(){const exists=chat.value.messages.some(m=>m.type==='player'),ok=await update(s=>insertPlayer(s));if(ok&&exists)error.value='此会话已有抖音播放器。'}
function setting(key,value){update(s=>{s.settings[key]=value})}
function saveNavigation(cid,mid,address){const old=state.value.conversations.find(c=>c.id===cid)?.messages.find(m=>m.id===mid);if(!old||old.address===address)return;update(s=>{const message=s.conversations.find(c=>c.id===cid)?.messages.find(m=>m.id===mid);if(message)message.address=address;s.settings.address=address})}
async function applyAddress(){try{const address=validateChatUrl(addressInput.value),id=state.value.selectedId;await update(s=>{s.settings.address=address;const message=s.conversations.find(c=>c.id===id).messages.find(m=>m.type==='player');if(message)message.address=address})}catch(value){error.value=value.message}}
function openSettings(){addressInput.value=state.value.settings.address;dialog.value='settings'}
function openConfig(){editConfig.value=validateChatState(state.value,'feishu');editId.value=state.value.selectedId;jsonInput.value=JSON.stringify(state.value,null,2);configError.value='';dialog.value='config'}
async function replace(raw){try{const candidate=validateChatState(raw,'feishu'),saved=await controller.update(s=>{const revision=s.revision;Object.assign(s,candidate,{revision})});editConfig.value=structuredClone(saved);jsonInput.value=JSON.stringify(saved,null,2);configError.value=''}catch(value){configError.value=value.message}}
function applyJson(){try{return replace(JSON.parse(jsonInput.value))}catch(value){configError.value='JSON 格式错误：'+value.message}}
function reset(){return replace(createChatState('feishu'))}
async function close(){try{await api.close()}catch(value){error.value=value.message}}
async function load(){error.value='';try{const revision=bossRevision;await loadChatRuntime(controller,api,runtime=>{if(!disposed&&revision===bossRevision)covered.value=runtime.covered;if(runtime.warning)error.value=runtime.warning});draft.value=state.value.drafts[state.value.selectedId]||''}catch(value){error.value=value.message}}
watch(()=>state.value?.selectedId,id=>{if(id)draft.value=state.value.drafts[id]||''})
onMounted(()=>{unsubs.push(api.onState(value=>controller.accept(value)),api.onBoss(value=>{bossRevision++;covered.value=value}),api.onError(message=>error.value=message));load()})
onBeforeUnmount(()=>{disposed=true;controller.dispose();unsubs.forEach(unsubscribe=>unsubscribe())})
</script>
```

The template must use one stable section per conversation:

```vue
<div class="all-messages">
  <section v-for="c in state.conversations" v-show="c.id === state.selectedId" :key="c.id" class="messages" :data-conversation="c.id">
    <div v-for="m in c.messages" :key="m.id" class="message-row" :class="[m.sender,m.type+'-message']">
      <div v-if="m.type==='media-card'" class="fs-media-card"><div class="local-media-preview"><span>▶</span></div><b>{{m.title}}</b><p>{{m.description}}</p></div>
      <ChatPlayer v-else-if="m.type==='player'" partition="persist:moyu-chat-feishu" :message="m" :settings="state.settings" :covered="covered" :active="c.id===state.selectedId" @navigate="address=>saveNavigation(c.id,m.id,address)" @error="message=>error=message"/>
      <div v-else class="bubble">{{m.text}}</div>
    </div>
  </section>
</div>
```

Build the surrounding markup in this fixed order: `.fs-window-tools`, `.client-body`, `.navigation`, `.conversation-list`, `.chat-panel`, `.chat-header`, `.chat-tabs`, `.group-announcement`, `.all-messages`, `.composer`. The navigation must render the labels `消息、豆包工作、云文档、推荐、多维表格、视频会议、通讯录、日历、飞行社、权益升级、更多、历史记录、实验室`; every non-message navigation action sets `error` to `“名称功能未接入，仅保留飞书外观。”`. The conversation list must render `quick` first and `filtered` below it; both button forms use `data-chat="会话ID"` and call `select(c.id)`. The seven tabs use `data-tab="页签名"` and labels `消息、云文档、群公告、文件、每日质检任务、质检问题收集表、＋`. The announcement close button uses `data-action="hide-announcement"`; the composer plus button uses `data-action="insert"`; settings/config buttons use `data-action="settings"` and `data-action="config"`.

The settings dialog renders address, orientation, scale, sender and mask controls with the same `data-setting` attributes used by the smoke. The configuration dialog binds `editConfig`, `editId`, `editChat` and `avatars`, calls `replace(editConfig)` for structured save, `applyJson` for JSON save, and `reset` for defaults. Both dialogs use `data-action="close-dialog"` to set `dialog=''`.

- [ ] **Step 4: 创建完全作用域的飞书样式**

Port every `.feishu` rule from `previews/chat-ui/styles.css` under `.formal-feishu`; do not copy any unscoped preview selectors. The critical rules must be:

```css
.formal-feishu,.formal-feishu *{box-sizing:border-box}
.formal-feishu{height:100vh;overflow:hidden;position:relative;padding:24px 6px 6px 0;background:radial-gradient(ellipse at 6% 35%,#d8e6ef 0,transparent 54%),linear-gradient(125deg,#e8ebee,#e4eaff 62%,#eeedf4);color:#1f2329;font:14px "Microsoft YaHei",sans-serif}
.formal-feishu .fs-window-tools{position:absolute;inset:0 0 auto 0;height:24px;-webkit-app-region:drag}
.formal-feishu button,.formal-feishu input,.formal-feishu textarea,.formal-feishu select{-webkit-app-region:no-drag}
.formal-feishu .client-body{height:100%;display:flex;gap:6px;min-width:0}
.formal-feishu .navigation{width:176px;flex:none;padding:0 8px;display:flex;flex-direction:column}
.formal-feishu .conversation-list{width:29%;min-width:280px;flex:none;background:#fcfcfddd;border-radius:9px;overflow:hidden}
.formal-feishu .chat-panel{min-width:0;flex:1;display:flex;flex-direction:column;border-radius:9px;overflow:hidden;background:#fbfbfc}
.formal-feishu .chat-header{height:43px;flex:none}
.formal-feishu .composer{height:52px;flex:none;border:1px solid #c4c9d2;border-radius:9px;background:#fff;display:flex;align-items:center;margin:12px 16px 16px;padding:5px 9px}
.formal-feishu .fs-media-card{padding:12px;background:#edeef0;border-radius:9px;max-width:520px}
.formal-feishu .local-media-preview{height:150px;display:grid;place-items:center;background:linear-gradient(135deg,#cfd8e6,#eef1f6);border-radius:5px;color:#fff;font-size:36px}
@media(max-width:850px){.formal-feishu .navigation{width:142px}.formal-feishu .conversation-list{width:260px;min-width:260px}}
@media(max-width:720px){.formal-feishu .navigation{width:46px}.formal-feishu .conversation-list{display:none;position:absolute;left:52px;top:24px;bottom:6px;width:calc(100% - 58px);min-width:0;z-index:12}.formal-feishu.show-list .conversation-list{display:block}}
```

Also port the approved circular avatar, quick-conversation, tab, announcement, message bubble, badge, dialog and responsive rules. Every selector must begin `.formal-feishu` or be inside a `.formal-feishu`-prefixed media rule.

- [ ] **Step 5: 运行视图结构与模型测试**

Run:

```powershell
node --test tests/feishu-wiring.test.mjs tests/feishu-chat.test.mjs tests/chat-runtime.test.mjs
npm run build
```

Expected: tests PASS and Vite production build succeeds without Vue template errors.

## Task 6：创建实际 Electron 飞书 smoke

**Files:**
- Create: `scripts/feishu-smoke.cjs`
- Create: `scripts/run-feishu-smoke.mjs`
- Reuse: `tests/fixtures/web/ad-modes/video.html`
- Reference: `scripts/dingtalk-smoke.cjs`

- [ ] **Step 1: 创建隔离运行器**

Create `scripts/run-feishu-smoke.mjs`:

```js
import {spawn} from 'node:child_process'
import {createRequire} from 'node:module'
import {fileURLToPath} from 'node:url'
import fs from 'node:fs';import path from 'node:path';import os from 'node:os'
const executable=createRequire(import.meta.url)('electron'),env={...process.env};delete env.ELECTRON_RUN_AS_NODE
const taskDir=fs.mkdtempSync(path.join(os.tmpdir(),'moyu-feishu-smoke-'));env.MOYU_FEISHU_DATA_DIR=taskDir
const run=args=>new Promise((resolve,reject)=>{const child=spawn(executable,[fileURLToPath(new URL('./feishu-smoke.cjs',import.meta.url)),...args],{env,stdio:'inherit',windowsHide:true});child.on('error',reject);child.on('exit',code=>resolve(code??1))})
try{const first=await run([]);process.exitCode=first===0?await run(['--restore-only']):first}
finally{const target=path.resolve(taskDir);if(path.dirname(target)===path.resolve(os.tmpdir())&&path.basename(target).startsWith('moyu-feishu-smoke-'))fs.rmSync(target,{recursive:true,force:true,maxRetries:10,retryDelay:100})}
```

- [ ] **Step 2: 创建主 smoke，并先验证默认零请求**

Create `scripts/feishu-smoke.cjs` using the helper structure from `scripts/dingtalk-smoke.cjs`. Before clicking insert, assert:

```js
assert.equal(await evaluate(feishu,'document.querySelectorAll(".chat-item").length'),10)
assert.equal(await evaluate(feishu,'document.querySelectorAll("webview").length'),0)
assert.equal(await evaluate(feishu,'document.querySelectorAll(".fs-media-card").length'),1)
assert.equal(feishuRequests,0)
assert.equal(await evaluate(feishu,'getComputedStyle(document.querySelector(".navigation")).width'),'176px')
assert.equal(await evaluate(feishu,'getComputedStyle(document.querySelector(".composer")).height'),'52px')
```

Intercept `persist:moyu-chat-feishu`, `persist:moyu-chat-dingtalk`, `persist:moyu-chat-wechat`, and default session separately. Each fixture writes its partition name into `document.body.dataset.fixturePartition`; increment only `feishuRequests` for the Feishu handler.

- [ ] **Step 3: 覆盖主动插入、交互与状态行为**

Add checks in this exact order. Use `evaluate`, `until`, `click`, `find`, `webContents`, `session`, `assert`, and `pause` helpers with the same definitions already shown at the top of `scripts/dingtalk-smoke.cjs`:

```js
await check('local first layout makes no request',async()=>{
  assert.equal(await evaluate(feishu,'document.querySelectorAll(".chat-item").length'),10)
  assert.equal(await evaluate(feishu,'document.querySelectorAll("webview").length'),0)
  assert.equal(await evaluate(feishu,'document.querySelectorAll(".fs-media-card").length'),1)
  assert.equal(feishuRequests,0)
})
await check('IME and newline-safe sending persists locally',async()=>{
  const before=(await evaluate(feishu,'window.feishuModeControl.get()')).conversations[0].messages.length
  await evaluate(feishu,`(()=>{const input=document.querySelector('.message-input');input.value='飞书验收消息';input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',isComposing:true,bubbles:true}))})()`)
  await pause(100);assert.equal((await evaluate(feishu,'window.feishuModeControl.get()')).conversations[0].messages.length,before)
  await evaluate(feishu,`document.querySelector('.message-input').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}))`)
  await until(async()=>(await evaluate(feishu,'window.feishuModeControl.get()')).conversations[0].messages.length===before+1,'message saved')
  const prevented=await evaluate(feishu,`(()=>{const event=new KeyboardEvent('keydown',{key:'Enter',shiftKey:true,bubbles:true,cancelable:true});document.querySelector('.message-input').dispatchEvent(event);return event.defaultPrevented})()`)
  assert.equal(prevented,false)
})
await check('quick conversations search tabs and announcement work',async()=>{
  await evaluate(feishu,'document.querySelector(".quick-conversations [data-chat=lin]").click()')
  await until(()=>evaluate(feishu,'document.querySelector("[data-chat=lin]").classList.contains("selected")'),'quick switch')
  await evaluate(feishu,`(()=>{const input=document.querySelector('[data-search]');input.value='质检';input.dispatchEvent(new Event('input',{bubbles:true}))})()`)
  assert.equal(await evaluate(feishu,'document.querySelectorAll(".chat-items .chat-item").length'),1)
  await evaluate(feishu,'document.querySelector("[data-tab=云文档]").click()');await until(()=>evaluate(feishu,'Boolean(document.querySelector(".chat-notice"))'),'tab notice')
  await evaluate(feishu,'document.querySelector("[data-action=hide-announcement]").click()')
  await until(()=>evaluate(feishu,'!document.querySelector(".group-announcement")'),'announcement hidden')
  await evaluate(feishu,'document.querySelector("[data-tab=群公告]").click()')
  await until(()=>evaluate(feishu,'Boolean(document.querySelector(".group-announcement"))'),'announcement restored')
  await evaluate(feishu,'document.querySelector("[data-chat=group]").click()')
})
await evaluate(feishu,'document.querySelector("[data-action=insert]").click()')
await until(()=>evaluate(feishu,'document.querySelector("webview")?.dataset.playerReady==="true"'),'feishu guest ready')
const guest=webContents.fromId(await evaluate(feishu,'document.querySelector("webview").getWebContentsId()')),guestId=guest.id
await check('plus inserts one real feishu guest',async()=>{
  assert.equal(guest.session,session.fromPartition('persist:moyu-chat-feishu'))
  assert.equal(await guest.executeJavaScript('document.body.dataset.fixturePartition'),'feishu')
  assert.equal(feishuRequests,1)
  await evaluate(feishu,'document.querySelector("[data-action=insert]").click()');await pause(100)
  assert.equal(await evaluate(feishu,'document.querySelectorAll("webview").length'),1)
})
await check('real guest receives click and wheel',async()=>{
  const point=await guest.executeJavaScript(`(()=>{const box=document.querySelector('[aria-label="下一条视频"]').getBoundingClientRect();return{x:box.x+box.width/2,y:box.y+box.height/2}})()`),zoom=guest.getZoomFactor(),x=Math.round(point.x*zoom),y=Math.round(point.y*zoom)
  guest.sendInputEvent({type:'mouseDown',x,y,button:'left',clickCount:1});guest.sendInputEvent({type:'mouseUp',x,y,button:'left',clickCount:1})
  await until(()=>guest.executeJavaScript('document.body.dataset.next==="yes"'),'guest click')
  guest.sendInputEvent({type:'mouseWheel',x:20,y:20,deltaY:80,deltaX:0});await until(()=>guest.executeJavaScript('document.body.dataset.wheel==="yes"'),'guest wheel')
})
await check('settings resize without rebuilding guest',async()=>{
  await evaluate(feishu,'document.querySelector("[data-action=settings]").click()')
  await evaluate(feishu,`(()=>{const input=document.querySelector('[data-setting=scale]');input.value='100';input.dispatchEvent(new Event('change',{bubbles:true}))})()`)
  await until(()=>evaluate(feishu,'document.querySelector(".chat-player").offsetWidth===220'),'scale applied')
  assert.equal(await evaluate(feishu,'document.querySelector("webview").getWebContentsId()'),guestId)
  await evaluate(feishu,'document.querySelector("[data-action=close-dialog]").click()')
})
await check('conversation switch pauses hidden media and retains draft',async()=>{
  await until(()=>guest.executeJavaScript('!document.querySelector("video").paused'),'media playing')
  await evaluate(feishu,'document.querySelector("[data-chat=lin]").click()');await until(()=>guest.executeJavaScript('document.querySelector("video").paused'),'hidden media paused')
  await evaluate(feishu,`(()=>{const input=document.querySelector('.message-input');input.value='保留飞书草稿';input.dispatchEvent(new Event('input',{bubbles:true}))})()`)
  await until(async()=>(await evaluate(feishu,'window.feishuModeControl.get()')).drafts.lin==='保留飞书草稿','draft saved')
  await evaluate(feishu,'document.querySelector("[data-chat=group]").click()');await until(()=>guest.executeJavaScript('!document.querySelector("video").paused'),'media resumed')
})
await check('invalid JSON is rejected atomically',async()=>{
  await evaluate(feishu,'document.querySelector("[data-action=config]").click()');const before=await evaluate(feishu,'window.feishuModeControl.get()')
  await evaluate(feishu,`(()=>{const input=document.querySelector('.json-input');input.value='{bad';input.dispatchEvent(new Event('input',{bubbles:true}))})()`)
  await evaluate(feishu,'document.querySelector("[data-action=apply-json]").click()');await until(()=>evaluate(feishu,'Boolean(document.querySelector(".config-error").textContent)'),'JSON error')
  assert.deepEqual(await evaluate(feishu,'window.feishuModeControl.get()'),before);await evaluate(feishu,'document.querySelector("[data-action=close-dialog]").click()')
})
await check('slow navigation is superseded and foreign redirect blocked',async()=>{
  await evaluate(home,`window.feishuModeControl.open('https://www.douyin.com/slow')`);await until(()=>evaluate(feishu,'document.querySelector("webview").dataset.playerReady==="false"'),'slow loading')
  await evaluate(home,`window.feishuModeControl.open('https://www.douyin.com/fast')`);await until(()=>guest.getURL()==='https://www.douyin.com/fast','fast wins');await pause(700)
  assert.equal((await evaluate(feishu,'window.feishuModeControl.get()')).settings.address,'https://www.douyin.com/fast')
  await guest.executeJavaScript(`location.href='https://www.douyin.com/blocked'`);await pause(300);assert.equal(guest.getURL(),'https://www.douyin.com/fast')
})
await check('three chats use distinct state and sessions',async()=>{
  await evaluate(home,'window.chatModeControl.open()');await evaluate(home,'window.dingtalkModeControl.open()');await until(()=>find('/wechat')&&find('/dingding'),'other chats')
  const wechat=find('/wechat'),dingtalk=find('/dingding');await until(()=>evaluate(wechat,'Boolean(document.querySelector("[data-chat-ready]"))'),'wechat ready');await until(()=>evaluate(dingtalk,'Boolean(document.querySelector("[data-chat-ready]"))'),'dingtalk ready')
  await evaluate(wechat,'document.querySelector("[data-action=insert]").click()');await evaluate(dingtalk,'document.querySelector("[data-action=insert]").click()')
  await until(()=>evaluate(wechat,'document.querySelector("webview")?.dataset.playerReady==="true"'),'wechat guest');await until(()=>evaluate(dingtalk,'document.querySelector("webview")?.dataset.playerReady==="true"'),'dingtalk guest')
  const wxGuest=webContents.fromId(await evaluate(wechat,'document.querySelector("webview").getWebContentsId()')),dingGuest=webContents.fromId(await evaluate(dingtalk,'document.querySelector("webview").getWebContentsId()'))
  assert.notEqual(guest.session,wxGuest.session);assert.notEqual(guest.session,dingGuest.session);assert.notEqual(wxGuest.session,dingGuest.session)
  await assert.rejects(evaluate(wechat,'window.feishuModeControl.get()'),/飞书窗口/);await assert.rejects(evaluate(feishu,'window.chatModeControl.get()'),/微信窗口/)
})
await check('boss covers all three chats and restores original guests',async()=>{
  const wechat=find('/wechat'),dingtalk=find('/dingding');await evaluate(home,`window.ipcRenderer.invoke('boss-key')`)
  for(const window of [feishu,wechat,dingtalk])await until(()=>evaluate(window,'Boolean(document.querySelector("[data-cover=chat-video]"))'),'chat cover')
  for(const window of [feishu,wechat,dingtalk]){assert.ok(window.isVisible());assert.equal(window.getOpacity(),1)}
  await evaluate(home,`window.ipcRenderer.invoke('boss-key')`);for(const window of [feishu,wechat,dingtalk])await until(()=>evaluate(window,'!document.querySelector("[data-cover=chat-video]")'),'chat restore')
  assert.equal(await evaluate(feishu,'document.querySelector("webview").getWebContentsId()'),guestId)
})
await check('close reopen restores state and destroys old guest',async()=>{
  await evaluate(feishu,'window.feishuModeControl.close()');await until(()=>!find('/feishu'),'feishu closed');assert.ok(guest.isDestroyed())
  await evaluate(home,'window.feishuModeControl.open()');await until(()=>find('/feishu'),'feishu reopened');feishu=find('/feishu')
  await until(()=>evaluate(feishu,'Boolean(document.querySelector("[data-chat-ready]"))'),'reopened ready');assert.equal((await evaluate(feishu,'window.feishuModeControl.get()')).settings.scale,100)
})
await check('no renderer console errors',async()=>assert.deepEqual(errors,[]))
```

For `--restore-only`, assert the sent message, a saved draft, hidden announcement, scale and player address, then wait for the restored guest. Print:

```js
console.log('FEISHU_RESULT '+JSON.stringify({passed,failed:0,onlineDouyinVerified:false}))
```

- [ ] **Step 4: 构建并运行飞书 Electron smoke**

Run:

```powershell
npm run build
node scripts/run-feishu-smoke.mjs
```

Expected: first process passes all 13 named checks; restart process passes restoration; `onlineDouyinVerified:false` remains explicit.

## Task 7：全量回归、审查和交付文档

**Files:**
- Create: `docs/feishu-douyin-acceptance.md`
- Create: `docs/2026-09-20-feishu-douyin-verification.md`
- Verify: all changed source and test files

- [ ] **Step 1: 运行完整单元测试和生产构建**

Run:

```powershell
npm test
npm run build
```

Expected: zero failures and successful main/preload/renderer bundles. Record exact test count.

- [ ] **Step 2: 运行全部聊天与既有模式 smoke**

Run each command independently:

```powershell
node scripts/run-feishu-smoke.mjs
node scripts/run-dingtalk-smoke.mjs
node scripts/run-wechat-smoke.mjs
npm run test:ad-modes
npm run test:douyin-opacity
npm run test:video-opacity
```

Expected: every process exits 0; record each first-run and restart count. Environment-only `WSALookupServiceBegin 10108` and an occupied Ctrl+D warning are not functional failures, but must remain documented.

- [ ] **Step 3: 请求只读代码审查并处理结论**

Review exactly these risks:

- cross-platform IPC and generic settings bypass;
- actual window key versus logical profile key;
- Feishu invalid-state backup atomicity;
- default media card accidentally creating a WebView or request;
- partition enforcement in the main process;
- guest/listener cleanup and navigation races;
- CSS escaping its `.formal-feishu` scope;
- accidental changes to protected views.

If a finding is valid, add a failing regression test before changing code, fix it, and rerun the affected smoke plus full unit suite.

- [ ] **Step 4: 复核保护文件和只读源哈希**

Run the Task 1 hash command again.

Expected: all seven hashes exactly match the baseline. Any mismatch in a protected file blocks delivery until explained and reverted through a narrow patch; never use destructive Git reset commands.

- [ ] **Step 5: 编写人工验收文档**

Create `docs/feishu-douyin-acceptance.md` with these steps:

```markdown
# 飞书模式（抖音气泡）启动与验收

1. `cd D:\deepseekharness\moyu-replica` 后运行 `npm run dev`。
2. 首页点击“飞书模式”，确认 176px 文字导航、10 个会话、快捷会话、7 个页签、群公告和 52px 输入栏。
3. 确认首次打开只有本地灰色媒体卡片，没有抖音网页或登录请求。
4. 输入消息，检查 Enter、Shift+Enter、会话草稿和搜索。
5. 关闭并从“群公告”页签恢复公告；其他业务页签必须提示未接入。
6. 点击输入栏“＋”，确认真实抖音气泡在小窗口中可点击、滚轮和登录。
7. 调整地址、方向、大小、发送方和遮罩，确认已有 guest 不重建。
8. 同时打开微信、钉钉、飞书，确认消息、配置、位置和登录状态互不共享。
9. 使用老板键，确认三个聊天窗口不消失，只遮挡播放器；再次按下恢复。
10. 关闭重开并重启程序，确认消息、草稿、公告状态、配置与播放器地址恢复。

自动化不访问真实账号；真实抖音登录、推荐流和在线播放由本机人工验收。
```

- [ ] **Step 6: 编写验证记录**

Create `docs/2026-09-20-feishu-douyin-verification.md` and include only observed evidence:

- exact unit-test count and build result;
- Feishu/DingTalk/WeChat/ad/opacity smoke counts;
- invalid-state backup test result;
- three real partition checks;
- default zero-request proof;
- protected hashes and source `app.asar` hash;
- unverified online Douyin boundary;
- Ctrl+D occupation note if reproduced.

- [ ] **Step 7: 最终检查**

Run:

```powershell
rg -n "onlineDouyinVerified:true" docs/feishu-douyin-acceptance.md docs/2026-09-20-feishu-douyin-verification.md
```

Expected: no output. Open the acceptance document in Codex for the user. Because the directory is not a Git repository, report that changes are preserved directly in `D:\deepseekharness\moyu-replica` and no commit or branch was created.
