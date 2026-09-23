# Phone Mirroring Wireless Feasibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prove that the already-built, unmodified QtScrcpy v4.1.0 runtime can pair, connect, display, and control one Android 11+ phone entirely over wireless debugging, without using USB at any point.

**Architecture:** Reuse the pinned source, isolated Qt toolchain, successful build, and published runtime already present under ignored `.artifacts/` paths. Use the bundled ADB for one real pairing-code session and one direct reconnect, then run the untouched QtScrcpy UI against the wireless device. Keep the pairing code out of chat, project files, Git, and captured command output by having the user type it directly into an interactive local terminal; device addresses may appear transiently in ADB output but are never committed.

**Tech Stack:** Windows PowerShell, QtScrcpy v4.1.0, bundled Android Debug Bridge 1.0.41 / 33.0.2, Android 11+ Wireless debugging, Git.

---

## Scope boundary

This plan implements only the highest-risk feasibility gate from `docs/superpowers/specs/2026-09-23-phone-mirroring-mode-design.md`.

Already completed and reused without repetition:

- QtScrcpy v4.1.0 source pinned at `8c74f7199b159651c69e585989d362ee16a9d1da`.
- QtScrcpyCore pinned at `9e388b8aa48e4e1c2cfdef408ef00c4c6b45c921`.
- Qt 5.15.2 `msvc2019_64` installed in the ignored project-local toolchain.
- Unmodified QtScrcpy successfully built and published to `.artifacts/qtscrcpy-runtime/`.
- Bundled ADB verified to expose both `pair` and `connect` commands.

Do not edit product code, QtScrcpy source, `src/`, `package.json`, or any existing transparent mode in this plan. Do not connect a USB cable. A failed wireless baseline stops later implementation work.

## File and artifact map

- Modify: `docs/superpowers/verification/2026-09-23-phone-mirroring-feasibility.md` — replace the obsolete USB criteria with durable wireless evidence and the PASS/BLOCKED result.
- Read only: `.artifacts/qtscrcpy-upstream/` — pristine upstream checkout.
- Read and execute only: `.artifacts/qtscrcpy-runtime/` — existing published runtime, ADB, Qt libraries, configuration, and scrcpy server.
- Do not commit `.artifacts/` or any device address, pairing code, screenshot, or runtime log.

### Task 1: Align the verification record with the approved wireless-only design

**Files:**
- Modify: `docs/superpowers/verification/2026-09-23-phone-mirroring-feasibility.md`

- [ ] **Step 1: Replace the obsolete USB record with the wireless checklist**

Replace the file content with:

```markdown
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
```

- [ ] **Step 2: Check the record diff and obsolete wording**

Run:

```powershell
git diff --check
rg -n "开启 USB 调试|连接 USB 设备|通过 USB 显示" docs/superpowers/verification/2026-09-23-phone-mirroring-feasibility.md
git diff -- docs/superpowers/verification/2026-09-23-phone-mirroring-feasibility.md
```

Expected: `git diff --check` passes and the search returns no obsolete USB instructions.

- [ ] **Step 3: Commit the corrected verification baseline**

Run:

```powershell
git add -- docs/superpowers/verification/2026-09-23-phone-mirroring-feasibility.md
git commit -m "docs: switch phone mirroring probe to wireless"
```

Expected: one documentation-only commit.

### Task 2: Reconfirm the existing runtime without rebuilding it

**Files:**
- Read only: `.artifacts/qtscrcpy-runtime/`
- Read only: `.artifacts/qtscrcpy-upstream/`

- [ ] **Step 1: Confirm the required runtime payload still exists**

Run:

```powershell
$required = @(
  '.artifacts\qtscrcpy-runtime\QtScrcpy.exe',
  '.artifacts\qtscrcpy-runtime\Qt5Core.dll',
  '.artifacts\qtscrcpy-runtime\Qt5Widgets.dll',
  '.artifacts\qtscrcpy-runtime\adb.exe',
  '.artifacts\qtscrcpy-runtime\scrcpy-server',
  '.artifacts\qtscrcpy-runtime\config\config.ini'
)
$missing = $required | Where-Object { -not (Test-Path -LiteralPath $_) }
if ($missing) { throw "Runtime is incomplete: $($missing -join ', ')" }
$required | ForEach-Object { Get-Item -LiteralPath $_ | Select-Object FullName, Length }
```

Expected: six files are listed and no exception is raised.

- [ ] **Step 2: Confirm source immutability and the bundled ADB feature set**

Run:

```powershell
git -C .artifacts/qtscrcpy-upstream status --short
git -C .artifacts/qtscrcpy-upstream rev-parse HEAD
& .artifacts/qtscrcpy-runtime/adb.exe version
& .artifacts/qtscrcpy-runtime/adb.exe help | Select-String -Pattern '^\s*pair HOST','^\s*connect HOST'
```

Expected:

- Source status is empty.
- HEAD is `8c74f7199b159651c69e585989d362ee16a9d1da`.
- ADB reports version 1.0.41 / 33.0.2.
- Help output contains both `pair HOST[:PORT] [PAIRING CODE]` and `connect HOST[:PORT]`.

- [ ] **Step 3: Confirm no USB device is present before pairing**

Run:

```powershell
& .artifacts/qtscrcpy-runtime/adb.exe start-server
& .artifacts/qtscrcpy-runtime/adb.exe devices -l
```

Expected: no physical USB device appears. If any device is already listed, identify whether it is a previous network serial in `IP:port` form; disconnect it before starting the fresh probe. Do not unplug or alter unrelated devices automatically.

### Task 3: Pair the phone without exposing the pairing code

**Files:**
- Execute only: `.artifacts/qtscrcpy-runtime/adb.exe`

- [ ] **Step 1: Ask the user to prepare the phone**

Required user actions:

1. Keep the phone and computer on the same mutually reachable network.
2. On Android 11+, open Developer options → Wireless debugging.
3. Turn on Wireless debugging.
4. Open “Pair device with pairing code” and leave that page visible.
5. Keep USB physically disconnected.

Do not ask the user to paste the six-digit code into chat.

- [ ] **Step 2: Open a visible local pairing terminal**

Run:

```powershell
$runtime = (Resolve-Path '.artifacts\qtscrcpy-runtime').Path
$adb = (Resolve-Path (Join-Path $runtime 'adb.exe')).Path
$escapedAdb = $adb.Replace("'", "''")
$pairCommand = @"
`$pairAddress = Read-Host '请输入手机配对窗口显示的 IP:配对端口'
& '$escapedAdb' pair `$pairAddress
Write-Host ''
Read-Host '记住上面的配对结果，然后按 Enter 关闭窗口'
"@
$encodedPairCommand = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($pairCommand))
Start-Process -FilePath 'powershell.exe' -WorkingDirectory $runtime -WindowStyle Normal -ArgumentList @(
  '-NoLogo', '-NoProfile', '-NoExit', '-EncodedCommand', $encodedPairCommand
)
```

Expected: a visible PowerShell window asks for the pairing address, then ADB asks for the six-digit pairing code. The user types both directly in that local window. The code does not appear in Codex chat or Git.

- [ ] **Step 3: Record only the pairing outcome**

Ask the user whether the terminal reported `Successfully paired to ...`.

Expected: pairing succeeds. If it reports a wrong code, timeout, or network error, stop and record the exact non-secret error category; do not proceed to QtScrcpy.

### Task 4: Connect the paired phone over its separate debugging port

**Files:**
- Execute only: `.artifacts/qtscrcpy-runtime/adb.exe`

- [ ] **Step 1: Keep the wireless debugging main page visible**

The user closes the pairing-code popup and reads the `IP address & Port` shown on the main Wireless debugging page. This connection port may differ from the pairing port.

- [ ] **Step 2: Open a visible local connection terminal**

Run:

```powershell
$runtime = (Resolve-Path '.artifacts\qtscrcpy-runtime').Path
$adb = (Resolve-Path (Join-Path $runtime 'adb.exe')).Path
$escapedAdb = $adb.Replace("'", "''")
$connectCommand = @"
`$connectAddress = Read-Host '请输入无线调试主页显示的 IP:连接端口'
& '$escapedAdb' connect `$connectAddress
Write-Host ''
& '$escapedAdb' devices -l
Write-Host ''
Read-Host '记住上面的连接结果，然后按 Enter 关闭窗口'
"@
$encodedConnectCommand = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($connectCommand))
Start-Process -FilePath 'powershell.exe' -WorkingDirectory $runtime -WindowStyle Normal -ArgumentList @(
  '-NoLogo', '-NoProfile', '-NoExit', '-EncodedCommand', $encodedConnectCommand
)
```

Expected: ADB reports `connected to ...`, and the device list contains one intended `IP:port` serial in state `device`.

- [ ] **Step 3: Independently verify the connected device state**

After the user closes the visible terminal, run:

```powershell
$adbOutput = & .artifacts/qtscrcpy-runtime/adb.exe devices -l
$adbOutput
$networkDevices = $adbOutput | Where-Object { $_ -match '^\S+:\d+\s+device\b' }
if ($networkDevices.Count -ne 1) {
  throw "Expected exactly one connected wireless device; found $($networkDevices.Count)"
}
```

Expected: exactly one wireless serial is in `device` state. Stop on `offline`, `unauthorized`, zero devices, or multiple ambiguous devices.

### Task 5: Exercise the untouched QtScrcpy projection path

**Files:**
- Execute only: `.artifacts/qtscrcpy-runtime/QtScrcpy.exe`

- [ ] **Step 1: Launch QtScrcpy from its runtime directory**

Run:

```powershell
$runtime = (Resolve-Path '.artifacts\qtscrcpy-runtime').Path
Start-Process -FilePath (Join-Path $runtime 'QtScrcpy.exe') -WorkingDirectory $runtime
```

Expected: the unmodified QtScrcpy v4.1.0 main window opens visibly.

- [ ] **Step 2: Start the wireless device using the existing QtScrcpy flow**

In QtScrcpy:

1. Refresh the device list.
2. Select the `IP:连接端口` device already connected by ADB.
3. Start the service.
4. Confirm that a phone projection window opens.

Acceptance: no USB cable is connected and the live phone image appears without a crash.

- [ ] **Step 3: Exercise only the critical control and resize behavior**

In the projection window:

1. Click one harmless phone UI target and confirm the phone responds.
2. Use QtScrcpy's Android Home action and confirm the phone returns Home.
3. Resize the projection window smaller and larger.
4. Confirm the complete phone image continues to fit without manual scrolling.
5. Stop the service and close QtScrcpy normally.

Acceptance: picture, click control, Home control, and resize behavior all work.

- [ ] **Step 4: Check normal process cleanup**

Run:

```powershell
Get-Process QtScrcpy,adb -ErrorAction SilentlyContinue | Select-Object ProcessName, Id, Path
```

Expected: QtScrcpy is gone after normal exit. The ADB server may remain; record that fact and do not force-kill it.

### Task 6: Prove direct reconnect without pairing again

**Files:**
- Execute only: `.artifacts/qtscrcpy-runtime/adb.exe`

- [ ] **Step 1: Disconnect the current wireless serial**

Run:

```powershell
$deviceLine = (& .artifacts/qtscrcpy-runtime/adb.exe devices) | Where-Object { $_ -match '^(\S+:\d+)\s+device$' } | Select-Object -First 1
if (-not $deviceLine) { throw 'No connected wireless device available for reconnect test' }
$serial = ([regex]::Match($deviceLine, '^(\S+:\d+)')).Groups[1].Value
& .artifacts/qtscrcpy-runtime/adb.exe disconnect $serial
& .artifacts/qtscrcpy-runtime/adb.exe devices
```

Expected: ADB reports the network serial disconnected and it no longer appears as `device`.

- [ ] **Step 2: Reconnect using only `adb connect`**

Run:

```powershell
$runtime = (Resolve-Path '.artifacts\qtscrcpy-runtime').Path
$adb = (Resolve-Path (Join-Path $runtime 'adb.exe')).Path
$escapedAdb = $adb.Replace("'", "''")
$reconnectCommand = @"
`$connectAddress = Read-Host '再次输入无线调试主页显示的 IP:连接端口（不要重新配对）'
& '$escapedAdb' connect `$connectAddress
Write-Host ''
& '$escapedAdb' devices -l
Write-Host ''
Read-Host '记住上面的重连结果，然后按 Enter 关闭窗口'
"@
$encodedReconnectCommand = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($reconnectCommand))
Start-Process -FilePath 'powershell.exe' -WorkingDirectory $runtime -WindowStyle Normal -ArgumentList @(
  '-NoLogo', '-NoProfile', '-NoExit', '-EncodedCommand', $encodedReconnectCommand
)
```

Expected: the phone returns to state `device` without running `adb pair` again.

- [ ] **Step 3: Verify the reconnected state**

Run:

```powershell
$adbOutput = & .artifacts/qtscrcpy-runtime/adb.exe devices -l
$adbOutput
if (-not ($adbOutput | Where-Object { $_ -match '^\S+:\d+\s+device\b' })) {
  throw 'Wireless reconnect did not return a device-state network serial'
}
```

Expected: one wireless device is again in `device` state.

### Task 7: Finalize the wireless feasibility decision

**Files:**
- Modify: `docs/superpowers/verification/2026-09-23-phone-mirroring-feasibility.md`

- [ ] **Step 1: Mark only directly observed wireless checks**

Change a checklist item from `- [ ]` to `- [x]` only when the command output or user-observed QtScrcpy behavior proved it. Never infer picture or input success from process existence.

- [ ] **Step 2: Record the strict conclusion**

If every wireless check passed, replace:

```markdown
状态：验证中
```

with:

```markdown
状态：PASS

结论：当前电脑上的 QtScrcpy v4.1.0 与内置 ADB 能够在完全不使用 USB 的情况下，通过 Android 11+ 配对码完成无线配对、连接、投屏、控制和直接重连。可以进入原生无线连接界面与 MoyuControlBar 实现阶段。
```

If any required check failed, use:

```markdown
状态：BLOCKED

结论：纯无线基线链路尚未全部通过，不能进入 QtScrcpy 产品改造。失败步骤、非敏感错误类别和实际观察结果已记录；配对码和设备地址未记录。
```

For a BLOCKED result, append the failed checklist item and sanitized error text under a `## 失败证据` heading. Do not record the pairing code, IP address, or ports.

- [ ] **Step 3: Review the repository boundary**

Run:

```powershell
git status --short
git diff --check
git diff -- docs/superpowers/verification/2026-09-23-phone-mirroring-feasibility.md
git check-ignore -v .artifacts/qtscrcpy-runtime/QtScrcpy.exe
```

Expected: only the verification record is modified; `.artifacts` is still ignored; no address, port, or pairing code appears in the diff.

- [ ] **Step 4: Commit the truthful evidence**

Run:

```powershell
git add -- docs/superpowers/verification/2026-09-23-phone-mirroring-feasibility.md
git commit -m "docs: record wireless phone mirroring feasibility"
```

Expected: one evidence-only commit. Commit either PASS or BLOCKED truthfully.

## Completion gate

Do not modify QtScrcpy source or MoYuMaster product code unless the verification record says `PASS`. A PASS authorizes a separate implementation plan for the native wireless connection UI and `MoyuControlBar`; Electron entry, local IPC, lifecycle, and packaging remain a later independently reviewable plan.
