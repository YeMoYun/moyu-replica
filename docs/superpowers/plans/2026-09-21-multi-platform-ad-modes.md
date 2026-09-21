# Multi-Platform Advertisement Modes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give B站、虎牙、斗鱼、快手 the same compact, directly interactive advertisement mode already approved for Douyin, including back, refresh/retry, expand, transparent-mode transfer and safe close behavior.

**Architecture:** Extend the existing `AD_MODES` registry from two entries to the five video platforms plus WeRead. `VideoAdView.vue`, `use-ad-page.mjs` and the controller stay shared; the route metadata supplies the platform key, and the main process derives authority from the actual advertisement window key. Existing transparency windows are only opened through their current keys and are never edited.

**Tech Stack:** Electron 31 BrowserWindow/webview, Vue 3, Node.js `node:test`, isolated Electron smoke fixtures

---

## Dependencies and file map

Execute `2026-09-21-video-mode-home-entry.md` first so `src/shared/video-platforms.mjs` and the generic home launcher exist.

- Modify `src/shared/ad-modes.mjs`: five video advertisement definitions and platform-aware URL validation.
- Modify `src/renderer/src/router/index.js`: route all five advertisement paths to `VideoAdView.vue`.
- Modify `src/main/window-definitions.mjs`: compact advertisement windows, including new Kuaishou route.
- Modify `src/main/index.js`: let the generic launcher open every registered video ad.
- Modify `src/renderer/src/views/VideoAdView.vue`: derive platform from route metadata.
- Modify `src/renderer/src/features/ad-modes/controller.mjs`: treat all video definitions as video ads.
- Modify `src/renderer/src/features/ad-modes/use-ad-page.mjs`: forward global video shortcuts for all video ads.
- Modify `tests/ad-modes.test.mjs`: registry, validation, controller and routing tests.
- Modify `tests/window-definitions.test.mjs`: compact window expectations.
- Modify `scripts/ad-modes-smoke.cjs`: isolated five-platform advertisement smoke.

## Task 1: Expand advertisement definitions and URL validation

**Files:**
- Modify: `src/shared/ad-modes.mjs:1-25`
- Modify: `tests/ad-modes.test.mjs:1-24`

- [ ] **Step 1: Replace the old rejection assertion with a five-platform contract**

In `tests/ad-modes.test.mjs`, import `VIDEO_PLATFORM_ORDER` and replace the assertion that Huya is unsupported with:

```js
test('all approved video ads have compact defaults and existing transparency targets', async () => {
  const {AD_MODES,normalizeAdSettings}=await shared()
  const {VIDEO_PLATFORM_ORDER,videoPlatform}=await import('../src/shared/video-platforms.mjs')
  for(const key of VIDEO_PLATFORM_ORDER){
    assert.equal(AD_MODES[key].home,videoPlatform(key).home)
    assert.equal(AD_MODES[key].transparentKey,videoPlatform(key).opacityKey)
    assert.equal(normalizeAdSettings(key,{}).zoom,.2)
  }
  assert.equal(normalizeAdSettings('weReadAd',{}).zoom,.7)
})

test('video ad URLs accept own official hosts and reject cross-site hosts',async()=>{
  const {validateAdUrl}=await shared()
  const cases={douyin:'https://www.douyin.com/video/1',bilibili:'https://www.bilibili.com/video/BV1',huya:'https://www.huya.com/123',douyu:'https://www.douyu.com/456',kuaishou:'https://www.kuaishou.com/short-video/789'}
  for(const [kind,url] of Object.entries(cases)){
    assert.equal(validateAdUrl(kind,url),url)
    assert.throws(()=>validateAdUrl(kind,'https://example.com/video/1'))
    assert.throws(()=>validateAdUrl(kind,url.replace('https://','https://user:pass@')))
  }
})
```

- [ ] **Step 2: Run the focused test and confirm failure**

Run:

```powershell
node --test tests/ad-modes.test.mjs
```

Expected: FAIL because `AD_MODES` lacks four platforms.

- [ ] **Step 3: Generate video ad definitions from the shared catalog**

Replace the top of `src/shared/ad-modes.mjs` with:

```js
import {VIDEO_PLATFORM_ORDER,videoPlatform} from './video-platforms.mjs'

const videoModes=Object.fromEntries(VIDEO_PLATFORM_ORDER.map(key=>{
  const platform=videoPlatform(key)
  return [key,Object.freeze({
    home:platform.home,
    hosts:platform.hosts,
    transparentKey:platform.opacityKey,
    width:286,
    height:420,
    type:'video'
  })]
}))

export const AD_MODES = Object.freeze({
  ...videoModes,
  weReadAd:Object.freeze({
    home:'https://weread.qq.com/',hosts:Object.freeze(['weread.qq.com']),
    transparentKey:'weRead',width:351,height:430,type:'reading'
  })
})
```

Replace domain selection inside `validateAdUrl()` with the definition's host list:

```js
const definition=mode(kind)
const allowed=definition.hosts.some(host=>url.hostname===host||url.hostname.endsWith('.'+host))
if(!['https:','http:'].includes(url.protocol)||url.username||url.password||!allowed)throw Error('只能打开此应用的 HTTP(S) 网页')
```

Use `mode(kind).type==='reading'` instead of `kind==='weReadAd'` in `normalizeAdSettings()`.

- [ ] **Step 4: Run focused and full unit tests**

Run:

```powershell
node --test tests/ad-modes.test.mjs tests/video-platforms.test.mjs
npm test
```

Expected: all tests pass.

- [ ] **Step 5: Commit registry changes**

Run:

```powershell
git add src/shared/ad-modes.mjs tests/ad-modes.test.mjs
git commit -m "feat: register five video advertisement modes"
```

## Task 2: Route every video advertisement to the dedicated view

**Files:**
- Modify: `src/renderer/src/router/index.js:18-46`
- Modify: `src/main/window-definitions.mjs:1-38`
- Modify: `tests/ad-modes.test.mjs`
- Modify: `tests/window-definitions.test.mjs`

- [ ] **Step 1: Add failing route and window assertions**

Append to `tests/ad-modes.test.mjs`:

```js
test('all five advertisement routes use the dedicated compact video view',()=>{
  const router=readFileSync(new URL('../src/renderer/src/router/index.js',import.meta.url),'utf8')
  for(const path of ['douyin','bilibili','huya','douyu','kuaishou']){
    assert.match(router,new RegExp(`path: '/${path}'.*VideoAdView\\.vue`))
  }
  assert.match(router,/path: '\/douyuOpacity'.*SiteView\.vue/)
})
```

Append to `tests/window-definitions.test.mjs`:

```js
test('all video advertisement windows use compact always-on-top bounds',async()=>{
  const {SITE_ROUTES}=await import('../src/main/window-definitions.mjs')
  for(const key of ['douyin','bilibili','huya','douyu','kuaishou']){
    assert.equal(SITE_ROUTES[key].width,286)
    assert.equal(SITE_ROUTES[key].height,420)
    assert.equal(SITE_ROUTES[key].alwaysOnTop,true)
    assert.equal(SITE_ROUTES[key].rightBottom,true)
  }
})
```

- [ ] **Step 2: Run tests and confirm current B站/虎牙/斗鱼 wiring fails**

Run:

```powershell
node --test tests/ad-modes.test.mjs tests/window-definitions.test.mjs
```

Expected: FAIL for routes that still use `SiteView.vue`, missing Kuaishou ad and B站's large window.

- [ ] **Step 3: Update router entries**

Use these five ad routes in `src/renderer/src/router/index.js`, leaving every opacity route unchanged:

```js
{ path: '/douyin', name: 'Douyin', component: () => import('../views/VideoAdView.vue'), meta: { site: 'douyin', mode: 'ad' } },
{ path: '/bilibili', name: 'Bilibili', component: () => import('../views/VideoAdView.vue'), meta: { site: 'bilibili', mode: 'ad' } },
{ path: '/huya', name: 'Huya', component: () => import('../views/VideoAdView.vue'), meta: { site: 'huya', mode: 'ad' } },
{ path: '/douyu', name: 'Douyu', component: () => import('../views/VideoAdView.vue'), meta: { site: 'douyu', mode: 'ad' } },
{ path: '/kuaishou', name: 'Kuaishou', component: () => import('../views/VideoAdView.vue'), meta: { site: 'kuaishou', mode: 'ad' } },
```

- [ ] **Step 4: Use compact definitions for all five ad windows**

In `src/main/window-definitions.mjs`, define:

```js
douyin: definition('/douyin',286,420,smallAd),
bilibili: definition('/bilibili',286,420,smallAd),
huya: definition('/huya',286,420,smallAd),
douyu: definition('/douyu',286,420,smallAd),
kuaishou: definition('/kuaishou',286,420,smallAd),
```

Do not edit `douyinOpacity`, `bilibiliOpacity`, `huyaOpacity`, `douyuOpacity` or `kuaishouOpacity` definitions.

- [ ] **Step 5: Run tests and build**

Run:

```powershell
node --test tests/ad-modes.test.mjs tests/window-definitions.test.mjs
npm run build
```

Expected: tests and build pass.

- [ ] **Step 6: Commit route and window changes**

Run:

```powershell
git add src/renderer/src/router/index.js src/main/window-definitions.mjs tests/ad-modes.test.mjs tests/window-definitions.test.mjs
git commit -m "feat: route video ads through compact view"
```

## Task 3: Parameterize the shared advertisement view

**Files:**
- Modify: `src/renderer/src/views/VideoAdView.vue:1-53`
- Modify: `src/renderer/src/features/ad-modes/controller.mjs:1-39`
- Modify: `src/renderer/src/features/ad-modes/use-ad-page.mjs:1-34`
- Modify: `tests/ad-modes.test.mjs`

- [ ] **Step 1: Write failing dynamic-platform assertions**

Append to `tests/ad-modes.test.mjs`:

```js
test('video advertisement view derives kind from trusted route metadata',()=>{
  const view=readFileSync(new URL('../src/renderer/src/views/VideoAdView.vue',import.meta.url),'utf8')
  assert.match(view,/useRoute/)
  assert.match(view,/route\.meta\.site/)
  assert.doesNotMatch(view,/useAdPage\('douyin'\)/)
})

test('shared controller prepares and controls every video ad kind',async()=>{
  const {createAdPageController}=await import('../src/renderer/src/features/ad-modes/controller.mjs')
  const {videoPlatform}=await import('../src/shared/video-platforms.mjs')
  for(const kind of ['douyin','bilibili','huya','douyu','kuaishou']){
    const home=videoPlatform(kind).home
    const scripts=[]
    const view={setZoomFactor:async()=>{},insertCSS:async()=> 'css',removeInsertedCSS:async()=>{},getURL:()=>home,canGoBack:()=>false,executeJavaScript:async code=>{scripts.push(code);return true}}
    const page=createAdPageController({kind,getWebview:()=>view,api:{getSettings:async()=>({}),saveSettings:async()=>({})}})
    await page.load();await page.domReady();await page.action('play')
    assert.ok(scripts.some(code=>code.includes('querySelectorAll'))) 
  }
})
```

- [ ] **Step 2: Run the focused tests and confirm hardcoded Douyin behavior fails**

Run:

```powershell
node --test tests/ad-modes.test.mjs
```

Expected: FAIL because the view calls `useAdPage('douyin')` and other kinds reject video actions.

- [ ] **Step 3: Derive the kind from route metadata**

In `VideoAdView.vue`:

```js
import {useRoute} from 'vue-router'
import {videoPlatform} from '../../../shared/video-platforms.mjs'

const route=useRoute()
const kind=String(route.meta.site||'')
const platform=videoPlatform(kind)
const {api,wv,initialized,initialAddress,error,pending,state,native,perform,domReady,navigation,failed,update,action,toTransparent}=useAdPage(kind)
```

Use `platform.label` in the ad detail copy where a platform name is helpful; keep all approved controls and CSS unchanged.

- [ ] **Step 4: Generalize video behavior without editing transparency scripts**

In `controller.mjs`, add:

```js
const isVideo=kind!=='weReadAd'
```

Then replace Douyin-only branches as follows:

```js
await c.view.setZoomFactor(state.expanded&&isVideo?.6:state.zoom)
if(isVideo)await c.script(prepareAdVideo)
```

For the action table, keep using the already-tested serialized functions but permit them for every video ad:

```js
if(!isVideo||!fn)throw Error('不支持的广告操作')
return fn()
```

Use `isVideo` to select `cleanupAdPage` during disposal. Do not edit `src/renderer/src/features/douyin/page-scripts.mjs`.

- [ ] **Step 5: Forward shortcuts for every video ad**

In `use-ad-page.mjs`, replace `if(kind==='douyin')` with:

```js
if(kind!=='weReadAd')for(const [channel,name] of [
  ['all-prev','prev'],['all-next','next'],['all-screen','fullscreen'],['all-like','like']
])subscriptions.push(window.ipcRenderer.on(channel,()=>action(name)))
```

- [ ] **Step 6: Run focused, full and build verification**

Run:

```powershell
node --test tests/ad-modes.test.mjs
npm test
npm run build
```

Expected: all commands pass and Douyin/WeRead regression tests remain green.

- [ ] **Step 7: Commit the shared view/controller change**

Run:

```powershell
git add src/renderer/src/views/VideoAdView.vue src/renderer/src/features/ad-modes/controller.mjs src/renderer/src/features/ad-modes/use-ad-page.mjs tests/ad-modes.test.mjs
git commit -m "feat: parameterize compact video advertisement view"
```

## Task 4: Enable the home launcher for all registered ads

**Files:**
- Modify: `src/main/index.js` at `videoModeLauncher` initialization
- Modify: `tests/video-mode-launcher.test.mjs`

- [ ] **Step 1: Add a source-level integration assertion**

Append to `tests/video-mode-launcher.test.mjs`:

```js
test('main launcher accepts every registered advertisement key',async()=>{
  const {readFileSync}=await import('node:fs')
  const source=readFileSync(new URL('../src/main/index.js',import.meta.url),'utf8')
  assert.doesNotMatch(source,/广告模式尚未接入/)
  assert.match(source,/Object\.hasOwn\(AD_MODES,key\)/)
})
```

- [ ] **Step 2: Run and confirm the temporary capability error is detected**

Run:

```powershell
node --test tests/video-mode-launcher.test.mjs
```

Expected: FAIL while the Plan 1 temporary error text remains.

- [ ] **Step 3: Replace the temporary ad branch**

Use:

```js
openAd:key=>{
  if(!Object.hasOwn(AD_MODES,key))throw new Error('不支持的广告模式')
  return openSite(key)
},
```

- [ ] **Step 4: Run integration tests and commit**

Run:

```powershell
node --test tests/video-mode-launcher.test.mjs tests/video-mode-entry.test.mjs tests/ad-modes.test.mjs
git add src/main/index.js tests/video-mode-launcher.test.mjs
git commit -m "feat: enable five advertisement entry targets"
```

Expected: selected tests pass and the commit succeeds.

## Task 5: Expand isolated Electron advertisement smoke

**Files:**
- Modify: `scripts/ad-modes-smoke.cjs`
- Modify: `tests/fixtures/web/ad-modes/video.html` only if the existing fixture lacks a selector needed by a platform action

- [ ] **Step 1: Intercept all five official hosts with the local video fixture**

Replace the two-way protocol selection with:

```js
const videoHosts=new Set(['www.douyin.com','www.bilibili.com','www.huya.com','www.douyu.com','www.kuaishou.com'])
await session.defaultSession.protocol.handle('https',request=>{
  const host=new URL(request.url).hostname
  return new Response(host==='weread.qq.com'?reading:video,{headers:{'Content-Type':'text/html; charset=utf-8'}})
})
```

- [ ] **Step 2: Iterate all five video kinds plus WeRead**

Use:

```js
for(const kind of ['douyin','bilibili','huya','douyu','kuaishou','weReadAd']){
  const isVideo=kind!=='weReadAd'
```

For video kinds, obtain the official test URL from this map:

```js
const urls={
  douyin:'https://www.douyin.com/video/123',
  bilibili:'https://www.bilibili.com/video/BV1',
  huya:'https://www.huya.com/123',
  douyu:'https://www.douyu.com/456',
  kuaishou:'https://www.kuaishou.com/short-video/789',
  weReadAd:'https://weread.qq.com/web/reader/123'
}
```

Replace every two-kind URL expression with `const url=urls[kind]`. In the restore-only branch assert `guest.getURL()===url`; check `skin===1` only for Douyin and keep the reading text/zoom/speed/color assertions only for WeRead.

Change the behavior branches to this exact nesting:

```js
if(isVideo){
  await check(kind+' back control returns to the previous guest page',async()=>{
    const nextUrl=new URL('/moyu-next',url).href
    await evaluate(w,`document.querySelector('webview').loadURL(${JSON.stringify(nextUrl)})`);await ready(w)
    assert.equal(guest.getURL(),nextUrl);await click(w,'back');await until(()=>guest.getURL()===url,kind+' history back');await ready(w)
  })
  await check(kind+' compact guest remains directly clickable',async()=>{
    assert.equal(await evaluate(w,'Boolean(document.querySelector(".click-mask"))'),false)
    assert.ok(Math.abs(await guest.executeJavaScript('document.querySelector(".xgplayer").getBoundingClientRect().width-innerWidth'))<=1)
  })
  if(kind==='douyin'){
    await check('douyin ad content and skin preserve the live guest',async()=>{
      await evaluate(w,"document.querySelector('.ad-copy').click()");await until(()=>evaluate(w,'Boolean(document.querySelector("[role=dialog]"))'),'details')
      await click(w,'close-details');await click(w,'skin');await ready(w)
      assert.equal((await evaluate(w,'window.adModeControl.getSettings()')).skin,1)
      assert.equal(await evaluate(w,'document.querySelector("webview").getWebContentsId()'),guest.id)
    })
    await check('douyin expanded window and global shortcuts reach the guest',async()=>{
      const smallBounds=w.getBounds();await click(w,'expand');await ready(w)
      assert.ok(w.getBounds().width>500);assert.ok(Math.abs(guest.getZoomFactor()-.6)<.01)
      for(const [channel,data] of [['all-prev','prev'],['all-next','next'],['all-screen','fullscreen'],['all-like','liked']]){
        w.webContents.send(channel);await until(()=>guest.executeJavaScript(`document.body.dataset.${data}==='yes'`),channel)
      }
      w.webContents.send('stop-or-continue');await until(()=>guest.executeJavaScript('document.querySelector("video").paused'),'paused')
      w.webContents.send('stop-or-continue');await until(()=>guest.executeJavaScript('!document.querySelector("video").paused'),'playing')
      await click(w,'expand');await until(()=>Math.abs(w.getBounds().width-smallBounds.width)<=4,'small bounds');await ready(w)
    })
  }
}else{
  await check('reading settings update the guest without transparency writes',async()=>{
    await click(w,'settings');await until(()=>evaluate(w,'Boolean(document.querySelector("[data-setting=zoom]"))'),'settings')
    await input(w,'zoom',.85);await input(w,'speed',4);await input(w,'text','学历提升测试','change');await ready(w)
    assert.ok(Math.abs(guest.getZoomFactor()-.85)<.01);await click(w,'scrollbar');await ready(w);await click(w,'scrollbar');await ready(w)
    await evaluate(w,"const i=document.querySelector('[data-setting=auto-scroll]');i.checked=true;i.dispatchEvent(new Event('change',{bubbles:true}))");await ready(w)
    await until(()=>guest.executeJavaScript('scrollY>1'),'reading scrolling');await click(w,'close-settings');await click(w,'color');await ready(w)
    assert.equal(await evaluate(w,"window.settingApi.getSetting('weRead.zoom')"),undefined)
  })
  await check('reading controls remain genuine site controls',async()=>{
    await click(w,'reader-controls');await until(()=>guest.executeJavaScript('Boolean(document.getElementById("__wr-ctrl-float__"))'),'reader controls')
    await guest.executeJavaScript('document.querySelector(".readerControls button").click()')
    assert.equal(await guest.executeJavaScript('document.body.dataset.controlClicked'),'目录');await click(w,'reader-controls');await ready(w)
  })
}
```

The common compact-control, navigation persistence, boss-cover, close/reopen and transparency-transfer blocks remain outside this branch and therefore run for all six kinds.

Run the compact-control, direct-clickability, back, boss-cover, close/reopen and transparent-transfer checks for every video kind. Keep the deeper selector/shortcut assertions for Douyin as the baseline.

- [ ] **Step 3: Map each video ad to its unchanged transparency route**

Use:

```js
const transparentRoutes={douyin:'/douyinOpacity',bilibili:'/bilibiliOpacity',huya:'/huyaOpacity',douyu:'/douyuOpacity',kuaishou:'/kuaishouOpacity',weReadAd:'/weRead'}
```

Assert that the target webview receives the current URL and the ad window closes only after that succeeds.

- [ ] **Step 4: Run isolated advertisement smoke twice**

Run:

```powershell
npm run build
npm run test:ad-modes
```

Expected: first-run and restore-only processes pass for six advertisement kinds; user settings are not read.

- [ ] **Step 5: Re-run transparency suites and hash guard**

Run:

```powershell
npm run test:douyin-opacity
npm run test:video-opacity
Get-FileHash src/renderer/src/views/DouyinOpacityView.vue,src/renderer/src/views/VideoOpacityView.vue,src/renderer/src/features/video-opacity/controller.mjs,src/renderer/src/features/video-opacity/platforms.mjs,src/renderer/src/features/video-opacity/huya-window-fill.mjs -Algorithm SHA256 | Format-Table Path,Hash
```

Expected: both suites pass and every protected hash matches Plan 1's baseline.

- [ ] **Step 6: Commit the smoke matrix**

Run:

```powershell
git add scripts/ad-modes-smoke.cjs tests/fixtures/web/ad-modes/video.html
git commit -m "test: cover five compact advertisement modes"
```

## Plan 2 completion checkpoint

Run:

```powershell
npm test
npm run build
npm run test:ad-modes
npm run test:douyin-opacity
npm run test:video-opacity
git status --short
```

Expected: all tests pass, the worktree is clean, all five advertisement buttons open compact directly interactive windows, and transparency implementation hashes remain unchanged.
