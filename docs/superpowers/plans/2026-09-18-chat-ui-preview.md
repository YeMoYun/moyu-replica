# Chat UI Preview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use executing-plans to implement this plan task-by-task in this session. Do not delegate this shared preview implementation.

**Goal:** 提供可本地打开、可交互验收的微信/钉钉/飞书 UI，正式应用与透明功能不变。

**Architecture:** `previews/chat-ui/model.js` 管理每平台独立演示数据；`app.js` 只负责 DOM 事件和渲染；`tokens.css` 与 `styles.css` 分别管理配色及三套布局。所有资源本地，无账号接口。

**Tech Stack:** HTML、CSS、经典浏览器 JavaScript、Node 内建测试、独立 Electron/Chromium 检查（复用已安装运行时）。

---

## Task 1：模型与配置验证

Files: Create `previews/chat-ui/model.js`, `previews/chat-ui/model.test.mjs`.

- [x] 写测试，接口为 `createWorkspace(platform)`, `sendMessage(state,text)`, `insertPlayer(state)`, `selectConversation(state,id)`, `updateSettings(state,patch)`, `applyConfig(state,config)`, `serializeConfig(state)`。
- [x] `node --test previews/chat-ui/model.test.mjs` 必须先因模型不存在失败。
- [x] 实现本地演示状态；发送空字符串不增加消息；站点白名单；横竖屏白名单；大小夹在 80–200%；配置完整校验后一次替换。
- [x] 重跑模型测试验证绿色，包括非法配置保持原数据、三平台互不覆盖。

## Task 2：网页与皮肤

Files: Create `previews/chat-ui/index.html`, `tokens.css`, `styles.css`, `app.js`, `README.md`.

- [x] 创建包含 `platform-tabs`, `size-select`, `boss-toggle`, `chat-app`, `settings-dialog`, `config-dialog` 的语义化页面。
- [x] 三套平台分别渲染源布局或明确新增布局；相同演示行为通过模型调用而不是正式 Electron API。
- [x] 绑定发送、搜索/选择会话、设置、配置、播放器交互、遮挡与恢复；用户输入只用 `textContent` 或转义后插入。
- [x] `node --check previews/chat-ui/model.js` 与 `node --check previews/chat-ui/app.js` 通过。
- [x] README 给出双击打开方式、演示边界、验收步骤及独立测试命令。

## Task 3：交互与保护性验证

Files: Create `previews/chat-ui/verify.cjs`, `run-verify.mjs`; Create `docs/superpowers/2026-09-18-chat-ui-preview-verification.md`.

- [x] 使用隔离 userData 和不启用 Node 的 Chromium 窗口打开 `index.html`。
- [x] 对每平台点击发送、会话切换、播放器插入、设置横竖屏/大小/发送方/遮罩、遮挡恢复、JSON 配置错误及正确配置。
- [x] 检查 320/375/414/768/1100/1280px 根页面不横向溢出；标准/紧凑/宽屏记录截图。
- [x] `node previews/chat-ui/run-verify.mjs` 返回零失败；`npm test` 通过。
- [x] 本批开始时记录的正式 `src/` 文件哈希全部保持不变；源 `app.asar` 哈希保持不变。
- [x] 打开独立网页供用户验收，报告预览不是正式实现。

本项目不是 Git 工作区；不创建分支、不提交、不删除或改写正式文件。
