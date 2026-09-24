# Phone Mirroring Electron Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the accepted custom QtScrcpy runtime to MoYuMaster's “游戏与投屏” section with secure local IPC, single-instance launch/restore, boss-key synchronization, bidirectional focus, and owned-process cleanup.

**Architecture:** Electron remains the lifecycle owner and exposes one argument-free preload action to the home page. A focused launcher resolves the development runtime, creates a per-session named pipe and token, starts one owned QtScrcpy process, and exchanges newline-delimited JSON with a small Qt `QLocalSocket` bridge. The accepted native UI stays independent; installer resources remain a later batch.

**Tech Stack:** Electron 31, Node.js ESM (`node:net`, `node:child_process`, `node:crypto`), Vue 3, Node test runner, C++11, Qt 5.15.2 Core/Network/Widgets/Test, CMake, Windows named pipes.

---

## Scope boundary

This is stage D from `docs/superpowers/specs/2026-09-23-phone-mirroring-mode-design.md`.

Included:

- Rename the home group to “游戏与投屏” and add “手机投屏模式”.
- Resolve and launch the already accepted development runtime.
- Reuse one Electron-owned QtScrcpy process and focus it on repeated clicks.
- Bidirectional focus, boss-key hide/show, and application shutdown over a local named pipe.
- Chinese errors in the existing home-page error area.

Excluded:

- Installer `extraResources`, signing, or clean-machine installation checks.
- Detecting or controlling QtScrcpy processes launched outside MoYuMaster.
- Any changes to transparent, advertisement, reading, or chat modes.
- USB support.

## File map

- Create: `src/main/phone-mirror-protocol.mjs` — pipe naming and authenticated line-message encoding/validation.
- Create: `src/main/phone-mirror-launcher.mjs` — runtime resolution, local server, one child process, focus/boss/shutdown lifecycle.
- Create: `src/main/phone-mirror-ipc.mjs` — main-window-only Electron IPC handler.
- Modify: `src/main/index.js` — initialize the launcher, connect boss key and quit lifecycle, register IPC.
- Modify: `src/preload/index.js` — expose only `openPhoneMirror()`.
- Modify: `src/renderer/src/views/HomeView.vue` — add the entry and reuse existing action error handling.
- Create: `tests/phone-mirror-protocol.test.mjs`.
- Create: `tests/phone-mirror-launcher.test.mjs`.
- Create: `tests/phone-mirror-ipc.test.mjs`.
- Modify: `tests/home-view.test.mjs`.
- Create: `native/QtScrcpy/QtScrcpy/ui/moyuipcbridge.h` — Qt-side authenticated local-socket contract.
- Create: `native/QtScrcpy/QtScrcpy/ui/moyuipcbridge.cpp` — connect, parse, dispatch, and send focus requests.
- Modify: `native/QtScrcpy/QtScrcpy/main.cpp` — attach bridge to `Dialog`, boss visibility, focus, and shutdown.
- Modify: `native/QtScrcpy/QtScrcpy/ui/dialog.h`.
- Modify: `native/QtScrcpy/QtScrcpy/ui/dialog.cpp` — expose external restore through the existing window controller.
- Modify: `native/QtScrcpy/QtScrcpy/CMakeLists.txt`.
- Modify: `native/QtScrcpy/QtScrcpy/tests/CMakeLists.txt`.
- Modify: `native/QtScrcpy/QtScrcpy/tests/tst_nativeui.cpp`.
- Create: `docs/superpowers/verification/2026-09-24-phone-mirroring-electron-integration.md`.

## Stable contracts

Electron-to-Qt command messages:

```json
{"token":"<random-session-token>","type":"focus-qtscrcpy-main"}
{"token":"<random-session-token>","type":"boss-hide"}
{"token":"<random-session-token>","type":"boss-show"}
{"token":"<random-session-token>","type":"shutdown"}
```

Qt-to-Electron messages:

```json
{"token":"<random-session-token>","type":"ready"}
{"token":"<random-session-token>","type":"focus-main-app"}
```

`ready` is transport handshaking only; it is not a user-facing command. Unknown types and token mismatches are ignored.

Electron launcher API:

```js
const launcher = createPhoneMirrorLauncher({
  projectRoot,
  focusMainApp: () => focus('main')
})

await launcher.openOrFocus()       // { status: 'started' | 'focused' }
launcher.setBossHidden(true)       // queues or sends boss-hide
await launcher.shutdown()          // graceful command, then owned-tree fallback
launcher.isRunning()               // boolean
```

Qt bridge API:

```cpp
class MoyuIpcBridge : public QObject {
    Q_OBJECT
public:
    explicit MoyuIpcBridge(const QString &serverName,
                           const QByteArray &token,
                           QObject *parent = nullptr);
    static MoyuIpcBridge *fromEnvironment(QObject *parent = nullptr);
    void start();
    void requestMainAppFocus();

signals:
    void focusQtScrcpyRequested();
    void bossHideRequested();
    void bossShowRequested();
    void shutdownRequested();
};
```

### Task 1: Add the authenticated local protocol

**Files:**
- Create: `src/main/phone-mirror-protocol.mjs`
- Create: `tests/phone-mirror-protocol.test.mjs`

- [ ] **Step 1: Write failing protocol tests**

Create `tests/phone-mirror-protocol.test.mjs`:

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  createPhoneMirrorPipe,
  encodePhoneMirrorMessage,
  parsePhoneMirrorLine
} from '../src/main/phone-mirror-protocol.mjs'

test('pipe name is session-specific and uses the Windows local-pipe namespace', () => {
  assert.equal(
    createPhoneMirrorPipe({ pid: 42, nonce: 'abc', platform: 'win32' }),
    '\\\\.\\pipe\\moyu-qtscrcpy-42-abc'
  )
})

test('protocol accepts only known types with the matching token', () => {
  const token = 'secret'
  assert.deepEqual(parsePhoneMirrorLine('{"token":"secret","type":"ready"}', token), {
    token,
    type: 'ready'
  })
  assert.equal(parsePhoneMirrorLine('{"token":"wrong","type":"ready"}', token), null)
  assert.equal(parsePhoneMirrorLine('{"token":"secret","type":"unknown"}', token), null)
  assert.equal(parsePhoneMirrorLine('not-json', token), null)
})

test('encoder produces one compact newline-delimited JSON message', () => {
  assert.equal(
    encodePhoneMirrorMessage('secret', 'boss-hide'),
    '{"token":"secret","type":"boss-hide"}\n'
  )
})
```

- [ ] **Step 2: Run the test and verify the missing-module failure**

Run:

```powershell
node --test tests/phone-mirror-protocol.test.mjs
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `phone-mirror-protocol.mjs`.

- [ ] **Step 3: Implement the protocol module**

Create `src/main/phone-mirror-protocol.mjs`:

```js
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const MESSAGE_TYPES = new Set([
  'ready',
  'focus-main-app',
  'focus-qtscrcpy-main',
  'boss-hide',
  'boss-show',
  'shutdown'
])

export function createPhoneMirrorPipe({ pid, nonce, platform = process.platform }) {
  const name = `moyu-qtscrcpy-${pid}-${nonce}`
  return platform === 'win32' ? `\\\\.\\pipe\\${name}` : join(tmpdir(), `${name}.sock`)
}

export function encodePhoneMirrorMessage(token, type) {
  if (!token || !MESSAGE_TYPES.has(type)) throw new Error('无效的手机投屏通信消息')
  return `${JSON.stringify({ token, type })}\n`
}

export function parsePhoneMirrorLine(line, expectedToken) {
  try {
    const value = JSON.parse(line)
    if (!value || value.token !== expectedToken || !MESSAGE_TYPES.has(value.type)) return null
    return { token: value.token, type: value.type }
  } catch {
    return null
  }
}
```

- [ ] **Step 4: Run the focused test**

Run: `node --test tests/phone-mirror-protocol.test.mjs`

Expected: 3 tests PASS.

- [ ] **Step 5: Commit the protocol**

```powershell
git add src/main/phone-mirror-protocol.mjs tests/phone-mirror-protocol.test.mjs
git commit -m "feat: add phone mirroring local protocol"
```

### Task 2: Build the development runtime launcher and owned lifecycle

**Files:**
- Create: `src/main/phone-mirror-launcher.mjs`
- Create: `tests/phone-mirror-launcher.test.mjs`

- [ ] **Step 1: Write failing path, singleton, and cleanup tests**

Create `tests/phone-mirror-launcher.test.mjs` using `EventEmitter` fakes. The assertions must cover these exact cases:

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { join } from 'node:path'
import {
  createPhoneMirrorLauncher,
  resolvePhoneMirrorExecutable
} from '../src/main/phone-mirror-launcher.mjs'

test('runtime override accepts a directory and default resolves the accepted artifact', () => {
  const exists = value => value.endsWith('QtScrcpy.exe')
  assert.equal(
    resolvePhoneMirrorExecutable({ projectRoot: 'D:\\repo', override: 'D:\\runtime', exists }),
    join('D:\\runtime', 'QtScrcpy.exe')
  )
  assert.equal(
    resolvePhoneMirrorExecutable({ projectRoot: 'D:\\repo', exists }),
    join('D:\\repo', '.artifacts', 'qtscrcpy-custom-runtime', 'QtScrcpy.exe')
  )
})

test('missing runtime returns a Chinese actionable error', () => {
  assert.throws(
    () => resolvePhoneMirrorExecutable({ projectRoot: 'D:\\repo', exists: () => false }),
    /手机投屏组件不存在.*MOYU_QTSCRCPY_RUNTIME/
  )
})

test('second open focuses the owned child and shutdown does not kill unrelated processes', async () => {
  const child = new EventEmitter()
  child.pid = 314
  child.exitCode = null
  const spawned = []
  const sent = []
  const killed = []
  const launcher = createPhoneMirrorLauncher({
    projectRoot: 'D:\\repo',
    env: {},
    exists: () => true,
    startTransport: async ({ onMessage }) => ({
      send: type => sent.push(type),
      close: async () => {}
    }),
    spawnProcess: (...args) => {
      spawned.push(args)
      queueMicrotask(() => child.emit('spawn'))
      return child
    },
    killTree: async pid => killed.push(pid),
    randomHex: () => 'nonce',
    focusMainApp: () => {}
  })

  assert.deepEqual(await launcher.openOrFocus(), { status: 'started' })
  assert.deepEqual(await launcher.openOrFocus(), { status: 'focused' })
  assert.equal(spawned.length, 1)
  assert.deepEqual(sent, ['focus-qtscrcpy-main'])

  child.exitCode = 0
  child.emit('exit', 0)
  await launcher.shutdown()
  assert.deepEqual(killed, [])
})
```

Add this timeout test in the same file:

```js
test('shutdown force-kills only the owned child after the grace period', async () => {
  const child = new EventEmitter()
  child.pid = 2718
  child.exitCode = null
  const killed = []
  const launcher = createPhoneMirrorLauncher({
    projectRoot: 'D:\\repo',
    env: {},
    exists: () => true,
    startTransport: async () => ({ send: () => {}, close: async () => {} }),
    spawnProcess: () => {
      queueMicrotask(() => child.emit('spawn'))
      return child
    },
    killTree: async pid => killed.push(pid),
    randomHex: () => 'nonce',
    focusMainApp: () => {},
    shutdownTimeoutMs: 1
  })

  await launcher.openOrFocus()
  await launcher.shutdown()
  assert.deepEqual(killed, [2718])
})
```

- [ ] **Step 2: Run the launcher test and verify failure**

Run: `node --test tests/phone-mirror-launcher.test.mjs`

Expected: FAIL with `ERR_MODULE_NOT_FOUND`.

- [ ] **Step 3: Implement the launcher with injected process and transport boundaries**

Create `src/main/phone-mirror-launcher.mjs` with these concrete rules:

```js
import { existsSync } from 'node:fs'
import { dirname, extname, join, resolve } from 'node:path'
import { randomBytes } from 'node:crypto'
import { spawn } from 'node:child_process'
import { createServer } from 'node:net'
import { createPhoneMirrorPipe, encodePhoneMirrorMessage, parsePhoneMirrorLine } from './phone-mirror-protocol.mjs'

export function resolvePhoneMirrorExecutable({ projectRoot, override, exists = existsSync }) {
  const candidate = override
    ? (extname(override).toLowerCase() === '.exe' ? resolve(override) : resolve(override, 'QtScrcpy.exe'))
    : resolve(projectRoot, '.artifacts', 'qtscrcpy-custom-runtime', 'QtScrcpy.exe')
  if (!exists(candidate)) {
    throw new Error(`手机投屏组件不存在：${candidate}。可通过 MOYU_QTSCRCPY_RUNTIME 指定运行库目录。`)
  }
  return candidate
}

export function startPhoneMirrorTransport({ pipePath, token, onMessage }) {
  let authenticatedSocket = null
  const queue = []
  const server = createServer(socket => {
    socket.setEncoding('utf8')
    let buffered = ''
    socket.on('data', chunk => {
      buffered += chunk
      for (;;) {
        const newline = buffered.indexOf('\n')
        if (newline < 0) break
        const line = buffered.slice(0, newline)
        buffered = buffered.slice(newline + 1)
        const message = parsePhoneMirrorLine(line, token)
        if (!message) continue
        if (message.type === 'ready') {
          authenticatedSocket?.destroy()
          authenticatedSocket = socket
          while (queue.length) socket.write(queue.shift())
        } else if (authenticatedSocket === socket) {
          onMessage(message.type)
        }
      }
    })
    socket.on('close', () => {
      if (authenticatedSocket === socket) authenticatedSocket = null
    })
  })

  return new Promise((resolvePromise, reject) => {
    server.once('error', reject)
    server.listen(pipePath, () => resolvePromise({
      send(type) {
        const payload = encodePhoneMirrorMessage(token, type)
        if (authenticatedSocket?.writable) authenticatedSocket.write(payload)
        else queue.push(payload)
      },
      close: () => new Promise(done => {
        authenticatedSocket?.destroy()
        server.close(() => done())
      })
    }))
  })
}
```

In the same module, implement `createPhoneMirrorLauncher(...)` so that it:

```js
export function createPhoneMirrorLauncher({
  projectRoot,
  env = process.env,
  exists = existsSync,
  startTransport = startPhoneMirrorTransport,
  spawnProcess = spawn,
  killTree = defaultKillTree,
  randomHex = () => randomBytes(16).toString('hex'),
  focusMainApp,
  shutdownTimeoutMs = 1500
}) {
  let child = null
  let transport = null
  let starting = null
  let shuttingDown = false

  const isRunning = () => Boolean(child && child.exitCode === null)
  const send = type => transport?.send(type)

  async function openOrFocus() {
    if (isRunning()) {
      send('focus-qtscrcpy-main')
      return { status: 'focused' }
    }
    if (starting) return starting
    starting = (async () => {
      const executable = resolvePhoneMirrorExecutable({
        projectRoot,
        override: env.MOYU_QTSCRCPY_RUNTIME,
        exists
      })
      const nonce = randomHex()
      const token = randomHex()
      const pipePath = createPhoneMirrorPipe({ pid: process.pid, nonce })
      transport = await startTransport({
        pipePath,
        token,
        onMessage: type => { if (type === 'focus-main-app') focusMainApp() }
      })
      const nextChild = spawnProcess(executable, [], {
        cwd: dirname(executable),
        windowsHide: true,
        stdio: 'ignore',
        env: {
          ...env,
          MOYU_IPC_PIPE: pipePath,
          MOYU_IPC_TOKEN: token,
          MOYU_PARENT_PID: String(process.pid)
        }
      })
      child = nextChild
      nextChild.once('exit', () => {
        if (child !== nextChild) return
        child = null
        const staleTransport = transport
        transport = null
        void staleTransport?.close()
      })
      try {
        await new Promise((resolveSpawn, rejectSpawn) => {
          nextChild.once('spawn', resolveSpawn)
          nextChild.once('error', rejectSpawn)
        })
      } catch (error) {
        child = null
        await transport?.close()
        transport = null
        throw new Error(`手机投屏启动失败：${error.message}`)
      }
      return { status: 'started' }
    })().finally(() => { starting = null })
    return starting
  }

  async function shutdown() {
    if (shuttingDown) return
    shuttingDown = true
    const owned = child
    if (owned && owned.exitCode === null) {
      send('shutdown')
      await Promise.race([
        new Promise(resolveExit => owned.once('exit', resolveExit)),
        new Promise(resolveTimeout => setTimeout(resolveTimeout, shutdownTimeoutMs))
      ])
      if (owned.exitCode === null) await killTree(owned.pid)
    }
    await transport?.close()
    transport = null
    child = null
  }

  return {
    openOrFocus,
    setBossHidden: hidden => send(hidden ? 'boss-hide' : 'boss-show'),
    shutdown,
    isRunning
  }
}
```

Implement `defaultKillTree(pid)` in the same module:

```js
function defaultKillTree(pid) {
  if (process.platform !== 'win32') {
    try { process.kill(pid, 'SIGKILL') } catch {}
    return Promise.resolve()
  }
  return new Promise(resolveKill => {
    const killer = spawn('taskkill', ['/pid', String(pid), '/t', '/f'], {
      windowsHide: true,
      stdio: 'ignore'
    })
    killer.once('error', () => resolveKill())
    killer.once('exit', () => resolveKill())
  })
}
```

Do not enumerate or kill by process name. Returning `{ status: 'started' }` only after the child emits `spawn` ensures startup errors reach the existing home error area.

- [ ] **Step 4: Run focused launcher tests**

Run:

```powershell
node --test tests/phone-mirror-protocol.test.mjs tests/phone-mirror-launcher.test.mjs
```

Expected: protocol, path, singleton, focus, normal-exit, and owned-tree timeout cases PASS.

- [ ] **Step 5: Commit the launcher**

```powershell
git add src/main/phone-mirror-launcher.mjs tests/phone-mirror-launcher.test.mjs
git commit -m "feat: add phone mirroring process launcher"
```

### Task 3: Add and test the Qt local-socket bridge

**Files:**
- Create: `native/QtScrcpy/QtScrcpy/ui/moyuipcbridge.h`
- Create: `native/QtScrcpy/QtScrcpy/ui/moyuipcbridge.cpp`
- Modify: `native/QtScrcpy/QtScrcpy/CMakeLists.txt`
- Modify: `native/QtScrcpy/QtScrcpy/tests/CMakeLists.txt`
- Modify: `native/QtScrcpy/QtScrcpy/tests/tst_nativeui.cpp`

- [ ] **Step 1: Add failing Qt protocol tests**

Add test slots to `tst_nativeui.cpp` that exercise the bridge without opening a real pipe:

```cpp
void NativeUiTest::moyuIpcParsesAuthenticatedCommands()
{
    QCOMPARE(MoyuIpcBridge::parseMessage(
                 QByteArrayLiteral("{\"token\":\"secret\",\"type\":\"boss-hide\"}"),
                 QByteArrayLiteral("secret")),
             QStringLiteral("boss-hide"));
    QVERIFY(MoyuIpcBridge::parseMessage(
                QByteArrayLiteral("{\"token\":\"wrong\",\"type\":\"boss-hide\"}"),
                QByteArrayLiteral("secret")).isEmpty());
    QVERIFY(MoyuIpcBridge::parseMessage(
                QByteArrayLiteral("{\"token\":\"secret\",\"type\":\"unknown\"}"),
                QByteArrayLiteral("secret")).isEmpty());
}

void NativeUiTest::moyuIpcEncodesFocusWithoutLeakingExtraFields()
{
    QCOMPARE(MoyuIpcBridge::encodeMessage(QByteArrayLiteral("secret"),
                                          QStringLiteral("focus-main-app")),
             QByteArrayLiteral("{\"token\":\"secret\",\"type\":\"focus-main-app\"}\n"));
}
```

Add `moyuipcbridge.cpp/.h` to `moyu_native_tests`, then run the native test build.

Expected: compile FAIL because `MoyuIpcBridge` does not exist.

- [ ] **Step 2: Implement the bridge contract**

Create `moyuipcbridge.h` using the stable contract above and public static helpers:

```cpp
static QString parseMessage(const QByteArray &line, const QByteArray &expectedToken);
static QByteArray encodeMessage(const QByteArray &token, const QString &type);
```

Implement `moyuipcbridge.cpp` with `QLocalSocket`, `QJsonDocument`, and `QJsonObject`:

- `fromEnvironment()` returns `nullptr` when either `MOYU_IPC_PIPE` or `MOYU_IPC_TOKEN` is absent, so direct QtScrcpy launches continue working.
- Strip the Windows `\\.\pipe\` prefix before `QLocalSocket::connectToServer()`; retain the original value on non-Windows.
- `start()` connects once and retries up to 10 times at 250 ms if Electron has not accepted the connection yet.
- On `connected`, send authenticated `ready`.
- Buffer bytes until newline, parse each complete line, and emit only the four Electron-to-Qt command signals.
- `requestMainAppFocus()` sends `focus-main-app` only while connected.
- Never log the token or full message payload.

Use this exact dispatch:

```cpp
if (type == QStringLiteral("focus-qtscrcpy-main")) emit focusQtScrcpyRequested();
else if (type == QStringLiteral("boss-hide")) emit bossHideRequested();
else if (type == QStringLiteral("boss-show")) emit bossShowRequested();
else if (type == QStringLiteral("shutdown")) emit shutdownRequested();
```

- [ ] **Step 3: Add the production sources to CMake**

Append to `QC_UI_SOURCES`:

```cmake
ui/moyuipcbridge.h
ui/moyuipcbridge.cpp
```

Keep `Qt${QT_DESIRED_VERSION}::Network`, which is already linked by the application target.

- [ ] **Step 4: Run focused native tests**

Run:

```powershell
$gitCommon = (& git rev-parse --path-format=absolute --git-common-dir).Trim()
$sharedRoot = Split-Path $gitCommon -Parent
$qtPrefix = Join-Path $sharedRoot '.artifacts\qtscrcpy-toolchain\Qt\5.15.2\msvc2019_64\lib\cmake\Qt5'
cmake -S native/QtScrcpy -B .artifacts/qtscrcpy-native-build -G "Visual Studio 17 2022" -A x64 -DCMAKE_PREFIX_PATH=$qtPrefix -DMOYU_BUILD_TESTS=ON -DCMAKE_BUILD_TYPE=RelWithDebInfo
cmake --build .artifacts/qtscrcpy-native-build --config RelWithDebInfo --target moyu_native_tests
ctest --test-dir .artifacts/qtscrcpy-native-build -C RelWithDebInfo --output-on-failure
```

Expected: bridge parsing/encoding tests and the previously accepted native tests PASS.

- [ ] **Step 5: Commit the bridge**

```powershell
git add native/QtScrcpy/QtScrcpy/ui/moyuipcbridge.* native/QtScrcpy/QtScrcpy/CMakeLists.txt native/QtScrcpy/QtScrcpy/tests
git commit -m "feat: add QtScrcpy local IPC bridge"
```

### Task 4: Wire Qt focus, boss visibility, and shutdown

**Files:**
- Modify: `native/QtScrcpy/QtScrcpy/main.cpp`
- Modify: `native/QtScrcpy/QtScrcpy/ui/dialog.h`
- Modify: `native/QtScrcpy/QtScrcpy/ui/dialog.cpp`

- [ ] **Step 1: Expose one external presentation method on Dialog**

Add to the public section of `dialog.h`:

```cpp
void restoreAndPresent();
```

Implement in `dialog.cpp`:

```cpp
void Dialog::restoreAndPresent()
{
    if (m_moyuWindow) {
        m_moyuWindow->restoreAndPresent();
        return;
    }
    showNormal();
    show();
    raise();
    activateWindow();
}
```

- [ ] **Step 2: Attach the bridge in main.cpp**

After constructing `g_mainDlg`, create the optional bridge and retain the pre-boss visible windows:

```cpp
QPointer<MoyuIpcBridge> bridge(MoyuIpcBridge::fromEnvironment(&a));
QVector<QPointer<QWidget>> bossVisibleWindows;

if (bridge) {
    QObject::connect(g_mainDlg, &Dialog::focusMainAppRequested,
                     bridge, &MoyuIpcBridge::requestMainAppFocus);
    QObject::connect(bridge, &MoyuIpcBridge::focusQtScrcpyRequested,
                     g_mainDlg, &Dialog::restoreAndPresent);
    QObject::connect(bridge, &MoyuIpcBridge::bossHideRequested, &a, [&]() {
        bossVisibleWindows.clear();
        for (QWidget *window : QApplication::topLevelWidgets()) {
            if (window->isVisible()) {
                bossVisibleWindows.append(window);
                window->hide();
            }
        }
    });
    QObject::connect(bridge, &MoyuIpcBridge::bossShowRequested, &a, [&]() {
        const auto saved = bossVisibleWindows;
        bossVisibleWindows.clear();
        for (const QPointer<QWidget> &window : saved) {
            if (window) window->show();
        }
        if (g_mainDlg && g_mainDlg->isVisible()) {
            g_mainDlg->raise();
            g_mainDlg->activateWindow();
        }
    });
    QObject::connect(bridge, &MoyuIpcBridge::shutdownRequested,
                     &a, &QCoreApplication::quit);
    bridge->start();
}
```

Include `moyuipcbridge.h`, `QPointer`, and `QVector`. Do not call `close()` for boss-hide because `Dialog::closeEvent()` intentionally converts close to tray hiding.

- [ ] **Step 3: Build QtScrcpy**

Run:

```powershell
cmake --build .artifacts/qtscrcpy-native-build --config RelWithDebInfo --target QtScrcpy -j 8
```

Expected: `native/QtScrcpy/output/x64/RelWithDebInfo/QtScrcpy.exe` builds without warnings-as-errors failures.

- [ ] **Step 4: Refresh only the accepted development executable**

Run:

```powershell
$runtime = Join-Path (Resolve-Path '.').Path '.artifacts\qtscrcpy-custom-runtime'
Copy-Item -LiteralPath 'native\QtScrcpy\output\x64\RelWithDebInfo\QtScrcpy.exe' -Destination (Join-Path $runtime 'QtScrcpy.exe') -Force
Get-Item (Join-Path $runtime 'QtScrcpy.exe') | Select-Object FullName, Length, LastWriteTime
```

Expected: the runtime keeps its accepted Qt/ADB/server dependencies and only the rebuilt executable timestamp changes.

- [ ] **Step 5: Commit the Qt wiring**

```powershell
git add native/QtScrcpy/QtScrcpy/main.cpp native/QtScrcpy/QtScrcpy/ui/dialog.h native/QtScrcpy/QtScrcpy/ui/dialog.cpp
git commit -m "feat: connect QtScrcpy to MoYuMaster lifecycle"
```

### Task 5: Expose a main-window-only Electron entry and connect lifecycle

**Files:**
- Create: `src/main/phone-mirror-ipc.mjs`
- Create: `tests/phone-mirror-ipc.test.mjs`
- Modify: `src/main/index.js`

- [ ] **Step 1: Write the failing IPC authorization test**

Create `tests/phone-mirror-ipc.test.mjs`:

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import { createPhoneMirrorIpcHandlers } from '../src/main/phone-mirror-ipc.mjs'

test('phone mirroring can only be opened by the main window', async () => {
  const calls = []
  const handlers = createPhoneMirrorIpcHandlers({
    keyFromSender: event => event.key,
    launcher: { openOrFocus: async () => { calls.push('open'); return { status: 'started' } } }
  })

  assert.deepEqual(await handlers.open({ key: 'main' }), { status: 'started' })
  await assert.rejects(handlers.open({ key: 'douyinOpacity' }), /仅主窗口/)
  assert.deepEqual(calls, ['open'])
})
```

- [ ] **Step 2: Implement the restricted IPC handler**

Create `src/main/phone-mirror-ipc.mjs`:

```js
export function createPhoneMirrorIpcHandlers({ keyFromSender, launcher }) {
  return {
    async open(event) {
      if (keyFromSender(event) !== 'main') throw new Error('仅主窗口可打开手机投屏模式')
      return launcher.openOrFocus()
    }
  }
}
```

Run: `node --test tests/phone-mirror-ipc.test.mjs`

Expected: PASS.

- [ ] **Step 3: Initialize the launcher and IPC in index.js**

Add imports:

```js
import { createPhoneMirrorLauncher } from './phone-mirror-launcher.mjs'
import { createPhoneMirrorIpcHandlers } from './phone-mirror-ipc.mjs'
```

Add module state:

```js
let phoneMirrorLauncher = null
let phoneMirrorQuitReady = false
```

Inside `registerIpc()`:

```js
const phoneMirrorIpc = createPhoneMirrorIpcHandlers({ keyFromSender, launcher: phoneMirrorLauncher })
handle('phone-mirror:open', phoneMirrorIpc.open)
```

In `app.whenReady()`, initialize before `registerIpc()`:

```js
phoneMirrorLauncher = createPhoneMirrorLauncher({
  projectRoot: join(__dirname, '../..'),
  focusMainApp: () => focus('main')
})
```

Extend `toggleBossKey()` after the Electron controllers return their state:

```js
phoneMirrorLauncher?.setBossHidden(hidden)
```

Add before the existing `will-quit` listener:

```js
app.on('before-quit', event => {
  if (phoneMirrorQuitReady || !phoneMirrorLauncher) return
  event.preventDefault()
  phoneMirrorLauncher.shutdown().finally(() => {
    phoneMirrorQuitReady = true
    app.quit()
  })
})
```

Do not register a process-name cleanup and do not modify the existing window controller cleanup.

- [ ] **Step 4: Run the Node integration tests and build**

Run:

```powershell
node --test tests/phone-mirror-protocol.test.mjs tests/phone-mirror-launcher.test.mjs tests/phone-mirror-ipc.test.mjs
npm run build
```

Expected: focused tests PASS and Electron/Vue build succeeds.

- [ ] **Step 5: Commit Electron main-process integration**

```powershell
git add src/main/index.js src/main/phone-mirror-ipc.mjs tests/phone-mirror-ipc.test.mjs
git commit -m "feat: integrate phone mirroring lifecycle"
```

### Task 6: Add the “游戏与投屏” home entry

**Files:**
- Modify: `src/preload/index.js`
- Modify: `src/renderer/src/views/HomeView.vue`
- Modify: `tests/home-view.test.mjs`

- [ ] **Step 1: Add a failing home interaction test**

Add to `tests/home-view.test.mjs`:

```js
test('phone mirroring entry uses the restricted home bridge', async () => {
  const calls = []
  const wrapper = await mountHome({
    homeElectronAPI: {
      openPhoneMirror: async () => { calls.push('open'); return { status: 'started' } }
    }
  })

  assert.match(wrapper.text(), /游戏与投屏/)
  await buttonWithText(wrapper, '手机投屏模式').trigger('click')
  await flushPromises()
  assert.deepEqual(calls, ['open'])
})

test('phone mirroring startup errors appear in the existing alert', async () => {
  const wrapper = await mountHome({
    homeElectronAPI: {
      openPhoneMirror: async () => { throw new Error('手机投屏组件不存在') }
    }
  })

  await buttonWithText(wrapper, '手机投屏模式').trigger('click')
  await flushPromises()
  assert.match(wrapper.get('[role="alert"]').text(), /手机投屏组件不存在/)
})
```

Run: `node --test tests/home-view.test.mjs`

Expected: FAIL because the group title, button, and bridge method do not exist.

- [ ] **Step 2: Expose the argument-free preload action**

Add inside `homeElectronAPI`:

```js
openPhoneMirror: () => ipcRenderer.invoke('phone-mirror:open'),
```

Do not expose runtime paths, pipe names, tokens, process IDs, or generic spawn methods.

- [ ] **Step 3: Add the entry without changing layout behavior**

In `HomeView.vue`, rename the heading and add the button next to “单机模式”:

```vue
<section class="group">
  <h3>游戏与投屏</h3>
  <div class="grid">
    <button type="button" @click="open('standaloneGame')">单机模式</button>
    <button type="button" @click="open('phoneMirror')">手机投屏模式</button>
  </div>
</section>
```

Add to the `calls` map in `open(key)`:

```js
phoneMirror: {
  action: '打开手机投屏模式',
  run: () => callBridge(api, 'openPhoneMirror', '手机投屏模式')
},
```

This deliberately reuses `runAction()` and `actionError`; do not create a new dialog or alert system.

- [ ] **Step 4: Run focused UI tests and build**

Run:

```powershell
node --test tests/home-view.test.mjs tests/home-errors.test.mjs
npm run build
```

Expected: the new click/error tests and existing home tests PASS; build succeeds.

- [ ] **Step 5: Commit the home entry**

```powershell
git add src/preload/index.js src/renderer/src/views/HomeView.vue tests/home-view.test.mjs
git commit -m "feat: add phone mirroring home entry"
```

### Task 7: Run one integrated development acceptance pass

**Files:**
- Create: `docs/superpowers/verification/2026-09-24-phone-mirroring-electron-integration.md`

- [ ] **Step 1: Confirm the accepted runtime is present**

Run:

```powershell
$runtime = Resolve-Path '.artifacts\qtscrcpy-custom-runtime\QtScrcpy.exe'
Get-Item $runtime | Select-Object FullName, Length, LastWriteTime
```

Expected: one visible `QtScrcpy.exe` in the accepted custom runtime.

- [ ] **Step 2: Start MoYuMaster and exercise the entry twice**

Run `npm run dev`, then:

1. Confirm the home group reads “游戏与投屏”.
2. Click “手机投屏模式”; QtScrcpy appears centered and visible.
3. Move/minimize QtScrcpy, click the entry again, and confirm the same process is restored and focused.
4. Confirm Task Manager shows only one QtScrcpy process started by this MoYuMaster session.

- [ ] **Step 3: Verify bidirectional focus and boss state**

1. Click the home icon in the QtScrcpy main control bar; MoYuMaster must restore and focus.
2. Open a phone projection window wirelessly.
3. Trigger the configured boss key; MoYuMaster, QtScrcpy main, and the projection window must all hide.
4. Trigger it again; only windows visible before the hide must return.
5. Confirm projection, mouse input, toolbar icons, and window scaling remain as previously accepted.

- [ ] **Step 4: Verify owned shutdown cleanup**

Exit MoYuMaster normally, then run:

```powershell
Get-Process QtScrcpy -ErrorAction SilentlyContinue | Select-Object Id, ProcessName, Path
```

Expected: no QtScrcpy process started by this session remains. Do not kill or judge unrelated manually started processes by name; use the observed session PID during acceptance.

- [ ] **Step 5: Record concise evidence**

Create the verification file with:

```markdown
# Phone Mirroring Electron Integration Verification

- Date: 2026-09-24
- Runtime: `.artifacts/qtscrcpy-custom-runtime/QtScrcpy.exe`
- Home entry launch: PASS/FAIL
- Repeated-click single instance and focus: PASS/FAIL
- Qt home button restores MoYuMaster: PASS/FAIL
- Boss hide/show preserves prior visibility: PASS/FAIL
- Wireless projection and input regression: PASS/FAIL
- MoYuMaster exit cleans owned QtScrcpy PID: PASS/FAIL
- Notes: non-secret observations only; no device address or pairing code
```

Mark only directly observed results as PASS.

- [ ] **Step 6: Commit the acceptance record**

```powershell
git add docs/superpowers/verification/2026-09-24-phone-mirroring-electron-integration.md
git commit -m "test: verify Electron phone mirroring integration"
```

## Final focused regression

After the real acceptance pass, run only the affected automated surfaces:

```powershell
node --test tests/phone-mirror-protocol.test.mjs tests/phone-mirror-launcher.test.mjs tests/phone-mirror-ipc.test.mjs tests/home-view.test.mjs tests/home-errors.test.mjs
ctest --test-dir .artifacts/qtscrcpy-native-build -C RelWithDebInfo --output-on-failure
npm run build
git status --short
```

Expected: focused Node tests PASS, existing native test target PASS, build succeeds, and only the intentional verification record is pending before its commit. Do not rerun unrelated video/reading matrices because this batch does not touch those paths.
