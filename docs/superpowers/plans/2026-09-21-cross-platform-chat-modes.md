# Cross-Platform Chat Disguise Modes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reuse the approved WeChat, DingTalk and Feishu interfaces for B站、虎牙、斗鱼、快手 while isolating all 15 platform/skin combinations and preserving existing Douyin data and sessions.

**Architecture:** A pure shared chat-context module converts `(video platform, skin)` into trusted window, route, storage and partition identities, with legacy identities retained for Douyin. The main process owns a lazy service registry and derives context from the actual sender window. Renderer views use one generic chat bridge, receive their immutable context from main, and pass the platform and partition to the shared player without changing approved visual CSS.

**Tech Stack:** Electron BrowserWindow/webview/session partitions, Vue 3, Node.js `node:test`, isolated Electron smoke fixtures

---

## Dependencies and file map

Execute these plans first:

1. `docs/superpowers/plans/2026-09-21-video-mode-home-entry.md`
2. `docs/superpowers/plans/2026-09-21-multi-platform-ad-modes.md`

Create:

- `src/shared/chat-context.mjs`: stable identity and compatibility rules.
- `src/main/chat-service-registry.mjs`: lazy state-service instances by composite context.
- `src/renderer/src/features/chat/platform-runtime.mjs`: renderer context validation and labels.
- `tests/chat-context.test.mjs`: 15-combination identity contract.
- `tests/chat-service-registry.test.mjs`: independent storage and legacy-key compatibility.
- `tests/video-chat-matrix-wiring.test.mjs`: main/preload/router/view wiring.
- `scripts/video-chat-matrix-smoke.cjs`: isolated 12-new-combination smoke.
- `scripts/run-video-chat-matrix-smoke.mjs`: safe temporary-data runner.

Modify:

- `src/shared/video-platforms.mjs`: official URL validator.
- `src/shared/chat-state.mjs`: platform-aware defaults and validation.
- `src/main/chat-service.mjs`: accept expected video platform.
- `src/main/chat-window-controls.mjs`: accept validated composite window keys.
- `src/main/chat-guest-policy.mjs`: validate platform-specific URL and partition.
- `src/main/index.js`: dynamic chat windows, generic IPC and service registry.
- `src/preload/index.js`: generic in-window chat bridge; retain legacy bridges.
- `src/renderer/src/router/index.js`: optional platform parameters on three routes.
- `src/renderer/src/features/chat/navigation.mjs`: platform-aware navigation validation.
- `src/renderer/src/features/chat/ChatPlayer.vue`: platform, label and partition props.
- `src/renderer/src/views/WechatView.vue`: dynamic player copy/context.
- `src/renderer/src/views/DingTalkView.vue`: dynamic player copy/context.
- `src/renderer/src/views/FeishuView.vue`: dynamic player copy/context.
- Existing chat tests and `package.json`.

## Task 1: Define stable identities for all 15 combinations

**Files:**
- Create: `src/shared/chat-context.mjs`
- Create: `tests/chat-context.test.mjs`

- [ ] **Step 1: Write the failing identity contract**

Create `tests/chat-context.test.mjs`:

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import {VIDEO_PLATFORM_ORDER} from '../src/shared/video-platforms.mjs'
import {
  CHAT_SKINS,chatContext,chatContextFromWindowKey
} from '../src/shared/chat-context.mjs'

test('fifteen chat contexts have unique stable window storage and partition identities',()=>{
  const contexts=VIDEO_PLATFORM_ORDER.flatMap(platform=>CHAT_SKINS.map(skin=>chatContext(platform,skin)))
  assert.equal(contexts.length,15)
  for(const field of ['id','windowKey','stateKey','partition','route'])assert.equal(new Set(contexts.map(context=>context[field])).size,15)
  for(const context of contexts)assert.deepEqual(chatContextFromWindowKey(context.windowKey),context)
})

test('douyin contexts retain all approved legacy identities',()=>{
  assert.deepEqual(chatContext('douyin','wechat'),{
    id:'douyin:wechat',platform:'douyin',skin:'wechat',windowKey:'wechat',
    stateKey:'wechat',partition:'persist:moyu-chat-wechat',route:'/wechat'
  })
  assert.equal(chatContext('douyin','dingtalk').windowKey,'dingding')
  assert.equal(chatContext('douyin','dingtalk').stateKey,'dingtalk')
  assert.equal(chatContext('douyin','dingtalk').partition,'persist:moyu-chat-dingtalk')
  assert.equal(chatContext('douyin','feishu').windowKey,'feishu')
})

test('new combinations use explicit composite identities',()=>{
  const context=chatContext('bilibili','wechat')
  assert.equal(context.windowKey,'chat-bilibili-wechat')
  assert.equal(context.stateKey,'bilibili.wechat')
  assert.equal(context.partition,'persist:moyu-chat-bilibili-wechat')
  assert.equal(context.route,'/wechat/bilibili')
  assert.throws(()=>chatContext('unknown','wechat'),/视频平台/)
  assert.throws(()=>chatContext('douyin','qq'),/伪装界面/)
  assert.throws(()=>chatContextFromWindowKey('chat-evil-wechat'),/聊天窗口/)
})
```

- [ ] **Step 2: Run the test and verify the module is missing**

Run:

```powershell
node --test tests/chat-context.test.mjs
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND`.

- [ ] **Step 3: Implement the identity module**

Create `src/shared/chat-context.mjs`:

```js
import {videoPlatform} from './video-platforms.mjs'

export const CHAT_SKINS=Object.freeze(['wechat','dingtalk','feishu'])
const LEGACY_WINDOWS=Object.freeze({wechat:'wechat',dingtalk:'dingding',feishu:'feishu'})
const LEGACY_STATES=Object.freeze({wechat:'wechat',dingtalk:'dingtalk',feishu:'feishu'})
const LEGACY_PARTITIONS=Object.freeze({
  wechat:'persist:moyu-chat-wechat',dingtalk:'persist:moyu-chat-dingtalk',feishu:'persist:moyu-chat-feishu'
})
const ROUTES=Object.freeze({wechat:'wechat',dingtalk:'dingding',feishu:'feishu'})

function skinKey(value){if(!CHAT_SKINS.includes(value))throw Error('不支持的伪装界面');return value}

export function chatContext(platform='douyin',skin='wechat'){
  const site=videoPlatform(platform).key,type=skinKey(skin),legacy=site==='douyin'
  return Object.freeze({
    id:`${site}:${type}`,
    platform:site,
    skin:type,
    windowKey:legacy?LEGACY_WINDOWS[type]:`chat-${site}-${type}`,
    stateKey:legacy?LEGACY_STATES[type]:`${site}.${type}`,
    partition:legacy?LEGACY_PARTITIONS[type]:`persist:moyu-chat-${site}-${type}`,
    route:legacy?`/${ROUTES[type]}`:`/${ROUTES[type]}/${site}`
  })
}

export function chatContextFromWindowKey(windowKey){
  for(const skin of CHAT_SKINS){const context=chatContext('douyin',skin);if(context.windowKey===windowKey)return context}
  const match=/^chat-([a-z]+)-(wechat|dingtalk|feishu)$/.exec(String(windowKey))
  if(!match)throw Error('未知聊天窗口')
  const context=chatContext(match[1],match[2])
  if(context.windowKey!==windowKey)throw Error('未知聊天窗口')
  return context
}
```

- [ ] **Step 4: Run focused tests and commit**

Run:

```powershell
node --test tests/chat-context.test.mjs
git add src/shared/chat-context.mjs tests/chat-context.test.mjs
git commit -m "feat: define cross-platform chat identities"
```

Expected: 3 tests pass and the commit succeeds.

## Task 2: Make chat state and URL validation platform-aware

**Files:**
- Modify: `src/shared/video-platforms.mjs`
- Modify: `src/shared/chat-state.mjs:1-81`
- Modify: `tests/video-platforms.test.mjs`
- Modify: `tests/chat-state.test.mjs`
- Modify: `tests/dingtalk-chat.test.mjs`
- Modify: `tests/feishu-chat.test.mjs`

- [ ] **Step 1: Add failing official-host validation tests**

Append to `tests/video-platforms.test.mjs`:

```js
test('platform URL validation accepts only own HTTP(S) host without credentials',async()=>{
  const {validateVideoPlatformUrl}=await import('../src/shared/video-platforms.mjs')
  assert.equal(validateVideoPlatformUrl('bilibili','https://www.bilibili.com/video/BV1'),'https://www.bilibili.com/video/BV1')
  assert.equal(validateVideoPlatformUrl('huya','http://www.huya.com/123'),'http://www.huya.com/123')
  for(const value of ['javascript:alert(1)','https://user:pass@www.huya.com/','https://huya.com.evil.test/'])assert.throws(()=>validateVideoPlatformUrl('huya',value))
  assert.throws(()=>validateVideoPlatformUrl('huya','https://www.douyu.com/1'))
})
```

Add to `tests/chat-state.test.mjs`:

```js
test('chat defaults and validation follow the expected video platform',()=>{
  for(const platform of ['bilibili','huya','douyu','kuaishou']){
    const state=M.createChatState('wechat',platform)
    assert.equal(state.settings.site,platform)
    assert.equal(M.validateChatState(state,'wechat',platform).settings.site,platform)
    assert.equal(M.validateChatUrl(state.settings.address,platform),state.settings.address)
    assert.throws(()=>M.validateChatState(state,'wechat','douyin'),/站点|播放器/)
    assert.throws(()=>M.validateChatUrl('https://www.douyin.com/',platform))
  }
})
```

- [ ] **Step 2: Run focused tests and confirm failure**

Run:

```powershell
node --test tests/video-platforms.test.mjs tests/chat-state.test.mjs
```

Expected: FAIL because state and URL validation are Douyin-only.

- [ ] **Step 3: Add the shared URL validator**

Append to `src/shared/video-platforms.mjs`:

```js
export function validateVideoPlatformUrl(platform,value){
  const definition=videoPlatform(platform)
  let url
  try{url=new URL(value)}catch{throw Error(`${definition.label}网页地址无效`)}
  const allowed=definition.hosts.some(host=>url.hostname===host||url.hostname.endsWith('.'+host))
  if(!['https:','http:'].includes(url.protocol)||url.username||url.password||!allowed)throw Error(`仅支持无凭据的${definition.label}官方 HTTP(S) 页面`)
  return url.href
}
```

- [ ] **Step 4: Parameterize chat state without changing default call behavior**

In `src/shared/chat-state.mjs`:

```js
import {videoPlatform,validateVideoPlatformUrl} from './video-platforms.mjs'
export const DOUYIN_HOME=videoPlatform('douyin').home
export const validateChatUrl=(value,platform='douyin')=>validateVideoPlatformUrl(platform,value)
```

Replace `createChatState()` with this complete implementation; it preserves all seven existing WeChat conversation objects byte-for-byte:

```js
export function createChatState(skin='wechat',platform='douyin'){
  chatProfile(skin)
  const home=videoPlatform(platform).home,settings={site:platform,orientation:'landscape',scale:140,sender:'self',mask:false,address:home}
  const msg=(n,sender,content,time,name)=>({id:'m'+n,type:'text',sender,text:content,time,...(name?{name}:{})})
  if(skin==='feishu')return {version:1,revision:0,selfName:'小叶',selectedId:'group',drafts:{},settings:{...settings},ui:{hiddenAnnouncements:[]},conversations:createFeishuConversations(msg)}
  if(skin==='dingtalk')return {version:1,revision:0,selfName:'小叶',selectedId:'group',drafts:{},settings:{...settings},conversations:createDingTalkConversations(msg)}
  return {version:1,revision:0,selfName:'我',selectedId:'group',drafts:{},settings:{...settings},conversations:[
    {id:'manager',name:'产品经理-老王',contact:'产品经理-老王',avatar:'manager',memberCount:0,unread:1,messages:[msg(5,'other','预计下午4点部署测试环境，请安排测试跟进。','10:08')]},
    {id:'file',name:'文件传输助手',contact:'助手',avatar:'file',memberCount:0,unread:0,messages:[msg(6,'other','你好，在吗？','11:00')]},
    {id:'group',name:'项目小组',contact:'产品经理-老王',avatar:'group',memberCount:5,unread:0,messages:[msg(1,'other','大家有没有看最新的项目进度文档？','14:20','产品经理-老王'),msg(2,'other','我正在看，前端模块的接口设计已经完成了。','14:23','技术支持-小李'),msg(3,'self','我负责的模块有点延迟，正在努力赶进度。','14:25')]},
    {id:'design',name:'UI-Susan',contact:'Susan',avatar:'design',memberCount:0,unread:3,messages:[msg(7,'other','这个颜色能不能再亮一点？','13:30')]},
    {id:'boss',name:'老板',contact:'老板',avatar:'boss',memberCount:0,unread:0,messages:[msg(8,'other','这个月工作报告的初稿发我看看。','15:10')]},
    {id:'lin',name:'技术支持-小李',contact:'技术支持-小李',avatar:'support',memberCount:0,unread:1,messages:[msg(9,'other','你好，在吗？','11:00')]},
    {id:'chen',name:'物业管家',contact:'管家',avatar:'property',memberCount:0,unread:0,messages:[msg(10,'other','家里水管漏了，能过来看看吗？','11:00')]}
  ]}
}
```

Change `validateChatState()` with these exact signature/name substitutions:

```js
export function validateChatState(raw,skin='wechat',platform='douyin'){
  const profile=chatProfile(skin)
  object(raw);if(raw.version!==1)throw Error('聊天配置版本不支持');const revision=integer(raw.revision,0,Number.MAX_SAFE_INTEGER-1,'版本')
  const selfName=text(raw.selfName,'自己的昵称'),settings=object(raw.settings)
  if(settings.site!==platform||!['landscape','portrait'].includes(settings.orientation)||!['self','other'].includes(settings.sender)||typeof settings.mask!=='boolean')throw Error('播放器设置与当前视频平台不一致')
  const normalizedSettings={site:platform,orientation:settings.orientation,scale:integer(settings.scale,80,200,'大小'),sender:settings.sender,mask:settings.mask,address:validateChatUrl(settings.address,platform)}
```

Leave the structural loops intact, but make these three exact replacements:

```js
const allowedTypes=skin==='feishu'?['text','media-card','player']:['text','player']
result.address=validateChatUrl(m.address,platform)
if(skin==='feishu'){
```

Replace `migrateLegacy()` with:

```js
export function migrateLegacy(raw,skin='wechat',platform='douyin'){
  object(raw);chatProfile(skin);const state=createChatState(skin,platform);let warning=''
  if(raw.siteKey&&raw.siteKey!==platform)warning=`旧站点已保留备份，本窗口仅支持${videoPlatform(platform).label}。`
  if(raw.contacts!==undefined&&!Array.isArray(raw.contacts)||raw.messages!==undefined&&!Array.isArray(raw.messages))throw Error('旧配置不能无损迁移，原文件已保留')
  if(!(raw.contacts?.length||raw.messages?.length))return {state,warning}
  state.conversations=[];const byName=new Map()
  const ensure=value=>{const name=text(value,'旧联系人');if(!byName.has(name)){const c={id:'legacy'+(state.conversations.length+1),name,contact:name,avatar:skin==='dingtalk'?'blue':'group',memberCount:0,unread:0,messages:[]};byName.set(name,c);state.conversations.push(c)}return byName.get(name)}
  for(const name of raw.contacts||[])ensure(name)
  let n=1
  for(const line of raw.messages||[]){if(typeof line!=='string'||!line.includes('|'))throw Error('旧消息缺少归属分隔符，原配置已保留');const index=line.indexOf('|'),c=ensure(line.slice(0,index));c.messages.push({id:'m'+n++,type:'text',sender:'other',text:text(line.slice(index+1),'旧消息',2000),time:'10:00'})}
  state.selectedId=state.conversations[0].id
  return {state:validateChatState(state,skin,platform),warning}
}
```

`insertPlayer(state)` continues using `state.settings.address`, so existing callers need no signature change.

- [ ] **Step 5: Update old protocol expectations deliberately**

In `tests/chat-state.test.mjs`, remove `http://www.douyin.com/` from the rejected URL list and add an equality assertion accepting that official HTTP URL. Keep executable schemes, credentials, cross-site and lookalike hosts rejected.

Do not change the approved conversation counts or Feishu media-card rules in the DingTalk/Feishu test files; only pass the optional platform argument in new cases.

- [ ] **Step 6: Run all state tests and commit**

Run:

```powershell
node --test tests/video-platforms.test.mjs tests/chat-state.test.mjs tests/dingtalk-chat.test.mjs tests/feishu-chat.test.mjs
npm test
git add src/shared/video-platforms.mjs src/shared/chat-state.mjs tests/video-platforms.test.mjs tests/chat-state.test.mjs tests/dingtalk-chat.test.mjs tests/feishu-chat.test.mjs
git commit -m "feat: validate chat state by video platform"
```

Expected: focused and full test suites pass; approved seed structures remain unchanged.

## Task 3: Add a lazy, isolated chat service registry

**Files:**
- Modify: `src/main/chat-service.mjs:1-30`
- Create: `src/main/chat-service-registry.mjs`
- Create: `tests/chat-service-registry.test.mjs`

- [ ] **Step 1: Write failing registry isolation tests**

Create `tests/chat-service-registry.test.mjs`:

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import {createChatServiceRegistry} from '../src/main/chat-service-registry.mjs'
import {chatContext} from '../src/shared/chat-context.mjs'
import {sendText} from '../src/shared/chat-state.mjs'

function memoryStore(){const values=new Map();return {values,get:key=>structuredClone(values.get(key)),set:(key,value)=>values.set(key,structuredClone(value)),setMany:input=>Object.entries(input).forEach(([key,value])=>values.set(key,structuredClone(value)))}}

test('registry isolates platform and skin state namespaces',()=>{
  const store=memoryStore(),events=[]
  const registry=createChatServiceRegistry({store,notify:(context,state)=>events.push([context.id,state.revision])})
  const wx=registry.service(chatContext('bilibili','wechat')),fei=registry.service(chatContext('huya','feishu'))
  const first=wx.get();sendText(first,'B站微信');wx.save(first,0)
  assert.equal(fei.get().revision,0)
  assert.equal(store.values.get('chatModes.bilibili.wechat').revision,1)
  assert.equal(store.values.get('chatModes.huya.feishu').revision,0)
  assert.deepEqual(events,[['bilibili:wechat',1]])
})

test('douyin registry uses legacy keys while new combinations never consume legacy config',()=>{
  const store=memoryStore();store.set('wechatConfig',{contacts:['旧联系人'],messages:['旧联系人|旧消息']})
  const registry=createChatServiceRegistry({store})
  assert.equal(registry.service(chatContext('douyin','wechat')).get().conversations[0].name,'旧联系人')
  assert.notEqual(registry.service(chatContext('bilibili','wechat')).get().conversations[0].name,'旧联系人')
  assert.ok(store.values.has('chatModes.wechat'))
  assert.ok(store.values.has('chatModes.bilibili.wechat'))
})
```

- [ ] **Step 2: Run and confirm the registry is missing**

Run:

```powershell
node --test tests/chat-service-registry.test.mjs
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND`.

- [ ] **Step 3: Teach one service its expected platform**

Change `createChatService()` to accept `platform='douyin'`:

```js
export function createChatService({store,notify=()=>{},key='wechat',profile=key,platform='douyin',legacyKey=key==='wechat'?'wechatConfig':'dingdingConfig',legacySiteKey,recoverInvalidSaved=false}){
```

Make these exact textual replacements inside `get()` and `save()`:

```text
validateChatState(saved,profile)  -> validateChatState(saved,profile,platform)
createChatState(profile)          -> createChatState(profile,platform)   (both occurrences)
},profile)                        -> },profile,platform)                  (the migrateLegacy call only)
validateChatState(raw,profile)    -> validateChatState(raw,profile,platform)
```

Keep revision conflict, atomic persistence, backup and notification behavior unchanged.

- [ ] **Step 4: Implement the registry**

Create `src/main/chat-service-registry.mjs`:

```js
import {createChatService} from './chat-service.mjs'
import {chatContext} from '../shared/chat-context.mjs'

export function createChatServiceRegistry({store,notify=()=>{}}){
  const services=new Map()
  function service(input){
    const context=chatContext(input.platform,input.skin)
    if(services.has(context.id))return services.get(context.id)
    const legacy=context.platform==='douyin'
    const options={store,key:context.stateKey,profile:context.skin,platform:context.platform,recoverInvalidSaved:!legacy||context.skin==='feishu',notify:state=>notify(context,state)}
    if(legacy&&context.skin==='wechat')Object.assign(options,{legacyKey:'wechatConfig',legacySiteKey:'wechat.currentSiteKey'})
    else if(legacy&&context.skin==='dingtalk')Object.assign(options,{legacyKey:'dingdingConfig',legacySiteKey:'dingding.currentSiteKey'})
    else Object.assign(options,{legacyKey:null,legacySiteKey:null})
    const created=createChatService(options);services.set(context.id,created);return created
  }
  return {service}
}
```

- [ ] **Step 5: Run registry and existing service tests**

Run:

```powershell
node --test tests/chat-service-registry.test.mjs tests/chat-state.test.mjs tests/dingtalk-chat.test.mjs tests/feishu-chat.test.mjs
```

Expected: all tests pass.

- [ ] **Step 6: Commit service isolation**

Run:

```powershell
git add src/main/chat-service.mjs src/main/chat-service-registry.mjs tests/chat-service-registry.test.mjs
git commit -m "feat: isolate chat services by platform and skin"
```

## Task 4: Generalize window persistence and guest attachment policy

**Files:**
- Modify: `src/main/chat-window-controls.mjs:1-26`
- Modify: `src/main/chat-guest-policy.mjs:1-20`
- Modify: `tests/chat-runtime.test.mjs`
- Modify: `tests/dingtalk-wiring.test.mjs`
- Modify: `tests/feishu-wiring.test.mjs`

- [ ] **Step 1: Add failing composite window and partition tests**

Append to `tests/chat-runtime.test.mjs`:

```js
test('composite chat windows persist bounds independently',async()=>{
  const {createChatWindowController}=await import('../src/main/chat-window-controls.mjs')
  const values=new Map(),store={get:key=>values.get(key),set:(key,value)=>values.set(key,value)},screen={getAllDisplays:()=>[{workArea:{x:0,y:0,width:1600,height:900}}]}
  const make=x=>{const w=new EventEmitter();w.isDestroyed=()=>false;w.getBounds=()=>({x,y:10,width:980,height:760});w.setBounds=()=>{};w.show=()=>{};w.close=()=>{};w.getOpacity=()=>1;w.setOpacity=()=>{};w.webContents={isDestroyed:()=>false,send:()=>{}};return w}
  const controller=createChatWindowController({store,screen}),a=make(10),b=make(70)
  controller.attach('chat-bilibili-wechat',a);controller.attach('chat-huya-wechat',b)
  a.emit('move');b.emit('move')
  assert.equal(values.get('chatWindows.chat-bilibili-wechat').bounds.x,10)
  assert.equal(values.get('chatWindows.chat-huya-wechat').bounds.x,70)
})
```

Add a new test in `tests/dingtalk-wiring.test.mjs`:

```js
test('guest policy binds official URL to the exact composite partition',async()=>{
  const {validateChatGuestAttachment}=await import('../src/main/chat-guest-policy.mjs')
  assert.equal(validateChatGuestAttachment('chat-bilibili-wechat',{src:'https://www.bilibili.com/video/BV1',partition:'persist:moyu-chat-bilibili-wechat'}).address,'https://www.bilibili.com/video/BV1')
  assert.throws(()=>validateChatGuestAttachment('chat-bilibili-wechat',{src:'https://www.huya.com/1',partition:'persist:moyu-chat-bilibili-wechat'}))
  assert.throws(()=>validateChatGuestAttachment('chat-bilibili-wechat',{src:'https://www.bilibili.com/',partition:'persist:moyu-chat-huya-wechat'}))
})
```

- [ ] **Step 2: Run focused tests and confirm whitelist failures**

Run:

```powershell
node --test tests/chat-runtime.test.mjs tests/dingtalk-wiring.test.mjs
```

Expected: FAIL because the controller and policy only accept three legacy keys.

- [ ] **Step 3: Validate any known chat window identity in the controller**

Import `chatContextFromWindowKey` in `chat-window-controls.mjs`. At the beginning of `attach(key,win)`, replace the fixed skin whitelist with:

```js
chatContextFromWindowKey(key)
```

Keep `chatWindows.${key}` persistence unchanged; legacy keys therefore retain old bounds automatically.

- [ ] **Step 4: Replace the fixed partition table in guest policy**

Use:

```js
import {chatContextFromWindowKey} from '../shared/chat-context.mjs'
import {validateChatUrl} from '../shared/chat-state.mjs'

export function chatPartitionForWindow(key){return chatContextFromWindowKey(key).partition}
export function validateChatGuestAttachment(key,params){
  const context=chatContextFromWindowKey(key)
  const address=validateChatUrl(params?.src,context.platform)
  if(params?.partition!==context.partition)throw Error('聊天网页会话分区无效')
  return {address,partition:context.partition}
}
```

- [ ] **Step 5: Run tests and commit**

Run:

```powershell
node --test tests/chat-runtime.test.mjs tests/dingtalk-wiring.test.mjs tests/feishu-wiring.test.mjs
git add src/main/chat-window-controls.mjs src/main/chat-guest-policy.mjs tests/chat-runtime.test.mjs tests/dingtalk-wiring.test.mjs tests/feishu-wiring.test.mjs
git commit -m "feat: isolate composite chat windows and guests"
```

Expected: focused tests pass.

## Task 5: Add dynamic main-process chat windows and generic IPC

**Files:**
- Modify: `src/main/index.js:41-145,156-185,422-469,862-877`
- Modify: `src/renderer/src/router/index.js:35-40`
- Create: `tests/video-chat-matrix-wiring.test.mjs`

- [ ] **Step 1: Write failing main/router wiring tests**

Create `tests/video-chat-matrix-wiring.test.mjs`:

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8')

test('three approved views accept an optional trusted platform route',()=>{
  const router=read('src/renderer/src/router/index.js')
  assert.match(router,/path: '\/wechat\/:platform\?'/)
  assert.match(router,/path: '\/dingding\/:platform\?'/)
  assert.match(router,/path: '\/feishu\/:platform\?'/)
})

test('main derives generic chat context from sender window and uses a service registry',()=>{
  const main=read('src/main/index.js')
  assert.match(main,/createChatServiceRegistry/)
  assert.match(main,/video-chat:get-context/)
  assert.match(main,/video-chat:get/)
  assert.match(main,/video-chat:save/)
  assert.match(main,/chatContextFromWindowKey\(keyFromSender\(event\)\)/)
  assert.match(main,/openVideoChat/)
  assert.doesNotMatch(main,/CHAT_WINDOW_TO_PROFILE\s*=/)
})
```

- [ ] **Step 2: Run and confirm failure**

Run:

```powershell
node --test tests/video-chat-matrix-wiring.test.mjs
```

Expected: FAIL on optional routes, registry and generic channels.

- [ ] **Step 3: Make the three router paths optional-platform routes**

Use:

```js
{ path: '/wechat/:platform?', name: 'Wechat', component: () => import('../views/WechatView.vue'), meta: { kind: 'wechat' } },
{ path: '/dingding/:platform?', name: 'Dingding', component: () => import('../views/DingTalkView.vue'), meta: { kind: 'dingtalk' } },
{ path: '/feishu/:platform?', name: 'Feishu', component: () => import('../views/FeishuView.vue'), meta: { kind: 'feishu' } },
```

Legacy URLs remain `/wechat`, `/dingding` and `/feishu`.

- [ ] **Step 4: Replace the static chat-window map with context parsing**

Import `chatContext`, `chatContextFromWindowKey` and `createChatServiceRegistry`. Add:

```js
const tryChatContext=key=>{try{return chatContextFromWindowKey(key)}catch{return null}}
const CHAT_WINDOW_OPTIONS=Object.freeze({
  wechat:{width:980,height:760},dingtalk:{width:980,height:760},feishu:{width:1200,height:800}
})
let chatServices=null
```

In `makeWindow()`, compute `const chat=tryChatContext(key)` once. Use `chat` instead of `CHAT_WINDOW_KEYS.has(key)` for controller attachment, webview policy and navigation guards. All calls to `validateChatUrl(address)` in guest events become `validateChatUrl(address,chat.platform)`.

In `focus()` and shortcut opacity handling, use `const chat=tryChatContext(key)` and pass `key` to `chatWindowControls.restore()`/`setOpacity()`.

- [ ] **Step 5: Add the dynamic window factory**

Add before `registerIpc()`:

```js
function openVideoChat(platform,skin,address){
  const context=chatContext(platform,skin),options=CHAT_WINDOW_OPTIONS[context.skin]
  const service=chatServices.service(context)
  if(address!==undefined){
    const url=validateChatUrl(address,context.platform),state=service.get()
    state.settings.address=url
    const player=state.conversations.find(c=>c.id===state.selectedId)?.messages.find(message=>message.type==='player')
    if(player)player.address=url
    service.save(state,state.revision)
  }
  return openRoute(context.windowKey,context.route,{...options,frame:false,skipTaskbar:true,webPreferences:{webSecurity:false}})
}
```

- [ ] **Step 6: Register generic sender-derived chat IPC**

Inside `registerIpc()` add:

```js
const senderChat=event=>chatContextFromWindowKey(keyFromSender(event))
handle('video-chat:get-context',event=>senderChat(event))
handle('video-chat:get',event=>{const context=senderChat(event);return chatServices.service(context).get()})
handle('video-chat:save',(event,state,revision)=>{const context=senderChat(event);return chatServices.service(context).save(state,revision)})
handle('video-chat:state',event=>{const context=senderChat(event);return {...chatWindowControls.state(context.windowKey),warning:chatServices.service(context).getWarning(),context}})
handle('video-chat:close',event=>{const context=senderChat(event);return chatWindowControls.close(context.windowKey)})
```

Replace the three repeated formal legacy handler blocks with this helper; keep `requireWechatLegacy` and `requireDingtalkLegacy` for the older config-window APIs:

```js
const registerLegacyChatBridge=(prefix,skin)=>{
  const expected=chatContext('douyin',skin)
  const requireLegacy=event=>{
    const actual=senderChat(event)
    if(actual.id!==expected.id)throw Error(`仅${skin}抖音窗口可操作此聊天配置`)
    return actual
  }
  handle(`${prefix}:get`,event=>{requireLegacy(event);return chatServices.service(expected).get()})
  handle(`${prefix}:save`,(event,state,revision)=>{requireLegacy(event);return chatServices.service(expected).save(state,revision)})
  handle(`${prefix}:state`,event=>{requireLegacy(event);return {...chatWindowControls.state(expected.windowKey),warning:chatServices.service(expected).getWarning()}})
  handle(`${prefix}:close`,event=>{requireLegacy(event);return chatWindowControls.close(expected.windowKey)})
  handle(`${prefix}:open`,(event,address)=>{
    if(keyFromSender(event)!=='main')throw Error('仅主窗口可打开伪装模式')
    openVideoChat('douyin',skin,address);return true
  })
}
registerLegacyChatBridge('chat-mode','wechat')
registerLegacyChatBridge('dingtalk-mode','dingtalk')
registerLegacyChatBridge('feishu-mode','feishu')
```

This preserves the old channel names, routes, storage keys and preload APIs while removing the three eager service variables.

- [ ] **Step 7: Initialize the registry and enable all launcher chat targets**

After `chatWindowControls` is created:

```js
chatServices=createChatServiceRegistry({store,notify:(context,state)=>{
  const win=windows.get(context.windowKey)
  if(win&&!win.isDestroyed()&&!win.webContents.isDestroyed()){
    win.webContents.send('video-chat:updated',state)
    const legacyChannel=context.platform==='douyin'?{wechat:'chat-mode:updated',dingtalk:'dingtalk-mode:updated',feishu:'feishu-mode:updated'}[context.skin]:null
    if(legacyChannel)win.webContents.send(legacyChannel,state)
  }
}})
```

Replace the Plan 1 temporary chat launcher branch with:

```js
openChat:(platform,skin)=>openVideoChat(platform,skin),
```

Delete the three eager service variables and their eager initialization only after legacy handlers use `chatServices.service(chatContext('douyin',skin))`.

- [ ] **Step 8: Run main/router wiring, legacy wiring and build**

Run:

```powershell
node --test tests/video-chat-matrix-wiring.test.mjs tests/chat-wiring.test.mjs tests/dingtalk-wiring.test.mjs tests/feishu-wiring.test.mjs tests/chat-runtime.test.mjs
npm run build
```

Expected: selected tests and build pass.

- [ ] **Step 9: Commit dynamic main wiring**

Run:

```powershell
git add src/main/index.js src/renderer/src/router/index.js tests/video-chat-matrix-wiring.test.mjs
git commit -m "feat: open chat disguises by video platform"
```

## Task 6: Expose a generic in-window chat bridge

**Files:**
- Modify: `src/preload/index.js:1-41`
- Modify: `tests/video-chat-matrix-wiring.test.mjs`

- [ ] **Step 1: Add the failing preload contract**

Append:

```js
test('preload exposes sender-bound generic chat operations and keeps legacy bridges',()=>{
  const preload=read('src/preload/index.js')
  assert.match(preload,/exposeInMainWorld\('videoChatModeControl'/)
  for(const channel of ['video-chat:get-context','video-chat:get','video-chat:save','video-chat:state','video-chat:close'])assert.match(preload,new RegExp(channel))
  assert.match(preload,/exposeInMainWorld\('chatModeControl'/)
  assert.match(preload,/exposeInMainWorld\('dingtalkModeControl'/)
  assert.match(preload,/exposeInMainWorld\('feishuModeControl'/)
})
```

- [ ] **Step 2: Run and confirm failure**

Run:

```powershell
node --test tests/video-chat-matrix-wiring.test.mjs
```

- [ ] **Step 3: Add the generic bridge**

Add to `src/preload/index.js` without removing legacy bridges:

```js
contextBridge.exposeInMainWorld('videoChatModeControl',{
  getContext:()=>ipcRenderer.invoke('video-chat:get-context'),
  get:()=>ipcRenderer.invoke('video-chat:get'),
  save:(state,revision)=>ipcRenderer.invoke('video-chat:save',state,revision),
  getRuntime:()=>ipcRenderer.invoke('video-chat:state'),
  close:()=>ipcRenderer.invoke('video-chat:close'),
  onState:on('video-chat:updated'),
  onBoss:on('chat-mode:boss'),
  onError:on('chat-mode:error')
})
```

- [ ] **Step 4: Run tests, build and commit**

Run:

```powershell
node --test tests/video-chat-matrix-wiring.test.mjs tests/preload-events.test.mjs
npm run build
git add src/preload/index.js tests/video-chat-matrix-wiring.test.mjs
git commit -m "feat: expose generic chat disguise bridge"
```

Expected: tests/build pass and legacy APIs remain present.

## Task 7: Parameterize navigation and the shared player

**Files:**
- Modify: `src/renderer/src/features/chat/navigation.mjs:1-55`
- Modify: `src/renderer/src/features/chat/ChatPlayer.vue:1-43`
- Modify: `tests/chat-navigation.test.mjs`
- Modify: `tests/video-chat-matrix-wiring.test.mjs`

- [ ] **Step 1: Add failing B站 navigation and player-copy tests**

Append to `tests/chat-navigation.test.mjs`:

```js
test('navigation validates every transition against its configured platform',async()=>{
  const {createChatNavigation}=await import('../src/renderer/src/features/chat/navigation.mjs')
  let url='https://www.bilibili.com/',committed
  const navigation=createChatNavigation({platform:'bilibili',initialAddress:url,readUrl:()=>url,load:()=>{},commit:value=>{committed=value},report:()=>{}})
  assert.equal(navigation.navigate('https://www.bilibili.com/video/BV1'),true)
  assert.equal(committed,'https://www.bilibili.com/video/BV1')
  assert.throws(()=>navigation.addressChanged('https://www.huya.com/1'),/B站/)
})
```

Append to `tests/video-chat-matrix-wiring.test.mjs`:

```js
test('shared player receives explicit platform label and partition',()=>{
  const player=read('src/renderer/src/features/chat/ChatPlayer.vue')
  assert.match(player,/platform:\{type:String,required:true\}/)
  assert.match(player,/label:\{type:String,required:true\}/)
  assert.match(player,/partition:\{type:String,required:true\}/)
  assert.match(player,/validateChatUrl\(props\.message\.address,props\.platform\)/)
  assert.doesNotMatch(player,/persist:moyu-chat-wechat/)
})
```

- [ ] **Step 2: Run and confirm Douyin hardcoding fails**

Run:

```powershell
node --test tests/chat-navigation.test.mjs tests/video-chat-matrix-wiring.test.mjs
```

- [ ] **Step 3: Pass platform through navigation validation**

Change the factory signature to:

```js
export function createChatNavigation({platform='douyin',initialAddress,readUrl,load,commit,report}){
```

Replace every `validateChatUrl(value)` call in this module with `validateChatUrl(value,platform)`.

- [ ] **Step 4: Require explicit player context**

In `ChatPlayer.vue`, use:

```js
const props=defineProps({
  message:Object,settings:Object,covered:Boolean,active:Boolean,
  platform:{type:String,required:true},label:{type:String,required:true},partition:{type:String,required:true}
})
const initialAddress=validateChatUrl(props.message.address,props.platform)
```

Create navigation with `platform:props.platform`. Replace visible Douyin text with:

```vue
<div v-else-if="!ready && !covered" class="player-loading">正在加载{{label}}网页…</div>
```

Use `${props.label}网页进程已退出，请重试` for renderer-process failure.

- [ ] **Step 5: Run tests and commit**

Run:

```powershell
node --test tests/chat-navigation.test.mjs tests/video-chat-matrix-wiring.test.mjs
git add src/renderer/src/features/chat/navigation.mjs src/renderer/src/features/chat/ChatPlayer.vue tests/chat-navigation.test.mjs tests/video-chat-matrix-wiring.test.mjs
git commit -m "feat: parameterize shared chat player by platform"
```

## Task 8: Load and validate renderer platform context

**Files:**
- Create: `src/renderer/src/features/chat/platform-runtime.mjs`
- Modify: `tests/video-chat-matrix-wiring.test.mjs`

- [ ] **Step 1: Add failing runtime-context tests**

Append:

```js
test('renderer runtime rejects a skin mismatch and returns platform display data',async()=>{
  const {loadChatPlatform}=await import('../src/renderer/src/features/chat/platform-runtime.mjs')
  const value=await loadChatPlatform({getContext:async()=>({platform:'huya',skin:'wechat',partition:'persist:moyu-chat-huya-wechat'})},'wechat')
  assert.equal(value.definition.label,'虎牙')
  assert.equal(value.partition,'persist:moyu-chat-huya-wechat')
  await assert.rejects(loadChatPlatform({getContext:async()=>({platform:'huya',skin:'feishu',partition:'x'})},'wechat'),/界面/)
})
```

- [ ] **Step 2: Run and confirm the helper is missing**

Run:

```powershell
node --test tests/video-chat-matrix-wiring.test.mjs
```

- [ ] **Step 3: Implement renderer context validation**

Create `src/renderer/src/features/chat/platform-runtime.mjs`:

```js
import {chatContext} from '../../../../shared/chat-context.mjs'
import {videoPlatform} from '../../../../shared/video-platforms.mjs'

export async function loadChatPlatform(api,expectedSkin){
  const received=await api.getContext()
  const context=chatContext(received.platform,received.skin)
  if(context.skin!==expectedSkin)throw Error('伪装界面身份不匹配')
  if(received.partition!==context.partition)throw Error('聊天网页会话分区无效')
  return {...context,definition:videoPlatform(context.platform)}
}
```

- [ ] **Step 4: Run and commit**

Run:

```powershell
node --test tests/video-chat-matrix-wiring.test.mjs
git add src/renderer/src/features/chat/platform-runtime.mjs tests/video-chat-matrix-wiring.test.mjs
git commit -m "feat: validate renderer chat platform context"
```

## Task 9: Adapt WeChat, DingTalk and Feishu without changing approved CSS

**Files:**
- Modify: `src/renderer/src/views/WechatView.vue:1-108`
- Modify: `src/renderer/src/views/DingTalkView.vue:1-36`
- Modify: `src/renderer/src/views/FeishuView.vue:1-100`
- Modify: `tests/chat-wiring.test.mjs`
- Modify: `tests/dingtalk-wiring.test.mjs`
- Modify: `tests/feishu-wiring.test.mjs`
- Modify: `tests/video-chat-matrix-wiring.test.mjs`

- [ ] **Step 1: Add failing shared-view context assertions**

Append to `tests/video-chat-matrix-wiring.test.mjs`:

```js
test('all approved chat views use generic bridge and dynamic player context',()=>{
  for(const file of ['WechatView.vue','DingTalkView.vue','FeishuView.vue']){
    const source=read('src/renderer/src/views/'+file)
    assert.match(source,/window\.videoChatModeControl/)
    assert.match(source,/loadChatPlatform/)
    assert.match(source,/:platform="platform\.platform"/)
    assert.match(source,/:partition="platform\.partition"/)
    assert.match(source,/:label="platform\.definition\.label"/)
    assert.doesNotMatch(source,/插入抖音播放器|抖音页面地址|本批已接入抖音/)
  }
})
```

- [ ] **Step 2: Run and confirm hardcoded views fail**

Run:

```powershell
node --test tests/video-chat-matrix-wiring.test.mjs
```

- [ ] **Step 3: Apply the common script pattern to each view**

In each view, import `loadChatPlatform`, use `const api=window.videoChatModeControl`, and add:

```js
const platform=ref(null)
const platformLabel=computed(()=>platform.value?.definition.label||'视频')
```

Use these exact validators:

```js
// WechatView.vue
const controller=createChatController({
  api,
  validate:raw=>validateChatState(raw,'wechat',platform.value?.platform||raw?.settings?.site||'douyin'),
  onState:value=>state.value=value,
  onError:value=>error.value=value.message
})

// DingTalkView.vue
const controller=createChatController({api,validate:raw=>validateChatState(raw,'dingtalk',platform.value?.platform||raw?.settings?.site||'douyin'),onState:value=>state.value=value,onError:value=>error.value=value.message})

// FeishuView.vue
const controller=createChatController({api,validate:raw=>validateChatState(raw,'feishu',platform.value?.platform||raw?.settings?.site||'douyin'),onState:value=>state.value=value,onError:value=>error.value=value.message})
```

At the beginning of each `load()` function, before `loadChatRuntime()`:

```js
platform.value=await loadChatPlatform(api,'wechat')
```

Use the matching skin string in the other two files.

- [ ] **Step 4: Pass immutable context to every ChatPlayer**

Use:

```vue
<ChatPlayer
  v-if="m.type==='player'"
  :platform="platform.platform"
  :label="platform.definition.label"
  :partition="platform.partition"
  :message="m" :settings="state.settings" :covered="covered" :active="c.id===state.selectedId"
  @navigate="address=>saveNavigation(c.id,m.id,address)" @error="message=>error=message"
/>
```

Feishu keeps its `v-else-if` placement. Do not change `wechat.css`, `dingtalk.css` or `feishu.css`.

- [ ] **Step 5: Replace platform-specific text and validation**

Use these calls in the corresponding view:

```js
validateChatUrl(addressInput.value,platform.value.platform)
// WeChat
validateChatState(raw,'wechat',platform.value.platform)
createChatState('wechat',platform.value.platform)
// DingTalk
validateChatState(raw,'dingtalk',platform.value.platform)
createChatState('dingtalk',platform.value.platform)
// Feishu
validateChatState(raw,'feishu',platform.value.platform)
createChatState('feishu',platform.value.platform)
```

Use `platformLabel` in UI strings:

```vue
插入{{platformLabel}}播放器
<label>{{platformLabel}}页面地址<input v-model="addressInput" :aria-label="platformLabel+'页面地址'"/></label>
```

Duplicate-player notices and Feishu summaries use the dynamic label, for example `${platformLabel.value}播放器` and `[${platformLabel.value}视频]`.

- [ ] **Step 6: Preserve legacy bridge tests separately**

Update old wiring tests to assert that legacy bridges and routes still exist, while view-runtime assertions now target `videoChatModeControl`. Do not delete cross-bridge rejection tests from existing Electron smoke scripts.

- [ ] **Step 7: Run all chat unit tests and build**

Run:

```powershell
node --test tests/chat-state.test.mjs tests/chat-runtime.test.mjs tests/chat-navigation.test.mjs tests/chat-wiring.test.mjs tests/dingtalk-chat.test.mjs tests/dingtalk-wiring.test.mjs tests/feishu-chat.test.mjs tests/feishu-wiring.test.mjs tests/video-chat-matrix-wiring.test.mjs
npm test
npm run build
```

Expected: all tests/build pass and no approved CSS file changed.

- [ ] **Step 8: Commit the shared-view adaptation**

Run:

```powershell
git add src/renderer/src/views/WechatView.vue src/renderer/src/views/DingTalkView.vue src/renderer/src/views/FeishuView.vue tests/chat-wiring.test.mjs tests/dingtalk-wiring.test.mjs tests/feishu-wiring.test.mjs tests/video-chat-matrix-wiring.test.mjs
git commit -m "feat: reuse chat disguises across video platforms"
```

## Task 10: Add a 12-combination isolated Electron smoke

**Files:**
- Create: `scripts/run-video-chat-matrix-smoke.mjs`
- Create: `scripts/video-chat-matrix-smoke.cjs`
- Modify: `package.json`

- [ ] **Step 1: Add the safe temporary-data runner**

Create `scripts/run-video-chat-matrix-smoke.mjs` using the existing chat runner pattern:

```js
import {spawn} from 'node:child_process'
import {createRequire} from 'node:module'
import {fileURLToPath} from 'node:url'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
const executable=createRequire(import.meta.url)('electron'),env={...process.env};delete env.ELECTRON_RUN_AS_NODE
const taskDir=fs.mkdtempSync(path.join(os.tmpdir(),'moyu-chat-matrix-'));env.MOYU_CHAT_MATRIX_DATA_DIR=taskDir
try{
  const code=await new Promise((resolve,reject)=>{const child=spawn(executable,[fileURLToPath(new URL('./video-chat-matrix-smoke.cjs',import.meta.url))],{env,stdio:'inherit',windowsHide:true});child.on('error',reject);child.on('exit',value=>resolve(value??1))})
  process.exitCode=code
}finally{
  const target=path.resolve(taskDir)
  if(path.dirname(target)===path.resolve(os.tmpdir())&&path.basename(target).startsWith('moyu-chat-matrix-'))fs.rmSync(target,{recursive:true,force:true,maxRetries:10,retryDelay:100})
}
```

- [ ] **Step 2: Create a local-fixture matrix smoke**

Create `scripts/video-chat-matrix-smoke.cjs`:

```js
const {app,BrowserWindow,session,webContents,globalShortcut}=require('electron')
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict')
const {pathToFileURL}=require('node:url')
if(!process.env.MOYU_CHAT_MATRIX_DATA_DIR)throw Error('Isolated matrix data required')
app.setPath('userData',process.env.MOYU_CHAT_MATRIX_DATA_DIR);app.disableHardwareAcceleration()
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms))
const evaluate=(window,code)=>window.webContents.executeJavaScript(code,true)
const find=route=>BrowserWindow.getAllWindows().find(window=>window.webContents.getURL().endsWith('#'+route))
async function until(fn,label){for(let index=0;index<160;index++){if(await fn())return;await pause(100)}throw Error('Timeout: '+label)}
const watchdog=setTimeout(()=>{console.error('Video chat matrix watchdog');app.exit(1)},120000)

app.whenReady().then(async()=>{
  const moduleUrl=pathToFileURL(path.join(__dirname,'../src/shared/chat-context.mjs')).href
  const {chatContext}=await import(moduleUrl)
  const fixture=fs.readFileSync(path.join(__dirname,'../tests/fixtures/web/ad-modes/video.html'),'utf8')
  const platforms=['bilibili','huya','douyu','kuaishou'],skins=['wechat','dingtalk','feishu']
  const contexts=platforms.flatMap(platform=>skins.map(skin=>chatContext(platform,skin)))
  for(const context of contexts){
    await session.fromPartition(context.partition).protocol.handle('https',()=>new Response(fixture+`<script>document.body.dataset.matrix=${JSON.stringify(context.id)}</script>`,{headers:{'content-type':'text/html; charset=utf-8'}}))
  }
  try{
    await until(()=>find('/home'),'home');const home=find('/home')
    await until(()=>evaluate(home,'Boolean(window.videoModeControl)'),'video mode bridge')
    let passed=0
    for(let index=0;index<contexts.length;index++){
      const context=contexts[index],scale=80+index
      await evaluate(home,`window.videoModeControl.open(${JSON.stringify(context.platform)},${JSON.stringify(context.skin)})`)
      await until(()=>find(context.route),context.id+' window');let window=find(context.route)
      await until(()=>evaluate(window,'document.querySelector("[data-chat-ready]")?.dataset.chatReady==="true"'),context.id+' ready')
      await evaluate(window,'document.querySelector("[data-action=insert]").click()')
      await until(()=>evaluate(window,'document.querySelector("webview")?.dataset.playerReady==="true"'),context.id+' guest')
      const guest=webContents.fromId(await evaluate(window,'document.querySelector("webview").getWebContentsId()'))
      const firstWindowId=window.id,firstGuestId=guest.id
      assert.equal(guest.session,session.fromPartition(context.partition))
      assert.equal(await guest.executeJavaScript('document.body.dataset.matrix'),context.id)
      assert.equal((await evaluate(window,'window.videoChatModeControl.get()')).settings.site,context.platform)
      assert.equal((await evaluate(window,'window.videoChatModeControl.getContext()')).id,context.id)
      await evaluate(home,`window.videoModeControl.open(${JSON.stringify(context.platform)},${JSON.stringify(context.skin)})`)
      assert.equal(find(context.route).id,firstWindowId)
      assert.equal(await evaluate(window,'document.querySelector("webview").getWebContentsId()'),firstGuestId)
      await evaluate(window,`(async()=>{const state=await window.videoChatModeControl.get();state.settings.scale=${scale};await window.videoChatModeControl.save(state,state.revision)})()`)
      await evaluate(window,'window.videoChatModeControl.close()').catch(error=>{if(!/destroy|closed/i.test(error.message))throw error})
      await until(()=>!find(context.route),context.id+' close')
      await evaluate(home,`window.videoModeControl.open(${JSON.stringify(context.platform)},${JSON.stringify(context.skin)})`)
      await until(()=>find(context.route),context.id+' reopen');window=find(context.route)
      await until(()=>evaluate(window,'Boolean(document.querySelector("[data-chat-ready]"))'),context.id+' restored')
      assert.equal((await evaluate(window,'window.videoChatModeControl.get()')).settings.scale,scale)
      await evaluate(window,'window.videoChatModeControl.close()').catch(()=>{})
      await until(()=>!find(context.route),context.id+' final close');passed++
    }
    const bossContexts=[chatContext('bilibili','wechat'),chatContext('huya','dingtalk'),chatContext('douyu','feishu')]
    for(const context of bossContexts){
      await evaluate(home,`window.videoModeControl.open(${JSON.stringify(context.platform)},${JSON.stringify(context.skin)})`)
      await until(()=>find(context.route),context.id+' boss window');const window=find(context.route)
      await until(()=>evaluate(window,'Boolean(document.querySelector("[data-chat-ready]"))'),context.id+' boss ready')
      if(!await evaluate(window,'Boolean(document.querySelector("webview"))'))await evaluate(window,'document.querySelector("[data-action=insert]").click()')
      await until(()=>evaluate(window,'Boolean(document.querySelector("webview"))'),context.id+' boss guest')
    }
    await evaluate(home,"window.ipcRenderer.invoke('boss-key')")
    for(const context of bossContexts){const window=find(context.route);await until(()=>evaluate(window,'Boolean(document.querySelector("[data-cover=chat-video]"))'),context.id+' covered');assert.equal(window.getOpacity(),1);assert.ok(window.isVisible())}
    await evaluate(home,"window.ipcRenderer.invoke('boss-key')")
    for(const context of bossContexts){const window=find(context.route);await until(()=>evaluate(window,'!document.querySelector("[data-cover=chat-video]")'),context.id+' restored');window.close()}
    console.log('VIDEO_CHAT_MATRIX_RESULT '+JSON.stringify({passed,combinations:contexts.length,failed:0,isolatedData:true,onlineVerified:false}))
    clearTimeout(watchdog);globalShortcut.unregisterAll();app.exit(0)
  }catch(error){
    console.error(error.stack)
    for(const window of BrowserWindow.getAllWindows().filter(value=>!value.isDestroyed()))console.error('WINDOW',window.webContents.getURL(),await evaluate(window,'document.body.innerText').catch(()=>''))
    clearTimeout(watchdog);globalShortcut.unregisterAll();app.exit(1)
  }
})
require('../out/main/index.js')
```

- [ ] **Step 3: Add the package script**

In `package.json` add:

```json
"test:video-chat-matrix": "node scripts/run-video-chat-matrix-smoke.mjs"
```

- [ ] **Step 4: Run the matrix smoke**

Run:

```powershell
npm run build
npm run test:video-chat-matrix
```

Expected: 12 combinations pass using isolated sessions and local fixtures.

- [ ] **Step 5: Commit smoke coverage**

Run:

```powershell
git add scripts/run-video-chat-matrix-smoke.mjs scripts/video-chat-matrix-smoke.cjs package.json
git commit -m "test: cover cross-platform chat matrix"
```

## Task 11: Run legacy and full regression without touching transparency

**Files:**
- Verify only; no source file changes.

- [ ] **Step 1: Run the full automated suite**

Run:

```powershell
npm test
npm run build
npm run test:smoke
npm run test:ad-modes
npm run test:video-chat-matrix
npm run test:douyin-opacity
npm run test:video-opacity
node scripts/run-wechat-smoke.mjs
node scripts/run-dingtalk-smoke.mjs
node scripts/run-feishu-smoke.mjs
```

Expected: all commands exit 0. Legacy Douyin sessions, bridge-rejection behavior and detailed UI interactions still pass.

- [ ] **Step 2: Verify protected source hashes**

Run:

```powershell
Get-FileHash src/renderer/src/views/DouyinOpacityView.vue,src/renderer/src/views/VideoOpacityView.vue,src/renderer/src/features/video-opacity/controller.mjs,src/renderer/src/features/video-opacity/platforms.mjs,src/renderer/src/features/video-opacity/huya-window-fill.mjs -Algorithm SHA256 | Format-Table Path,Hash
Get-FileHash D:/MoYuMaster-1.0.0-win/resources/app.asar -Algorithm SHA256
```

Expected: project transparency hashes match the Plan 1 baseline and the source `app.asar` matches the previously recorded read-only hash.

- [ ] **Step 3: Confirm repository state and commit history**

Run:

```powershell
git status --short
git log --oneline --decorate -12
```

Expected: the worktree is clean and the log contains the task-level feature/test commits from all three plans.

## Plan 3 completion checkpoint

The feature is complete only when:

- All 25 homepage mode entries open the correct window.
- The 12 new chat combinations have independent state, partition and bounds.
- The three legacy Douyin chat modes retain their old data keys, partitions and routes.
- Repeated opens focus one instance.
- Boss cover, close/reopen and destroyed-window guards pass.
- Existing transparency files retain their baseline hashes.
- Full tests, build, advertisement smoke, matrix smoke and all three detailed legacy chat smokes pass.
