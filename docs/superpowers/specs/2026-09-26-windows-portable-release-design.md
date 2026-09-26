# Windows x64 绿色便携版发布设计

日期：2026-09-26

## 目标

把当前 `moyu-replica` 完整应用制作成 Windows 10/11 x64 绿色便携压缩包。接收者下载 ZIP、完整解压后，双击“摸鱼大师.exe”即可运行，不需要安装 Node.js、Electron、Qt、ADB、开发工具或项目源码。

本轮只制作免安装便携版，不制作安装程序、不发布到应用商店，也不接入已延期的微信公众号扫码登录实验。

## 已确认选择

- 只支持 Windows 10/11 64 位。
- 使用“绿色便携目录 + ZIP”交付，不制作单文件自解压程序或 NSIS 安装包。
- 用户没有 Windows 代码签名证书；首版为无签名构建。
- 程序免安装，但用户设置继续保存在 Windows 用户数据目录，不跟随程序目录移动。
- 打包内容包含完整的 QtScrcpy 无线投屏运行库。
- 发布包不包含源码、测试、开发依赖、`.pdb`、`.lib`、个人配置、设备地址、配对码或测试数据。

## 当前项目状态

项目使用 Electron 31、Vue 3 和 `electron-vite`。现有 `npm run build` 只生成 `out/` 编译产物，没有安装桌面打包器，也没有 Windows 发布配置。

手机投屏通过 `src/main/phone-mirror-launcher.mjs` 启动 QtScrcpy。开发状态默认路径为：

```text
.artifacts/qtscrcpy-custom-runtime/QtScrcpy.exe
```

该路径依赖项目目录，在打包后的 `app.asar` 环境中不可用。发布前必须加入开发/打包双路径解析，并把 QtScrcpy 发布文件复制到 Electron 的 `resources` 目录。

当前接受的 QtScrcpy 运行库约 76.62 MiB，其中 `.pdb` 和 `.lib` 调试产物约 13.57 MiB。发布副本排除这些调试文件后约 63.05 MiB；项目内开发运行库保持不变。

## 方案比较

### 方案 1：electron-builder 解包目录后压缩

本轮采用。`electron-builder` 生成标准 `win-unpacked`，其中 Electron、`app.asar` 和外部 QtScrcpy 运行库保持稳定相对路径，再由受控脚本生成 ZIP。优点是解压即用、问题容易定位、外部原生组件最可靠；代价是压缩包内存在多个文件，用户必须完整解压而不能只复制主程序。

### 方案 2：单个 Portable EXE

会在运行时释放 Electron 和原生依赖，启动更慢，临时目录、杀毒软件扫描和 QtScrcpy 子进程路径更难控制。当前项目包含多 DLL 的 Qt 程序，不采用此方案。

### 方案 3：NSIS 安装程序

可创建快捷方式、卸载项和安装目录，但不符合“下载、解压、直接使用”的明确目标，本轮不采用。

## 构建工具与版本

- 使用固定版本 `electron-builder 26.15.3`，作为开发依赖写入锁文件。
- 继续使用现有 `electron-vite` 生成主进程、预加载和渲染层产物。
- 目标为 `win` + `x64` + `dir`，不调用安装器目标。
- 使用 PowerShell 发布脚本组装最终目录、生成 ZIP 和 SHA256。
- 构建过程不从 `D:\MoYuMaster-1.0.0-win` 复制任何代码或图标；只读源软件继续保持不变。

## 发布目录结构

最终输出目录：

```text
release/
├─ MoYuMaster-1.0.0-win-x64/
│  ├─ 摸鱼大师.exe
│  ├─ 使用说明.txt
│  ├─ LICENSE.electron.txt
│  ├─ LICENSES.chromium.html
│  ├─ resources/
│  │  ├─ app.asar
│  │  ├─ qtscrcpy/
│  │  │  ├─ QtScrcpy.exe
│  │  │  ├─ adb.exe
│  │  │  ├─ scrcpy-server
│  │  │  ├─ Qt5*.dll
│  │  │  ├─ *.dll
│  │  │  ├─ config/
│  │  │  ├─ keymap/
│  │  │  ├─ platforms/
│  │  │  └─ 其他 Qt 运行目录
│  │  └─ licenses/
│  │     ├─ QtScrcpy-LICENSE.txt
│  │     ├─ QtScrcpy-UPSTREAM.md
│  │     └─ QtScrcpy-runtime-license.txt
│  └─ Electron 运行时文件
├─ MoYuMaster-1.0.0-win-x64.zip
├─ SHA256SUMS.txt
└─ package-manifest.txt
```

`release/` 是生成物目录并加入 Git 忽略。ZIP 内以 `MoYuMaster-1.0.0-win-x64/` 为唯一顶层目录，避免用户直接解压时把大量文件散落到下载目录。

## Electron 打包配置

新增独立 `electron-builder.yml`，主要规则为：

- `appId` 使用项目自己的稳定标识。
- `productName` 为“摸鱼大师”。
- Windows 可执行文件名为“摸鱼大师”。
- 只包含生产运行需要的 `out/`、`package.json` 和生产依赖。
- `asar` 保持启用。
- 使用 `extraResources` 把 QtScrcpy 运行库复制到 `resources/qtscrcpy`。
- QtScrcpy 过滤规则排除 `*.pdb` 和 `*.lib`。
- 使用 `extraResources` 放入 QtScrcpy 许可与上游说明。
- 使用 `extraFiles` 把中文使用说明放在便携目录根部。
- 输出先进入受控的临时打包目录，再由发布脚本复制到版本化 `release` 目录。

本轮不复用只读源软件的品牌图标。若项目没有自有 Windows `.ico`，首个便携包沿用当前应用的默认图标；自有图标设计作为独立后续任务，不阻塞功能交付。

## QtScrcpy 路径解析

`resolvePhoneMirrorExecutable` 保留环境变量覆盖能力，并按以下优先级解析：

1. `MOYU_QTSCRCPY_RUNTIME`：开发者显式覆盖；可指向目录或 `QtScrcpy.exe`。
2. 打包状态：`process.resourcesPath/qtscrcpy/QtScrcpy.exe`。
3. 开发状态：`projectRoot/.artifacts/qtscrcpy-custom-runtime/QtScrcpy.exe`。

Electron 主进程创建 launcher 时显式传入 `app.isPackaged`、`process.resourcesPath` 和 `app.getPath('userData')/qtscrcpy`，避免模块在单元测试中隐式依赖 Electron 全局状态。launcher 启动 QtScrcpy 前创建该用户配置目录，并通过 `QTSCRCPY_CONFIG_PATH` 传递给子进程，使 QtScrcpy 的 `config.ini` 与 `userdata.ini` 不写入便携程序目录。

找不到运行库时继续显示中文错误，并包含实际检查路径；不得静默退回不存在的开发目录。

## 用户数据与免安装边界

- 程序文件可放在普通用户有读取权限的目录，运行不要求管理员权限。
- 用户设置、窗口尺寸、快捷键、登录令牌、书架记录和 QtScrcpy 配置继续使用 Electron 默认 `userData` 目录，位于各自 Windows 账户的应用数据区域。
- 替换或删除便携程序目录不会自动删除用户数据。
- 不实现“把所有设置写在程序旁边”的 U 盘数据模式。
- 本地书籍和视频保持原位置，只保存现有选择记录，不复制到发布包。
- 发布过程使用隔离的临时 `userData` 进行启动检查，不读取打包者的日常配置。

## 发布脚本

新增 PowerShell 脚本负责以下顺序：

1. 检查当前平台为 Windows x64。
2. 检查 Git 工作树状态并记录当前提交，但不自动修改或清理用户文件。
3. 检查 `out/` 可重新构建、QtScrcpy 必需文件存在、许可文件存在。
4. 执行 `electron-vite build`。
5. 执行 `electron-builder --win --x64 --dir`。
6. 检查解包目录包含主程序、`app.asar`、QtScrcpy、ADB、`scrcpy-server`、Qt 平台插件和说明文件。
7. 检查发布副本不包含 `.pdb`、`.lib`、源码、测试和个人配置。
8. 把解包目录复制为版本化便携目录。
9. 用 `Compress-Archive` 生成 ZIP。
10. 对 ZIP 计算 SHA256，写入 `SHA256SUMS.txt`。
11. 生成 `package-manifest.txt`，记录版本、架构、Git 提交、生成时间、文件数量和 ZIP 大小，不记录用户名、设备地址或密钥。

脚本只覆盖经过绝对路径校验的当前版本发布目录和文件，不递归清空仓库根目录或宽泛路径。

## 中文使用说明

`使用说明.txt` 至少包含：

- 支持 Windows 10/11 64 位。
- 必须完整解压 ZIP，不能只把主程序 `.exe` 单独拿出来。
- 双击“摸鱼大师.exe”启动，无需安装或管理员权限。
- 网页、阅读站点和视频站点需要联网。
- 手机投屏仅支持现有 Android 无线调试流程，不提供 USB 模式。
- 手机和电脑需满足无线 ADB 网络条件。
- 用户设置保存在 Windows 用户数据目录。
- 本包没有代码签名，首次运行可能显示“未知发布者”或 SmartScreen 提示。
- 建议先用随包 SHA256 对照发布方提供的哈希；不指导关闭 Defender 或其他安全软件。
- 退出主程序后，其启动的 QtScrcpy 应一同退出。
- 常见问题：压缩包未完整解压、被安全软件隔离文件、网站网络不可用、无线调试未连接。

## 许可与再分发

- QtScrcpy 源仓库的 Apache License 2.0 文件随包提供。
- QtScrcpy 上游说明和运行库中已有的许可文件随包提供。
- Electron 构建产物自带的 Electron/Chromium 许可文件保留。
- 不删除第三方 DLL、ADB 或随包组件要求保留的通知文件。
- 本轮不声称对第三方组件拥有专有版权。

## 无签名构建限制

- Windows 可能显示“未知发布者”。
- SmartScreen 和安全软件判断受下载来源、信誉和本机策略影响，无法通过打包配置保证不提示。
- 使用说明提供 SHA256 校验方法，但不建议用户绕过安全策略或关闭杀毒软件。
- 将来取得代码签名证书后，应作为独立发布流程接入，不在本轮伪造签名或使用来源不明证书。

## 自动检查

### 路径单元测试

覆盖：

- 开发状态解析 `.artifacts/qtscrcpy-custom-runtime/QtScrcpy.exe`。
- 打包状态解析 `resources/qtscrcpy/QtScrcpy.exe`。
- 环境变量目录与可执行文件覆盖。
- 候选文件缺失时中文错误包含实际路径。

### 打包结构测试

检查 `electron-builder.yml` 的架构、目标、`asar`、QtScrcpy 目标目录和调试文件排除规则；检查发布脚本只操作版本化输出路径。

### 构建检查

- 运行聚焦测试。
- 运行现有完整 Node 测试，确认打包改动没有破坏已完成模式。
- 运行 `npm run build`。
- 运行发布脚本并检查 ZIP 清单。

## 解压后人工验收

1. 把 ZIP 复制到与仓库无关的新临时目录。
2. 完整解压后双击“摸鱼大师.exe”。
3. 主界面能显示，发布目录不需要 `node_modules` 或源码。
4. 阅读、视频、聊天伪装、本地阅读和本地视频入口能打开。
5. “手机投屏模式”能从包内 `resources/qtscrcpy` 启动 QtScrcpy。
6. 再次点击手机投屏入口只聚焦已有 QtScrcpy，不重复启动。
7. 老板键和主程序退出仍能控制本次启动的 QtScrcpy。
8. 退出主程序后，本次启动的 QtScrcpy 进程不残留。
9. 使用发布的 `SHA256SUMS.txt` 重新计算 ZIP 哈希并一致。
10. ZIP 内不存在 `.pdb`、`.lib`、源码、测试、个人设置、设备地址或配对码。

没有真实 Android 无线调试设备时，可以验证 QtScrcpy 主窗口启动、聚焦和退出，但必须把“真实无线连接未复验”明确记录为发布限制，不能误报通过。

## 完成标准

只有同时满足以下条件才宣布便携版完成：

- 版本化 ZIP、SHA256 和清单均成功生成。
- 从全新解压目录启动主应用成功。
- 打包版手机投屏路径不再引用仓库 `.artifacts`。
- QtScrcpy 必需运行文件和许可文件齐全。
- 调试文件、源码、测试与个人数据未进入 ZIP。
- 自动检查通过，解压后核心入口完成抽查。
- 已明确记录无签名限制和任何未能真实复验的外部功能。

## 不在本轮范围

- macOS、Linux、Windows ARM64 或 32 位版本。
- NSIS/MSIX 安装包、自动更新和在线下载页。
- 购买或配置 Windows 代码签名证书。
- 自定义新的 Windows 应用图标。
- 修改透明模式、阅读模式、视频模式或聊天伪装功能。
- 修改无线投屏功能逻辑或增加 USB 模式。
- 实施微信公众号扫码登录方案。
