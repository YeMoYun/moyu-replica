# 抖音透明度模式验收记录

日期：2026-09-17。按已批准规格及用户选择的方式 2，在现有目录实现。

后续用户反馈打开时主进程弹窗，已专项修复 Electron 31 过期子页面导航转发，具体复现和最终计数见 [主进程弹窗修复记录](douyin-frame-error-verification.md)。下表保留首轮交付计数；后续最终单测为 83 项，抖音验收为 13 + 3 项。

## 交付范围

仅 `/douyinOpacity` 使用新的 `DouyinOpacityView.vue`。首页视频组新增“抖音透明度”入口；原“抖音模式”继续打开 `/douyin` 广告模式。

34px 工具栏顺序：眼睛、置顶、关闭、刷新、帮助、拖动区、缩放、水滴、鼠标移出隐藏。隐藏后留恢复眼睛。全部图标为 SVG，没有地址栏、前进/后退、通用复选框及常驻全屏文字按钮。

真实生产网页地址仍为 `https://www.douyin.com/?recommend=1`。首次自动适配，采用 1280×720 参考视口，缩放范围 0.2–1；dom-ready 后等待一帧，监听主文档导航和宿主尺寸变化。页面自己的纵向视频滚动不被禁用。

缩放预设 0.2/0.4/0.75/1、自定义滑块；窗口透明度范围 0.1–1、步长 0.01。手动缩放可持久化，并提供恢复自动适配。模块新增的布尔设置 `douyinOpacity.autoFit` 仅记录该偏好，不覆盖其他设置。保存失败回滚页面缩放，跨文档保存竞态有专项测试。

全局上一条/下一条/网页全屏/播放暂停通过窄 preload 事件桥控制 webview；网页全屏与原生窗口全屏、置顶分开。切换无按钮时仅发送键盘回退事件，不宣称已成功切换；全屏或播放没有目标时显示真实中文错误。隐藏时仅暂停之前在播放的视频，恢复时不启动用户原来暂停的视频。

## 新鲜验证结果

| 命令 | 结果 |
| --- | --- |
| `npm.cmd test` | 76/76，通过（新增 11 项） |
| `npm.cmd run build` | main/preload/renderer 构建通过 |
| `npm.cmd run test:douyin-opacity` | 12 项真实 Electron 本地验收 + 3 项进程重启恢复，通过 |
| `npm.cmd run test:smoke` | 13 项窗口回归 + 2 项重启恢复，通过 |
| `npm.cmd run test:weread` | 12 项微信读书回归 + 3 项重启恢复，通过 |

测试先红后绿：首次新增 10 项均因模块/页面/路由功能尚不存在而失败；实现后通过。后续新增导航期间保存缩放测试先复现 0.39 替代 0.75 的竞态，修复后通过。真实 Electron 首次复现入口返回值无法克隆的问题，修复对应 handler 后通过。

本地 Electron fixture 使用两个真实 HTML video + canvas MediaStream，未伪造原生窗口 API。验收包含控件顺序、高度、恢复眼睛、配置快捷键帮助与 Escape 焦点恢复、真实 guest zoom、窗口尺寸变化、内部滚动、预设及自动恢复、事件桥、缺控件错误、播放/暂停、老板键、连续透明度滑块输入最终值、置顶、鼠标隐藏、刷新和重开。

每次使用唯一临时 userData，拦截所有 HTTP(S)。临时数据在精确路径校验后自动删除，未使用或修改用户实际配置。运行时出现 Ctrl+D 被占用提示，因此不将老板键事件模拟计为实体键盘验收。窗口回归里受管理设置和未安装的原生绑定拒绝日志，以及微信读书缺控件日志，为预期负向测试。

## 只读及回归保护

备份：`D:\deepseekharness\moyu-replica\backups\2026-09-17-douyin-opacity-before.zip`（99,539 字节，包含修改前 src/tests/scripts/package.json）。

原版 `D:\MoYuMaster-1.0.0-win\resources\app.asar` 修改前后 SHA256 相同：

`456E0AC20C536C52F7B529B149BFD6D6D7CEBF24D6D7E831CDABC128754E79C9`

与 ZIP 内备份逐字节哈希比较通过、保持未变的文件：`WeReadView.vue`、微信读书 controller/page-scripts、`SiteView.vue`、`VideoView.vue`、`window-controls.mjs`、`window-definitions.mjs`。没有修改原版及提取参考目录，没有初始化 Git 或提交。

## 截图证据

目录：`D:\deepseekharness\moyu-replica\.artifacts\douyin-opacity-demo-20260917\`。

- `douyin-compact-autofit.png`：默认自动适配、图标工具栏。
- `douyin-resized-autofit.png`：窗口变大后真实 guest 缩放响应。
- `douyin-zoom-dialog.png`：缩放预设、恢复自动适配。
- `douyin-opacity-dialog.png`：窗口透明度 33%，步长 0.01。
- `douyin-help-dialog.png`：当前配置快捷键及使用说明。

这些截图明确是本地隔离夹具，不是线上抖音截图，不构成线上兼容或与录屏逐像素一致的声明。手动选择 75% 可能裁切宽网页，这是用户手动偏好；恢复自动适配后重新随窗口计算。

## 用户手动验收

```powershell
cd D:\deepseekharness\moyu-replica
npm.cmd run dev
```

首页 → 视频模式 → “抖音透明度”（不要选原“抖音模式”）。检查初次打开是否自动适配、改变窗口尺寸时是否同步缩放；图标顺序、拖动区、隐藏恢复、缩放/透明度弹窗、置顶和鼠标移出隐藏是否符合录屏。若旧设置保留手动比例，在蓝色四角弹窗点击“恢复自动适配”。

仍待人工验证：线上抖音 DOM/推荐/登录及账号权限；真实播放器全屏、上下条按钮选择器是否对应当前版本；不接受非可信键盘事件的网站回退行为；真实键盘快捷键及占用冲突；在桌面其他软件上的视觉透明效果。页面 DOM 更新可能需后续调整固定选择器，不承诺账号/权限或绕过站点限制。
