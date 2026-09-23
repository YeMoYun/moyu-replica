# 手机投屏模式纯无线可行性记录

日期：2026-09-23
目标：验证未修改 QtScrcpy v4.1.0 可使用其内置 ADB，在完全不连接 USB 的情况下配对、连接、显示和控制一台 Android 11+ 真实设备。

## 固定基线

- QtScrcpy：v4.1.0
- 上游提交：`8c74f7199b159651c69e585989d362ee16a9d1da`
- QtScrcpyCore：`9e388b8aa48e4e1c2cfdef408ef00c4c6b45c921`
- 架构：Windows x64
- 编译器：Visual Studio Build Tools 2022 / MSVC x64
- Qt：5.15.2 `msvc2019_64`
- ADB：Android Debug Bridge 1.0.41 / 33.0.2

## 已完成的本机构建证据

- [x] 上游源码及 QtScrcpyCore 子模块完整且源码保持未修改
- [x] 未修改源码构建成功
- [x] 发布目录包含 QtScrcpy、Qt 运行库、ADB、配置与 scrcpy-server
- [x] 内置 ADB 支持 `adb pair` 和 `adb connect`

## 纯无线真机检查

- [ ] 全程未连接 USB
- [ ] `adb pair` 使用六位配对码成功
- [ ] `adb connect` 使用无线调试连接端口成功
- [ ] ADB 设备状态为 `device`，不是 `offline` 或 `unauthorized`
- [ ] QtScrcpy 投屏画面正常出现
- [ ] 鼠标点击可以控制手机
- [ ] Android Home 指令可以控制手机
- [ ] 调整投屏窗口大小后画面继续正确适配
- [ ] 断开后无需再次配对即可直接重新连接

## 敏感信息处理

- 配对码由用户直接输入本机交互终端，未发送到聊天。
- 配对码、设备地址和端口未写入项目文件或 Git。

## 结论

状态：验证中
