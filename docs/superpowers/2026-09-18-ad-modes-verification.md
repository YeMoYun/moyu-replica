# 抖音与微信读书广告模式验证记录

日期：2026-09-18

## 本批变更

- 新增独立广告窗口注册与控制：`src/main/ad-window-controls.mjs`。
- 新增广告设置/地址校验：`src/shared/ad-modes.mjs`；设置保存于 `adModes.*`，不写入透明度命名空间。
- 新增广告页面控制器与页面脚本：`src/renderer/src/features/ad-modes/`。
- 新增 `VideoAdView.vue` 与 `ReadingAdView.vue`，替换抖音广告路由、微信读书广告路由。
- 广告老板键在视频内容区显示本地二维码遮挡，在阅读内容区显示本地广告遮挡；窗口本身保持可见。
- 广告切换透明模式只把当前地址交给既有透明窗口，不修改透明模式代码或透明设置。
- 首页增加两个广告入口；聊天界面、聊天配置和三套聊天 UI 均未接入本批正式代码。

## 直接证据

- `node --test tests/*.test.mjs`：125/125 通过。
- `npm run build`：通过。
- `npm run test:ad-modes`：首轮 16 项交互、重启 2 项通过；最终修复视频非当前播放器样式与阅读导航控制状态后重新通过。
- 透明/阅读/窗口回归：
  - 抖音透明：13 + 重启 3
  - B站/虎牙/快手透明：40 + 重启 6
  - 微信读书：12 + 重启 3
  - 番茄/晋江：16 + 重启 2
  - 虎牙窗口填充：5
  - 通用窗口：13 + 重启 2
- 保护范围内 23 个透明视图、透明 features、窗口控制器/定义、guest guard 和聊天视图校验值均未变化。
- `D:\MoYuMaster-1.0.0-win\resources\app.asar` SHA256 仍为 `456E0AC20C536C52F7B529B149BFD6D6D7CEBF24D6D7E831CDABC128754E79C9`。
- 备份：`backups/2026-09-18-ad-modes-before.zip`。

## 人工检查截图

- `.artifacts/ad-modes-20260918/douyin.png`：视频广告小窗、控件、视频区域。
- `.artifacts/ad-modes-20260918/douyin-covered.png`：视频区域二维码遮挡，广告头保持可见。
- `.artifacts/ad-modes-20260918/weReadAd.png`：阅读广告、真实阅读内容与顶部控件。
- `.artifacts/ad-modes-20260918/weReadAd-covered.png`：阅读区域本地广告遮挡，顶部控件保持可用。

## 限制

- 所有 Electron 烟测均使用离线网页夹具并阻断外部请求；报告不代表当前机器已完成抖音或微信读书线上页面验证。
- 烟测日志中 `Ctrl+D` 被占用提示来自当前 Windows 环境；老板键通过 IPC 事件直接验证了遮挡/恢复。正式验收时如果需要实体 Ctrl+D，应先在快捷键设置中改为未占用组合。
- Electron/Chromium 的离屏烟测会出现 `network_change_notifier_win.cc(268)` 等环境警告，不影响测试结果；预期的非法地址与错误设置测试也会打印对应拒绝日志。
- 广告模式目前只完成抖音、微信读书两个代表；B站、虎牙、快手、番茄、晋江广告模式及聊天 UI 仍按后续批次执行。

## 2026-09-18 小窗口操作修复

- 移除抖音广告视频区的小窗口点击遮罩；视频网页在广告小窗口内即可直接点击操作。
- 放大按钮现在只负责改变窗口尺寸，不再作为视频网页操作的前置条件。
- 抖音广告模式顶部增加返回按钮，调用当前视频网页历史记录返回，不关闭广告窗口。
- 老板键二维码遮挡层仍保留，遮挡时继续阻止视频操作并可恢复。
- 修复后 `npm run test:ad-modes` 为 17 项交互、2 项重启恢复全部通过；`node --test tests/*.test.mjs` 为 125/125 通过；`npm run build` 通过。
