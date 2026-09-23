# 手机投屏模式基线可行性记录

日期：2026-09-23
目标：验证未修改 QtScrcpy v4.1.0 可在当前 Windows 电脑上从源码构建，并通过 USB 显示和控制一台真实 Android 设备。

## 固定基线

- QtScrcpy：v4.1.0
- 上游提交：`8c74f7199b159651c69e585989d362ee16a9d1da`
- 架构：Windows x64
- 编译器：Visual Studio Build Tools 2022 / MSVC x64
- CMake：Visual Studio 2022 附带版本
- Qt：5.15.2 `msvc2019_64`

## 检查结果

- [ ] 上游源码及 QtScrcpyCore 子模块完整
- [ ] 未修改源码构建成功
- [ ] 发布目录包含 QtScrcpy、Qt 运行库、ADB、配置与 scrcpy-server
- [ ] ADB 能识别并授权真实设备
- [ ] 投屏画面正常出现
- [ ] 鼠标点击可以控制手机
- [ ] 键盘输入或快捷键可以控制手机
- [ ] 调整投屏窗口大小后画面继续正确适配

## 结论

状态：验证中
