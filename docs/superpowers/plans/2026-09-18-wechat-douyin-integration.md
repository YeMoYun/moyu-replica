# WeChat Douyin Integration Implementation Plan

> **For agentic workers:** executing-plans inline, no delegation. Non-Git workspace: no worktree or commits. Preserve existing user files.

**Goal:** 将已批准微信布局接入真实抖音气泡、配置持久化与独立老板键。

**Architecture:** 独立微信视图和气泡组件；纯聊天状态模型、原子存储服务、排队客户端及聊天窗口控制器。新增主进程/preload 接口，原透明实现保持不动。

**Tech Stack:** Vue 3、Electron 31、现有 JSON store、Node test、隔离 Electron smoke。

## 任务 1：状态与存储（tests/chat-state.test.mjs, src/shared/chat-state.mjs, src/main/chat-service.mjs）

- [ ] 新建先失败测试，接口：`createChatState()`、`validateChatState(raw)`、`sendText(s,text)`、`insertPlayer(s)`、`playerSize(settings)`、`validateChatUrl(url)`、`migrateLegacy(legacy)`。
- [ ] 测试默认七会话/无播放器、文字安全/空白/长度、重复插入复用、横竖屏比例、URL 协议/域/凭据、配置原子校验和旧数据归属。
- [ ] `node --test tests/chat-state.test.mjs`：缺少新模型时预期 FAIL。
- [ ] 实现上述具名接口，数据含 version/revision/selfName/selectedId/conversations/drafts/settings。源码示例约束：`if (players.length > 1) throw Error('每个会话最多一个播放器')`。
- [ ] 存储服务接口 `createChatService({store,notify})`，`get()` 首次调用使用 `store.setMany` 一次写入旧配置备份和新配置，`save(raw,revision)` 先比较当前 revision 后校验、保存、通知。测试失败写盘不通知、不改变已提交数据；测试旧 revision 拒绝覆盖。
- [ ] 再运行同一测试，预期全通过。

## 任务 2：隔离窗口/排队更新（tests/chat-runtime.test.mjs, src/main/chat-window-controls.mjs, src/renderer/src/features/chat/controller.mjs）

- [ ] 先写测试：老板键不隐藏窗口、打开时继承遮挡、关闭清理；客户端两次快速操作串行保存，失败保留旧状态，过期广播不覆盖新状态。
- [ ] `node --test tests/chat-runtime.test.mjs`：新模块不存在时 FAIL。
- [ ] 窗口控制器 `createChatWindowController({store,screen})` 提供 attach/state/toggleBoss/restore/setOpacity/close；老板键仅发送 `chat-mode:boss`，几何使用现有只读 `fitBounds`。
- [ ] 客户端 `createChatController({api,onState,onError})` 提供 load/update/accept/dispose；核心更新顺序：`const next=structuredClone(state); operation(next); const saved=await api.save(next,state.revision); accept(saved)`。队列失败后仍允许下一次操作。
- [ ] 重跑对应测试全通过。

## 任务 3：正式布局和 webview（src/renderer/src/views/WechatView.vue, src/renderer/src/features/chat/ChatPlayer.vue, ChatIcon.vue, wechat.css, player-scripts.mjs; tests/chat-wiring.test.mjs; scripts/wechat-smoke.cjs）

- [ ] 先写静态路由/桥接隔离测试及实际 Electron smoke：点击文件夹出现 webview，改变 scale 不换 guest，真实点击/滚轮传递、输入法发送、老板键保持窗口可见并恢复同一 guest，导航地址持久化。
- [ ] 在实现前运行 smoke，预期旧微信视图缺少 `[data-chat-ready]` 和真实气泡入口。
- [ ] 新视图移植已批准微信布局，头像从已审阅预览副本复制。更多菜单 settings/config/insert；配置结构化编辑与 JSON 原子校验；Ctrl+Enter/Shift+Enter 换行，`event.isComposing` 时不发送。
- [ ] 气泡 DOM 使用会话/消息稳定 key 与 `v-show`，布局变化不改变 src。webview 使用持久化隔离 partition，不带应用 preload；只允许抖音页面导航，远程页面不能调用聊天桥接。
- [ ] 页面脚本提供 owned CSS 适配和暂停/恢复：保存本次暂停前在播放的视频，恢复仅这一组；隐藏与老板键分别作为暂停原因。错误显示真实文字，销毁时清理 listeners/ResizeObserver。
- [ ] 气泡初始尺寸沿用预览：`width=(portrait?160:220)*scale/100`；比例竖 160/260、横 220/140；本批仅抖音设置可用。

## 任务 4：入口/IPC（src/main/index.js, src/preload/index.js, src/renderer/src/router/index.js, src/renderer/src/views/HomeView.vue）

- [ ] 主进程创建独立聊天服务和窗口注册，微信不再进入透明 hide registry；toggleBoss 同时分派现有透明/广告和新聊天策略，既有策略代码不改。
- [ ] `chat-mode:get/save/state/close/open` 校验来源：get/save/state/close 仅微信窗口，open 仅主窗口；save 更新只在持久化成功后广播。
- [ ] preload 新增 chatModeControl；首页保留微信入口、新增抖音微信模式入口；`/wechat` 指向新视图，其余透明/钉钉路由不改。
- [ ] 微信 guest 主进程独立分支安装现有 frame guard，并限制新窗口/导航目的地，不设置全局异常处理。
- [ ] `node --test tests/chat-*.test.mjs` 全通过。

## 任务 5：验证和交付

- [ ] `npm test`、`npm run build`，预期零失败/构建退出 0。
- [ ] `node scripts/run-wechat-smoke.mjs` 两轮独立进程检查实际 guest 和重启恢复，不使用用户账号/配置；回归 `npm run test:ad-modes` 与透明窗口/视频检查。
- [ ] 对照正式截图和已批准预览，核对保护文件 SHA256，记录公共文件必要改动。
- [ ] 添加运行/验收说明和验证记录。真实抖音在线访问另行记录，离线 smoke 不冒充线上播放已通过；用户自行登录验收。

自审：规格的本批要求对应上述任务；统一五模式入口、其他站点和钉钉/飞书不纳入本批。无 Git 操作；没有未定义的外部依赖。
