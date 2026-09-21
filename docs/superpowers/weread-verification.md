# 微信读书专属页面验证记录

日期：2026-09-17

## 已完成

- 普通 `/weRead` 已改为 `WeReadView.vue`；`/weReadAd`、`/weReadAdOld` 和其他网站继续使用原有 `SiteView.vue`。
- 普通微信读书不再渲染通用网址输入、前进/后退/刷新、全屏、百分比、复选框和文字“显示操作栏”等控件。
- 新工具栏为 30px 深色录屏式简约栏：隐藏/恢复、关闭、置顶、鼠标移出隐藏、网页透明、窗口透明度、“控”和“更多”。
- “控”操作的是网页真实 `.readerControls`，支持横向浮层、真实按钮点击、提示方向调整、原父节点/兄弟节点/属性/子元素样式精确恢复。
- 已接入网页透明、窗口透明度 0.1–1 步长 0.01、置顶、自动滚动、老板键隐藏暂停/恢复、滚动条、背景/字体颜色、缩放 0.6–1、恢复默认、刷新重注入和重启恢复。

## 自动化证据

在 `D:\deepseekharness\moyu-replica` 执行：

| 命令 | 结果 |
|---|---|
| `node --test tests/*.test.mjs` | 65/65 通过 |
| `npm.cmd run build` | production build 通过 |
| `npm.cmd run test:smoke` | 13/13，重启 2/2 通过 |
| `npm.cmd run test:weread` | 12/12，重启 3/3 通过 |
| `node --test tests/weread-scripts.test.mjs` | 14/14 通过 |

微信读书冒烟测试使用唯一临时 `userData`、拦截远程 HTTP(S)，在真实 Electron/Vue/webview 中加载项目内本地阅读夹具；不会读取或修改用户配置。测试输出明确标记 `onlineSiteVerified:false`、`physicalKeyboardVerified:false`。

截图位于 `.artifacts/weread-demo-20260917/`：

- `weread-compact.png`：普通简约工具栏；
- `weread-reader-controls.png`：真实网页阅读控件浮层；
- `weread-transparent.png`：网页透明但窗口不变暗；
- `weread-opacity.png`：窗口透明度滑块效果。

## 只读源与回滚

- 源程序 `D:\MoYuMaster-1.0.0-win` 未写入；`resources/app.asar` SHA-256 仍为 `456E0AC20C536C52F7B529B149BFD6D6D7CEBF24D6D7E831CDABC128754E79C9`。
- 本批次修改前备份：`backups\2026-09-17-weread-before.zip`。

## 尚需人工验收

线上微信读书的登录、真实书籍 DOM、账号权限和网站持续更新仍需在允许网络的实际环境中人工验证；本地夹具自动化不能替代线上兼容性、实体键盘快捷键和录屏视觉逐帧验收。
