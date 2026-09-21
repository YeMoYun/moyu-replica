# 抖音透明度打开时主进程弹窗修复

日期：2026-09-17。用户报错：`Render frame was disposed before WebFrameMain could be accessed`，堆栈 `browser_init:2:95438`。

## 定位证据

实际运行时为 Electron 31.7.7。从本机 Electron 内嵌 `process.binding('natives')['electron/js2c/browser_init']` 的第二行对应列读取到：guest-view-manager 的 `will-frame-navigate` 监听器访问 `event.frame.processId`，该属性在 frame 已销毁时同步抛错。

官方 [Electron 31.7.7 guest-view-manager.ts](https://github.com/electron/electron/blob/v31.7.7/lib/browser/guest-view-manager.ts#L152-L159) 存在同一访问路径。当前上游 [对应实现](https://github.com/electron/electron/blob/main/lib/browser/guest-view-manager.ts) 已使用导航事件上的 processId/routingId；本项目没有升级 Electron 大版本或修改 node_modules。

之前的隔离夹具只有视频与滚动区域，未覆盖销毁子页面的导航事件，因而漏掉该情况。

## 修复边界

新增 `src/main/guest-frame-navigation.mjs`；仅在 `/douyinOpacity` 的宿主 `did-attach-webview` 时安装，仅对 Electron 31 生效。识别旧运行时的具体导航转发 callback，包装该 callback，不拦截应用自身监听器，不改全局 emit，不添加全局 uncaughtException 吞错。

正常事件保留原转发参数；只有此回调的准确 disposed-frame 错误被认定为过期事件、跳过并记录中文警告。其他异常原样抛出。重复安装不重复包装；guest 销毁时清理拥有的监听器；升级运行时后应重新评估/移除该版本限定兼容代码。

没有改微信读书、通用网页、视频视图、用户偏好或只读原版。

## 红绿回归

新增 7 项单测在修复前失败，修复后通过。

Electron 集成测试创建真实 iframe，保留其原生 WebFrameMain，然后从页面移除 iframe，等待原生对象的 processId 确实抛出 disposed 错误。向实际 guest 上的 Electron 内部 callback 确定性重放过期导航事件。修复前断言失败，包含与截图相同的 `browser_init:2:95438` 堆栈；修复后通过且 guest 仍存活。该重放是合成事件，但使用真实已销毁的原生 frame，而非伪造 getter，不等同于自动完成线上抖音用户场景验收。

最终命令结果：

- `npm.cmd test`：83 项通过，0 失败。
- `npm.cmd run build`：主进程、preload、renderer 通过。
- `npm.cmd run test:douyin-opacity`：13 项 + 3 项独立进程重启恢复通过。
- `npm.cmd run test:smoke`：13 项 + 2 项重启恢复通过。
- `npm.cmd run test:weread`：12 项 + 3 项重启恢复通过。

负向测试中的受管理设置/缺少原生绑定/微信读书缺控件错误是预期日志；Ctrl+D 被占用警告不计作实体键盘通过。过期导航事件中文警告是本次测试触发保护的预期日志。

备份：`D:\deepseekharness\moyu-replica\backups\2026-09-17-douyin-frame-error-before.zip`。原版 app.asar SHA256 保持 `456E0AC20C536C52F7B529B149BFD6D6D7CEBF24D6D7E831CDABC128754E79C9`。所有 Electron 验收使用临时隔离 userData、阻断远程请求，测试结束删除临时数据，不使用用户实际配置。

## 用户复验

这是主进程改动，需要完整重启当前开发实例，不能只刷新网页：关闭复刻软件，在启动它的终端 Ctrl+C，然后重新运行 `npm.cmd run dev`（目录 `D:\deepseekharness\moyu-replica`）。从首页打开“抖音透明度”，确认真实网页初次打开、刷新、关闭重开不再出现该主进程弹窗。
