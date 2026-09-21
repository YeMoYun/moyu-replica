# 三平台透明化实现与验证

日期：2026-09-17。用户批准当前会话执行，并要求首页四平台只保留透明化入口。

## 交付范围

- 首页保留“抖音透明化、B站透明化、虎牙透明化、快手透明化”，移除这四平台的旧普通模式按钮；旧路由和 API 保留兼容。斗鱼、本地视频、微信读书及其他入口不改。
- `/bilibiliOpacity`、`/huyaOpacity`、`/kuaishouOpacity` 使用 `VideoOpacityView.vue`，不再使用通用 SiteView；抖音仍使用已验收的专用页面。
- 三站使用相同 34px 图标栏、隐藏恢复、置顶、关闭、刷新、帮助、缩放、透明度、鼠标移出隐藏；缩放/透明度弹窗的范围、精度、预设、自动适配及焦点逻辑与抖音一致。
- 平台各自保存 zoom/autoFit 及原生窗口状态，自动适配依据实际 guest 视口。保存失败回滚，跨导航保留已提交的手动偏好。
- 播放/暂停处理所有 video；隐藏只暂停当时播放的视频，显示时不擅自恢复用户原先暂停的视频。
- 网页播放器全屏与原生窗口全屏/置顶分离。B站、虎牙没有切换控件时显示中文提示，不发送会改变音量的方向键，也不随机换直播房间。仅快手支持标记为未验证的键盘回退。
- 三站 `target=_blank` 请求进入主进程 allowlist；HTTPS 平台根域及子域、默认端口、无 URL 凭证的站内链接在原 guest 加载。处理器始终拒绝弹窗；外链维持系统浏览器处理。
- 对应窗口创建 IPC 返回可克隆的 true，不返回 BrowserWindow。三站安装既有 Electron 31 过期 frame 转发保护。

## 验证结果

| 命令 | 结果 |
| --- | --- |
| `npm.cmd test` | 104 / 104 通过 |
| `npm.cmd run build` | main / preload / renderer 构建成功 |
| `npm.cmd run test:video-opacity` | 首轮 40、进程重启 6 项通过 |
| `npm.cmd run test:douyin-opacity` | 13 + 重启 3 项通过 |
| `npm.cmd run test:smoke` | 13 + 重启 2 项通过 |
| `npm.cmd run test:weread` | 12 + 重启 3 项通过 |

TDD：原有基线 83 项通过；新增 20 项先因缺少新实现失败，然后转绿。真实 Electron 测试另外暴露 fullscreen 容器误匹配，补充第 21 项红测试后增加根节点过滤，最终共 104 项。

新 smoke 使用唯一临时 userData，普通远程请求被阻断。站内播放测试的 HTTPS 固定路径由协议拦截返回本地 fixture，不访问真实站点。结束后验证临时路径并删除测试数据，不使用或删除用户实际配置。

真实边界覆盖：八图标顺序、视口 zoom/native resize、内部滚动、精确滑杆输入、帮助与 Escape 焦点、真实 HTMLVideoElement/MediaStream、老板键选择性暂停恢复、原生 opacity/置顶、实际鼠标位置自动隐藏、关闭重开与进程重启。三站分别用不同 zoom/opacity/topmost 和不同窗口几何检查独立恢复。

站内新窗口测试实际点击 target=_blank 链接，核对 guest ID 不变、BrowserWindow 数量不变、最终 URL 和缩放正确。本地 fixture 不是线上页面成功的替代证明。

过期 frame 测试创建真正的 iframe，保存原生 WebFrameMain 后删除 iframe，确认原生 processId 访问抛出截图对应异常，再向 Electron 已安装的内部监听器重放导航事件；不是在线随机复现，也没有使用假的 frame getter。

## 实测发现与处理

1. `allowpopups=false` 会生成 disablePopups=true，站内链接在主进程处理前已被拦截。新三站允许请求到达处理器，但处理器无条件 deny，合法站内 URL 改在原 guest 加载。实际链接 smoke 从超时转为通过。
2. 虎牙全屏选择器可能命中带相同 CSS 类的页面根容器，错误地声称点击成功。脚本排除 body/html，并验证缺控件时仍显示真实中文错误。
3. Windows 原生透明窗口将请求的 450 DIP 高度取整为 451/452，恢复同一保存几何也出现 1 像素差异。验收比较独立记录的实际关闭前几何，明确容许各字段最大 2 像素误差；磁盘保存几何与关闭前实际几何要求完全相等。不改既有窗口控制器和默认尺寸。
4. 软件渲染的隔离截图明确调用 showInactive 并等待绘制，避免捕获未显示窗口的空白帧。截图不是对主窗口 ready-to-show 时序的新增证明。

本次按用户选择在当前会话做代码自查，没有独立审查代理。检查了路由边界、窄事件桥及卸载、域名/端口/凭证限制、异常回传、串行事务和已验收模块保护。

## 备份及只读保证

备份：`D:\deepseekharness\moyu-replica\backups\2026-09-17-video-opacity-before.zip`，含修改前 src/tests/scripts/package 文件。

原版 `D:\MoYuMaster-1.0.0-win\resources\app.asar` SHA256 修改前后相同：

`456E0AC20C536C52F7B529B149BFD6D6D7CEBF24D6D7E831CDABC128754E79C9`

逐文件与 ZIP 内原字节比较 SHA256 均未变：DouyinOpacityView、抖音 controller/page-scripts/fit、WeReadView、SiteView、main/sites.js、main/window-controls.mjs、main/guest-frame-navigation.mjs。原版及提取目录未写入。

截图：`D:\deepseekharness\moyu-replica\.artifacts\video-opacity-demo-20260917`，共 13 张，含首页及每站工具栏、帮助、缩放、透明度。

## 启动与线上验收门槛

退出旧复刻程序（包括托盘实例），在 PowerShell 执行：

```powershell
cd D:\deepseekharness\moyu-replica
npm.cmd run dev
```

本次未验证真实站点登录、网络播放、当前线上 DOM 或物理快捷键；不要据本地测试声称线上全部功能已经通过。逐站手动打开实际视频/直播，检查站内点击在原窗口播放、播放器全屏、登录、缩放、滚轮及播放暂停。B站、虎牙不支持切换的页面应有明确提示；快手键盘回退依赖站点响应。

隔离 smoke 运行期间系统拒绝注册 Ctrl+D，首页显示冲突提示；老板键行为通过 IPC 触发验证，不能等同于物理按键已验证。启动验收时避免原软件与复刻版同时占用相同快捷键；仍冲突则在快捷键设置修改，不自动覆盖用户设置。
