# Video Mode Home Entry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the home screen in the approved MoYuMaster style and provide seven video entries with a shared five-mode chooser, while routing existing modes without changing transparency implementations.

**Architecture:** A shared, immutable video-platform catalog is the single source of truth for platform labels, home URLs and window targets. `HomeView.vue` renders the approved dashboard and delegates every mode selection to a sender-restricted main-process launcher exposed through a narrow preload bridge. Unsupported later-phase combinations return a visible renderer error instead of crashing or opening the wrong window.

**Tech Stack:** Electron 31, Vue 3, Vue Router, Node.js `node:test`, electron-vite

---

## File map

- Create `src/shared/video-platforms.mjs`: platform order, labels, allowed roots and mode target resolution.
- Create `src/main/video-mode-launcher.mjs`: dependency-injected dispatcher for ad, opacity and chat targets.
- Create `src/renderer/src/components/VideoModeDialog.vue`: approved five-mode modal.
- Modify `src/main/index.js`: sender-restricted `video-mode:open` and recent-chat IPC handlers.
- Modify `src/preload/index.js`: expose `videoModeControl`.
- Modify `src/renderer/src/views/HomeView.vue`: approved dark dashboard and seven-entry video card.
- Create `tests/video-platforms.test.mjs`: catalog and target contract.
- Create `tests/video-mode-launcher.test.mjs`: dispatcher behavior and recent-platform fallback.
- Create `tests/home-video-entry.test.mjs`: home/modal wiring and protected transparency references.

## Task 1: Capture the current replica as the Git baseline

**Files:**
- Track: `.gitignore`
- Track: `docs/`
- Track: `electron.vite.config.mjs`
- Track: `package.json`
- Track: `package-lock.json`
- Track: `scripts/`
- Track: `src/`
- Track: `tests/`

- [ ] **Step 1: Confirm generated files remain ignored**

Run:

```powershell
git check-ignore -v node_modules out .artifacts .superpowers backups previews
```

Expected: every path is matched by `.gitignore`.

- [ ] **Step 2: Run the pre-change unit baseline**

Run:

```powershell
npm test
npm run build
```

Expected: all current tests pass and the production build exits with code 0.

- [ ] **Step 3: Record protected transparency hashes**

Run:

```powershell
Get-FileHash src/renderer/src/views/DouyinOpacityView.vue,src/renderer/src/views/VideoOpacityView.vue,src/renderer/src/features/video-opacity/controller.mjs,src/renderer/src/features/video-opacity/platforms.mjs,src/renderer/src/features/video-opacity/huya-window-fill.mjs -Algorithm SHA256 | Format-Table Path,Hash
```

Expected: five SHA256 values are copied into the execution log before editing.

- [ ] **Step 4: Create the baseline commit**

Run:

```powershell
git add .gitignore docs electron.vite.config.mjs package.json package-lock.json scripts src tests
git commit -m "chore: capture moyu replica baseline"
```

Expected: `git status --short` is empty.

## Task 2: Add the shared video-platform catalog

**Files:**
- Create: `src/shared/video-platforms.mjs`
- Create: `tests/video-platforms.test.mjs`

- [ ] **Step 1: Write the failing catalog tests**

Create `tests/video-platforms.test.mjs`:

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  VIDEO_PLATFORM_ORDER, VIDEO_MODE_ORDER, videoPlatform, resolveVideoMode
} from '../src/shared/video-platforms.mjs'

test('the approved five platforms and five modes have stable order', () => {
  assert.deepEqual(VIDEO_PLATFORM_ORDER, ['douyin','bilibili','huya','douyu','kuaishou'])
  assert.deepEqual(VIDEO_MODE_ORDER, ['ad','opacity','wechat','dingtalk','feishu'])
  assert.equal(new Set(VIDEO_PLATFORM_ORDER).size, 5)
})

test('each platform resolves ad, existing opacity and three chat targets', () => {
  for (const key of VIDEO_PLATFORM_ORDER) {
    const definition = videoPlatform(key)
    assert.ok(definition.label && definition.home.startsWith('https://'))
    assert.deepEqual(resolveVideoMode(key,'ad'), {kind:'ad',key})
    assert.deepEqual(resolveVideoMode(key,'opacity'), {kind:'opacity',key:definition.opacityKey})
    for (const skin of ['wechat','dingtalk','feishu']) {
      assert.deepEqual(resolveVideoMode(key,skin), {kind:'chat',platform:key,skin})
    }
  }
  assert.throws(() => videoPlatform('unknown'), /视频平台/)
  assert.throws(() => resolveVideoMode('douyin','excel'), /视频模式/)
})
```

- [ ] **Step 2: Run the tests to verify the module is missing**

Run:

```powershell
node --test tests/video-platforms.test.mjs
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `src/shared/video-platforms.mjs`.

- [ ] **Step 3: Implement the immutable catalog**

Create `src/shared/video-platforms.mjs`:

```js
const define = (key,label,home,host,opacityKey) => Object.freeze({
  key,label,home,hosts:Object.freeze([host]),opacityKey
})

export const VIDEO_PLATFORM_ORDER = Object.freeze([
  'douyin','bilibili','huya','douyu','kuaishou'
])

export const VIDEO_MODE_ORDER = Object.freeze([
  'ad','opacity','wechat','dingtalk','feishu'
])

export const VIDEO_PLATFORMS = Object.freeze({
  douyin:define('douyin','抖音','https://www.douyin.com/?recommend=1','douyin.com','douyinOpacity'),
  bilibili:define('bilibili','B站','https://www.bilibili.com/','bilibili.com','bilibiliOpacity'),
  huya:define('huya','虎牙','https://www.huya.com/','huya.com','huyaOpacity'),
  douyu:define('douyu','斗鱼','https://www.douyu.com/','douyu.com','douyuOpacity'),
  kuaishou:define('kuaishou','快手','https://www.kuaishou.com/','kuaishou.com','kuaishouOpacity')
})

export function videoPlatform(key) {
  const definition=VIDEO_PLATFORMS[key]
  if(!definition)throw new Error('不支持的视频平台')
  return definition
}

export function resolveVideoMode(platform,mode) {
  const definition=videoPlatform(platform)
  if(mode==='ad')return {kind:'ad',key:definition.key}
  if(mode==='opacity')return {kind:'opacity',key:definition.opacityKey}
  if(['wechat','dingtalk','feishu'].includes(mode))return {kind:'chat',platform:definition.key,skin:mode}
  throw new Error('不支持的视频模式')
}
```

- [ ] **Step 4: Run the focused and full unit tests**

Run:

```powershell
node --test tests/video-platforms.test.mjs
npm test
```

Expected: both commands pass.

- [ ] **Step 5: Commit the catalog**

Run:

```powershell
git add src/shared/video-platforms.mjs tests/video-platforms.test.mjs
git commit -m "feat: add shared video platform catalog"
```

## Task 3: Add a testable main-process mode launcher

**Files:**
- Create: `src/main/video-mode-launcher.mjs`
- Create: `tests/video-mode-launcher.test.mjs`

- [ ] **Step 1: Write failing dispatcher tests**

Create `tests/video-mode-launcher.test.mjs`:

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import {createVideoModeLauncher} from '../src/main/video-mode-launcher.mjs'

test('launcher delegates resolved targets and records successful chat platform only', () => {
  const calls=[],recent=new Map()
  const launcher=createVideoModeLauncher({
    openAd:key=>calls.push(['ad',key]),
    openOpacity:key=>calls.push(['opacity',key]),
    openChat:(platform,skin)=>calls.push(['chat',platform,skin]),
    readRecent:skin=>recent.get(skin),
    writeRecent:(skin,platform)=>recent.set(skin,platform)
  })
  launcher.open('douyin','ad')
  launcher.open('huya','opacity')
  launcher.open('bilibili','wechat')
  assert.deepEqual(calls,[['ad','douyin'],['opacity','huyaOpacity'],['chat','bilibili','wechat']])
  assert.equal(recent.get('wechat'),'bilibili')
  launcher.openRecentChat('wechat')
  assert.deepEqual(calls.at(-1),['chat','bilibili','wechat'])
})

test('recent chat defaults to douyin and failed opens do not overwrite recent state', () => {
  const writes=[]
  const launcher=createVideoModeLauncher({
    openAd:()=>{},openOpacity:()=>{},
    openChat:(platform)=>{if(platform==='huya')throw Error('尚未接入')},
    readRecent:()=>undefined,
    writeRecent:(...args)=>writes.push(args)
  })
  launcher.openRecentChat('feishu')
  assert.deepEqual(writes,[['feishu','douyin']])
  assert.throws(()=>launcher.open('huya','feishu'),/尚未接入/)
  assert.deepEqual(writes,[['feishu','douyin']])
})
```

- [ ] **Step 2: Verify failure before implementation**

Run:

```powershell
node --test tests/video-mode-launcher.test.mjs
```

Expected: FAIL because the launcher module does not exist.

- [ ] **Step 3: Implement the launcher**

Create `src/main/video-mode-launcher.mjs`:

```js
import {resolveVideoMode,videoPlatform} from '../shared/video-platforms.mjs'

export function createVideoModeLauncher({openAd,openOpacity,openChat,readRecent,writeRecent}) {
  function open(platform,mode) {
    const target=resolveVideoMode(platform,mode)
    if(target.kind==='ad')return openAd(target.key)
    if(target.kind==='opacity')return openOpacity(target.key)
    const result=openChat(target.platform,target.skin)
    writeRecent(target.skin,target.platform)
    return result
  }
  function openRecentChat(skin) {
    const candidate=readRecent(skin)||'douyin'
    const platform=videoPlatform(candidate).key
    const result=openChat(platform,skin)
    writeRecent(skin,platform)
    return result
  }
  return {open,openRecentChat}
}
```

- [ ] **Step 4: Run focused tests**

Run:

```powershell
node --test tests/video-mode-launcher.test.mjs
```

Expected: 2 tests pass.

- [ ] **Step 5: Commit the launcher**

Run:

```powershell
git add src/main/video-mode-launcher.mjs tests/video-mode-launcher.test.mjs
git commit -m "feat: add video mode dispatcher"
```

## Task 4: Wire the restricted IPC and preload bridge

**Files:**
- Modify: `src/main/index.js:22-61,422-503,862-877`
- Modify: `src/preload/index.js:1-47`
- Create: `tests/video-mode-entry.test.mjs`

- [ ] **Step 1: Write failing wiring assertions**

Create `tests/video-mode-entry.test.mjs`:

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8')

test('home has one restricted video-mode bridge instead of constructing routes', () => {
  const main=read('src/main/index.js'),preload=read('src/preload/index.js')
  assert.match(preload,/exposeInMainWorld\('videoModeControl'/)
  assert.match(preload,/ipcRenderer\.invoke\('video-mode:open'/)
  assert.match(main,/keyFromSender\(event\)!=='main'/)
  assert.match(main,/video-mode:open-recent-chat/)
  assert.match(main,/createVideoModeLauncher/)
})
```

- [ ] **Step 2: Run the wiring test and confirm failure**

Run:

```powershell
node --test tests/video-mode-entry.test.mjs
```

Expected: FAIL because `videoModeControl` and the new IPC handlers are absent.

- [ ] **Step 3: Add the main-process launcher instance**

In `src/main/index.js`, import `createVideoModeLauncher` and add a module variable:

```js
import { createVideoModeLauncher } from './video-mode-launcher.mjs'

let videoModeLauncher = null
```

After chat/ad/window controllers and the three existing chat services are created, initialize it with current capabilities:

```js
videoModeLauncher=createVideoModeLauncher({
  openAd:key=>{
    if(!Object.hasOwn(AD_MODES,key))throw new Error(`${key} 广告模式尚未接入`)
    return openSite(key)
  },
  openOpacity:key=>openSite(key),
  openChat:(platform,skin)=>{
    if(platform!=='douyin')throw new Error('该平台伪装模式尚未接入')
    const key={wechat:'wechat',dingtalk:'dingding',feishu:'feishu'}[skin]
    if(!key)throw new Error('不支持的伪装界面')
    return openSite(key)
  },
  readRecent:skin=>settings.get(`videoModes.lastPlatform.${skin}`),
  writeRecent:(skin,platform)=>settings.set(`videoModes.lastPlatform.${skin}`,platform)
})
```

The explicit errors are temporary capability boundaries between the three approved implementation plans; they are renderer-visible and are replaced by Plans 2 and 3.

- [ ] **Step 4: Register sender-restricted handlers**

Inside `registerIpc()` add:

```js
handle('video-mode:open',(event,platform,mode)=>{
  if(keyFromSender(event)!=='main')throw new Error('仅主窗口可打开视频模式')
  return videoModeLauncher.open(platform,mode),true
})
handle('video-mode:open-recent-chat',(event,skin)=>{
  if(keyFromSender(event)!=='main')throw new Error('仅主窗口可打开伪装模式')
  return videoModeLauncher.openRecentChat(skin),true
})
```

- [ ] **Step 5: Expose only the two home actions in preload**

Add to `src/preload/index.js`:

```js
contextBridge.exposeInMainWorld('videoModeControl', {
  open: (platform,mode) => ipcRenderer.invoke('video-mode:open',platform,mode),
  openRecentChat: skin => ipcRenderer.invoke('video-mode:open-recent-chat',skin)
})
```

- [ ] **Step 6: Run wiring and regression tests**

Run:

```powershell
node --test tests/video-mode-entry.test.mjs tests/chat-wiring.test.mjs tests/ad-modes.test.mjs
npm run build
```

Expected: all selected tests pass and the build succeeds.

- [ ] **Step 7: Commit IPC wiring**

Run:

```powershell
git add src/main/index.js src/preload/index.js tests/video-mode-entry.test.mjs
git commit -m "feat: expose video mode entry bridge"
```

## Task 5: Build the approved five-mode dialog

**Files:**
- Create: `src/renderer/src/components/VideoModeDialog.vue`
- Create: `tests/home-video-entry.test.mjs`

- [ ] **Step 1: Write the failing component contract test**

Create `tests/home-video-entry.test.mjs`:

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8')

test('mode dialog has approved order, full-width feishu and three close paths', () => {
  const source=read('src/renderer/src/components/VideoModeDialog.vue')
  const positions=['广告模式','透明度模式','微信模式','钉钉模式','飞书模式'].map(x=>source.indexOf(x))
  assert.ok(positions.every((value,index)=>value>0&&(index===0||value>positions[index-1])))
  assert.match(source,/class="mode-button feishu"/)
  assert.match(source,/@click\.self="emit\('close'\)"/)
  assert.match(source,/@keydown\.escape/)
  assert.match(source,/aria-label="关闭模式选择"/)
})
```

- [ ] **Step 2: Verify the missing component fails**

Run:

```powershell
node --test tests/home-video-entry.test.mjs
```

Expected: FAIL with `ENOENT` for `VideoModeDialog.vue`.

- [ ] **Step 3: Create the modal component**

Create `src/renderer/src/components/VideoModeDialog.vue`:

```vue
<template>
  <div class="mode-scrim" tabindex="-1" @click.self="emit('close')" @keydown.escape="emit('close')">
    <section class="mode-dialog" role="dialog" aria-modal="true" :aria-label="`选择${platform.label}模式`">
      <header><h2>选择{{platform.label}}模式</h2><button aria-label="关闭模式选择" @click="emit('close')">×</button></header>
      <div class="mode-grid">
        <button class="mode-button" @click="choose('ad')">广告模式</button>
        <button class="mode-button" @click="choose('opacity')">透明度模式</button>
        <button class="mode-button" @click="choose('wechat')">微信模式</button>
        <button class="mode-button" @click="choose('dingtalk')">钉钉模式</button>
        <button class="mode-button feishu" @click="choose('feishu')">飞书模式</button>
      </div>
    </section>
  </div>
</template>
<script setup>
import {onMounted,onBeforeUnmount} from 'vue'
defineProps({platform:{type:Object,required:true}})
const emit=defineEmits(['close','select'])
const choose=mode=>emit('select',mode)
const escape=event=>{if(event.key==='Escape')emit('close')}
onMounted(()=>document.addEventListener('keydown',escape))
onBeforeUnmount(()=>document.removeEventListener('keydown',escape))
</script>
<style scoped>
.mode-scrim{position:fixed;inset:0;z-index:100;background:#090a14b8;backdrop-filter:blur(5px);display:grid;place-items:center;padding:20px}
.mode-dialog{width:min(526px,100%);overflow:hidden;border:1px solid #555873;border-radius:20px;background:#2d2e45;color:#fff;box-shadow:0 30px 70px #050611a8}
header{height:90px;padding:0 30px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid #474961}h2{margin:0;font-size:24px}header button{border:0;background:none;color:#fff;font-size:31px;cursor:pointer}
.mode-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px;padding:30px}.mode-button{height:62px;border:1px solid #70738e;border-radius:13px;background:#46485d;color:#fff;font-size:18px;cursor:pointer}.mode-button:hover{background:#565970;border-color:#9fa7dc}.feishu{grid-column:1/-1;background:#424b67;border-color:#7588c8}
</style>
```

- [ ] **Step 4: Run the component test**

Run:

```powershell
node --test tests/home-video-entry.test.mjs
```

Expected: the dialog contract test passes.

- [ ] **Step 5: Commit the modal**

Run:

```powershell
git add src/renderer/src/components/VideoModeDialog.vue tests/home-video-entry.test.mjs
git commit -m "feat: add five mode chooser dialog"
```

## Task 6: Replace the home page with the approved dashboard

**Files:**
- Modify: `src/renderer/src/views/HomeView.vue:1-192`
- Modify: `tests/home-video-entry.test.mjs`
- Modify: `tests/home-errors.test.mjs`

- [ ] **Step 1: Extend the failing home contract**

Append to `tests/home-video-entry.test.mjs`:

```js
test('home renders seven video entries and opens the shared dialog', () => {
  const source=read('src/renderer/src/views/HomeView.vue')
  for(const label of ['抖音模式','B站模式','虎牙模式','斗鱼模式','快手模式','自定义网站模式','本地视频播放'])assert.match(source,new RegExp(label))
  assert.match(source,/VideoModeDialog/)
  assert.match(source,/videoModeControl\.open/)
  assert.match(source,/videoModeControl\.openRecentChat/)
  assert.match(source,/role="alert"/)
  assert.doesNotMatch(source,/抖音透明化|B站透明化|虎牙透明化|快手透明化/)
})
```

- [ ] **Step 2: Run the home test and confirm failure**

Run:

```powershell
node --test tests/home-video-entry.test.mjs
```

Expected: FAIL because `HomeView.vue` still contains the old flat tile list.

- [ ] **Step 3: Replace the template with six source-style cards**

Use this structure in `HomeView.vue`; retain the existing `appError`, shortcut-status listener, `logout()` and `clearCache()` behavior:

```vue
<template>
  <div class="home">
    <header class="top"><div class="logo">MoYuMaster <span>🐟</span></div><button class="logout" @click="logout">退出登录</button></header>
    <div v-if="appError" class="app-error" role="alert">{{appError}}</div>
    <main class="dashboard">
      <section class="group"><h3>阅读模式</h3><div class="grid"><button @click="open('weRead')">微信读书</button><button @click="open('fanQue')">番茄小说</button><button @click="open('jinJiang')">晋江文学城</button><button @click="go('/bookReader')">本地阅读模式</button></div></section>
      <section class="group"><h3>网页模式</h3><div class="grid"><button @click="open('web')">网页端</button><button @click="open('zhihu')">知乎模式</button></div></section>
      <section class="group"><h3>视频模式</h3><div class="grid video-grid"><button v-for="item in videoEntries" :key="item.key" @click="choosePlatform(item.key)">{{item.label}}模式</button><button @click="open('customWebpage')">自定义网站模式</button><button class="wide" @click="open('localVideo')">本地视频播放</button></div></section>
      <section class="group"><h3>游戏模式</h3><div class="grid"><button @click="open('standaloneGame')">单机模式</button></div></section>
      <section class="group"><h3>伪装模式</h3><div class="grid"><button @click="openRecentChat('wechat')">微信模式</button><button @click="openRecentChat('dingtalk')">钉钉模式</button><button @click="openRecentChat('feishu')">飞书模式</button></div></section>
      <section class="group"><h3>系统设置</h3><div class="grid"><button @click="go('/userInfo')">个人中心</button><button @click="go('/keyword')">快捷键设置</button><button @click="clearCache">清除缓存</button><button @click="showUnavailable('操作指南')">操作指南</button><button @click="showUnavailable('联系客服')">联系客服</button></div></section>
    </main>
    <button class="ad-cover-entry" @click="showUnavailable('广告遮挡')">广告遮挡 →</button>
    <VideoModeDialog v-if="selectedPlatform" :platform="selectedPlatform" @close="selectedKey=''" @select="openSelectedMode"/>
  </div>
</template>
```

- [ ] **Step 4: Use the shared catalog and generic bridge**

At the top of `<script setup>`, add:

```js
import VideoModeDialog from '../components/VideoModeDialog.vue'
import {VIDEO_PLATFORM_ORDER,VIDEO_PLATFORMS} from '../../../shared/video-platforms.mjs'
```

Add the following state and actions while preserving existing non-video `open()` calls:

```js
const selectedKey=ref('')
const videoEntries=VIDEO_PLATFORM_ORDER.map(key=>VIDEO_PLATFORMS[key])
const selectedPlatform=computed(()=>selectedKey.value?VIDEO_PLATFORMS[selectedKey.value]:null)
function choosePlatform(key){appError.value='';selectedKey.value=key}
async function openSelectedMode(mode){
  const platform=selectedKey.value
  selectedKey.value=''
  try{await window.videoModeControl.open(platform,mode)}catch(error){appError.value=error.message}
}
async function openRecentChat(skin){
  try{await window.videoModeControl.openRecentChat(skin)}catch(error){appError.value=error.message}
}
function showUnavailable(name){appError.value=`${name}入口已保留，当前版本未连接对应服务。`}
```

Import `computed` from Vue alongside the existing lifecycle functions.

- [ ] **Step 5: Apply the approved visual system**

Replace the scoped style with these layout rules, keeping the error bar visible above cards:

```css
.home{height:100%;overflow:auto;color:#f7f8ff;background:radial-gradient(circle at 50% 0,#292b4b 0,#20223e 38%,#191a31 100%);font-family:"Microsoft YaHei",sans-serif}
.top{height:118px;display:flex;align-items:center;justify-content:center;position:relative}.logo{font-size:50px;font-weight:800;letter-spacing:1px;text-shadow:0 4px 20px #0008}.logo span{font-size:40px;margin-left:14px}.logout{position:absolute;right:28px;top:28px;border:0;background:none;color:#fff;font-size:15px;cursor:pointer}
.app-error{margin:0 30px 14px;padding:10px 14px;border:1px solid #d6b76a;border-radius:8px;background:#fff3cd;color:#664d03}
.dashboard{padding:0 30px;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:24px}.group{min-height:242px;padding:22px 24px;border:1px solid #4b4d69;border-radius:15px;background:#35364d;box-shadow:0 16px 30px #0c0d1b33}.group h3{margin:0 0 17px;padding-bottom:9px;border-bottom:1px solid #50516b;color:#9db5ff;font-size:24px}.grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}.grid button{min-height:58px;border:1px solid transparent;border-radius:12px;background:#5b5c73;color:#fff;font-size:17px;cursor:pointer}.grid button:hover{background:#6b6d88;border-color:#a6aeec}.grid .wide{grid-column:1/-1}.ad-cover-entry{display:block;margin:32px auto;border:0;background:none;color:#4f9aff;font-size:17px;cursor:pointer}@media(max-width:900px){.dashboard{grid-template-columns:1fr 1fr}.logo{font-size:38px}}@media(max-width:620px){.dashboard{grid-template-columns:1fr}.top{height:96px}}
```

- [ ] **Step 6: Update the home error unit harness**

In `tests/home-errors.test.mjs`, extend the VM context with the exact imported values removed by its import-stripping harness:

```js
computed:read=>({get value(){return read()}}),
VIDEO_PLATFORM_ORDER:['douyin','bilibili','huya','douyu','kuaishou'],
VIDEO_PLATFORMS:{
  douyin:{key:'douyin',label:'抖音'},bilibili:{key:'bilibili',label:'B站'},
  huya:{key:'huya',label:'虎牙'},douyu:{key:'douyu',label:'斗鱼'},kuaishou:{key:'kuaishou',label:'快手'}
},
window:{
  homeElectronAPI:{},
  videoModeControl:{open:async()=>{},openRecentChat:async()=>{}},
  ipcRenderer:{invoke:async()=>({success:false,errors:[{message:'Ctrl+D 已被占用'}]})},
  windowControl:{onError:()=>()=>{disposed=true}}
}
```

Retain the current `ref`, `useRouter`, `onMounted`, `onUnmounted`, `mount`, `unmount`, `disposed` and `appError` assertions unchanged around this expanded context.

- [ ] **Step 7: Run home, unit and build verification**

Run:

```powershell
node --test tests/home-video-entry.test.mjs tests/home-errors.test.mjs tests/video-mode-entry.test.mjs
npm test
npm run build
```

Expected: all commands pass.

- [ ] **Step 8: Commit the home redesign**

Run:

```powershell
git add src/renderer/src/views/HomeView.vue tests/home-video-entry.test.mjs tests/home-errors.test.mjs
git commit -m "feat: rebuild home video mode entry"
```

## Task 7: Electron smoke and transparency protection checkpoint

**Files:**
- Modify: `scripts/window-smoke.cjs`

- [ ] **Step 1: Add a home-entry smoke check**

After the home window is ready in `scripts/window-smoke.cjs`, add:

```js
await check('home exposes seven video entries and five-mode chooser',async()=>{
  assert.equal(await evaluate(home,'document.querySelectorAll(".video-grid button").length'),7)
  await evaluate(home,'[...document.querySelectorAll(".video-grid button")].find(x=>x.textContent.includes("抖音")).click()')
  await until(()=>evaluate(home,'Boolean(document.querySelector("[role=dialog]"))'),'video mode dialog')
  assert.deepEqual(await evaluate(home,'[...document.querySelectorAll(".mode-button")].map(x=>x.textContent.trim())'),['广告模式','透明度模式','微信模式','钉钉模式','飞书模式'])
  await evaluate(home,'document.querySelector("[aria-label=关闭模式选择]").click()')
})
```

- [ ] **Step 2: Run production smoke**

Run:

```powershell
npm run build
npm run test:smoke
```

Expected: both smoke passes complete with isolated data and no remote requests.

- [ ] **Step 3: Recalculate protected hashes**

Run the same `Get-FileHash` command from Task 1.

Expected: every transparency hash is byte-for-byte identical to the baseline log.

- [ ] **Step 4: Commit the smoke coverage**

Run:

```powershell
git add scripts/window-smoke.cjs
git commit -m "test: cover home video mode chooser"
```

## Plan 1 completion checkpoint

Run:

```powershell
npm test
npm run build
npm run test:smoke
git status --short
```

Expected: tests/build/smoke pass and the worktree is clean. At this checkpoint all seven video entries and five buttons are visible; existing opacity and Douyin chat/ad modes work, while combinations intentionally owned by Plans 2 and 3 fail safely in the home error bar until those plans are executed.
