# WeChat Screenshot Preview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: executing-plans inline. No delegation. Steps use checkbox syntax.

**Goal:** 微信独立演示按用户截图调整，保留原预览交互，不动其他平台或正式应用。

**Architecture:** app.js 增加独立微信渲染分支，复用本地消息模型；样式追加 `.wechat` 规则。图片素材复制到独立 assets 目录；HTTP 服务仅扩展 8 个已知图片的精确白名单。

**Tech Stack:** 原生 JavaScript/CSS、Node test、现有隔离 Electron 验证器。

---

### Task 1: Boundaries and failing tests

Files: `previews/chat-ui/model.test.mjs`, `previews/chat-ui/verify.cjs`.

- [x] 记录正式 src SHA256 和飞书/钉钉 standard PNG SHA256；检查只读源头像素材，确认没有编辑源文件。
- [x] 微信模型断言：`M.current(s).name === '项目小组'`、成员 5、默认 7 会话、无默认 player；其他平台默认数据分支不变。
- [x] 微信 UI 断言：底部设备按钮、方形 img 已加载、工具栏图标为 smile/cube/folder/cut/phone-video、顶部操作仅 more/close、更多菜单 settings/config 可操作。
- [x] `node --test previews/chat-ui/model.test.mjs` 和 `node previews/chat-ui/run-verify.mjs` 验证新增断言失败；记录预期失败原因。

### Task 2: Implement isolated WeChat UI

Files: `previews/chat-ui/app.js`, `previews/chat-ui/styles.css`, `previews/chat-ui/model.js`, `previews/chat-ui/index.html`, `previews/chat-ui/assets/`, `previews/chat-ui/serve.cjs`.

- [x] model 的微信专属分支生成默认会话，公共函数、飞书/钉钉默认数据不变。
- [x] 用 `wechatHTML(s,chat)` 生成截图布局，render 的微信分支调用它；`avatar()` 在微信分支显示本地图片，对方按已知名称/会话 ID 映射，自己固定图片。用户文本继续 escape。
- [x] `wechat-more` 切换隐藏菜单，菜单项复用 settings/config/insert action；平台/会话切换与菜单项操作关闭菜单。点击外部与 Escape 收起，按钮 aria-expanded 同步。
- [x] `.wechat .chat-item{height:66px}`、`.wechat .composer{height:144px}`、`.wechat .avatar{object-fit:cover}` 等作用域规则调整颜色、头像、消息和输入工具；新增微信专用 SVG 符号，不替换其他平台图标。
- [x] Ctrl+Enter 在微信输入框插入换行并保存草稿，Enter 原行为保留。扩展 HTTP 精确图片白名单，重启本任务启动的预览服务前核对监听进程与命令行。

### Task 3: Verify and document

Files: `previews/chat-ui/README.md`, verification record, output PNGs.

- [x] 完整模型和 UI 检查通过，包括微信菜单关闭、键盘发送/换行、图片加载与无外部资源访问。
- [x] 检查微信标准/宽屏/窄屏截图；核对飞书和钉钉截图，并以逐节点几何及计算样式隔离检查证明微信专属样式不影响其他平台。正式 src 数量及哈希不变。
- [x] HTTP 页面及所有新增头像返回 200，正式 `npm test` 通过；更新说明并交付预览，等待 UI 验收，不接入正式代码。

全页 PNG 对比没有作为唯一验收依据：钉钉截图哈希出现差异，未据此声称图片完全相同。新增的移除微信专属样式前后逐节点几何和计算样式检查，在钉钉、飞书均通过。
