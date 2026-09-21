# 抖音透明度模式专属页面 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Replace only `/douyinOpacity` with a recording-matched compact control page whose real Douyin webview automatically fits its available window instead of requiring manual wheel zooming.

**Architecture:** Keep native window state authoritative in the existing sender-targeted `windowControl`. Add a focused `DouyinOpacityView.vue`, pure fit/guest-page functions under `features/douyin`, and a narrow `douyinOpacityControl` preload event bridge. The guest page remains the real Douyin site in production; the isolated smoke test uses a local fixture and blocks all remote requests.

**Tech Stack:** Vue 3, Electron webview, Electron preload contextBridge, Node test runner, electron-vite.

---

## File map

- Create `src/renderer/src/features/douyin/fit.mjs`: clamp/fit zoom calculation and normalized settings helpers.
- Create `src/renderer/src/features/douyin/page-scripts.mjs`: independently serializable guest-page actions for scroll cleanup, previous/next, fullscreen, play/pause and cleanup.
- Create `src/renderer/src/views/DouyinOpacityView.vue`: recording-style toolbar, zoom/opacity/help dialogs, webview lifecycle and event subscriptions.
- Modify `src/preload/index.js`: expose `douyinOpacityControl` with only the required event subscription methods.
- Modify `src/renderer/src/router/index.js`: route only `/douyinOpacity` to the dedicated view.
- Create `tests/douyin-opacity-fit.test.mjs`, `tests/douyin-opacity-scripts.test.mjs`, and `tests/douyin-opacity-view.test.mjs`.
- Create `tests/fixtures/web/douyin/douyin.html`, `scripts/douyin-opacity-smoke.cjs`, and `scripts/run-douyin-opacity-smoke.mjs`.
- Modify `package.json` to add `test:douyin-opacity`.
- Record evidence in `docs/superpowers/douyin-opacity-verification.md` and update this plan after verification.

## Task 1: Baseline and failing tests

**Files:**
- Create: `tests/douyin-opacity-fit.test.mjs`
- Create: `tests/douyin-opacity-scripts.test.mjs`
- Create: `tests/douyin-opacity-view.test.mjs`

- [x] **Step 1: Archive the current implementation and record source hash**

Run from `D:\deepseekharness\moyu-replica`:

```powershell
$stamp = Get-Date -Format yyyy-MM-dd-HHmmss
Compress-Archive -Path src,tests,scripts,package.json,package-lock.json -DestinationPath "backups\$stamp-douyin-opacity-before.zip" -Force
Get-FileHash 'D:\MoYuMaster-1.0.0-win\resources\app.asar' -Algorithm SHA256
```

Expected: backup exists and the source archive hash is recorded without writing to `D:\MoYuMaster-1.0.0-win`.

- [x] **Step 2: Write failing fit and guest-script tests**

Cover these exact contracts:

```js
assert.equal(clampDouyinZoom(0.1), 0.2)
assert.equal(clampDouyinZoom(1.2), 1)
assert.equal(calculateDouyinFitZoom({width: 500, height: 416}), 0.39)
assert.equal(calculateDouyinFitZoom({width: 1920, height: 1080}), 1)
assert.throws(() => runGuest('findDouyinTarget', 'missing'), /未找到/)
assert.equal(runGuest('togglePlayback'), true)
assert.equal(runGuest('cleanupDouyinPage').cleaned, true)
```

The fake guest DOM must verify that functions are self-contained after `Function#toString()`, use stable selector priority, remove only owned CSS, and do not throw when cleanup is repeated.

- [x] **Step 3: Write failing route/template tests**

Assert that only `/douyinOpacity` imports `DouyinOpacityView.vue`; `/douyin` and unrelated `SiteView` routes remain unchanged. Assert the dedicated template contains the icon actions `hide-bar`, `topmost`, `close`, `reload`, `help`, `zoom`, `opacity`, `auto-hide`, has a drag area and webview, and contains no `.addr`, generic back/forward buttons, or text fullscreen control.

- [x] **Step 4: Run the focused tests and record the red state**

```powershell
node --test tests/douyin-opacity-fit.test.mjs tests/douyin-opacity-scripts.test.mjs tests/douyin-opacity-view.test.mjs
```

Expected: FAIL because the new modules/view do not exist yet. Do not weaken assertions to make the initial run pass.

## Task 2: Fit and guest-page modules

**Files:**
- Create: `src/renderer/src/features/douyin/fit.mjs`
- Create: `src/renderer/src/features/douyin/page-scripts.mjs`
- Test: `tests/douyin-opacity-fit.test.mjs`
- Test: `tests/douyin-opacity-scripts.test.mjs`

- [x] **Step 1: Implement deterministic fit helpers**

Export `DOUYIN_DEFAULT_ZOOM = 0.4`, `clampDouyinZoom(value)`, and `calculateDouyinFitZoom({width,height})`. Use a 1280×720 design viewport, clamp to 0.2–1, round to two decimal places, and never enlarge a small page beyond 1. For a 500×416 webview the result must be 0.39; for 1920×1080 it must be 1. Add `normalizeZoomSetting` so invalid persisted values fall back to 0.4.

- [x] **Step 2: Implement independently serializable page functions**

Export `prepareDouyinPage`, `navigateDouyinVideo(direction)`, `toggleDouyinFullscreen`, `toggleDouyinPlayback`, and `cleanupDouyinPage`. Each function must run correctly from `Function#toString()` with no module closure.

Selector priority must be explicit:

```js
next: ['button[aria-label*="下一"]','[data-e2e*="next"]','[data-e2e*="forward"]']
prev: ['button[aria-label*="上一"]','[data-e2e*="prev"]','[data-e2e*="back"]']
fullscreen: ['button[aria-label*="全屏"]','[data-e2e*="fullscreen"]','.xgplayer-fullscreen']
```

If no selector exists, dispatch the matching `ArrowDown`/`ArrowUp` key for next/previous; fullscreen must throw a visible Chinese error. Playback must toggle every page `<video>` and return the resulting state. Preparation inserts one owned style block that sets the host document overflow rules without changing unrelated styles; cleanup removes only that block and is idempotent.

- [x] **Step 3: Run focused tests**

```powershell
node --test tests/douyin-opacity-fit.test.mjs tests/douyin-opacity-scripts.test.mjs
```

Expected: PASS for all fit, selector, fallback, idempotency and serialization tests.

## Task 3: Preload bridge and dedicated Vue page

**Files:**
- Modify: `src/preload/index.js`
- Create: `src/renderer/src/views/DouyinOpacityView.vue`
- Modify: `src/renderer/src/router/index.js`
- Test: `tests/douyin-opacity-view.test.mjs`

- [x] **Step 1: Add the narrow event bridge**

Expose `window.douyinOpacityControl` with `onPrev`, `onNext`, `onAllScreen`, `onStopOrContinue`, `onOpacityUp`, `onOpacityDown`, and `onBoss`. Each method returns the existing unsubscribe function from `createEventSubscriptions`; no new raw IPC object is exposed.

- [x] **Step 2: Implement the dedicated toolbar**

Use inline SVG symbols and data actions matching the spec. The top bar is about 34px high with a dark background, no address field, a flex drag area, and no-drag controls. Render a single recovery eye when hidden. Use `window.windowControl` for native state and keep opacity/always-on-top/auto-hide/close operations independent.

- [x] **Step 3: Implement dialogs and persisted state**

Load `douyinOpacity.zoom` from `settingApi`, default to 0.4, clamp 0.2–1, and save changes. The zoom dialog contains presets 0.2/0.4/0.75/1.0 and a 0.1 step slider. The opacity dialog uses 0.1–1 and 0.01 step. The help dialog lists the currently configured shortcut labels from `get-shortcuts` and explains that webpage fullscreen differs from native window fullscreen.

- [x] **Step 4: Implement webview lifecycle and automatic fit**

On `dom-ready` and main-document navigation, run `prepareDouyinPage`, wait for one animation frame, compute fit zoom from the webview client dimensions, and call `setZoomFactor`. Install a `ResizeObserver` on the host container with a debounce; update the fit zoom on resize while automatic fitting is enabled. A manual zoom change disables automatic fitting for the current session and is persisted; the zoom dialog provides a “恢复自动适配” action that re-enables it and immediately recalculates.

Subscribe to `all-prev`, `all-next`, `all-screen`, `stop-or-continue`, `opacity-up`, `opacity-down`, and `windowControl.onBoss`; route them to serialized guest functions or native state actions. Unsubscribe, disconnect the observer, remove owned CSS and stop pending timers in `onUnmounted`.

- [x] **Step 5: Replace only the opacity route and run page tests**

```powershell
node --test tests/douyin-opacity-view.test.mjs
npm.cmd run build
```

Expected: the route/template tests pass and production build emits the new page without changing the `/douyin` route.

## Task 4: Isolated Electron smoke test

**Files:**
- Create: `tests/fixtures/web/douyin/douyin.html`
- Create: `scripts/douyin-opacity-smoke.cjs`
- Create: `scripts/run-douyin-opacity-smoke.mjs`
- Modify: `package.json`

- [x] **Step 1: Create a local fixture and runner**

The fixture must contain a dark Douyin-like sidebar/grid, four video cards, two real `<video>` elements, stable next/previous/fullscreen buttons, and enough content to expose a missing fit/overflow bug. The runner must set a unique `MOYU_DOUYIN_DATA_DIR`, block HTTP(S), load `out/main/index.js`, open `/douyinOpacity`, and replace only the guest webview URL with the local fixture.

- [x] **Step 2: Verify the recording-style surface**

Assert no `.addr` or generic navigation controls, toolbar height is 34px, all eight data actions are present, and the screenshot resembles the supplied recording. Test hide/show recovery and cleanup after close.

- [x] **Step 3: Verify adaptive zoom and web actions**

Read `guest.getZoomFactor()` after initial DOM ready, resize the native window with `setBounds`, and assert the fit zoom changes within 0.2–1 without introducing a host scrollbar. Click manual presets, restore auto-fit, trigger previous/next/fullscreen/play-pause through the actual renderer event bridge, and verify fixture state changes.

- [x] **Step 4: Verify native state and persistence**

Exercise opacity precision, topmost independence, auto-hide, boss-key pause/resume, refresh reapplication, close/reopen restoration and restart restoration. Capture `douyin-opacity-compact.png`, `douyin-opacity-fit.png`, and `douyin-opacity-dialog.png` under `.artifacts/douyin-opacity-demo-20260917`.

- [x] **Step 5: Add and run the npm command**

Add:

```json
"test:douyin-opacity": "node scripts/run-douyin-opacity-smoke.mjs"
```

Run:

```powershell
npm.cmd run test:douyin-opacity
```

Expected: all local checks pass and the runner reports `onlineSiteVerified:false` and `physicalKeyboardVerified:false`.

## Task 5: Full verification and handoff

**Files:**
- Create: `docs/superpowers/douyin-opacity-verification.md`
- Modify: `docs/superpowers/plans/2026-09-17-douyin-opacity.md`

- [x] **Step 1: Run all verification commands**

```powershell
npm.cmd test
npm.cmd run build
npm.cmd run test:smoke
npm.cmd run test:weread
npm.cmd run test:douyin-opacity
```

- [x] **Step 2: Verify source immutability and backup**

Recompute the SHA-256 of `D:\MoYuMaster-1.0.0-win\resources\app.asar`; it must match the pre-task hash. Confirm the new backup and screenshot paths exist.

- [x] **Step 3: Record evidence and remaining manual gates**

Document exact pass counts, build result, screenshot paths, backup path, source hash, and the fact that online Douyin login/permissions, real-site DOM drift, and physical keyboard behavior still require manual validation.

- [x] **Step 4: Mark the plan complete**

Check off only the steps backed by fresh command output. Do not claim online compatibility based on the blocked local fixture.

## 已执行实现调整（2026-09-17）

- 用户选方式 2，在当前会话直接执行；项目无 Git，因此先备份，不创建仓库、不提交、不创建工作树。按用户选择进行本会话代码自查，不分派代理。
- 测试集中在 `tests/douyin-opacity.test.mjs`（11 项），并新增 `features/douyin/controller.mjs` 分离页面状态、串行事务和文档生命周期。上文示例中的 `findDouyinTarget`/`togglePlayback` 没有作为测试专用 API 引入；实际测试覆盖公开导出的导航、全屏、播放和清理函数。
- `calculateDouyinFitZoom(width,height)` 使用两个数值参数。选择器使用明确的 `data-e2e` 值，避免宽泛 substring 匹配点到无关按钮；键盘回退标记为未验证，不宣称站点已响应。
- 新增模块私有 `douyinOpacity.autoFit` 布尔键，使自动适配/手动缩放模式跨刷新和重启保持一致；兼容已有合法 zoom。滑块步长 0.01，保证 0.75 快捷值精确可表示，拖动时实时应用。
- 帮助弹窗通过现有 `settingApi.getSetting('shortcuts')` 读取当前配置，不依赖页面的原始 ipcRenderer。老板键事件重新读取 `windowControl` 权威状态，避免与鼠标移出隐藏状态冲突。
- 为用户提供首页“抖音透明度”独立入口；修复该模式已有 IPC handler 返回 BrowserWindow、导致 structured clone 失败的问题，只返回 true，不影响其他模式。
- 实际截图名及最终命令计数见 `docs/superpowers/douyin-opacity-verification.md`。勾选表示功能契约已按上述调整执行和验证，并非上文伪代码逐字实现。
