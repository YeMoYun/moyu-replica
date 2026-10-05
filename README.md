# 摸鱼大师

一个面向 Windows 桌面的「摸鱼」多合一工具：把阅读、视频、聊天等日常场景装进一组可以透明、置顶、自动隐藏的小窗口里，配合全局快捷键与老板键，在工作间隙快速进出、一键隐藏。

基于 **Electron 31 + Vue 3 + electron-vite** 构建的复刻实现，参考了 MoYuMaster 的产品思路，从窗口系统到页面交互均为独立实现。

> ⚠️ **免责声明**：本项目仅供学习与技术交流。请遵守所在工作场所的规定，合理安排工作与休息；使用本工具产生的一切后果由使用者自行承担。本项目与原版 MoYuMaster 无任何关联。

---

## 功能总览

主面板将所有功能分为五组，每个功能都在**独立的窗口**中打开：

### 📖 阅读模式
- **微信读书 / 番茄小说 / 晋江文学城**：以小窗或透明覆盖形式嵌入真实网页，支持网页透明、自动滚动、字体颜色与背景改写、缩放
- **本地阅读模式**：阅读本地 TXT / MOBI / PDF，书架管理、连续滚动、章节跳转、进度记忆、响应式排版

### 🌐 网页模式
- **通用网页端 / 知乎模式**：任意网址的透明小窗化浏览

### 🎬 视频模式
- **抖音 / 快手 / B站 / 虎牙 / 斗鱼**，各有两种形态：
  - **广告小窗**：右下角 286×420 的小视频窗
  - **透明覆盖窗**：可缩放的透明置顶播放器，自动适配视频画面
- **自定义网站模式 / 单机模式**：任意网址的广告小窗化
- **本地视频播放**：播放本地视频文件的小窗
- 全部平台支持播放控制、点赞、上/下一个的全局快捷键联动

### 📱 游戏与投屏
- **单机模式**：网页小窗化的游戏入口
- **手机投屏模式**：集成 QtScrcpy，通过 **Android 无线调试** 将手机画面投射为电脑窗口（无需 USB）

### 💬 伪装模式
- **微信 / 钉钉 / 飞书**：将阅读网页伪装成对应的聊天界面（消息列表、输入框、工作群外观），站点内容在皮肤之下滚动
- 支持配置常用站点与皮肤细节

### 🛠 通用窗口能力（所有功能窗口）
- **无边框透明窗口**：任意拖动、边缘/四角光标贴合缩放
- **透明度调节**：窗口整体不透明度 10%–100%
- **永久置顶 / 取消置顶**：置顶采用 `screen-saver` 层级，窗口与任务栏重叠时浮于任务栏之上
- **鼠标移出自动隐藏**：光标离开窗口淡出，移回恢复
- **网页穿透**（部分透明窗口）：点击窗口透明区域可穿透到下层软件
- **老板键**：一键隐藏/恢复所有功能窗口
- 尺寸、位置、透明度、置顶等状态自动记忆；新开窗口统一恢复默认外观，仅继承宽高

---

## 全局快捷键

| 动作 | 默认按键 | 说明 |
|---|---|---|
| 老板键 | `Ctrl+D` | 隐藏/恢复全部功能窗口 |
| 增加透明度 | `Ctrl+P` | 所有窗口一起变透明 |
| 降低透明度 | `Ctrl+O` | |
| 上一个 | `Ctrl+J` | 视频类窗口联动：上一个 |
| 下一个 | `Ctrl+K` | 视频类窗口联动：下一个 |
| 全部静音/屏幕 | `Ctrl+L` | 视频类窗口联动 |
| 全部点赞 | `Ctrl+M` | 视频类窗口联动 |
| 绑定软件 | `Ctrl+B` | 预留 |
| 播放/暂停 | `Ctrl+E` | 自动滚动与视频播放 |

快捷键可在应用内自定义，支持冲突检测；上述默认值如与已安装软件冲突（如 `Ctrl+D`），可在设置中修改。

---

## 技术栈

| 层 | 技术 |
|---|---|
| 桌面框架 | Electron 31 |
| 渲染层 | Vue 3 + vue-router（hash 路由，46 条） |
| 构建 | electron-vite 2 / Vite 5 |
| 打包 | electron-builder 26.15.3（win-x64 dir + 便携 ZIP） |
| 安卓投屏 | QtScrcpy（Apache-2.0，随包分发运行库） |
| 文档解析 | pdfjs-dist（PDF）、@lingo-reader/mobi-parser（MOBI） |
| 编码识别 | iconv-lite、jschardet |
| 测试 | node:test（单元）+ 真实 Electron 冒烟脚本（CDP 驱动） |

---

## 项目结构

```
moyu-replica/
├─ src/
│  ├─ main/                      # Electron 主进程
│  │  ├─ index.js                # 入口：窗口工厂、IPC 注册、托盘、全局快捷键
│  │  ├─ window-definitions.mjs  # 全部功能窗口的几何/外观定义（单一事实来源）
│  │  ├─ window-controls.mjs     # 普通窗口控制器：透明度/置顶/自动隐藏/穿透/记忆
│  │  ├─ ad-window-controls.mjs  # 广告小窗控制器（独立持久化与老板键覆盖语义）
│  │  ├─ chat-window-controls.mjs# 聊天伪装窗口控制器
│  │  ├─ window-live-resize.mjs  # 边缘贴合缩放状态机（两类控制器共享）
│  │  ├─ window-opening.mjs      # 新窗口居中/前台呈现/外观重置
│  │  ├─ video-mode-launcher.mjs # 视频平台模式启动与记忆
│  │  ├─ phone-mirror-*.mjs      # QtScrcpy 投屏启动、IPC、协议
│  │  ├─ guest-frame-navigation.mjs / video-guest-links.mjs  # 来宾页面安全
│  │  ├─ settings-guard.mjs      # 设置读写校验
│  │  └─ shortcuts.mjs / auth.js / storage.mjs / sites.js
│  ├─ preload/                   # contextBridge：windowControl / adModeControl / …
│  ├─ renderer/                  # Vue 3 应用
│  │  └─ src/
│  │     ├─ App.vue              # 根组件 + 全局缩放手柄挂载（能力探测后启用）
│  │     ├─ features/            # 功能域模块：ad-modes / chat / douyin /
│  │     │                       #   video-opacity / reading-sites / weread /
│  │     │                       #   local-reader / window-resize
│  │     ├─ views/               # 各功能窗口视图（每个路由一个窗口）
│  │     └─ router/              # 路由表
│  └─ shared/                    # 主/渲染进程共享：广告模式、聊天白名单、
│                                #   快捷键规范化、视频平台定义
├─ native/QtScrcpy/              # QtScrcpy 源码与运行库（Apache-2.0）
├─ tests/                        # 51 个 node:test 单元测试文件
├─ scripts/                      # 冒烟脚本（真实 Electron + CDP）、打包脚本
├─ docs/                         # 设计文档（specs/plans/verification）
├─ build/                        # 随包分发的中文使用说明
└─ electron-builder.yml          # 打包配置（asar、extraResources、过滤规则）
```

---

## 快速开始

### 环境要求

- Windows 10 / 11 x64
- Node.js ≥ 18（含 npm）
- 手机投屏需要一台支持**无线调试**（Android 11+）的安卓手机，与电脑在同一网络

### 开发运行

```bash
git clone https://github.com/YeMoYun/moyu-replica.git
cd moyu-replica
npm install
npm run dev
```

### 生产构建

```bash
npm run build        # 生成 out/ 主进程、预加载与渲染层产物
npm start            # 以生产产物启动
```

---

## 测试

项目采用两层测试体系，全部本地运行、不访问真实网站（冒烟脚本拦截所有远程请求）：

### 单元测试（node:test）

覆盖窗口控制器、缩放状态机、设置校验、聊天白名单、快捷键规范化、视图结构等：

```bash
npm test
```

### 冒烟测试（真实 Electron）

每条命令启动真实 Electron 进程，在隔离的用户数据目录中驱动真实窗口与来宾页面断言端到端行为：

```bash
npm run test:smoke              # 主面板与通用窗口
npm run test:weread             # 微信读书窗口（含真实任务栏 Z 序、缩放手柄拖拽）
npm run test:video-opacity      # 透明视频覆盖窗（5 平台）
npm run test:douyin-opacity     # 抖音透明窗专项
npm run test:huya-window-fill   # 虎牙窗口填充专项
npm run test:reading-sites      # 番茄/晋江阅读站
npm run test:ad-modes           # 五平台广告小窗
npm run test:video-chat-matrix  # 视频×聊天伪装矩阵
npm run test:phone-mirror       # 手机投屏集成
```

---

## 打包便携版

一键生成绿色便携压缩包（解压即用，无需安装）：

```bash
npm run package:win      # 构建 → electron-builder → 结构校验 → ZIP + SHA256 + 清单
npm run test:portable    # 解压 ZIP、隔离数据启动打包后的主程序做启动冒烟
```

产物位于 `release/`：

```
release/
├─ MoYuMaster-1.0.0-win-x64/     # 版本化便携目录
│  ├─ 摸鱼大师.exe
│  ├─ 使用说明.txt
│  └─ resources/                 # app.asar、qtscrcpy 运行库、许可文件
├─ MoYuMaster-1.0.0-win-x64.zip
├─ SHA256SUMS.txt                # 分发时可校验完整性
└─ package-manifest.txt          # 版本、提交、生成时间、哈希
```

要点：

- 用户设置保存在 Windows 用户数据目录，不跟随程序目录移动
- 打包脚本要求 Git 工作区干净，并记录当前提交号到清单
- 当前为**无签名构建**，首次运行可能触发 SmartScreen 提示

---

## 架构要点

### 窗口系统

每个功能 = 一条路由 = 一个独立 `BrowserWindow`。窗口的几何与外观（尺寸、透明、置顶、右下角定位等）集中在 `window-definitions.mjs` 单点定义；三类控制器分别管理普通窗口、广告小窗、聊天窗口的透明度、置顶、自动隐藏、像素级穿透与状态持久化，共享同一套老板键广播。

### 边缘贴合缩放

透明无边框窗口在 Windows 上没有 `WS_THICKFRAME`，系统缩放循环只能放大不能缩小。本项目统一关闭原生缩放区（`resizable:false`），在窗口最外圈挂载 pointer 事件手柄：按下时主进程快照边界与光标位置，拖动中渲染层只上报光标坐标，主进程把被抓边缘精确放到光标处——**边缘与鼠标 1:1 贴合、未涉及的边固定不动**。状态机位于 `window-live-resize.mjs`，由普通与广告两类控制器共享；渲染层在 `App.vue` 全局挂载一次，通过能力探测决定是否启用。

### 安卓投屏

主进程按「环境变量 → 打包资源 → 开发运行库」的顺序解析 QtScrcpy 可执行文件，投屏配置写入用户数据目录；退出主程序时回收随包启动的 QtScrcpy 进程。

### 安全边界

- 聊天伪装窗口对来宾页面执行 URL 白名单校验，重定向与弹窗一律拦截
- 所有来宾页面注入导航守卫，禁用弹窗劫持
- 非主进程能力最小化：渲染层通过 contextBridge 暴露有限 API，来宾页面沙箱化

---

## 文档

设计与验收文档位于 `docs/`：

- `docs/superpowers/specs/` — 每个功能的设计文档（中文，含方案比较与验收标准）
- `docs/superpowers/plans/` — 实施计划
- `docs/superpowers/verification/` — 可行性与验收记录
- `docs/superpowers/*.md` — 各专项验证记录

---

## 许可证

[MIT](LICENSE)

第三方组件：QtScrcpy（Apache-2.0）、Electron 与 Chromium 的许可文件随便携包分发。
