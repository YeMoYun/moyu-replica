# 三平台透明化 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans。沿用用户已选当前会话执行，不分派代理。步骤用 checkbox 跟踪。

**Goal:** B站、虎牙、快手透明模式达到已验收抖音标准，首页四平台仅保留透明化入口。

**Architecture:** 新建三平台共用 VideoOpacityView、平台配置和串行 controller。已验收抖音不重构；复用窗口状态权威与已验证 Electron 31 保护。站内新窗口链接限制域名后在原 guest 中加载。

**Tech Stack:** Vue 3、Electron 31 webview、Node test runner、electron-vite。

项目没有 Git；不创建仓库、工作树或提交，先 ZIP 备份。只读原版及提取目录不写入。

## Task 1：基线和红测试

文件：`tests/video-opacity.test.mjs`、`tests/video-guest-links.test.mjs`。

- [x] 备份 src/tests/scripts/package 文件并记录源 asar SHA256；`npm.cmd test` 应 83 项通过。
- [x] 创建平台、事务、页面脚本、路由及首页入口测试，契约：

```js
assert.equal(VIDEO_PLATFORMS.bilibili.key,'bilibiliOpacity')
assert.equal(calculateVideoFitZoom(500,416),.39)
await page.setZoom(.75)
assert.equal(settings['bilibiliOpacity.zoom'],.75)
assert.equal(settings['huyaOpacity.zoom'],undefined)
assert.throws(()=>navigateVideo(platform,'next'),/未找到|直播/)
```

- [x] 链接测试使用实际导出 `isPlatformURL`、`installVideoGuestLinks`：允许 HTTPS 平台域名，拒绝后缀伪装、非 HTTPS、非默认端口；原 guest loadURL，拒绝新窗口，失败报告，销毁清理。
- [x] `node --test tests/video-opacity.test.mjs tests/video-guest-links.test.mjs`：因新模块及路由不存在而失败。

## Task 2：纯函数、平台配置和 controller

创建 `src/renderer/src/features/video-opacity/fit.mjs`、`platforms.mjs`、`page-scripts.mjs`、`controller.mjs`。

- [x] fit 导出 `clampVideoZoom`、`normalizeZoomSetting`、`calculateVideoFitZoom(width,height)`；1280×720、两位小数、0.2–1、非法值默认 .4。
- [x] 配置 `VIDEO_PLATFORMS`，每项有 name/key/url/next/prev/fullscreen/keyboardFallback。B站使用 bpx 控件，虎牙使用直播播放器控件，快手使用 xg/明确切换控件；仅快手允许 ArrowUp/Down 回退。
- [x] 页面脚本独立可序列化：`prepareVideoPage(platform)`、`navigateVideo(platform,direction)`、`toggleVideoFullscreen(platform)`、`toggleVideoPlayback(platform)`、`setVideoHidden(platform,hidden)`、`cleanupVideoPage(platform)`。CSS 与视频暂停集合按平台 key 命名；缺目标中文失败，恢复仅原先播放的视频。
- [x] controller 导出 `createVideoOpacityState`、`createVideoOpacityController({state,platform,getWebview,settings})`，公开 load/navigationStarted/domReady/resize/setZoom/restoreAutoFit/navigate/fullscreen/playback/setHidden/dispose。串行操作，文档代际防过期，保存失败回滚，跨导航提交用户偏好。
- [x] 重跑 focused tests，模块行为和链接通过；仅路由及首页仍红。

## Task 3：共享页面、入口、窄桥及 native 集成

创建 `src/renderer/src/views/VideoOpacityView.vue`、`src/main/video-guest-links.mjs`。修改 router、HomeView、preload/index.js、main/index.js。

- [x] 将已验收工具栏/弹窗结构作为新共用组件标准，动态平台名称、URL、设置键，使用 `window.videoOpacityControl` 的受控事件 API。不改 DouyinOpacityView 源文件。
- [x] dom-ready 等一帧再适配，ResizeObserver debounce，slider input 实时更新，原生请求串行，帮助读配置，Escape/Tab 焦点管理，卸载清理。
- [x] 只有 `/bilibiliOpacity`、`/huyaOpacity`、`/kuaishouOpacity` 改为新页面。首页对应 tile：

```html
<button @click="open('douyinOpacity')">抖音透明化</button>
<button @click="open('bilibiliOpacity')">B站透明化</button>
<button @click="open('huyaOpacity')">虎牙透明化</button>
<button @click="open('kuaishouOpacity')">快手透明化</button>
```

- [x] home API 新增 B站/虎牙透明创建函数；复用快手入口。对应 handler：`{ openSite(key); return true }`，不返回 BrowserWindow。
- [x] 四透明窗口 attach 已验证导航保护；新三站还安装 guest links：HTTPS 平台根域/子域且默认端口 → guest.loadURL(url)，立即 `{action:'deny'}`，其他链接走原外链 handler；不创建新原生窗。
- [x] 更新因用户新标签/保护范围变更而过时的旧测试，不削弱旧功能断言。`npm.cmd test` 和 `npm.cmd run build` 全通过。

## Task 4：三站真实 Electron 隔离验收

创建 `tests/fixtures/web/video-opacity/video.html`、`scripts/video-opacity-smoke.cjs`、`scripts/run-video-opacity-smoke.mjs`；package 增加 `test:video-opacity`。

- [x] runner 使用唯一临时 userData。普通远程请求阻断；允许的测试 HTTPS 路径只由 session.protocol.handle 返回本地 fixture，不访问外网、不使用实际用户配置。精确校验临时目录后删除。
- [x] 逐站检查八图标顺序、34px 高度、无地址栏、隐藏恢复、真实 zoom 和 native resize、内部滚动、手动/自动切换、透明度精准输入、topmost、鼠标隐藏、老板键选择性恢复、配置帮助、缺控件错误。
- [x] 每站确定性重放真实已销毁 WebFrameMain，验证导航保护；实际点击站内 target=_blank 链接后 guest 留在原窗口；截图保存 `.artifacts/video-opacity-demo-20260917`。
- [x] 刷新、关闭重开、进程重启时按各平台不同 zoom/opacity/置顶/边界独立恢复；事件触发仅一次，平台间偏好不串用。

## Task 5：最终验证和交付

- [x] `npm.cmd test`、`npm.cmd run build`、`npm.cmd run test:video-opacity`、`npm.cmd run test:douyin-opacity`、`npm.cmd run test:smoke`、`npm.cmd run test:weread` 全通过。
- [x] 原 asar hash 不变；与备份校验 DouyinOpacityView、抖音 controller/scripts、WeRead、SiteView、窗口默认尺寸未变。
- [x] 写 `docs/superpowers/video-opacity-verification.md`，记录真实计数、备份、截图和线上手动门槛。更新 checkbox，交付启动方法及四个入口。

计划自查：全部规格可映射到上述任务；签名和模块路径一致。用户已授权当前会话执行，不再重复询问执行方式。
