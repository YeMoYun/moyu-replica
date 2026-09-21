# 三套聊天 UI 预览验证记录

日期：2026-09-18。状态：独立预览可交付；尚未获得三套界面分别验收通过，不进入正式集成。

## 交付位置

- `previews/chat-ui/index.html`：零新增依赖的本地预览入口，可双击打开。
- `previews/chat-ui/serve.cjs`：可选只监听 `127.0.0.1:4186` 的预览服务，严格只提供预览页面与样式/脚本，不暴露项目文件。
- `previews/chat-ui/README.md`：启动、边界、验收步骤。
- `previews/chat-ui/output/`：三平台的标准/紧凑/宽屏、设置、配置、视频/阅读遮挡截图。
- `previews/chat-ui/output/playwright/chrome-settings.png`：真实 Chrome 点击设置按钮后的截图。

## 参考与诚实边界

微信/钉钉布局参数直接读取只读源 `MoYuMaster/app/dist/assets/index-DCnjErhB.css` 与 `renderer.beautified.js`：微信 60px 导航/250px 列表，钉钉 35px 蓝色顶部区/120px 导航/250px 列表。飞书是新增独立方案，无源程序参考，不声称与最新真实客户端逐像素一致。

联系人、消息、头像、时间、成员数、已读状态全部标为演示。播放器、播放暂停、播放器放大只是本地布局状态，不加载真实视频或网页。视频老板键为明确标注的横/竖屏动态图占位，不是源 GIF；阅读单独使用文本遮挡。Ctrl+B 是网页内快捷键，不注册系统老板键。

## 验证证据

- `node --test previews/chat-ui/model.test.mjs`：9/9。
- `node previews/chat-ui/run-verify.mjs`：31/31；隔离 userData，外部请求为 0，渲染器错误为 0。
- 交互覆盖三平台布局、搜索/会话选择、消息转义、草稿保留、播放器插入、横竖屏、比例、发送方、交互遮罩、视频/阅读遮挡恢复、无效 JSON 原子保护、有效配置文字转义、尺寸预设、平台隔离、重载恢复。
- 窄视口检查 320/375/414/768px：三个平台根页面无横向溢出；窄屏会话列表按钮可展开并选择会话。
- 真实 Chrome 经本地 HTTP 打开，实际填入演示消息并按 Enter 发送成功，实际点击设置后弹窗正常显示；修复浏览器默认 favicon 404 后控制台 0 错误。
- `npm test`：正式项目既有 127/127。
- 本批开始/结束对比正式 `src/` 全部 62 个文件的 SHA256：0 改动、0 新增。`ChatSkinView.vue`、`ChatConfigView.vue`、路由、preload、所有透明模式均未修改。
- 源 `D:\MoYuMaster-1.0.0-win\resources\app.asar` SHA256 仍为 `456E0AC20C536C52F7B529B149BFD6D6D7CEBF24D6D7E831CDABC128754E79C9`。

## 验证中修正的预览问题

- 工具按钮重复 class 属性导致窄屏专用按钮样式失效；先复现后合并为单个 class。
- flex 子项把 `inline-flex` 计算为 `flex`，改为验证实际可见且可操作，不以错误的字面断言判断失败。
- 超长消息校验原本会先递增演示 ID；失败测试复现后改为先校验再修改状态。
- Electron 隐藏窗口采集弹窗时可能返回上一帧；加入截图背景像素断言先复现，再以 offscreen 绘制、关闭背景节流并等待绘制帧解决。重新检查弹窗截图，不把 DOM 通过当作截图正确。

## 后续门槛

请用户分别验收微信、钉钉、飞书的外观及交互。任何一套未通过，仅修改独立预览；全部所需界面明确通过后，再设计正式聊天行为与真实播放器集成，不改变已验收透明模式。
