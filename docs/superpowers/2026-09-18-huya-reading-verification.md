# 虎牙窗口内全屏与双站阅读改造验收

日期：2026-09-18。用户确认设计后，在当前目录直接执行；无 Git，未创建仓库、工作树或提交。

## 交付

- 虎牙真实播放器右下角全屏按钮被捕获，和网页全屏快捷键共用窗口内铺满布局；再次点击或 Escape 退出。兼容旧 `player-wrap` 和当前公开 HTML 的 `J_playerMain`，恢复原始属性和页面滚动位置。没有打开全屏权限或切换显示器全屏。
- `/fanQue`、`/jinJiang` 改为专属 `ReadingSiteView`，采用已验收微信读书的 30px 主栏、恢复眼睛、更多六操作、四类弹窗。不是继续使用 SiteView。
- 真实目录、章节及设置控件浮出；番茄保留原 React 根节点的事件委托，晋江使用真实 chapter_list/prev/next/reader_setting_panel。浮出横向、窄视口可滚动，收起精确恢复属性/位置；旧根节点被替换时仍保全控件。
- 网页背景透明和原生窗口透明度独立，快速拖动原生透明度滑杆保存最后值；字号/颜色/恢复样式/滚动条、自动滚动速度 1–10、隐藏暂停/恢复、页底停止均已接入。弹窗支持焦点、Tab 循环和 Escape 恢复焦点。
- 自动滚动只作用于真实正文所在的 overflow 容器或文档滚动元素；缺少正文时明确失败且不保存假开启。没有自动跨章、绕过登录/VIP 或付费内容。
- 两站 target=_blank 站内章节跳转回原 guest；新窗口始终 deny。配置与地址分别保存，地址限各自 HTTPS 域名，拒绝伪域名/凭据/端口。原滚动配置 fanQue/jinJiang ScrollSpeed、AutoScrollEnabled 保留；各站新增独立 Zoom 字段。

## 新鲜验证

| 命令 | 结果 |
|---|---|
| npm test | 116/116 |
| npm run build | 生产构建通过 |
| npm run test:huya-window-fill | 5/5，真实 MediaStream video 与 player 边界贴合 guest viewport，手动 zoom/resize 仍贴合 |
| npm run test:reading-sites | 16/16，另两个跨进程重启检查通过 |
| npm run test:video-opacity | 单独重跑 40/40，跨进程重启 6/6 |
| npm run test:douyin-opacity | 13/13，重启 3/3 |
| npm run test:weread | 12/12，重启 3/3 |
| npm run test:smoke | 13/13，重启 2/2 |

测试先观察缺模块/旧路由失败，然后实现；缺正文、横向布局、根节点替换的新增失败分别观察后修复。DOM 和几何验收使用真实 Electron、生产 preload/主进程/渲染器，不以“click 标记”证明视频铺满。

首次并发三平台回归在截图阶段达到 120 秒 watchdog，记为失败，不计入通过；随后单独完整重跑成功。后续原生 UI 回归建议顺序执行，避免截图、焦点及原生窗口可见性相互干扰。

## 证据与限制

公开页面 HTTP 查询成功，确认当前虎牙 `J_playerMain`，番茄免费章节 `.muye-reader-content/.reader-toolbar/.muye-reader-btns/#app`，晋江免费章节 `.noveltext/#chapter_list/#chapter_prev_link/#chapter_next_link/#reader_setting_panel`。这只能证明选择器来源，不等于线上交互通过。

额外只读 Electron 探测：番茄真实免费章节加载成功，showReadingControls 返回 shown=true/count=2，随后清理。晋江完整 load 事件超时，但已提交免费正文 DOM，停止继续加载后真实控件浮出 shown=true/count=4，随后清理。这些结果只证明真实控件浮出，不证明原生字体/目录弹出交互或完整线上验收。虎牙 load 事件超时，已有部分 DOM，但后续执行报 Script failed to execute，未取得可用的线上按钮/几何证据；不据此推断生产 webview 交互通过或失败。隔离回归的 onlineSiteVerified 均为 false。用户应在自己的正常网络中复测真实直播间和免费章节。物理老板键也未验证：已有实例占用 Ctrl+D，测试使用实际 IPC 分发，不修改真实快捷键、不关闭用户程序。

所有 smoke 使用唯一临时 userData，本地 HTTPS 夹具或 file 夹具，阻断远程网络；退出后只删除经验证的测试临时目录。线上只读探测另外使用独立临时配置，不使用真实 cookies/账号，也不自动点击收费/账号操作。

## 保护与备份

备份：`backups/2026-09-18-huya-reading-before.zip`（170939 bytes）。保留，可以恢复改动前的 src/tests/scripts/package 文件；未覆盖或解压到原项目。

原版 `D:\MoYuMaster-1.0.0-win\resources\app.asar` SHA256 改动前后均为：

`456E0AC20C536C52F7B529B149BFD6D6D7CEBF24D6D7E831CDABC128754E79C9`

ZIP 内容与当前文件内存哈希比对：WeReadView、DouyinOpacityView、SiteView、window-definitions、window-controls、weread 两模块、douyin 两模块、guest-frame-navigation，共十个保护文件全部相同。没有改动源软件，也没有覆盖用户已有窗口定义重构。

截图已查看，位于 `.artifacts/huya-reading-demo-20260918/`：huya-window-fill.png、fanQue-reading-controls.png、jinJiang-reading-controls.png。这些截图是隔离本地夹具，不伪称线上网站截图。

当前会话按代码审查模板逐项核对：范围只替换两阅读路由；配置隔离和权限边界未扩张；真实 DOM 和视频未克隆；导航代际/CSS ownership/卸载清理保留；已修正横向排列、缺正文保存假开启、根节点替换后控件丢失三项问题。沿用用户选择的当前会话执行，不派代理审查、不伪造 Git diff。完整线上交互仍是人工验收项。

## 启动与人工复测

关闭当前复刻软件旧窗口，PowerShell：

```powershell
cd D:\deepseekharness\moyu-replica
npm run dev
```

首页点虎牙透明化→真实直播间→播放器右下角全屏；应占据现有小窗口内容区，而不是整个显示器，Escape 恢复。

首页点番茄小说/晋江文学城→免费正文→“控”；检查目录、字体、上一章/下一章，及更多内自动滚动、样式、恢复样式。隐藏/恢复窗口后滚动应暂停/继续；三站原生置顶/透明度和各站配置不应互相影响。
