# 钉钉抖音气泡正式集成验证记录

日期：2026-09-20

## 已完成

- 正式 `/dingding` 使用独立钉钉视图，尺寸为 35px 顶栏、120px 导航、250px 会话列表、50px 标题栏。
- 五个默认本地会话，不自动联网；文件夹按钮按会话插入一个真实抖音 guest。
- `chatModes.dingtalk`、`chatWindows.dingtalk`、`persist:moyu-chat-dingtalk` 与微信完全分离；主进程同时强制检查窗口与 partition 的对应关系。
- 通用设置 IPC 无法读取或覆盖两套聊天状态；旧聊天配置 IPC 也按微信/钉钉来源窗口隔离。
- 旧 `dingdingConfig` 和 `dingding.currentSiteKey` 保留备份并迁移；非抖音旧站点产生可见说明。畸形旧配置会回退到五个默认会话、保留原始备份并显示迁移警告。
- 无边框钉钉窗口顶部蓝栏可拖动，搜索输入区保持可交互。
- 共用老板键只遮挡聊天播放器，不隐藏窗口；钉钉和微信同时打开时共同遮挡。
- 旧钉钉配置 API 和 `/dingdingConfig` 暂时保留兼容。

## 验证证据

- 钉钉实际 Electron：首轮 12/12，独立进程重启 1/1。首轮包含真实微信/钉钉双 partition、跨窗口 IPC 拒绝、会话切换媒体暂停/恢复、草稿、非法 JSON 原子拒绝、慢/快导航竞态和 renderer console error 检查。
- 微信回归：20/20，重启 1/1。
- 广告模式回归：17/17，重启 2/2。
- 抖音透明模式：13/13，重启 3/3。
- B站/虎牙/快手透明模式：40/40，重启 6/6。
- 完整单元测试：160/160；最终生产构建成功。

受保护文件的交付前 SHA256 与基线一致：`WechatView.vue`、`DouyinOpacityView.vue`、`VideoOpacityView.vue`、`features/video-opacity/controller.mjs`、`features/video-opacity/page-scripts.mjs`。只读源 `app.asar` SHA256 为 `456E0AC20C536C52F7B529B149BFD6D6D7CEBF24D6D7E831CDABC128754E79C9`。

## 环境与边界

- Windows 日志中的 `WSALookupServiceBegin 10108` 未导致隔离测试失败。
- 当前机器提示 Ctrl+D 被其他进程占用；人工验收前需关闭旧程序或更改快捷键。
- 自动化阻断远程请求，`onlineDouyinVerified` 为 false；不能据此宣称真实线上抖音已通过。
