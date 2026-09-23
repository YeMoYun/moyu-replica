# New Window Center and Present Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every newly created feature window retain only its prior width and height, open centered on the active display with default appearance, and appear temporarily in the foreground.

**Architecture:** Add one main-process helper that owns display selection, centered-bound calculation, per-window-kind appearance reset, and temporary foreground presentation. Wire it into `openRoute` after all legacy placement/restoration logic, while keeping existing controller persistence and already-open-window behavior intact.

**Tech Stack:** Electron 31, JavaScript ES modules, Node.js built-in test runner, existing Electron smoke harness

---

## File Structure

- Create `src/main/window-opening.mjs`: pure/testable calculations plus the small BrowserWindow presentation and appearance-reset operations.
- Create `tests/window-opening.test.mjs`: unit tests for multi-display centering, ordinary/ad/chat reset behavior, foreground presentation, and main-process wiring.
- Modify `src/main/index.js`: normalize only newly created feature windows and use the shared foreground presenter for new and existing windows.
- Modify `scripts/window-smoke.cjs`: replace the obsolete state-restoration expectation and exercise real ordinary, advertisement, and chat windows.

### Task 1: Define the centered-opening contract

**Files:**
- Create: `tests/window-opening.test.mjs`
- Create: `src/main/window-opening.mjs`

- [x] **Step 1: Write failing unit tests for centering, state reset, and temporary foreground presentation**

Create `tests/window-opening.test.mjs` with:

```js
import test from 'node:test'
import assert from 'node:assert/strict'

let opening={}
try{opening=await import('../src/main/window-opening.mjs')}catch(error){if(error.code!=='ERR_MODULE_NOT_FOUND')throw error}

function fakeWindow(bounds={x:50,y:60,width:800,height:600}){
  const calls=[]
  let value={...bounds},destroyed=false,minimized=false
  return {
    calls,
    getBounds:()=>({...value}),
    setBounds:next=>{value={...next};calls.push(['bounds',next])},
    setOpacity:value=>calls.push(['opacity',value]),
    setAlwaysOnTop:value=>calls.push(['topmost',value]),
    isDestroyed:()=>destroyed,
    isMinimized:()=>minimized,
    restore:()=>calls.push(['restore']),
    show:()=>calls.push(['show']),
    moveTop:()=>calls.push(['moveTop']),
    focus:()=>calls.push(['focus']),
    set destroyed(value){destroyed=value},
    set minimized(value){minimized=value}
  }
}
const second={workArea:{x:1920,y:40,width:1280,height:720}}
const screen={
  getCursorScreenPoint:()=>({x:2300,y:300}),
  getDisplayNearestPoint:point=>{assert.deepEqual(point,{x:2300,y:300});return second},
  getPrimaryDisplay:()=>({workArea:{x:0,y:0,width:1920,height:1040}})
}

test('centered opening keeps size and uses the display nearest the cursor',()=>{
  assert.equal(typeof opening.centerWindowOnActiveDisplay,'function')
  const win=fakeWindow({x:-900,y:-700,width:900,height:600})
  assert.deepEqual(opening.centerWindowOnActiveDisplay(win,screen),{x:2110,y:100,width:900,height:600})
  assert.deepEqual(win.getBounds(),{x:2110,y:100,width:900,height:600})
})

test('oversized windows are clamped before centering and primary display is a safe fallback',()=>{
  const win=fakeWindow({x:0,y:0,width:2500,height:1200})
  const fallback={getPrimaryDisplay:screen.getPrimaryDisplay}
  assert.deepEqual(opening.centerWindowOnActiveDisplay(win,fallback),{x:0,y:0,width:1920,height:1040})
})

test('ordinary opening resets appearance through its controller but preserves boss semantics',()=>{
  const win=fakeWindow(),calls=[]
  opening.normalizeNewFeatureWindow({kind:'standard',key:'huyaOpacity',win,screen,
    windowControls:{setOpacity:(...args)=>calls.push(['opacity',...args]),setTopmost:(...args)=>calls.push(['topmost',...args]),setAutoHide:(...args)=>calls.push(['autoHide',...args])}})
  assert.deepEqual(calls,[['opacity','huyaOpacity',1],['topmost','huyaOpacity',false],['autoHide','huyaOpacity',false]])
  assert.deepEqual(win.getBounds(),{x:2160,y:100,width:800,height:600})
})

test('advertisement and chat openings reset only their supported native appearance',()=>{
  const ad=fakeWindow(),chat=fakeWindow(),adCalls=[]
  opening.normalizeNewFeatureWindow({kind:'ad',key:'douyin',win:ad,screen,adWindowControls:{setOpacity:(...args)=>adCalls.push(args)}})
  assert.deepEqual(adCalls,[['douyin',1]])
  assert.ok(ad.calls.some(call=>call[0]==='topmost'&&call[1]===false))
  opening.normalizeNewFeatureWindow({kind:'chat',key:'wechat',win:chat,screen})
  assert.ok(chat.calls.some(call=>call[0]==='opacity'&&call[1]===1))
  assert.ok(chat.calls.some(call=>call[0]==='topmost'&&call[1]===false))
})

test('foreground presentation restores only when minimized and never persists topmost',()=>{
  const win=fakeWindow();win.minimized=true
  assert.equal(opening.presentWindow(win),true)
  assert.deepEqual(win.calls,[['restore'],['show'],['moveTop'],['focus']])
  const closed=fakeWindow();closed.destroyed=true
  assert.equal(opening.presentWindow(closed),false)
  assert.deepEqual(closed.calls,[])
})
```

- [x] **Step 2: Run the focused unit test and verify RED**

Run:

```powershell
node --test tests/window-opening.test.mjs
```

Expected: FAIL because `src/main/window-opening.mjs` and its exported functions do not exist.

- [x] **Step 3: Implement the minimal shared opening helper**

Create `src/main/window-opening.mjs` with:

```js
const finiteArea=area=>area&&['x','y','width','height'].every(field=>Number.isFinite(area[field]))

export function centerWindowOnActiveDisplay(win,screen){
  const current=win.getBounds()
  let display
  try{
    const point=screen.getCursorScreenPoint?.()
    if(point)display=screen.getDisplayNearestPoint?.(point)
  }catch{}
  const workArea=finiteArea(display?.workArea)?display.workArea:screen.getPrimaryDisplay().workArea
  const width=Math.min(workArea.width,Math.max(100,Math.round(current.width)))
  const height=Math.min(workArea.height,Math.max(100,Math.round(current.height)))
  const bounds={
    x:workArea.x+Math.round((workArea.width-width)/2),
    y:workArea.y+Math.round((workArea.height-height)/2),
    width,height
  }
  win.setBounds(bounds)
  return bounds
}

export function normalizeNewFeatureWindow({kind,key,win,screen,windowControls,adWindowControls}){
  if(kind==='ad'){
    adWindowControls.setOpacity(key,1)
    win.setAlwaysOnTop(false)
  }else if(kind==='chat'){
    win.setOpacity(1)
    win.setAlwaysOnTop(false)
  }else{
    windowControls.setOpacity(key,1)
    windowControls.setTopmost(key,false)
    windowControls.setAutoHide(key,false)
  }
  return centerWindowOnActiveDisplay(win,screen)
}

export function presentWindow(win){
  if(!win||win.isDestroyed())return false
  if(win.isMinimized?.())win.restore()
  win.show()
  try{win.moveTop?.()}catch{}
  win.focus()
  return true
}
```

- [x] **Step 4: Run the focused unit test and verify GREEN**

Run:

```powershell
node --test tests/window-opening.test.mjs
```

Expected: all five tests pass.

- [x] **Step 5: Commit the helper and contract tests**

```powershell
git add src/main/window-opening.mjs tests/window-opening.test.mjs
git commit -m "feat: define centered feature window opening"
```

### Task 2: Wire all feature window categories into the shared policy

**Files:**
- Modify: `tests/window-opening.test.mjs`
- Modify: `src/main/index.js`

- [x] **Step 1: Add a failing wiring test**

Append to `tests/window-opening.test.mjs`:

```js
import fs from 'node:fs'

test('main process normalizes new feature windows after legacy placement and presents every visible window',()=>{
  const source=fs.readFileSync(new URL('../src/main/index.js',import.meta.url),'utf8')
  assert.match(source,/import \{ normalizeNewFeatureWindow, presentWindow \} from '\.\/window-opening\.mjs'/)
  assert.match(source,/ready-to-show[\s\S]*?presentWindow\(win\)/)
  assert.match(source,/function focus\(key\)[\s\S]*?presentWindow\(w\)/)
  const rightBottom=source.indexOf('if (opts.rightBottom')
  const normalize=source.indexOf('normalizeNewFeatureWindow({')
  assert.ok(rightBottom>=0&&normalize>rightBottom)
  assert.match(source,/key !== 'main'/)
  assert.match(source,/kind: Object\.hasOwn\(AD_MODES,key\) \? 'ad' : tryChatContext\(key\) \? 'chat' : 'standard'/)
})
```

- [x] **Step 2: Run the focused test and verify RED**

Run:

```powershell
node --test tests/window-opening.test.mjs
```

Expected: the wiring test fails because `src/main/index.js` does not import or call the opening helper.

- [x] **Step 3: Use the presenter when a window becomes visible**

Add this import near the other main-process helpers in `src/main/index.js`:

```js
import { normalizeNewFeatureWindow, presentWindow } from './window-opening.mjs'
```

Replace the `ready-to-show` handler in `makeWindow` with:

```js
win.on('ready-to-show',()=>presentWindow(win))
```

Replace the final `w.focus()` call in `focus(key)` with:

```js
presentWindow(w)
```

The existing controller-specific restore calls remain in place so hidden-state semantics are unchanged.

- [x] **Step 4: Normalize only newly created child windows after legacy positioning**

At the end of `openRoute`, after the `opts.rightBottom` block and before `return win`, add:

```js
if(key!=='main')normalizeNewFeatureWindow({
  kind: Object.hasOwn(AD_MODES,key) ? 'ad' : tryChatContext(key) ? 'chat' : 'standard',
  key,win,screen,windowControls,adWindowControls
})
```

This placement deliberately uses the width and height already restored and validated by the relevant controller, then overwrites only its position and appearance.

- [x] **Step 5: Run the focused wiring test and verify GREEN**

Run:

```powershell
node --test tests/window-opening.test.mjs
```

Expected: all six tests pass.

- [x] **Step 6: Run the core unit suite**

Run:

```powershell
npm test
```

Expected: all unit tests pass.

- [x] **Step 7: Commit the production wiring**

```powershell
git add src/main/index.js tests/window-opening.test.mjs
git commit -m "feat: center and present new feature windows"
```

### Task 3: Prove the policy in real Electron windows

**Files:**
- Modify: `scripts/window-smoke.cjs`

- [x] **Step 1: Add reusable centered-bound assertions to the smoke harness**

After `check`, add:

```js
function activeWorkArea(){
  const {screen}=require('electron')
  return screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea
}
function assertCentered(window,width,height){
  const area=activeWorkArea(),bounds=window.getBounds()
  assert.equal(bounds.width,width);assert.equal(bounds.height,height)
  assert.ok(Math.abs(bounds.x-(area.x+Math.round((area.width-width)/2)))<=2)
  assert.ok(Math.abs(bounds.y-(area.y+Math.round((area.height-height)/2)))<=2)
}
```

- [x] **Step 2: Replace the obsolete ordinary-window persistence expectation**

Replace `close/reopen retains opacity and topmost` with:

```js
await check('ordinary reopen keeps only size and returns centered with default appearance',async()=>{
  const area=activeWorkArea()
  web.setBounds({x:area.x,y:area.y,width:420,height:360})
  await evaluate(web,'(async()=>{await window.windowControl.setOpacity(.55);await window.windowControl.setAlwaysOnTop(true);await window.windowControl.setAutoHide(true)})()')
  const previous=web
  await evaluate(web,'window.windowControl.close()').catch(error=>{if(!/destroy|closed/i.test(error.message))throw error})
  await until(()=>previous.isDestroyed(),'web closed')
  await evaluate(home,'window.homeElectronAPI.createWeb()')
  web=await until(()=>find('/web'),'web reopened')
  await until(async()=>evaluate(web,'Boolean(document.querySelector(".bar"))'),'reopened rendered')
  assertCentered(web,420,360)
  assert.ok(Math.abs(web.getOpacity()-1)<.03)
  assert.equal(web.isAlwaysOnTop(),false)
  assert.equal((await evaluate(web,'window.windowControl.getState()')).autoHideEnabled,false)
})
```

Update the restart-only branch to expect `assertCentered(restored,420,360)`, opacity `1`, and `isAlwaysOnTop() === false`. Update the managed-setting check later in the smoke to assert that the unchanged live topmost value is `false`.

- [x] **Step 3: Add one advertisement and one chat reopen case**

Before the shortcut tests, add:

```js
await check('advertisement reopen keeps only size and returns centered with default appearance',async()=>{
  await evaluate(home,"window.videoModeControl.open('douyin','ad')")
  let ad=await until(()=>find('/douyin'),'douyin ad')
  await until(()=>evaluate(ad,'Boolean(window.adModeControl)'),'ad preload')
  const area=activeWorkArea();ad.setBounds({x:area.x,y:area.y,width:330,height:440})
  ad.setOpacity(.4);ad.setAlwaysOnTop(true);const previous=ad
  await evaluate(ad,'window.adModeControl.close()').catch(error=>{if(!/destroy|closed/i.test(error.message))throw error})
  await until(()=>previous.isDestroyed(),'ad closed')
  await evaluate(home,"window.videoModeControl.open('douyin','ad')")
  ad=await until(()=>find('/douyin'),'ad reopened')
  assertCentered(ad,330,440);assert.ok(Math.abs(ad.getOpacity()-1)<.03);assert.equal(ad.isAlwaysOnTop(),false)
  ad.close()
})
await check('chat reopen keeps only size and returns centered in the foreground',async()=>{
  await evaluate(home,"window.videoModeControl.open('douyin','wechat')")
  let chat=await until(()=>find('/wechat'),'wechat')
  const area=activeWorkArea();chat.setBounds({x:area.x,y:area.y,width:720,height:560});chat.setOpacity(.5);chat.setAlwaysOnTop(true)
  chat.close();await until(()=>chat.isDestroyed(),'chat closed')
  await evaluate(home,"window.videoModeControl.open('douyin','wechat')")
  chat=await until(()=>find('/wechat'),'wechat reopened')
  assertCentered(chat,720,560);assert.ok(Math.abs(chat.getOpacity()-1)<.03);assert.equal(chat.isAlwaysOnTop(),false)
  chat.close()
})
```

- [x] **Step 4: Build and run the real Electron smoke once**

Run:

```powershell
npm run build
npm run test:smoke
```

Expected: the smoke passes both its first run and restart run using isolated user data; remote requests remain blocked.

- [x] **Step 5: Commit the Electron regression coverage**

```powershell
git add scripts/window-smoke.cjs
git commit -m "test: prove centered feature window reopening"
```

### Task 4: Confirm repository state without repeating completed regressions

**Files:**
- Verify only

- [x] **Step 1: Confirm formatting and working-tree state**

```powershell
git diff --check
git status --short --branch
```

Expected: `git diff --check` reports nothing and the feature branch is clean. Reuse the successful core suite from Task 2 and the successful build plus Electron smoke from Task 3 instead of rerunning them.
