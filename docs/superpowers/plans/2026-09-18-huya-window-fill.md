# 虎牙窗口内全屏 Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans。沿用当前会话直接执行；项目无 Git，不建仓库/工作树/提交。按 checkbox 跟踪。

**Goal:** 虎牙直播间右下角按钮和网页全屏快捷键铺满现有小窗口，而非整个显示器。

**Architecture:** 新建可序列化 huya-window-fill 模块；prepare 阶段安装捕获监听器，将虎牙真实按钮连接到可恢复的窗口内布局。全局快捷键调用同一 guest 状态；页面导航/退出清理。

**Tech Stack:** Electron 31 webview、DOM/CSS、Node test、真实 Electron 隔离 smoke。

## Task 1：证据和红测试

- [x] 运行 `npm.cmd test` 确认 104 项基线；ZIP 备份 src/tests/scripts/package 文件，记录源 asar SHA256。
- [x] 查询实际公开虎牙页面播放器/button 结构，不登录、不更改真实账号。不通时记录网络限制。
- [x] 创建 `tests/huya-window-fill.test.mjs`，断言 prepare 安装按钮处理、全屏有真实 owned style/状态、退出还原、重复准备不累积、cleanup 清理。先运行 `node --test tests/huya-window-fill.test.mjs` 观察缺实现失败。

```js
assert.equal(typeof scripts.installHuyaWindowFill,'function')
assert.equal(typeof scripts.toggleHuyaWindowFill,'function')
assert.equal(typeof scripts.cleanupHuyaWindowFill,'function')
```

## Task 2：窗口内布局和接入

- [x] 创建 `src/renderer/src/features/video-opacity/huya-window-fill.mjs`，导出上述三函数。每个函数独立序列化；guest state 保存真实 #player-wrap、进入前属性、祖先布局属性、body scroll 和事件 unsubscribe。CSS 定位真实播放器 100vw×100vh，video contain，不复制 video、不调用原生全屏。
- [x] 按实际按钮选择器捕获点击，阻断系统全屏请求路径；Escape/再次点击退出。DOM 更新后按钮仍工作。窗口 resize 依靠视口单位适配；cleanup 恢复 owned 样式与监听器。
- [x] 修改 `controller.mjs`，仅 platform.key===huyaOpacity 时 dom-ready 执行 install，fullscreen 调用 toggle，dispose 调用 cleanup；保留其他平台 prepare/fullscreen 不变。
- [x] 重跑红测试转绿，运行 `npm.cmd test`。不开放 session 权限。

## Task 3：真实几何验收

- [x] 创建 `tests/fixtures/web/video-opacity/huya-room.html`，嵌套偏移/transform 播放器、真实 MediaStream video、右下角原始 requestFullscreen 按钮、重复内容，真实点击后核对播放器边界贴合 guest viewport。
- [x] 创建 `scripts/huya-window-fill-smoke.cjs` 和 `run-huya-window-fill-smoke.mjs`，唯一临时 userData、阻断远程网络、验证不同 zoom/.resize、按钮/快捷键/Escape、原生 bounds/opacity/topmost 不变、DOM 恢复、刷新/重开清理，结束删除经精确校验的临时路径。
- [x] package 添加 `test:huya-window-fill`，更新三平台旧 smoke 的虎牙全屏部分为真实 player-wrap fixture，不再以 click 标记当作铺满证明。
- [x] `npm.cmd run build`、`npm.cmd run test:huya-window-fill`、`npm.cmd run test:video-opacity` 全通过；记录本地与线上证据边界。


执行记录：详见 `docs/superpowers/2026-09-18-huya-reading-verification.md`。checkbox 表示实施/本地验证完成，不表示完整线上交互或物理键盘通过。
