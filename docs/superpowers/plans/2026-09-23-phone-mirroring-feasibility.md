# Phone Mirroring Baseline Feasibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prove on this Windows machine that an unmodified, pinned QtScrcpy source build can launch and display/control one real Android device before any MoYuMaster UI or integration code is changed.

**Architecture:** Keep all source, toolchain, build, and runtime artifacts under the ignored `.artifacts/` directory. Pin QtScrcpy v4.1.0, reproduce its official Windows CI toolchain (Qt 5.15.2 with MSVC 2022), build and publish the untouched upstream application, then complete one user-observed USB-device session. Product code remains unchanged in this plan.

**Tech Stack:** Windows PowerShell, Git, CMake 3.30.5, Visual Studio 2022 Build Tools/MSVC, Qt 5.15.2 `msvc2019_64`, QtScrcpy v4.1.0, ADB.

---

## Scope boundary

This is the first of three implementation plans derived from `docs/superpowers/specs/2026-09-23-phone-mirroring-mode-design.md`:

1. This plan: upstream source/build/real-device feasibility.
2. Later plan: native `MoyuControlBar` in `Dialog` and `VideoForm`.
3. Later plan: Electron entry, local IPC, boss-key integration, lifecycle, and packaging.

Do not edit `src/`, `package.json`, existing transparent modes, or QtScrcpy source during this plan. A failed baseline must stop before product changes begin.

## File and artifact map

- Create: `docs/superpowers/verification/2026-09-23-phone-mirroring-feasibility.md` — durable evidence and the final PASS/BLOCKED decision.
- Create ignored directory: `.artifacts/qtscrcpy-upstream/` — pristine v4.1.0 checkout including `QtScrcpyCore`.
- Create ignored directory: `.artifacts/qtscrcpy-toolchain/` — isolated Python environment and Qt SDK if Qt is not already available.
- Create ignored directory: `.artifacts/qtscrcpy-runtime/` — published Windows runtime used for the real-device check.
- Do not add downloaded binaries or generated CMake output to Git.

### Task 1: Record the immutable baseline and toolchain probe

**Files:**
- Create: `docs/superpowers/verification/2026-09-23-phone-mirroring-feasibility.md`

- [ ] **Step 1: Confirm the Git worktree is clean**

Run:

```powershell
git status --short --branch
```

Expected: `## main` and no changed paths. If product files are already dirty, stop and preserve those changes before continuing.

- [ ] **Step 2: Re-run the compiler and CMake probe**

Run:

```powershell
$vswhere = 'C:\Program Files (x86)\Microsoft Visual Studio\Installer\vswhere.exe'
$cmake = 'C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\Common7\IDE\CommonExtensions\Microsoft\CMake\CMake\bin\cmake.exe'
& $vswhere -products * -version '[17.0,18.0)' -format json
& $cmake --version
Get-ChildItem 'C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\VC\Tools\MSVC' -Directory
```

Expected:

- Visual Studio Build Tools 2022 is complete and launchable.
- CMake reports `3.30.5-msvc23` or a compatible newer version.
- At least one MSVC toolset directory is listed.

- [ ] **Step 3: Check for an existing Qt 5.15.2 installation without scanning whole drives**

Run:

```powershell
$qtCandidates = @(
  'D:\Qt\5.15.2\msvc2019_64',
  'C:\Qt\5.15.2\msvc2019_64',
  "$env:LOCALAPPDATA\Programs\Qt\5.15.2\msvc2019_64",
  '.artifacts\qtscrcpy-toolchain\Qt\5.15.2\msvc2019_64'
)
$qtCandidates | ForEach-Object {
  [pscustomobject]@{
    Path = $_
    QMake = Test-Path -LiteralPath (Join-Path $_ 'bin\qmake.exe')
  }
} | ConvertTo-Json
```

Expected on the current machine: every `QMake` value is `false`. If a valid existing installation is found, use it and skip Task 3.

- [ ] **Step 4: Create the verification record with the known fixed baseline**

Create `docs/superpowers/verification/2026-09-23-phone-mirroring-feasibility.md` with exactly this initial content:

```markdown
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
```

- [ ] **Step 5: Commit the baseline record**

Run:

```powershell
git add -- docs/superpowers/verification/2026-09-23-phone-mirroring-feasibility.md
git commit -m "docs: start phone mirroring feasibility record"
```

Expected: one documentation-only commit.

### Task 2: Acquire and verify pristine QtScrcpy v4.1.0

**Files:**
- Create ignored directory: `.artifacts/qtscrcpy-upstream/`

- [ ] **Step 1: Verify the destination is safe and unused**

Run:

```powershell
$repoRoot = (Resolve-Path '.').Path
$upstream = [System.IO.Path]::GetFullPath((Join-Path $repoRoot '.artifacts\qtscrcpy-upstream'))
if (-not $upstream.StartsWith((Join-Path $repoRoot '.artifacts'), [System.StringComparison]::OrdinalIgnoreCase)) {
  throw "QtScrcpy target escaped .artifacts: $upstream"
}
if (Test-Path -LiteralPath $upstream) {
  throw "QtScrcpy target already exists; inspect it instead of overwriting: $upstream"
}
$upstream
```

Expected: an absolute path beneath `D:\deepseekharness\moyu-replica\.artifacts`.

- [ ] **Step 2: Clone the official v4.1.0 tag without changing the user's Git proxy configuration**

The user's persistent Git proxy currently points to an unavailable local port. Override it only for these commands:

```powershell
git -c http.proxy= -c https.proxy= clone --branch v4.1.0 --depth 1 https://gitee.com/Barryda/QtScrcpy.git .artifacts/qtscrcpy-upstream
```

Expected: checkout completes without modifying global or repository proxy settings.

- [ ] **Step 3: Initialize the GitHub-hosted QtScrcpyCore submodule over HTTPS**

The upstream `.gitmodules` file uses an SSH URL. Override that URL only for this checkout:

```powershell
git -C .artifacts/qtscrcpy-upstream config submodule.QtScrcpy/QtScrcpyCore.url https://github.com/barry-ran/QtScrcpyCore.git
git -C .artifacts/qtscrcpy-upstream -c http.proxy= -c https.proxy= submodule update --init --depth 1 QtScrcpy/QtScrcpyCore
```

Expected: `QtScrcpy/QtScrcpyCore/CMakeLists.txt` exists.

- [ ] **Step 4: Verify the exact source revision and clean state**

Run:

```powershell
git -C .artifacts/qtscrcpy-upstream rev-parse HEAD
git -C .artifacts/qtscrcpy-upstream status --short
git -C .artifacts/qtscrcpy-upstream submodule status
```

Expected:

- HEAD is `8c74f7199b159651c69e585989d362ee16a9d1da`.
- The checkout has no modifications.
- The submodule line does not begin with `-` or `+`.

- [ ] **Step 5: Confirm the upstream license is present**

Run:

```powershell
Get-FileHash .artifacts/qtscrcpy-upstream/LICENSE -Algorithm SHA256
Get-Content .artifacts/qtscrcpy-upstream/LICENSE -TotalCount 5
```

Expected: the file begins with `Apache License` and `Version 2.0`.

### Task 3: Install an isolated Qt SDK only if the probe found none

**Files:**
- Create ignored directory: `.artifacts/qtscrcpy-toolchain/`

- [ ] **Step 1: Stop for explicit approval before the large dependency download**

Report that Qt 5.15.2 development files are absent, that Visual Studio and CMake are already usable, and that the proposed Qt/Python environment will live only under `.artifacts/qtscrcpy-toolchain/`. Do not run the remaining Task 3 steps until the user approves the download.

- [ ] **Step 2: Create a project-local Python environment**

Run:

```powershell
py -3 -m venv .artifacts/qtscrcpy-toolchain/venv
& .artifacts/qtscrcpy-toolchain/venv/Scripts/python.exe -m pip install --upgrade pip
& .artifacts/qtscrcpy-toolchain/venv/Scripts/python.exe -m pip install aqtinstall==3.3.0
```

Expected: `aqt.exe` is created beneath `.artifacts/qtscrcpy-toolchain/venv/Scripts/`.

- [ ] **Step 3: Install the same Qt version and architecture used by upstream Windows CI**

Run:

```powershell
& .artifacts/qtscrcpy-toolchain/venv/Scripts/aqt.exe install-qt windows desktop 5.15.2 win64_msvc2019_64 --outputdir .artifacts/qtscrcpy-toolchain/Qt
```

Expected: `.artifacts/qtscrcpy-toolchain/Qt/5.15.2/msvc2019_64/bin/qmake.exe` exists.

- [ ] **Step 4: Verify Qt without changing the machine PATH**

Run:

```powershell
& .artifacts/qtscrcpy-toolchain/Qt/5.15.2/msvc2019_64/bin/qmake.exe -query QT_VERSION
& .artifacts/qtscrcpy-toolchain/Qt/5.15.2/msvc2019_64/bin/qmake.exe -query QT_INSTALL_PREFIX
```

Expected: version `5.15.2` and a prefix inside this repository's `.artifacts` directory.

### Task 4: Build and publish the unmodified upstream application

**Files:**
- Create ignored build output below `.artifacts/qtscrcpy-upstream/output/`
- Create ignored runtime: `.artifacts/qtscrcpy-runtime/`

- [ ] **Step 1: Set process-local build environment variables**

Run in one PowerShell session:

```powershell
$upstream = (Resolve-Path '.artifacts/qtscrcpy-upstream').Path
$qtBase = (Resolve-Path '.artifacts/qtscrcpy-toolchain/Qt/5.15.2').Path
$cmakeDir = 'C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\Common7\IDE\CommonExtensions\Microsoft\CMake\CMake\bin'
$env:ENV_QT_PATH = $qtBase
$env:ENV_VCVARSALL = 'C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\VC\Auxiliary\Build\vcvarsall.bat'
$env:ENV_VCINSTALL = 'C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\VC'
$env:PATH = "$cmakeDir;$env:PATH"
```

Expected: no persistent environment variables are written.

- [ ] **Step 2: Build with the upstream Windows build script**

Run:

```powershell
Push-Location $upstream
try {
  & cmd.exe /d /c 'ci\win\build_for_win.bat RelWithDebInfo x64'
  if ($LASTEXITCODE -ne 0) { throw "QtScrcpy build failed with exit code $LASTEXITCODE" }
} finally {
  Pop-Location
}
```

Expected: `.artifacts/qtscrcpy-upstream/output/x64/RelWithDebInfo/QtScrcpy.exe` exists.

- [ ] **Step 3: Prove the source stayed unmodified after the build**

Run:

```powershell
git -C .artifacts/qtscrcpy-upstream status --short
git -C .artifacts/qtscrcpy-upstream diff --exit-code
```

Expected: no tracked source changes. Generated ignored/untracked build directories are acceptable only outside tracked source paths.

- [ ] **Step 4: Publish a runnable directory with upstream's deployment script**

Run:

```powershell
$runtime = [System.IO.Path]::GetFullPath((Join-Path (Resolve-Path '.').Path '.artifacts\qtscrcpy-runtime'))
if (Test-Path -LiteralPath $runtime) {
  throw "Runtime target already exists; inspect it instead of overwriting: $runtime"
}
Push-Location $upstream
try {
  & cmd.exe /d /c 'ci\win\publish_for_win.bat x64 ..\..\..\qtscrcpy-runtime'
  if ($LASTEXITCODE -ne 0) { throw "QtScrcpy publish failed with exit code $LASTEXITCODE" }
} finally {
  Pop-Location
}
```

Expected: `.artifacts/qtscrcpy-runtime/QtScrcpy.exe` exists.

- [ ] **Step 5: Check the minimum runtime payload**

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
$required | ForEach-Object { [pscustomobject]@{Path=$_;Exists=Test-Path -LiteralPath $_} } | Format-Table -AutoSize
if ($required.Where({ -not (Test-Path -LiteralPath $_) }).Count) { throw 'Published runtime is incomplete' }
```

Expected: every item reports `True`.

### Task 5: Complete one real-device USB session

**Files:**
- Modify: `docs/superpowers/verification/2026-09-23-phone-mirroring-feasibility.md`

- [ ] **Step 1: Ask the user to prepare the Android device**

Required user actions:

1. Use Android 5.0 or newer.
2. Enable Developer options and USB debugging.
3. Connect with a data-capable USB cable.
4. Unlock the phone and accept the computer's RSA debugging prompt.

Do not change phone settings automatically.

- [ ] **Step 2: Verify ADB authorization before opening QtScrcpy**

Run:

```powershell
& .artifacts/qtscrcpy-runtime/adb.exe start-server
& .artifacts/qtscrcpy-runtime/adb.exe devices -l
```

Expected: exactly one intended device line ends in `device`, not `unauthorized` or `offline`. If multiple devices are present, identify the intended serial before continuing.

- [ ] **Step 3: Launch the visible upstream application for user interaction**

Run:

```powershell
$runtime = (Resolve-Path '.artifacts/qtscrcpy-runtime').Path
Start-Process -FilePath (Join-Path $runtime 'QtScrcpy.exe') -WorkingDirectory $runtime
```

The window is intentionally visible because the user must interact with and assess it.

- [ ] **Step 4: Exercise only the critical real-device path**

In QtScrcpy:

1. Refresh the device list.
2. Select the authorized USB device.
3. Start the service.
4. Confirm that the phone picture appears.
5. Click one harmless phone UI target from the PC.
6. Use `Ctrl+H` and confirm Android Home is triggered.
7. Resize the projection window smaller and larger; confirm the full phone picture continues to fit without manual scrolling.
8. Stop the service and close QtScrcpy.

Acceptance criteria: no crash, usable picture, working input, working Home command, and correct resize behavior.

- [ ] **Step 5: Check for leftover processes**

Run:

```powershell
Get-Process QtScrcpy,adb -ErrorAction SilentlyContinue | Select-Object ProcessName,Id,Path
```

Expected: QtScrcpy is gone after normal exit. `adb` may remain as its normal server process; record that fact rather than force-killing it.

### Task 6: Finalize the feasibility decision

**Files:**
- Modify: `docs/superpowers/verification/2026-09-23-phone-mirroring-feasibility.md`

- [ ] **Step 1: Mark each observed checklist item**

Change only successfully observed items from `- [ ]` to `- [x]`. Do not mark an item from build logs alone when it requires user-visible phone behavior.

- [ ] **Step 2: Record a strict conclusion**

If all eight checklist items passed, replace:

```markdown
状态：验证中
```

with:

```markdown
状态：PASS

结论：当前电脑能够从未修改的 QtScrcpy v4.1.0 源码构建出完整 Windows x64 运行目录，并能通过 USB 显示和控制真实 Android 设备。可以进入 MoyuControlBar 原生改造阶段。
```

If any required item failed, replace it with:

```markdown
状态：BLOCKED

结论：基线链路尚未通过，不能进入 MoyuControlBar 改造。失败项和原始错误已记录在下方。
```

Then append the exact failing command, exit code, and concise error text. Do not propose product-code workarounds for a broken upstream baseline.

- [ ] **Step 3: Review the repository diff**

Run:

```powershell
git status --short
git diff -- docs/superpowers/verification/2026-09-23-phone-mirroring-feasibility.md
```

Expected: only the verification record is modified; `.artifacts` remains ignored.

- [ ] **Step 4: Commit the evidence**

Run:

```powershell
git add -- docs/superpowers/verification/2026-09-23-phone-mirroring-feasibility.md
git commit -m "docs: record phone mirroring feasibility"
```

Expected: one evidence-only commit. If the result is BLOCKED, committing the truthful failure record is still correct.

## Completion gate

Do not create the native toolbar implementation plan until this record says `PASS`. A PASS authorizes planning the Qt source changes; it does not by itself authorize installing application-wide packaging dependencies or modifying existing transparent-mode behavior.

