# 2026-09-20 飞书抖音气泡验证记录

## 自动验证结果

- `npm test`：170 项通过，0 项失败。
- `npm run build`：main、preload、renderer 三个生产包构建成功。
- 飞书 Electron smoke：首次运行 13 项通过；重启恢复 1 项通过。
- 钉钉 Electron smoke：首次运行 12 项通过；重启恢复 1 项通过。
- 微信 Electron smoke：首次运行 20 项通过；重启恢复 1 项通过。
- 广告模式 smoke：首次运行 17 项通过；重启恢复 2 项通过。
- 抖音透明模式 smoke：首次运行 13 项通过；重启恢复 3 项通过。
- B站、虎牙、快手透明模式 smoke：40 项通过。
- 损坏飞书状态测试验证：原始无效状态写入 `chatMigration.feishu.invalidSaved`，默认 10 会话状态与警告原子写回。

## 隔离与本地优先证据

- 飞书首次打开时断言：10 个会话、1 个本地媒体卡片、0 个 WebView、飞书分区请求数为 0。
- 用户点击“＋”后才产生 1 个真实 guest；其 session 为 `persist:moyu-chat-feishu`。
- 同时创建的微信、钉钉、飞书 guest 分别使用 `persist:moyu-chat-wechat`、`persist:moyu-chat-dingtalk`、`persist:moyu-chat-feishu`，三个 Electron session 对象两两不同。
- 主进程拒绝从微信窗口调用飞书状态接口，也拒绝从飞书窗口调用微信状态接口。
- 只允许主窗口通过 `feishu-mode:open` 打开飞书，只允许飞书窗口通过 `feishu-mode:close` 关闭自身；未保留通用 `create-feishu` / `close-feishu-window` 旁路。
- 退出登录接口只允许主窗口调用，并且只删除登录凭据，不清空聊天状态、窗口状态或其他应用设置。
- 慢地址被后发快地址覆盖、跨域重定向被拒绝；测试中的 `ERR_ABORTED (-3)` 是旧导航被主动取消时的预期日志。
- 代码审查发现的同站意外导航竞态已增加失败回归测试；播放器会停止被拒绝的主框架导航并重发当前期望地址。
- `WSALookupServiceBegin 10108` 为当前 Windows 测试环境日志；未影响本地夹具验证。
- 本机 `Ctrl+D` 已被其他程序占用，自动化通过 IPC 直接触发同一老板键逻辑完成验证。

## 受保护文件与只读源哈希复核

| 文件 | SHA256 |
| --- | --- |
| `src/renderer/src/views/WechatView.vue` | `D782D43883CDBF7161105AA3C5AA14A1F332D1C77A016979EBD072DC275B51FB` |
| `src/renderer/src/views/DingTalkView.vue` | `86E684485C76D8830B89320063FE23F1567FB6272E996B1E721A4683470CFC07` |
| `src/renderer/src/views/DouyinOpacityView.vue` | `19F7D01EAB55FCFAA66E5D4547DA788884A5753F325950E3082D22121ED6CCBD` |
| `src/renderer/src/views/VideoOpacityView.vue` | `31DBE97A92454C65D842797A17A50818B4353AC8944DED08C8C77A1CD68B1E25` |
| `src/renderer/src/features/video-opacity/controller.mjs` | `B26E082E165BAEF3A5D03BBACB0BCFD8B564E0D42D49676A898A5DC20216D62A` |
| `src/renderer/src/features/video-opacity/page-scripts.mjs` | `9E6D2957C091CF099FEC4D54C7BE489E4E6625AD1C2697D00014E1B84FE80D4D` |
| `D:\MoYuMaster-1.0.0-win\resources\app.asar` | `456E0AC20C536C52F7B529B149BFD6D6D7CEBF24D6D7E831CDABC128754E79C9` |

以上哈希与实施前基线一致；微信、钉钉、抖音透明视图、通用视频透明视图及只读源包均未被修改。

## 未自动验证的边界

自动化未连接真实抖音服务，也未验证真实账号登录、线上推荐流和在线播放；这些项目保留给本机人工验收。目录不是 Git 工作区，所有变更直接保存在 `D:\deepseekharness\moyu-replica`，未创建分支或提交。
