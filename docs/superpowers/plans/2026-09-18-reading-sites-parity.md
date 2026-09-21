# 晋江与番茄阅读一致性 Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans，沿用当前会话直接执行。无 Git，不创建仓库、工作树或提交。

**Goal:** 两站完整采用已验收微信读书的简约控件和阅读功能，配置、真实 DOM 和滚动分别适配。

**Architecture:** 新增 reading-sites/platforms/page-scripts/controller 与 ReadingSiteView；只替换 fanQue/jinJiang 路由，不修改微信读书源码。复用发送方 windowControl，主进程给两站 guest 安装站内链接处理。

**Tech Stack:** Vue 3、Electron 31、DOM/CSS/RAF、Node test runner。

## Task 1：网站证据与红测试

- [x] 查看原版两站真实阅读配置及公开免费章节 HTML，记录阅读内容、原生目录/翻页控件选择器。付费/登录限制不绕过。
- [x] 创建 `tests/reading-sites.test.mjs`：平台地址/阅读页识别、旧配置恢复/非法值、独立配置、透明开关与浮出控件、真实中文 guest 异常、磁盘失败、隐藏滚动暂停、不重复 CSS、reset 保留其他配置、卸载清理、两新路由和无旧通用控件。
- [x] `node --test tests/reading-sites.test.mjs` 因缺模块/路由失败，然后实现。

```js
const state=createReadingState(platform)
const page=createReadingController({state,platform,getWebview,settings})
await page.setTransparent(true)
await page.toggleReaderControls()
assert.equal(state.transparent,true)
assert.equal(state.controlsShown,true)
```

## Task 2：可序列化适配和生命周期

- [x] 创建 `src/renderer/src/features/reading-sites/platforms.mjs`：READING_PLATFORMS[fanQue/jinJiang] 的 name/key/url/root/content/controls，`isReadingURL(platform,url)`；不套 .readerControls。
- [x] 创建 `page-scripts.mjs` 导出 showReadingControls/hideReadingControls/startReadingScroll/stopReadingScroll/cleanupReadingPage。浮出实际 DOM 控件，保存 parent/next/style 并在退出/cleanup 完整还原；内容缺失明确中文失败。滚动优先真实 overflow 容器，其次 document.scrollingElement，累计距离、速度 1–10、页底停止、重复调用取消旧 RAF。
- [x] 创建 controller.mjs：createReadingState/createReadingController，load/navigationStarted/domReady/setTransparent/toggleReaderControls/setZoom/setStyle/resetStyle/setScrollbarHidden/setAutoScroll/setSpeed/setHidden/dispose。串行操作、文档代际检查、CSS key ownership、actual guest error envelope、磁盘保存失败不更新 preference/live appearance。
- [x] 滚动保留原字段 `${key}AutoScrollEnabled`、`${key}ScrollSpeed`，缩放新增独立 `${key}Zoom`，颜色/transparent/scrollbarHidden/lastAddress 使用 `${key}.field`。新地址限平台 HTTPS 域名，旧 localStorage 合法值兼容。
- [x] focused tests 转绿；缺新路由项保持红直到接入。

## Task 3：完整控件和 native 集成

- [x] 创建 `src/renderer/src/views/ReadingSiteView.vue`，以 WeReadView 的模板/CSS 为标准，动态 platform name/url/state。保留完整主栏、更多六按钮与 opacity/style/scroll/help 弹窗。原生滑杆请求串行，快捷键读配置，按 Escape/Tab 处理焦点，卸载解绑。
- [x] `/fanQue`、`/jinJiang` 引入新页面；原来 /weRead 保留原文件，原尺寸和首页名称不变。
- [x] `src/main/video-guest-links.mjs` 精确域名 allowlist 扩展 fanqienovel.com/jjwxc.net；`main/index.js` 只在两站 did-attach-webview 安装既有导航保护和站内链接 handler；允许 requests 到处理器后始终 deny 新窗、原 guest 载入站内阅读章节。
- [x] 增加两站域名伪装/端口/非 HTTPS 检查，`npm.cmd test`、`npm.cmd run build` 全通过。

## Task 4：隔离 Electron 验收与总回归

- [x] 创建真实章节/原生导航 DOM 的 `tests/fixtures/web/reader/reading-sites.html`，两站分别真实 overflow 内容容器；捕获控件 before/after 的 DOM/样式快照。
- [x] 创建 `scripts/reading-sites-smoke.cjs` 和 runner；唯一 userData、本地 HTTPS 协议夹具、不访问实际用户配置；从首页 API 打开，验证完整控件、原生 opacity（topmost/auto-hide 另由公共窗口与原视频回归覆盖）、网页透明、真实控件交互/还原、颜色/zoom/scrollbar、auto-scroll 隐藏恢复、首页/错误、刷新与重开/进程重启独立恢复，保存截图。
- [x] package 增加 `test:reading-sites`。`npm.cmd run test:reading-sites` 通过，再运行 test/build、test:huya-window-fill、test:video-opacity、test:douyin-opacity、test:weread、test:smoke。
- [x] 写 `docs/superpowers/2026-09-18-huya-reading-verification.md`，核对原版 hash 与备份保护文件，更新两份 plan checkbox；明确未通过的线上或物理键盘项目。

计划自查：签名、命名空间和路由一致；所有功能能映射到独立任务；新增真实几何验收补前次缺口。用户已确认当前会话执行，不再重复询问。


执行记录：详见 `docs/superpowers/2026-09-18-huya-reading-verification.md`。checkbox 表示实施/本地验证完成，不表示完整线上交互或物理键盘通过。
