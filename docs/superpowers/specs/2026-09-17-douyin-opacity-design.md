# 抖音透明度模式专属页面设计

日期：2026-09-17。状态：用户已确认采用 A 方案，等待实现计划。

## 目标与边界

只改录屏对应的 `/douyinOpacity` 透明度模式；普通 `/douyin` 广告模式、微信读书及其他网站入口保持现状。目标是让透明度模式的窗口行为、缩放和工具栏接近 `D:\MoYuMaster-1.0.0-win` 原版录屏：背景可透出，真实抖音网页填充窗口，打开后自动适配，不依赖用户反复滚轮调整页面比例。

原版只读参考和用户录屏用于确认视觉与行为；不复制抖音账号、登录或会员权限，不伪造网页内容。

## 用户可见界面

新增 `DouyinOpacityView.vue`，替换 `/douyinOpacity` 路由的 `SiteView.vue`。页面不再显示网址输入框、前进/后退、通用全屏文字按钮、百分比常驻文本或通用复选框。

工具栏为 34px 左右的深色紧凑栏，与录屏顺序一致：

- 左侧：隐藏操作栏、置顶/取消置顶、关闭、刷新、帮助；
- 中间：空白拖动区；
- 右侧：网页缩放、窗口透明度、鼠标移出隐藏；
- 隐藏后保留白色/红色眼睛恢复入口。

图标使用内联 SVG，按钮用 `title` 与 `aria-label` 表达作用；按钮区域禁止拖动，中间空白区域允许拖动。帮助、缩放和窗口透明度均使用深色弹窗，透明度滑块范围 0.1–1、步长 0.01；缩放提供 0.2、0.4、0.75、1.0 快捷值和自定义滑块。

## 网页自适应与视频行为

页面仍加载真实 `https://www.douyin.com/?recommend=1`，使用当前 `webview`。在 `dom-ready`、主文档导航和宿主窗口尺寸变化时执行同一套适配流程：

1. 等待网页完成一次布局；
2. 根据宿主 webview 可用尺寸计算缩放建议，并限制在 0.2–1.0；窗口较小时不放大网页，窗口变大时逐步恢复可读比例；
3. 调用 `webview.setZoomFactor`，保存到 `douyinOpacity.zoom`；
4. 注入仅由本模块持有的 CSS，清理横向溢出和通用页面滚动条造成的窗口滚动，保留抖音内容自己的视频切换/滚动区域；
5. 适配失败显示在专属错误区域，不吞掉异常。

“窗口全屏”与“网页内部全屏”分开：原生窗口仍由 `windowControl` 管理；全局 `all-screen` 事件只在 webview 内执行固定选择器序列（抖音全屏按钮、播放器全屏按钮）或抛出可见错误，不改变原生置顶状态。`all-prev`、`all-next` 先查找带 `aria-label` 的上一条/下一条按钮，再向网页派发 `ArrowUp`/`ArrowDown`；`stop-or-continue` 控制页面内所有 `<video>` 播放/暂停。页面卸载时全部取消订阅。

## 状态与接口

复用已有 sender-targeted `windowControl`：`getState`、`setOpacity`、`setAlwaysOnTop`、`setAutoHide`、`close`，不新增绕过主进程的窗口操作。使用 `window.ipcRenderer` 的受控事件订阅接收 `all-prev`、`all-next`、`all-screen`、`stop-or-continue`、`opacity-up`、`opacity-down` 与老板键状态。

新增 `douyinOpacityControl` preload 窄接口，仅提供 `onPrev`、`onNext`、`onAllScreen`、`onStopOrContinue`、`onOpacityUp`、`onOpacityDown` 和 `onBoss` 事件订阅；不把原始 Electron `ipcRenderer` 作为该页面依赖。已有通用 `windowControl` 仍是窗口状态唯一权威。

持久化只使用本模块键：`douyinOpacity.zoom`、`windowState.douyinOpacity` 中已有的透明度/置顶/自动隐藏/窗口边界。不得清空其他设置。刷新和重新打开时恢复透明度、置顶、边界和缩放。

## 错误处理与生命周期

- webview 尚未准备好时，按钮保持禁用或显示明确中文错误；
- 网页脚本找不到视频控制目标时，报告“当前页面未找到可操作的视频控件”，不显示假成功状态；
- 缩放/透明度设置保存失败时保留旧状态并显示错误；
- `ResizeObserver`、webview 事件、IPC 订阅和 debounce 定时器在 `onUnmounted` 全部清理；
- 老板键隐藏期间不改变用户的缩放、透明度和自动隐藏偏好。

## 测试方案

采用 TDD，先添加失败测试，再实现：

1. 路由测试：只有 `/douyinOpacity` 指向专属页面，`/douyin` 和其他站点仍指向原组件；模板没有旧地址栏/通用全屏控件。
2. 控制逻辑测试：缩放限制、快捷值、设置读写、错误回滚、事件订阅清理、隐藏栏恢复。
3. 网页脚本测试：自动适配计算、CSS 注入/移除、视频控制选择器与无目标错误；脚本可以独立通过 `Function#toString()` 注入 webview。
4. 隔离 Electron 冒烟：唯一临时 `userData`、拦截远程 HTTP(S)，用本地抖音网格/视频 fixture 验证 34px 工具栏、窗口缩放响应、真实 webview `setZoomFactor`、透明度/置顶/自动隐藏、快捷键事件、刷新和重启恢复，并截图检查视觉结果。
5. 回归：`npm.cmd test`、`npm.cmd run build`、既有 `npm.cmd run test:smoke`、微信读书 `npm.cmd run test:weread` 全部通过。自动化本地 fixture 不宣称线上抖音登录、账号权限或实体键盘验收通过。

## 明确不做

- 不改普通 `/douyin` 广告模式；
- 不复制抖音页面或绕过登录/会员权限；
- 不把“自动适配”实现成盲目固定全屏或破坏网页内部视频滚动；
- 不删除原 `SiteView.vue`，不修改只读原版目录。
