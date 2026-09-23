# Native Phone Mirroring UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Vendor the already-verified QtScrcpy v4.1.0 source and build a Windows-only native experience with an in-app two-step wireless pairing dialog, Chinese ADB feedback, no USB entry points, and MoYuMaster control bars on both the QtScrcpy main window and every phone projection window.

**Architecture:** Keep QtScrcpy as an independent native application under `native/QtScrcpy`. Separate wireless UI, ADB execution, result translation, reusable toolbar rendering, and window behavior into focused Qt classes; integrate those classes into upstream `Dialog` and `VideoForm` with minimal changes. Reuse the pinned source and local Qt toolchain already proven by the feasibility record, then validate the modified native executable with the same wireless phone before beginning Electron integration.

**Tech Stack:** C++11, Qt 5.15.2 Widgets/Core/Test, CMake 3.30.5, Visual Studio 2022/MSVC x64, QtScrcpy v4.1.0, Android Debug Bridge 33.0.2, PowerShell, Git.

---

## Scope boundary

This is implementation batch 1 from `docs/superpowers/specs/2026-09-23-phone-mirroring-mode-design.md`.

Included:

- Fixed QtScrcpy and QtScrcpyCore source under `native/QtScrcpy` with license and modification record.
- Native two-step pairing/connection dialog with no terminal window.
- Chinese status/error translation and pairing-code redaction.
- Removal of USB-dependent UI paths.
- Reusable `MoyuControlBar` and shared window behavior.
- Toolbar integration in `Dialog` and `VideoForm`, retaining the original `ToolForm` phone controls.
- Build, focused Qt tests, and one wireless real-device acceptance pass.

Excluded until batch 2:

- MoYuMaster home-page entry and Electron preload/main-process code.
- Named-pipe IPC, boss-key linkage, and Qt-to-Electron “return to MoYuMaster” delivery.
- Installer `extraResources` and clean-machine packaging validation.

The main-window Home toolbar button is present and emits `focusMainAppRequested()`. Batch 1 verifies that signal; batch 2 connects it to local IPC. No existing Electron transparent, advertisement, reading, or chat mode may be modified in this plan.

## File map

### Vendored source and provenance

- Create: `native/QtScrcpy/` — build-relevant tracked QtScrcpy v4.1.0 source.
- Create: `native/QtScrcpy/UPSTREAM.md` — upstream revisions, license, and MoYuMaster change summary.
- Preserve: `native/QtScrcpy/LICENSE` and `native/QtScrcpy/QtScrcpy/QtScrcpyCore/LICENSE`.

### Wireless pairing

- Create: `native/QtScrcpy/QtScrcpy/ui/adbresulttranslator.h`
- Create: `native/QtScrcpy/QtScrcpy/ui/adbresulttranslator.cpp`
- Create: `native/QtScrcpy/QtScrcpy/ui/wirelessadbcontroller.h`
- Create: `native/QtScrcpy/QtScrcpy/ui/wirelessadbcontroller.cpp`
- Create: `native/QtScrcpy/QtScrcpy/ui/wirelesspairdialog.h`
- Create: `native/QtScrcpy/QtScrcpy/ui/wirelesspairdialog.cpp`

### Control bar and shared window behavior

- Create: `native/QtScrcpy/QtScrcpy/ui/moyucontrolbar.h`
- Create: `native/QtScrcpy/QtScrcpy/ui/moyucontrolbar.cpp`
- Create: `native/QtScrcpy/QtScrcpy/ui/moyuwindowcontroller.h`
- Create: `native/QtScrcpy/QtScrcpy/ui/moyuwindowcontroller.cpp`

### Upstream integration

- Modify: `native/QtScrcpy/QtScrcpy/CMakeLists.txt`
- Modify: `native/QtScrcpy/CMakeLists.txt`
- Modify: `native/QtScrcpy/QtScrcpy/ui/dialog.h`
- Modify: `native/QtScrcpy/QtScrcpy/ui/dialog.cpp`
- Modify: `native/QtScrcpy/QtScrcpy/ui/videoform.h`
- Modify: `native/QtScrcpy/QtScrcpy/ui/videoform.cpp`

### Focused tests and evidence

- Create: `native/QtScrcpy/QtScrcpy/tests/CMakeLists.txt`
- Create: `native/QtScrcpy/QtScrcpy/tests/tst_nativeui.cpp`
- Create: `docs/superpowers/verification/2026-09-23-native-phone-mirroring-ui.md`

## Stable public contracts

Use these names consistently in every task:

```cpp
enum class AdbAction { Pair, Connect };
enum class AdbResultCode {
    PairSucceeded,
    AlreadyPaired,
    ConnectSucceeded,
    AlreadyConnected,
    InvalidPairingCode,
    PairTimedOut,
    NetworkUnreachable,
    InvalidConnectPort,
    ConnectionRefused,
    DeviceOffline,
    AdbMissing,
    Cancelled,
    UnknownFailure
};

struct AdbUserResult {
    AdbResultCode code;
    bool success;
    QString message;
    QString diagnostic;
};
```

```cpp
class AdbResultTranslator {
public:
    static AdbUserResult translate(AdbAction action,
                                   int exitCode,
                                   QProcess::ProcessError processError,
                                   bool timedOut,
                                   bool cancelled,
                                   const QString &standardOutput,
                                   const QString &standardError,
                                   const QString &pairingCode = QString());
    static QString sanitizeDiagnostic(const QString &text, const QString &pairingCode);
};
```

```cpp
class WirelessAdbController : public QObject {
    Q_OBJECT
public:
    struct ValidationResult { bool valid; QString message; };
    struct Invocation { QString program; QStringList arguments; QByteArray standardInput; };

    explicit WirelessAdbController(QString adbPath, QObject *parent = nullptr);
    static ValidationResult validatePair(const QString &host, const QString &port, const QString &code);
    static ValidationResult validateConnect(const QString &host, const QString &port);
    static Invocation pairInvocation(const QString &adbPath, const QString &host, const QString &port, const QString &code);
    static Invocation connectInvocation(const QString &adbPath, const QString &host, const QString &port);
    bool pair(const QString &host, const QString &port, const QString &code);
    bool connectDevice(const QString &host, const QString &port);
    void cancel();
    bool isBusy() const;

signals:
    void busyChanged(bool busy);
    void statusChanged(const QString &message);
    void finished(const AdbUserResult &result);
};
```

```cpp
class MoyuControlBar : public QWidget {
    Q_OBJECT
public:
    enum class Role { MainWindow, VideoWindow };
    explicit MoyuControlBar(Role role, QWidget *parent = nullptr);
signals:
    void closeRequested();
    void topmostToggled(bool enabled);
    void fitRequested();
    void opacityRequested();
    void autoHideToggled(bool enabled);
    void controlRequested();
    void homeRequested();
    void fullscreenRequested();
    void helpRequested();
    void appearanceRequested();
    void collapseRequested();
};
```

```cpp
class WirelessPairDialog : public QDialog {
    Q_OBJECT
public:
    enum class Step { Pair, Connect };
    WirelessPairDialog(WirelessAdbController *controller, QSettings *settings, QWidget *parent = nullptr);
    Step currentStep() const;
signals:
    void connectionSucceeded();
};

class MoyuWindowController : public QObject {
    Q_OBJECT
public:
    MoyuWindowController(QWidget *window, MoyuControlBar *bar, QString stateKey, QObject *parent = nullptr);
    void setStateKey(const QString &stateKey);
    void restoreAndPresent();
    void setInteractionSuspended(bool suspended);
    void setFitAction(std::function<void()> action);
    void setFullscreenAction(std::function<void()> action);
};
```

### Task 1: Vendor the pinned upstream source with provenance

**Files:**
- Create: `native/QtScrcpy/`
- Create: `native/QtScrcpy/UPSTREAM.md`

- [ ] **Step 1: Resolve and validate source and destination roots**

Run from the implementation worktree:

```powershell
$worktreeRoot = (Resolve-Path '.').Path
$gitCommon = (& git rev-parse --path-format=absolute --git-common-dir).Trim()
$sharedRoot = (Split-Path $gitCommon -Parent)
$upstream = (Resolve-Path (Join-Path $sharedRoot '.artifacts\qtscrcpy-upstream')).Path
$destination = [IO.Path]::GetFullPath((Join-Path $worktreeRoot 'native\QtScrcpy'))
if (-not $destination.StartsWith((Join-Path $worktreeRoot 'native'), [StringComparison]::OrdinalIgnoreCase)) {
  throw "Destination escaped native/: $destination"
}
if (Test-Path -LiteralPath $destination) { throw "Destination already exists: $destination" }
git -C $upstream rev-parse HEAD
git -C $upstream status --short
git -C (Join-Path $upstream 'QtScrcpy\QtScrcpyCore') rev-parse HEAD
```

Expected: parent HEAD is `8c74f7199b159651c69e585989d362ee16a9d1da`, core HEAD is `9e388b8aa48e4e1c2cfdef408ef00c4c6b45c921`, and parent status is empty.

- [ ] **Step 2: Export only build-relevant tracked source**

Run:

```powershell
$tempRoot = Join-Path $worktreeRoot '.artifacts\vendor-export'
New-Item -ItemType Directory -Path $destination -Force | Out-Null
New-Item -ItemType Directory -Path $tempRoot -Force | Out-Null
$parentTar = Join-Path $tempRoot 'qtscrcpy-parent.tar'
$coreTar = Join-Path $tempRoot 'qtscrcpy-core.tar'
git -C $upstream archive --format=tar --output=$parentTar HEAD CMakeLists.txt LICENSE README.md README_zh.md config keymap ci/win QtScrcpy
tar -xf $parentTar -C $destination
$coreDestination = Join-Path $destination 'QtScrcpy\QtScrcpyCore'
New-Item -ItemType Directory -Path $coreDestination -Force | Out-Null
git -C (Join-Path $upstream 'QtScrcpy\QtScrcpyCore') archive --format=tar --output=$coreTar HEAD
tar -xf $coreTar -C $coreDestination
```

Expected: the destination contains the top-level and core CMake files, both license files, app source, ADB, FFmpeg libraries, `scrcpy-server`, configuration, keymaps, and Windows build scripts; it contains no `.git` directory.

- [ ] **Step 3: Add the exact upstream record**

Create `native/QtScrcpy/UPSTREAM.md` with:

```markdown
# Vendored QtScrcpy provenance

- Upstream project: QtScrcpy
- Upstream version: v4.1.0
- QtScrcpy commit: `8c74f7199b159651c69e585989d362ee16a9d1da`
- QtScrcpyCore commit: `9e388b8aa48e4e1c2cfdef408ef00c4c6b45c921`
- License: Apache License 2.0; see `LICENSE` and `QtScrcpy/QtScrcpyCore/LICENSE`
- Imported on: 2026-09-23

## MoYuMaster modifications

- Android 11+ pairing-code wireless connection dialog.
- Chinese ADB result translation and redacted diagnostics.
- Removal of USB-dependent connection entry points.
- MoYuMaster control bars and per-window state behavior.

Modified upstream files carry a `Modified for MoYuMaster` notice near the file header.
```

- [ ] **Step 4: Verify provenance and repository boundaries**

Run:

```powershell
if (Get-ChildItem -LiteralPath $destination -Recurse -Force -Directory -Filter '.git') {
  throw 'Nested Git directory found in vendored source'
}
git -C $upstream hash-object LICENSE
git hash-object native/QtScrcpy/LICENSE
git status --short
```

Expected: both license hashes match and Git reports only `native/QtScrcpy/` as new tracked content.

- [ ] **Step 5: Commit the vendored baseline**

Run:

```powershell
git add -- native/QtScrcpy
git commit -m "build: vendor QtScrcpy v4.1.0"
```

### Task 2: Add focused Qt test infrastructure and Chinese ADB translation

**Files:**
- Create: `native/QtScrcpy/QtScrcpy/ui/adbresulttranslator.h`
- Create: `native/QtScrcpy/QtScrcpy/ui/adbresulttranslator.cpp`
- Create: `native/QtScrcpy/QtScrcpy/tests/CMakeLists.txt`
- Create: `native/QtScrcpy/QtScrcpy/tests/tst_nativeui.cpp`
- Modify: `native/QtScrcpy/CMakeLists.txt`

- [ ] **Step 1: Add failing translator test cases**

Create the first `tst_nativeui.cpp` test class with data rows covering these exact mappings:

```cpp
void NativeUiTest::translator_data()
{
    QTest::addColumn<int>("action");
    QTest::addColumn<int>("exitCode");
    QTest::addColumn<bool>("timedOut");
    QTest::addColumn<QString>("out");
    QTest::addColumn<QString>("err");
    QTest::addColumn<int>("expectedCode");
    QTest::addColumn<QString>("expectedMessage");

    QTest::newRow("pair success") << int(AdbAction::Pair) << 0 << false
        << "Successfully paired to 192.0.2.1:37123" << ""
        << int(AdbResultCode::PairSucceeded) << "配对成功，请填写无线调试主页中的连接端口";
    QTest::newRow("pair invalid") << int(AdbAction::Pair) << 1 << false
        << "" << "Failed: Unable to start pairing client."
        << int(AdbResultCode::InvalidPairingCode) << "配对码不正确或已经失效，请在手机上重新生成";
    QTest::newRow("pair timeout") << int(AdbAction::Pair) << 1 << true
        << "" << "" << int(AdbResultCode::PairTimedOut)
        << "配对超时，请确认手机配对页面仍然开启";
    QTest::newRow("connect success") << int(AdbAction::Connect) << 0 << false
        << "connected to 192.0.2.1:37777" << ""
        << int(AdbResultCode::ConnectSucceeded) << "设备连接成功，设备列表已刷新";
    QTest::newRow("already connected") << int(AdbAction::Connect) << 0 << false
        << "already connected to 192.0.2.1:37777" << ""
        << int(AdbResultCode::AlreadyConnected) << "设备连接成功，设备列表已刷新";
    QTest::newRow("refused") << int(AdbAction::Connect) << 1 << false
        << "" << "failed to connect: connection refused"
        << int(AdbResultCode::ConnectionRefused) << "手机拒绝连接，请确认无线调试仍然开启";
    QTest::newRow("offline") << int(AdbAction::Connect) << 1 << false
        << "device offline" << "" << int(AdbResultCode::DeviceOffline)
        << "设备已离线，请重新连接";
}
```

Add a separate test asserting that `sanitizeDiagnostic("code 123456", "123456")` does not contain `123456` and does contain `******`.

- [ ] **Step 2: Add the test target and prove it fails**

Add `MOYU_BUILD_TESTS` to the top-level CMake file:

```cmake
option(MOYU_BUILD_TESTS "Build MoYuMaster native UI tests" OFF)
if(MOYU_BUILD_TESTS)
    enable_testing()
    add_subdirectory(QtScrcpy/tests)
endif()
```

Create the initial test CMake file as:

```cmake
find_package(Qt5 REQUIRED COMPONENTS Core Widgets Test)

add_executable(moyu_native_tests
    tst_nativeui.cpp
    ../ui/adbresulttranslator.cpp
    ../ui/adbresulttranslator.h
)

target_include_directories(moyu_native_tests PRIVATE ../ui)
target_link_libraries(moyu_native_tests PRIVATE Qt5::Core Qt5::Widgets Qt5::Test)
add_test(NAME moyu_native_tests COMMAND moyu_native_tests)
set_tests_properties(moyu_native_tests PROPERTIES ENVIRONMENT "QT_QPA_PLATFORM=offscreen")
```

When later tasks introduce the controller, dialog, toolbar, and window controller, append their `.cpp` and `.h` paths to this same target before running that task's test.

Run:

```powershell
$gitCommon = (& git rev-parse --path-format=absolute --git-common-dir).Trim()
$sharedRoot = Split-Path $gitCommon -Parent
$qtPrefix = Join-Path $sharedRoot '.artifacts\qtscrcpy-toolchain\Qt\5.15.2\msvc2019_64\lib\cmake\Qt5'
cmake -S native/QtScrcpy -B .artifacts/qtscrcpy-native-tests -G "Visual Studio 17 2022" -A x64 -DCMAKE_PREFIX_PATH=$qtPrefix -DMOYU_BUILD_TESTS=ON -DCMAKE_BUILD_TYPE=RelWithDebInfo
cmake --build .artifacts/qtscrcpy-native-tests --config RelWithDebInfo --target moyu_native_tests
```

Expected: compile fails because `AdbResultTranslator` is not implemented yet.

- [ ] **Step 3: Implement the translator contract**

Implement `AdbResultTranslator::translate(...)` with case-insensitive matching and this precedence: missing binary → cancelled → timeout → success/already-success → offline → invalid pairing code → connection refused → network unreachable → invalid port → unknown failure. Build `diagnostic` from stdout and stderr only after replacing the supplied pairing code and every `pairing code` followed by six digits with `******`.

Use the exact Chinese messages in the design specification. Do not write diagnostics to disk or call `qDebug()` with them.

- [ ] **Step 4: Run the translator tests**

Run:

```powershell
cmake --build .artifacts/qtscrcpy-native-tests --config RelWithDebInfo --target moyu_native_tests
ctest --test-dir .artifacts/qtscrcpy-native-tests -C RelWithDebInfo --output-on-failure
```

Expected: all translator and redaction rows pass.

- [ ] **Step 5: Commit translation and test infrastructure**

Run:

```powershell
git add -- native/QtScrcpy/CMakeLists.txt native/QtScrcpy/QtScrcpy/tests native/QtScrcpy/QtScrcpy/ui/adbresulttranslator.*
git commit -m "feat: translate wireless adb results to Chinese"
```

### Task 3: Implement validated, console-free ADB pairing and connection

**Files:**
- Create: `native/QtScrcpy/QtScrcpy/ui/wirelessadbcontroller.h`
- Create: `native/QtScrcpy/QtScrcpy/ui/wirelessadbcontroller.cpp`
- Modify: `native/QtScrcpy/QtScrcpy/tests/tst_nativeui.cpp`
- Modify: `native/QtScrcpy/QtScrcpy/tests/CMakeLists.txt`

- [ ] **Step 1: Add failing validation and invocation tests**

Add rows asserting:

```cpp
QVERIFY(!WirelessAdbController::validatePair("", "37123", "123456").valid);
QVERIFY(!WirelessAdbController::validatePair("192.0.2.1", "0", "123456").valid);
QVERIFY(!WirelessAdbController::validatePair("192.0.2.1", "65536", "123456").valid);
QVERIFY(!WirelessAdbController::validatePair("192.0.2.1", "37123", "12345").valid);
QVERIFY(WirelessAdbController::validatePair("192.0.2.1", "37123", "123456").valid);
QVERIFY(WirelessAdbController::validateConnect("192.0.2.1", "37777").valid);

const auto pair = WirelessAdbController::pairInvocation("adb.exe", "192.0.2.1", "37123", "123456");
QCOMPARE(pair.arguments, QStringList({"pair", "192.0.2.1:37123"}));
QVERIFY(!pair.arguments.join(' ').contains("123456"));
QCOMPARE(pair.standardInput, QByteArray("123456\n"));

const auto connect = WirelessAdbController::connectInvocation("adb.exe", "192.0.2.1", "37777");
QCOMPARE(connect.arguments, QStringList({"connect", "192.0.2.1:37777"}));
QVERIFY(connect.standardInput.isEmpty());
```

- [ ] **Step 2: Run the focused test and verify failure**

Run the same CMake build command from Task 2.

Expected: compile fails because `WirelessAdbController` is not implemented.

- [ ] **Step 3: Implement controller execution and cancellation**

Implement one owned `QProcess` and one single-shot `QTimer`:

- Pair starts `adb pair host:port`, waits for `started`, writes `code + '\n'`, closes the write channel, clears the in-memory code buffer, and uses a 30-second timer.
- Connect starts `adb connect host:port` with no standard input and uses a 15-second timer.
- `QProcess::setProcessChannelMode(QProcess::SeparateChannels)` retains stdout and stderr for translation.
- On Windows the application target remains `WIN32`; no `cmd.exe`, PowerShell, shell string, or console window is created.
- `cancel()` stops the timer, terminates the child, escalates to `kill()` only if it does not exit, clears buffers, and emits `Cancelled` once.
- Every terminal path clears the stored pairing code before emitting `finished`.
- A second operation while busy returns `false` and does not replace the running process.

Add `// Modified for MoYuMaster: native wireless pairing without USB or console UI.` at the top of every modified upstream file in later tasks.

Add `../ui/wirelessadbcontroller.cpp` and `../ui/wirelessadbcontroller.h` to `moyu_native_tests` in the test CMake file before building.

- [ ] **Step 4: Run focused tests**

Run:

```powershell
cmake --build .artifacts/qtscrcpy-native-tests --config RelWithDebInfo --target moyu_native_tests
ctest --test-dir .artifacts/qtscrcpy-native-tests -C RelWithDebInfo --output-on-failure
```

Expected: validation, invocation, translation, and redaction tests pass.

- [ ] **Step 5: Commit the controller**

Run:

```powershell
git add -- native/QtScrcpy/QtScrcpy/ui/wirelessadbcontroller.* native/QtScrcpy/QtScrcpy/tests
git commit -m "feat: add secure wireless adb controller"
```

### Task 4: Build the two-step native pairing dialog and remove terminal interaction

**Files:**
- Create: `native/QtScrcpy/QtScrcpy/ui/wirelesspairdialog.h`
- Create: `native/QtScrcpy/QtScrcpy/ui/wirelesspairdialog.cpp`
- Modify: `native/QtScrcpy/QtScrcpy/CMakeLists.txt`
- Modify: `native/QtScrcpy/QtScrcpy/tests/tst_nativeui.cpp`

- [ ] **Step 1: Add a failing offscreen widget contract test**

Instantiate `WirelessPairDialog` with a controller using a nonexistent inert test path without starting a command. Assert these object names and initial properties:

```cpp
QCOMPARE(dialog.currentStep(), WirelessPairDialog::Step::Pair);
QVERIFY(dialog.findChild<QLineEdit*>("pairHostEdit"));
QVERIFY(dialog.findChild<QLineEdit*>("pairPortEdit"));
auto code = dialog.findChild<QLineEdit*>("pairCodeEdit");
QVERIFY(code);
QCOMPARE(code->echoMode(), QLineEdit::Password);
QVERIFY(dialog.findChild<QPushButton*>("pairButton"));
QVERIFY(dialog.findChild<QPushButton*>("skipPairButton"));
QVERIFY(dialog.findChild<QLineEdit*>("connectHostEdit"));
QVERIFY(dialog.findChild<QLineEdit*>("connectPortEdit"));
QVERIFY(dialog.findChild<QPushButton*>("connectButton"));
QVERIFY(dialog.findChild<QPushButton*>("finishButton"));
QVERIFY(dialog.findChild<QToolButton*>("diagnosticToggle"));
```

Run the focused test and expect compile failure because the dialog does not exist.

- [ ] **Step 2: Implement the exact two-step UI**

Build the dialog in C++ with a `QStackedWidget` and these rules:

- Window title `无线连接手机`, minimum size `520x430`, modal to `Dialog`.
- Pair page fields: IP, pairing port, six-digit code, show/hide code button, `开始配对`, `我已配对，直接连接`.
- Persistent warning: `配对端口与连接端口可能不同`.
- Connect page fields: IP, connection port, `返回重新配对`, `连接设备`, disabled `完成` until success.
- Pair success clears the code, copies only IP to the connect page, clears the connection port, and changes step.
- Skip pairing copies the saved/current IP, clears the connection port, and changes step without running ADB.
- Connect success emits `connectionSucceeded()`, enables `完成`, and leaves the success message visible until the user closes the dialog.
- `QSettings` key `moyu/wireless/lastIp` is the only persisted input. Never persist either port or the code.
- A checkable `诊断信息` tool button controls a read-only `QPlainTextEdit`, hidden by default.
- Busy state disables every editable field, navigation button, and action button except Cancel/Close.
- `reject()` calls `WirelessAdbController::cancel()` before closing.

Add `../ui/wirelesspairdialog.cpp` and `../ui/wirelesspairdialog.h` to `moyu_native_tests` before building the widget test.

Append the production sources to `QC_UI_SOURCES` in `QtScrcpy/CMakeLists.txt`:

```cmake
set(QC_UI_SOURCES ${QC_UI_SOURCES}
    ui/adbresulttranslator.h
    ui/adbresulttranslator.cpp
    ui/wirelessadbcontroller.h
    ui/wirelessadbcontroller.cpp
    ui/wirelesspairdialog.h
    ui/wirelesspairdialog.cpp
)
```

- [ ] **Step 3: Add Chinese visual states**

Use one status label with properties `state=normal|working|success|error`; apply blue, green, and red styles. Show the controller's Chinese `statusChanged` message immediately and the final `AdbUserResult::message` when done. Only the folded diagnostic box receives `result.diagnostic`.

- [ ] **Step 4: Run the widget and logic tests**

Run:

```powershell
$env:QT_QPA_PLATFORM='offscreen'
cmake --build .artifacts/qtscrcpy-native-tests --config RelWithDebInfo --target moyu_native_tests
ctest --test-dir .artifacts/qtscrcpy-native-tests -C RelWithDebInfo --output-on-failure
```

Expected: dialog structure, initial password masking, translator, validation, and invocation tests pass.

- [ ] **Step 5: Commit the pairing dialog**

Run:

```powershell
git add -- native/QtScrcpy/QtScrcpy/ui/wirelesspairdialog.* native/QtScrcpy/QtScrcpy/CMakeLists.txt native/QtScrcpy/QtScrcpy/tests
git commit -m "feat: add native wireless pairing dialog"
```

### Task 5: Build the reusable MoYuMaster control bar and window behavior

**Files:**
- Create: `native/QtScrcpy/QtScrcpy/ui/moyucontrolbar.h`
- Create: `native/QtScrcpy/QtScrcpy/ui/moyucontrolbar.cpp`
- Create: `native/QtScrcpy/QtScrcpy/ui/moyuwindowcontroller.h`
- Create: `native/QtScrcpy/QtScrcpy/ui/moyuwindowcontroller.cpp`
- Modify: `native/QtScrcpy/QtScrcpy/tests/tst_nativeui.cpp`
- Modify: `native/QtScrcpy/QtScrcpy/CMakeLists.txt`

- [ ] **Step 1: Add failing toolbar signal tests**

Create both roles and assert the exact button object names:

```cpp
const QStringList names = {
    "collapseButton", "closeButton", "topmostButton", "fitButton",
    "opacityButton", "autoHideButton", "controlButton", "homeButton",
    "fullscreenButton", "helpButton", "appearanceButton"
};
for (const QString &name : names) {
    QVERIFY2(bar.findChild<QToolButton*>(name.toUtf8().constData()), qPrintable(name));
}
QSignalSpy controlSpy(&bar, &MoyuControlBar::controlRequested);
QTest::mouseClick(bar.findChild<QToolButton*>("controlButton"), Qt::LeftButton);
QCOMPARE(controlSpy.count(), 1);
```

Run focused tests and expect compile failure because the toolbar does not exist.

- [ ] **Step 2: Implement the visual toolbar**

Create a fixed-height `34px` dark toolbar with `6px` spacing, `28x28px` tool buttons, rounded hover states, blue active states, and Chinese tooltips. Use `IconHelper`/FontAwesome where an icon is available and the literal `控` label for the control button. Main and video roles use identical order and styling.

The appearance menu offers exactly `深色工具栏` and `浅色工具栏`. The opacity popup contains a horizontal slider from 20 to 100 with the current percentage label. The collapse button hides the main bar and shows a `22x22px` recovery button at the window's top-left.

- [ ] **Step 3: Implement shared window state behavior**

`MoyuWindowController` owns common behavior for one window and one bar:

- Persist under `moyu/windows/<role-or-serial>/` only `size`, `opacity`, `topmost`, `autoHide`, and `lightToolbar`; never persist x/y.
- Restore the saved size clamped to the screen work area, center on the screen nearest the cursor, call `raise()` and `activateWindow()`.
- Topmost toggles `Qt::WindowStaysOnTopHint` while preserving geometry.
- Auto-hide polls the global cursor every 150 ms. Outside the saved window rectangle it uses opacity `0.02`; re-entry restores the configured opacity.
- Modal dialogs call `setInteractionSuspended(true)` so auto-hide cannot hide their owner.
- Fullscreen remembers the normal geometry and restores it on exit.
- Collapse state is not confused with window hidden state.

Add the four toolbar/window-controller source and header paths to `moyu_native_tests` before running the toolbar tests.

Append the same four files to production `QC_UI_SOURCES`:

```cmake
set(QC_UI_SOURCES ${QC_UI_SOURCES}
    ui/moyucontrolbar.h
    ui/moyucontrolbar.cpp
    ui/moyuwindowcontroller.h
    ui/moyuwindowcontroller.cpp
)
```

- [ ] **Step 4: Run toolbar tests**

Run the offscreen focused tests. Expected: both roles expose all buttons, signals fire exactly once, and QSettings state restores size/properties without restoring an old position.

- [ ] **Step 5: Commit the shared toolbar**

Run:

```powershell
git add -- native/QtScrcpy/QtScrcpy/ui/moyucontrolbar.* native/QtScrcpy/QtScrcpy/ui/moyuwindowcontroller.* native/QtScrcpy/QtScrcpy/CMakeLists.txt native/QtScrcpy/QtScrcpy/tests
git commit -m "feat: add native MoYuMaster control bar"
```

### Task 6: Integrate the toolbar into phone projection windows

**Files:**
- Modify: `native/QtScrcpy/QtScrcpy/ui/videoform.h`
- Modify: `native/QtScrcpy/QtScrcpy/ui/videoform.cpp`

- [ ] **Step 1: Add the Apache modification notice and members**

Add the required notice near the file header. Add `QPointer<MoyuControlBar> m_moyuBar`, `QPointer<MoyuWindowController> m_moyuWindow`, `bool m_originalToolVisible`, and a public `toggleOriginalToolBar()` method.

- [ ] **Step 2: Insert the toolbar without covering video**

After `ui->setupUi(this)`, insert `MoyuControlBar(Role::VideoWindow)` at index 0 of `ui->verticalLayout`. Keep `KeepRatioWidget` as the second layout item so the video always receives the remaining space.

Update `updateShowSize()` and `removeBlackRect()` to add the visible control-bar height to the desired outer height. Fullscreen may hide the bar, but exiting fullscreen restores its previous visibility.

- [ ] **Step 3: Wire every video-window action**

Use these exact mappings:

- Close → `close()`.
- Topmost, opacity, auto-hide, appearance, collapse → `MoyuWindowController`.
- Fit → `removeBlackRect()` and keep device aspect ratio.
- Fullscreen → existing `switchFullScreen()`.
- Control → show/hide existing `ToolForm` without deleting or replacing it.
- Home → `device->postGoHome()` for `m_serial`.
- Help → Chinese dialog listing the toolbar actions and retained QtScrcpy shortcuts.

Call `m_moyuWindow->setStateKey("video/" + sanitizedSerial)` from `setSerial()`. Do not restore the stored x/y from upstream `Config::getRect`; restore only the size and center the window.

- [ ] **Step 4: Build the application target**

Run the native CMake build from Task 8 early. Expected: `QtScrcpy.exe` links successfully and the existing `ToolForm` remains compiled.

- [ ] **Step 5: Commit projection integration**

Run:

```powershell
git add -- native/QtScrcpy/QtScrcpy/ui/videoform.*
git commit -m "feat: add MoYuMaster controls to phone windows"
```

### Task 7: Integrate pairing and toolbar into the QtScrcpy main window

**Files:**
- Modify: `native/QtScrcpy/QtScrcpy/ui/dialog.h`
- Modify: `native/QtScrcpy/QtScrcpy/ui/dialog.cpp`

- [ ] **Step 1: Add members and the modification notice**

Add `QPointer<WirelessPairDialog> m_wirelessDialog`, `QPointer<MoyuControlBar> m_moyuBar`, `QPointer<MoyuWindowController> m_moyuWindow`, and `QPointer<VideoForm> m_lastVideoForm`. Add signal `void focusMainAppRequested();` for batch-2 IPC.

- [ ] **Step 2: Replace USB-era entry points**

In `initUI()`:

- Remove/hide `usbConnectBtn`, `wifiConnectBtn`, `startAdbdBtn`, `getIPBtn`, `deviceIpEdt`, and `devicePortEdt` from the interactive layout.
- Keep one `wirelessConnectBtn`, change its text to `无线连接`, and make it open `WirelessPairDialog`.
- Remove the slot declarations and implementations that execute USB quick-connect, `adb tcpip 5555`, and USB IP discovery.
- Filter refreshed devices so the visible device list accepts only serials matching `host:port`; USB serials never appear as supported devices.
- Keep wireless disconnect, device refresh, bitrate, resolution, recording, multi-device, and other connection-medium-independent options.

- [ ] **Step 3: Integrate dialog completion**

Resolve ADB path in this order: `QTSCRCPY_ADB_PATH`, configured `AdbPath`, then `applicationDirPath()/adb.exe`. Construct the controller/dialog with that path. Suspend main-window auto-hide while the dialog is open. On `connectionSucceeded()`, call `on_updateDevice_clicked()` and select the sole connected wireless device when exactly one exists.

- [ ] **Step 4: Insert and wire the main control bar**

Create `MoyuControlBar(Role::MainWindow)` as a child at the top of `Dialog`. Increase the existing root layout's top margin by the bar height so it never covers the upstream content, and update the bar width in `resizeEvent()`. Map:

- Control → raise/activate `m_lastVideoForm`, or show `请先连接并启动设备`.
- Home → emit `focusMainAppRequested()`; batch 1 test checks the signal only.
- Fit → restore saved main size and center.
- Fullscreen, close, topmost, opacity, auto-hide, appearance, collapse → shared controller.
- Help → Chinese dialog explaining wireless pairing and toolbar actions.

Set `m_lastVideoForm` whenever `onDeviceConnected()` creates a phone window and clear it when that window is destroyed.

- [ ] **Step 5: Run focused tests and commit**

Run `ctest` and build `QtScrcpy`. Then commit:

```powershell
git add -- native/QtScrcpy/QtScrcpy/ui/dialog.*
git commit -m "feat: integrate wireless UI into QtScrcpy main window"
```

### Task 8: Build a reusable modified runtime

**Files:**
- Build outputs only under ignored `.artifacts/`

- [ ] **Step 1: Configure and run the focused Qt tests**

Run:

```powershell
$gitCommon = (& git rev-parse --path-format=absolute --git-common-dir).Trim()
$sharedRoot = Split-Path $gitCommon -Parent
$qtBase = Join-Path $sharedRoot '.artifacts\qtscrcpy-toolchain\Qt\5.15.2'
$qtPrefix = Join-Path $qtBase 'msvc2019_64\lib\cmake\Qt5'
cmake -S native/QtScrcpy -B .artifacts/qtscrcpy-native-build -G "Visual Studio 17 2022" -A x64 -DCMAKE_PREFIX_PATH=$qtPrefix -DMOYU_BUILD_TESTS=ON -DCMAKE_BUILD_TYPE=RelWithDebInfo
cmake --build .artifacts/qtscrcpy-native-build --config RelWithDebInfo --target moyu_native_tests
ctest --test-dir .artifacts/qtscrcpy-native-build -C RelWithDebInfo --output-on-failure
```

Expected: all focused native tests pass.

- [ ] **Step 2: Build the modified application**

Run:

```powershell
cmake --build .artifacts/qtscrcpy-native-build --config RelWithDebInfo --target QtScrcpy -j 8
```

Expected: `native/QtScrcpy/output/x64/RelWithDebInfo/QtScrcpy.exe` exists.

- [ ] **Step 3: Assemble a test runtime by reusing the verified baseline payload**

Run:

```powershell
$baseline = Join-Path $sharedRoot '.artifacts\qtscrcpy-runtime'
$runtime = Join-Path (Resolve-Path '.').Path '.artifacts\qtscrcpy-custom-runtime'
if (Test-Path -LiteralPath $runtime) { throw "Runtime already exists: $runtime" }
Copy-Item -LiteralPath $baseline -Destination $runtime -Recurse
Copy-Item -LiteralPath 'native\QtScrcpy\output\x64\RelWithDebInfo\QtScrcpy.exe' -Destination (Join-Path $runtime 'QtScrcpy.exe') -Force
Copy-Item -LiteralPath 'native\QtScrcpy\LICENSE' -Destination (Join-Path $runtime 'LICENSE-QtScrcpy.txt')
Copy-Item -LiteralPath 'native\QtScrcpy\UPSTREAM.md' -Destination (Join-Path $runtime 'UPSTREAM.md')
```

Expected: the custom runtime contains the modified executable plus the already-verified Qt libraries, ADB, server, config, keymaps, and license.

- [ ] **Step 4: Run repository and binary boundary checks**

Run:

```powershell
git diff --check
git status --short
git check-ignore -v .artifacts/qtscrcpy-custom-runtime/QtScrcpy.exe
Get-Item .artifacts/qtscrcpy-custom-runtime/QtScrcpy.exe | Select-Object FullName,Length,LastWriteTime
```

Expected: product source changes are committed, runtime remains ignored, and no Electron source is modified.

### Task 9: Complete one real native-UI wireless acceptance pass

**Files:**
- Create: `docs/superpowers/verification/2026-09-23-native-phone-mirroring-ui.md`

- [ ] **Step 1: Start from a clean wireless ADB state**

Use the custom runtime ADB to disconnect any prior network device. Keep USB physically disconnected. Launch the modified `QtScrcpy.exe` from `.artifacts/qtscrcpy-custom-runtime`.

- [ ] **Step 2: Validate the dedicated pairing UI**

Observe all of the following:

- “无线连接” opens the two-step Qt dialog and no terminal appears.
- Invalid empty fields and a five-digit code show Chinese validation messages.
- Pairing code is masked by default and the visibility button works.
- A real pairing succeeds using the phone's current pairing address/code.
- The code clears after success; only IP transfers to step 2.
- A real connection succeeds using the different connection port.
- The Chinese success message remains visible until “完成”.
- Device refresh selects the connected wireless phone.

- [ ] **Step 3: Validate both control bars**

On the main window and then the phone window verify close, topmost, fit, opacity, auto-hide, fullscreen, help, appearance, collapse/recovery, and correct centering. Additionally verify:

- Main Control raises the latest phone window.
- Main Home emits without crashing; Electron activation is explicitly deferred to batch 2.
- Phone Control toggles the original QtScrcpy `ToolForm`.
- Phone Home sends Android Home.
- Resize keeps the whole phone image fitted below the toolbar.

- [ ] **Step 4: Record PASS or BLOCKED without secrets**

Create the verification record with fixed revisions, build/test result, each checklist item, and a strict `PASS` only if every required behavior above was observed. Never record pairing codes, IP addresses, or ports. A failure record includes only the sanitized Chinese category and affected checklist item.

- [ ] **Step 5: Commit the evidence**

Run:

```powershell
git add -- docs/superpowers/verification/2026-09-23-native-phone-mirroring-ui.md
git commit -m "docs: record native phone mirroring UI verification"
```

## Completion gate

Do not begin Electron integration until the native verification record says `PASS`. A PASS authorizes the separate batch-2 plan for home entry, single-instance process launch, local IPC, boss-key coordination, lifecycle cleanup, and installer resources.
