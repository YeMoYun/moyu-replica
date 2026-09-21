# DingTalk Douyin Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将已验收的钉钉界面正式接入独立的抖音网页气泡、持久化和老板键，同时保持微信与透明度模式不变。

**Architecture:** 把现有微信聊天模型、存储、排队控制器和播放器改为接受显式平台配置；微信保持默认配置，钉钉使用独立状态键、窗口键和 webview partition。新增独立 `DingTalkView.vue` 与样式，主进程为钉钉提供来源受限 IPC 和 guest 导航保护。

**Tech Stack:** Vue 3、Electron 31、ES modules、现有 JSON store、Node `node:test`、隔离 Electron smoke。

---

本目录不是 Git 工作区，因此不创建 worktree、不提交；每个任务以测试结果和文档记录作为检查点。只读源 `D:\MoYuMaster-1.0.0-win` 不写入。

## 文件结构

- Create `src/shared/chat-profiles.mjs`：微信、钉钉默认数据及允许头像的唯一来源。
- Modify `src/shared/chat-state.mjs`：状态创建、验证和旧数据迁移接受平台 key，省略时仍为微信。
- Modify `src/main/chat-service.mjs`：按平台读写独立 namespace，并原子备份旧钉钉配置。
- Modify `src/main/chat-window-controls.mjs`：管理两个独立窗口记录，共享老板键遮挡状态。
- Modify `src/renderer/src/features/chat/controller.mjs`：接受注入的状态校验器，默认仍校验微信。
- Modify `src/renderer/src/features/chat/ChatPlayer.vue`：接受显式 partition，默认仍为微信 partition。
- Create `src/renderer/src/views/DingTalkView.vue`、`src/renderer/src/features/chat/dingtalk.css`：已批准钉钉皮肤与交互。
- Modify `src/main/index.js`、`src/preload/index.js`、`src/renderer/src/router/index.js`、`src/renderer/src/views/HomeView.vue`：窗口、IPC、入口和 guest 安全接线。
- Create `tests/dingtalk-chat.test.mjs`、`tests/dingtalk-wiring.test.mjs`、`scripts/dingtalk-smoke.cjs`、`scripts/run-dingtalk-smoke.mjs`：模型、接线和实际 Electron 验证。
- Create `docs/dingtalk-douyin-acceptance.md`、`docs/2026-09-20-dingtalk-douyin-verification.md`：人工验收和证据。

## Task 1：锁定基线并定义平台状态（RED）

**Files:**
- Create: `tests/dingtalk-chat.test.mjs`
- Read only: `src/renderer/src/views/WechatView.vue`
- Read only: `src/renderer/src/views/*OpacityView.vue`

- [ ] **Step 1: 记录受保护文件哈希**

运行：

```powershell
$protected = @(
  'src/renderer/src/views/WechatView.vue',
  'src/renderer/src/views/DouyinOpacityView.vue',
  'src/renderer/src/views/VideoOpacityView.vue',
  'src/renderer/src/features/video-opacity/controller.mjs',
  'src/renderer/src/features/video-opacity/page-scripts.mjs'
)
$protected | ForEach-Object { "$(Get-FileHash -Algorithm SHA256 $_ | Select-Object -ExpandProperty Hash)  $_" }
```

将输出暂存到本次验证记录；不编辑这些文件。

- [ ] **Step 2: 写钉钉默认状态和平台隔离失败测试**

创建 `tests/dingtalk-chat.test.mjs`，核心断言如下：

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import {createChatState,validateChatState,migrateLegacy} from '../src/shared/chat-state.mjs'

test('dingtalk profile starts with approved five conversations and no automatic player',()=>{
  const s=createChatState('dingtalk')
  assert.deepEqual(s.conversations.map(c=>c.name),['研发项目组','林晓','设计讨论组','陈晨','文件传输助手'])
  assert.equal(s.selectedId,'group')
  assert.equal(s.conversations.flatMap(c=>c.messages).some(m=>m.type==='player'),false)
  assert.deepEqual(validateChatState(s,'dingtalk'),s)
})

test('wechat and dingtalk avatar vocabularies cannot cross',()=>{
  const ding=createChatState('dingtalk'),wx=createChatState()
  ding.conversations[0].avatar='manager'
  wx.conversations[0].avatar='blue'
  assert.throws(()=>validateChatState(ding,'dingtalk'),/头像/)
  assert.throws(()=>validateChatState(wx),/头像/)
})

test('legacy dingtalk messages migrate while non-douyin site becomes a warning',()=>{
  const old={contacts:['林晓'],messages:['林晓|第一段|保留分隔符'],siteKey:'jinJiang'}
  const result=migrateLegacy(old,'dingtalk')
  assert.match(result.warning,/抖音/)
  assert.equal(result.state.conversations[0].messages[0].text,'第一段|保留分隔符')
  assert.equal(result.state.conversations[0].avatar,'blue')
})
```

- [ ] **Step 3: 验证测试按预期失败**

运行：

```powershell
node --test tests/dingtalk-chat.test.mjs
```

预期：FAIL；`createChatState('dingtalk')` 仍返回微信七会话，或钉钉 profile 尚不存在。不得通过修改断言绕过失败。

## Task 2：实现平台配置、校验和独立存储（GREEN）

**Files:**
- Create: `src/shared/chat-profiles.mjs`
- Modify: `src/shared/chat-state.mjs`
- Modify: `src/main/chat-service.mjs`
- Test: `tests/dingtalk-chat.test.mjs`
- Test: `tests/chat-state.test.mjs`

- [ ] **Step 1: 创建明确的平台配置接口**

`src/shared/chat-profiles.mjs` 导出不可变配置；消息对象必须使用现有 `id/type/sender/text/time/name` 字段：

```js
export const CHAT_PROFILES=Object.freeze({
  wechat:Object.freeze({key:'wechat',avatars:['manager','file','group','design','boss','support','property','self']}),
  dingtalk:Object.freeze({key:'dingtalk',avatars:['blue','green','purple','orange','file','self']})
})

export function chatProfile(key='wechat'){
  const profile=CHAT_PROFILES[key]
  if(!profile)throw Error('聊天平台不支持')
  return profile
}

export function createDingTalkConversations(msg){
  return [
    {id:'group',name:'研发项目组',contact:'林晓',avatar:'blue',memberCount:8,unread:0,messages:[
      msg(1,'other','上午的更新已经整理到共享文档，大家有空看一下。','10:08','林晓'),
      msg(2,'self','收到，我先看一下，下午一起对齐。','10:09')
    ]},
    {id:'lin',name:'林晓',contact:'林晓',avatar:'green',memberCount:0,unread:2,messages:[msg(5,'other','今天下午三点方便沟通吗？','09:56')]},
    {id:'design',name:'设计讨论组',contact:'陈晨',avatar:'purple',memberCount:5,unread:1,messages:[msg(6,'other','新版界面我已经发到文档了。','09:42','陈晨')]},
    {id:'chen',name:'陈晨',contact:'陈晨',avatar:'orange',memberCount:0,unread:0,messages:[msg(7,'other','这版的间距看起来舒服一些。','昨天')]},
    {id:'file',name:'文件传输助手',contact:'助手',avatar:'file',memberCount:0,unread:0,messages:[msg(8,'self','本周待办与测试记录','昨天')]}
  ]
}
```

现有微信七会话继续留在 `createChatState` 的微信分支，不移动、不重新措辞、不改变 ID。

- [ ] **Step 2: 让状态 API 接受平台 key，并保持默认微信兼容**

进行以下精确改动：

```js
export function createChatState(platform='wechat'){
  const profile=chatProfile(platform)
  const msg=(n,sender,content,time,name)=>({id:'m'+n,type:'text',sender,text:content,time,...(name?{name}:{})})
  if(profile.key==='dingtalk')return {version:1,revision:0,selfName:'小叶',selectedId:'group',drafts:{},
    settings:{site:'douyin',orientation:'landscape',scale:140,sender:'self',mask:false,address:DOUYIN_HOME},
    conversations:createDingTalkConversations(msg)}
}
```

在钉钉 early return 后保留当前完整微信 `return` 对象，不改变任何字段。把 `validateChatState(raw)` 改为 `validateChatState(raw,platform='wechat')`，函数首行增加 `const profile=chatProfile(platform)`，并仅把 `CHAT_AVATARS.includes(c.avatar)` 替换成 `profile.avatars.includes(c.avatar)`。把 `migrateLegacy(raw)` 改为 `migrateLegacy(raw,platform='wechat')`，使用 `createChatState(platform)`，并把 legacy 联系人的头像表达式从固定 `'group'` 改为 `platform==='dingtalk'?'blue':'group'`。其余验证与迁移语句逐字保留。

`CHAT_AVATARS` 继续导出微信头像数组，避免现有微信视图改动。

- [ ] **Step 3: 先补独立存储测试，再确认失败**

向 `tests/dingtalk-chat.test.mjs` 增加：

```js
test('dingtalk service uses an independent namespace and keeps legacy backup',async()=>{
  const {createChatService}=await import('../src/main/chat-service.mjs')
  const values=new Map([
    ['dingdingConfig',{contacts:['林晓'],messages:['林晓|迁移消息']}],
    ['dingding.currentSiteKey','huya']
  ])
  const store={get:k=>structuredClone(values.get(k)),set:(k,v)=>values.set(k,structuredClone(v)),setMany:o=>Object.entries(o).forEach(([k,v])=>values.set(k,structuredClone(v)))}
  const service=createChatService({store,key:'dingtalk',profile:'dingtalk',legacyKey:'dingdingConfig',legacySiteKey:'dingding.currentSiteKey'})
  const state=service.get()
  assert.equal(state.conversations[0].name,'林晓')
  assert.equal(values.get('chatModes.dingtalk').revision,0)
  assert.deepEqual(values.get('chatMigration.dingtalk').legacy,{contacts:['林晓'],messages:['林晓|迁移消息']})
  assert.equal(values.get('chatMigration.dingtalk').legacySiteKey,'huya')
  assert.equal(values.has('chatModes.wechat'),false)
})
```

运行并观察旧服务仍写 `chatModes.wechat` 导致 FAIL。

- [ ] **Step 4: 参数化存储服务**

实现接口：

```js
export function createChatService({store,notify=()=>{},key='wechat',profile=key,
  legacyKey=key==='wechat'?'wechatConfig':'dingdingConfig',legacySiteKey}){
  let warning='';const stateKey=`chatModes.${key}`,migrationKey=`chatMigration.${key}`
  function get(){
    const saved=store.get(stateKey)
    if(saved!==undefined)return validateChatState(saved,profile)
    const legacy=store.get(legacyKey),siteValue=legacySiteKey?store.get(legacySiteKey):undefined
    let state=createChatState(profile),warning=''
    if(legacy!==undefined){const result=migrateLegacy({...legacy,...(siteValue?{siteKey:siteValue}:{})},profile);state=result.state;warning=result.warning}
    const values={[stateKey]:state}
    if(legacy!==undefined)values[migrationKey]={legacy,legacySiteKey:siteValue,warning,date:new Date().toISOString()}
    store.setMany(values);return structuredClone(state)
  }
  function save(raw,revision){
    const committed=get();if(revision!==committed.revision)throw Error('聊天配置已更新，请重新操作（版本冲突）')
    const next=validateChatState(raw,profile);next.revision=committed.revision+1
    store.set(stateKey,next);notify(structuredClone(next));return structuredClone(next)
  }
  return {get,save,getWarning:()=>warning||store.get(migrationKey)?.warning||''}
}
```

局部 `warning` 必须赋值并由 `getWarning()` 返回；旧键不得删除。

- [ ] **Step 5: 验证模型与存储绿色且微信不回退**

运行：

```powershell
node --test tests/dingtalk-chat.test.mjs tests/chat-state.test.mjs
```

预期：全部 PASS；现有微信七会话、迁移和失败写入断言不变。

## Task 3：窗口控制、客户端校验和 IPC 隔离

**Files:**
- Modify: `tests/chat-runtime.test.mjs`
- Create: `tests/dingtalk-wiring.test.mjs`
- Modify: `src/main/chat-window-controls.mjs`
- Modify: `src/renderer/src/features/chat/controller.mjs`
- Modify: `src/main/index.js`
- Modify: `src/preload/index.js`

- [ ] **Step 1: 写两个聊天窗口共享遮挡、独立位置的失败测试**

向 `tests/chat-runtime.test.mjs` 增加两个 fake window，断言：

```js
const wx=win(),ding=win()
c.attach('wechat',wx);c.attach('dingtalk',ding)
c.toggleBoss()
assert.deepEqual(wx.sent.at(-1),['chat-mode:boss',true])
assert.deepEqual(ding.sent.at(-1),['chat-mode:boss',true])
assert.equal(store.get('chatWindows.wechat'),undefined)
ding.emit('move')
assert.deepEqual(store.get('chatWindows.dingtalk').bounds,ding.getBounds())
```

先运行并确认 `本批仅支持微信聊天` 导致 FAIL。

- [ ] **Step 2: 参数化窗口键并保持全局 covered**

`attach` 只接受 `wechat`、`dingtalk`，用动态键读写：

```js
const allowed=new Set(['wechat','dingtalk'])
if(!allowed.has(key))throw Error('聊天窗口类型不支持')
const saved=store.get(`chatWindows.${key}`)?.bounds||store.get(`windowState.${key}`)?.bounds
const persist=()=>store.set(`chatWindows.${key}`,{bounds:win.getBounds()})
```

`covered` 仍为控制器级变量；attach 返回的 state 让后打开窗口继承遮挡。

- [ ] **Step 3: 写客户端注入钉钉校验器的失败测试**

```js
const validate=raw=>validateChatState(raw,'dingtalk')
const controller=createChatController({api,validate,onState:s=>published=s})
await controller.load()
assert.equal(published.conversations.length,5)
await controller.update(s=>sendText(s,'钉钉消息'))
assert.equal(published.revision,1)
```

修改 `createChatController({api,validate=validateChatState,...})`，在 `accept` 和 `update` 中调用注入的 `validate`；默认路径保持微信测试通过。

- [ ] **Step 4: 写来源隔离静态测试并观察失败**

`tests/dingtalk-wiring.test.mjs` 至少包含：

```js
assert.match(preload,/exposeInMainWorld\('dingtalkModeControl'/)
assert.match(main,/dingtalk-mode:get/)
assert.match(main,/keyFromSender\(event\).*dingding/s)
assert.match(main,/createChatService\(\{store,.*key:'dingtalk'/s)
assert.doesNotMatch(view,/chatModeControl/)
```

此时 `DingTalkView.vue` 尚不存在，测试应因缺少正式钉钉桥接和视图而 FAIL。

- [ ] **Step 5: 实现独立 service、IPC 和 preload**

主进程创建 `dingtalkService`；通知只发送给存活的 `dingding` 窗口。注册：

```js
const requireDingtalk=event=>{if(keyFromSender(event)!=='dingding')throw Error('仅钉钉窗口可操作聊天配置')}
handle('dingtalk-mode:get',event=>{requireDingtalk(event);return dingtalkService.get()})
handle('dingtalk-mode:save',(event,state,revision)=>{requireDingtalk(event);return dingtalkService.save(state,revision)})
handle('dingtalk-mode:state',event=>{requireDingtalk(event);return {...chatWindowControls.state('dingtalk'),warning:dingtalkService.getWarning()}})
handle('dingtalk-mode:close',event=>{requireDingtalk(event);return chatWindowControls.close('dingtalk')})
handle('dingtalk-mode:open',(event,address)=>{
  if(keyFromSender(event)!=='main')throw Error('仅主窗口可打开钉钉模式')
  if(address!==undefined){
    const url=validateChatUrl(address),state=dingtalkService.get();state.settings.address=url
    const player=state.conversations.find(c=>c.id===state.selectedId)?.messages.find(m=>m.type==='player')
    if(player)player.address=url
    dingtalkService.save(state,state.revision)
  }
  openSite('dingding');return true
})
```

省略 address 时不得重置保存地址。

preload 暴露与微信同构但使用钉钉 channel 的 `dingtalkModeControl`：`open/get/save/getRuntime/close/onState/onBoss/onError`。继续保留旧 `dingdingControl` 和 `dingdingConfigApi`。

- [ ] **Step 6: 运行运行时和接线测试**

```powershell
node --test tests/chat-runtime.test.mjs tests/dingtalk-wiring.test.mjs tests/chat-wiring.test.mjs
```

预期：窗口与 bridge 部分 PASS；视图/路由断言可继续保持 RED，留给下一任务。

## Task 4：正式钉钉皮肤和稳定播放器

**Files:**
- Modify: `src/renderer/src/features/chat/ChatPlayer.vue`
- Create: `src/renderer/src/views/DingTalkView.vue`
- Create: `src/renderer/src/features/chat/dingtalk.css`
- Modify: `src/renderer/src/router/index.js`
- Modify: `src/renderer/src/views/HomeView.vue`
- Test: `tests/dingtalk-wiring.test.mjs`

- [ ] **Step 1: 完成视图行为静态失败断言**

```js
assert.match(routes,/path: '\/dingding'.*DingTalkView.vue/)
assert.match(view,/class="dingtalk formal-dingtalk"/)
assert.match(view,/v-show="c.id === state.selectedId"/)
assert.match(view,/:key="m.id"/)
assert.match(view,/isComposing/)
assert.match(view,/Shift\+Enter/)
assert.match(view,/partition="persist:moyu-chat-dingtalk"/)
assert.doesNotMatch(view,/window\.chatModeControl/)
```

运行测试并确认旧路由仍指向 `ChatSkinView.vue` 而 FAIL。

- [ ] **Step 2: 参数化播放器 partition，默认保护微信**

`ChatPlayer.vue` props 改为：

```js
const props=defineProps({
  message:Object,settings:Object,covered:Boolean,active:Boolean,
  partition:{type:String,default:'persist:moyu-chat-wechat'}
})
```

模板使用 `:partition="partition"`。增加静态断言：微信调用不传 partition，钉钉调用显式传 `persist:moyu-chat-dingtalk`；两者都不得使用 preload 或 nodeintegration 属性。

- [ ] **Step 3: 创建钉钉视图结构**

`DingTalkView.vue` 的稳定层级依次是 `.formal-dingtalk > .top-bar + .client-body`；client-body 内为 `.navigation + .conversation-list + .chat-panel`；chat-panel 内为 `.chat-header + .all-messages + .composer`。会话必须使用 `v-for="c in state.conversations" v-show="c.id === state.selectedId" :key="c.id"`，消息必须使用 `v-for="m in c.messages" :key="m.id"`。播放器节点必须写为 `<ChatPlayer v-if="m.type==='player'" partition="persist:moyu-chat-dingtalk" :message="m" :settings="state.settings" :covered="covered" :active="c.id===state.selectedId" />`。自己发送的每条消息下显示 `.read-state` 文本“已读”。

逻辑复用 `createChatController`、`loadChatRuntime`、`sendText`、`insertPlayer` 和 `validateChatState(raw,'dingtalk')`。发送键：输入法合成或 keyCode 229 不发送；Shift+Enter 与 Ctrl+Enter 换行；普通 Enter 发送。草稿更新、会话切换、配置替换和导航保存沿用微信已经验证的排队模式，但 API 必须是 `window.dingtalkModeControl`。

- [ ] **Step 4: 实现批准的钉钉 CSS，禁止跨皮肤选择器**

所有规则以 `.formal-dingtalk` 开头或位于该根节点作用域。关键尺寸必须是：top bar 35px、navigation 120px、conversation list 250px、chat header 50px；composer 为圆角白色面板。自己消息浅蓝、对方消息白色、已读文字位于自己气泡右下。720px 以下隐藏会话列表并由 `.show-list` 展开；根节点无横向滚动。

- [ ] **Step 5: 路由和首页切换到正式入口**

把 `/dingding` 组件改为 `DingTalkView.vue`；`/dingdingConfig` 保持旧兼容路由。首页现有“钉钉模式”按钮改为调用 `window.dingtalkModeControl.open()`，错误写入已有 `appError`。

- [ ] **Step 6: 运行接线和全部聊天单元测试**

```powershell
node --test tests/dingtalk-wiring.test.mjs tests/chat-*.test.mjs
```

预期：全部 PASS，微信接线测试更新为断言 `/dingding` 指向新视图，但仍断言 `/wechat`、`/douyinOpacity` 不变。

## Task 5：主进程 guest 安全边界和实际 Electron smoke

**Files:**
- Modify: `src/main/index.js`
- Create: `scripts/dingtalk-smoke.cjs`
- Create: `scripts/run-dingtalk-smoke.mjs`
- Reuse read only: `tests/fixtures/web/ad-modes/video.html`
- Test: `tests/dingtalk-wiring.test.mjs`

- [ ] **Step 1: 写主进程 guest 安全失败断言**

断言 `wechat` 与 `dingding` 都进入聊天专属 `will-attach-webview`/`did-attach-webview` 分支，校验 `validateChatUrl`、删除 remote preload、关闭 Node、启用 context isolation/sandbox/web security、拒绝权限和站外主框架跳转。断言透明模式专属分支文本未改变。

- [ ] **Step 2: 泛化聊天 guest 分支**

用显式集合代替只判断微信：

```js
const CHAT_WINDOW_KEYS=new Set(['wechat','dingding'])
if(CHAT_WINDOW_KEYS.has(key))chatWindowControls.attach(key,win)
if(CHAT_WINDOW_KEYS.has(key)){
  win.webContents.on('will-attach-webview',secureChatGuest)
  win.webContents.on('did-attach-webview',(_event,guest)=>installChatGuestPolicy(win,guest))
}
```

提取的两个局部函数必须只包含原微信分支已经验证的安全设置和 URL 规则；错误发送到对应窗口的 `chat-mode:error`，preload 同时将该事件提供给两套 mode control。不要改透明度和广告 guest 分支。

- [ ] **Step 3: 先创建会失败的隔离 Electron smoke**

`run-dingtalk-smoke.mjs` 创建唯一临时 userData，先 `npm run build` 后用项目 Electron 启动 `dingtalk-smoke.cjs`，退出后只删除该显式临时目录。首轮和 `--restore-only` 为两个独立进程。

smoke 首轮必须实际检查：

1. 35/120/250/50px 布局、五会话、浅蓝自己消息和圆角 composer；
2. Enter 发送、IME Enter 不发送、Shift+Enter 换行、草稿切换保留；
3. 文件夹插入一个真实 webview，Node 和应用 bridge 均为 undefined；
4. 原生 `sendInputEvent` 点击和滚轮抵达 fixture；
5. 横竖屏、scale、mask 不改变 guest webContents ID；
6. 隐藏会话暂停，切回只恢复此前播放媒体；
7. 加载 slowA 时切 fastB，旧地址不覆盖新地址；抖音同域 302 保存 canonical 地址，站外 302 被拒绝；
8. 老板键保持窗口可见和 opacity 1，覆盖气泡并恢复同一 guest；手动暂停视频不被错误启动；
9. 微信和钉钉同时打开时只有各自状态/partition，老板键同时覆盖两者；
10. 非法 JSON 原子拒绝、有效结构化配置更新；关闭重开清理旧 guest。

重启轮检查消息、草稿、方向、scale、最终地址和联系人名称恢复。测试开始时先断言正式钉钉 DOM 缺失或旧 `ChatSkinView` 结构，确认 RED 后再完成实现。

- [ ] **Step 4: 运行钉钉 smoke 并修复实现而非降低断言**

```powershell
node scripts/run-dingtalk-smoke.mjs
```

预期：首轮全部 PASS、重启轮全部 PASS、`onlineDouyinVerified:false`、renderer console errors 为 0。Windows 网络服务警告和已知快捷键占用单独记录，不计为功能通过。

## Task 6：完整回归、代码复核与交付

**Files:**
- Create: `docs/dingtalk-douyin-acceptance.md`
- Create: `docs/2026-09-20-dingtalk-douyin-verification.md`
- Modify: `docs/superpowers/plans/2026-09-20-dingtalk-douyin-integration.md`（只更新真实完成项）

- [ ] **Step 1: 运行完整自动化验证**

```powershell
npm test
npm run build
node scripts/run-dingtalk-smoke.mjs
node scripts/run-wechat-smoke.mjs
npm run test:ad-modes
npm run test:douyin-opacity
npm run test:video-opacity
npm run test:smoke
```

每条命令必须退出 0。记录准确测试数量，不把截断输出推断为通过。

- [ ] **Step 2: 复核受保护文件**

重新计算 Task 1 的哈希；`WechatView.vue` 和所有 opacity 文件必须与基线相同。允许的共享改动仅限规格列出的聊天核心、main/preload/router/Home 和新钉钉文件。重新计算只读 `app.asar` 哈希并确认未变化。

- [ ] **Step 3: 请求只读代码复核**

使用 requesting-code-review，要求复核者重点检查：平台数据串写、IPC 来源越权、partition 误共享、旧配置迁移覆盖、老板键隐藏窗口、guest 导航竞态、监听器泄漏及微信回归。修复每个 Critical/Important 前必须先写失败测试；修复后重新运行受影响 smoke。

- [ ] **Step 4: 写人工验收说明**

`docs/dingtalk-douyin-acceptance.md` 写明：

```powershell
cd D:\deepseekharness\moyu-replica
npm run dev
```

验收路径为：首页“钉钉模式”→文件夹插入抖音→点击/滚轮/登录→切换会话→设置横竖屏与大小→老板键遮挡/恢复→关闭重开→重启恢复。说明聊天为本地数据、Ctrl+D 占用处理和真实在线抖音必须人工验收。

- [ ] **Step 5: 写验证记录并更新计划**

验证记录列出精确命令、测试数量、截图路径、哈希结果、最终复核结论和未验证边界。只给实际完成且有证据的计划项打勾；飞书和其他站点保持未实现。

## 计划自审

- 规格中的界面、独立存储/session、迁移、IPC、老板键、导航、安全、重启恢复和回归要求均有对应任务。
- 微信默认 API 通过默认参数保持兼容；钉钉调用必须显式传 profile/validator/partition。
- 本计划不修改透明功能，不接入飞书或其他网站，不调用真实钉钉服务。
- 所有新生产行为均先有明确失败测试；实际线上抖音只由用户人工验收。
