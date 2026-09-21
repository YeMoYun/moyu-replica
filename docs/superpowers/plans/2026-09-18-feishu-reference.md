# Feishu Reference UI Implementation Plan

> **For agentic workers:** Use executing-plans inline; no delegation. Steps use checkbox syntax.

**Goal:** 在独立预览中按用户截图重做飞书，其他平台和正式代码不动。

**Architecture:** 为现有 app.js 增加飞书专属 HTML 分支，复用本地状态、消息与播放器；styles.css 追加仅 `.feishu` 作用域规则。导航、头像与公告状态仅归飞书，不加载远程资源。

**Tech Stack:** 原生 HTML/CSS/JavaScript，现有 Electron 验证器，Node test。

---

### Task 1: Capture boundaries and add failing UI expectations

Files: `previews/chat-ui/verify.cjs`, existing `src` (read-only).

- [x] 记录 src 62 个文件的 SHA256；运行原 UI 检查并记录微信、钉钉 standard PNG 哈希。
- [x] 将飞书预期改为 `navigation.width === '176px'`，`top-bar.display === 'none'`；搜索使用 `.navigation input[data-search]`。
- [x] 增加飞书断言：`document.querySelectorAll('.feishu .chat-tabs button').length === 7`；圆形头像；会话快捷入口；52px 输入栏；发送 SVG；公告关闭、显示与配置转义。运行 `node previews/chat-ui/run-verify.mjs`，预期在飞书导航宽度断言失败。

### Task 2: Implement screenshot-specific renderer and styles

Files: `previews/chat-ui/app.js`, `previews/chat-ui/styles.css`, `previews/chat-ui/index.html`, `previews/chat-ui/model.js`, `previews/chat-ui/model.test.mjs`.

- [x] 为飞书添加 `feishuHTML(s,chat)`；render 使用 `platform==='feishu'?feishuHTML(s,chat):existingHTML`，其他平台结构原样保留。
- [x] listHTML 仅在飞书分支追加外部标签并使用圆形头像；飞书消息分支追加演示引用和本地回复标记。所有用户内容使用既有 escape。
- [x] 飞书显示 176px 导航、29% 列表、聊天群页签与公告；`hiddenAnnouncements` 按会话 ID 保存关闭状态，`hide-announcement` / `show-announcement` 执行本地 DOM 更新。快捷按钮继续使用已有 conversation action。
- [x] 追加 `.feishu .composer{height:52px;flex-direction:row}` 等作用域 CSS，按截图设置圆形头像、浅蓝选择、灰色卡片、底部内联工具。新增局部 SVG 符号用于历史、实验室、@、缩小等图标。未接入按钮继续走 notice。
- [x] 为截图中的群聊与密集会话栏增加仅飞书的默认数据测试（先失败），随后在 createWorkspace 的飞书分支生成质检组、16 成员、合成对方消息与 10 个会话；微信/钉钉模型和共用操作函数不变。
- [x] 运行 UI 检查，所有检查通过。

### Task 3: Verify and hand off independent preview

Files: `previews/chat-ui/verify.cjs`, `previews/chat-ui/README.md`, verification doc.

- [x] 运行 `node --test previews/chat-ui/model.test.mjs` 和完整 UI 检查；截图检查飞书标准、宽屏、紧凑，320/375/414/768px 布局检查通过。
- [x] 微信、钉钉 standard PNG SHA256 与基线一致；src 文件哈希与数量一致；HTTP 预览资源状态 200。
- [x] 更新预览说明与验证记录；用户验收前不接入正式代码。
