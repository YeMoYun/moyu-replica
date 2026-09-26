# Windows x64 Portable Release Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce a versioned Windows 10/11 x64 ZIP that users can fully extract and run by double-clicking `摸鱼大师.exe`, including the accepted QtScrcpy wireless-mirroring runtime and redistributable notices.

**Architecture:** `electron-vite` continues to build the application into `out/`, then pinned `electron-builder` creates a `win-unpacked` directory with `app.asar`. QtScrcpy is copied as an external `resources/qtscrcpy` runtime, while the launcher selects development or packaged paths explicitly and writes QtScrcpy settings under Electron `userData`. A guarded PowerShell script assembles the versioned folder, ZIP, manifest, and SHA256, followed by an isolated extracted-package smoke run.

**Tech Stack:** Electron 31, Vue 3, electron-vite 2.3.0, electron-builder 26.15.3, Node.js test runner, PowerShell 7/Windows PowerShell, QtScrcpy x64 runtime.

---

## File map

Modify:

- `src/main/phone-mirror-launcher.mjs`: select packaged runtime and redirect QtScrcpy configuration to user data.
- `src/main/index.js`: pass packaged paths, create an isolated smoke-test data path, and permit controlled packaged startup smoke exit.
- `tests/phone-mirror-launcher.test.mjs`: cover development, packaged, override, and user-data environment behavior.
- `package.json`: pin the packager and add release commands.
- `package-lock.json`: lock `electron-builder@26.15.3` and its dependencies.
- `.gitignore`: exclude generated `release/`.

Create:

- `electron-builder.yml`: deterministic x64 directory-package configuration.
- `build/使用说明.txt`: end-user extraction, security, connectivity, and wireless-debugging guidance.
- `tests/packaging-config.test.mjs`: assert builder boundaries and required release assets.
- `scripts/package-portable.ps1`: guarded build, assembly, ZIP, checksum, and manifest workflow.
- `tests/packaging-script.test.mjs`: statically check destructive-path and secret-exclusion safeguards.
- `scripts/run-portable-smoke.mjs`: extract the produced ZIP to a new temporary directory and launch the packaged application with isolated data.
- `tests/portable-smoke-script.test.mjs`: assert the smoke script verifies the intended package structure and uses an isolated directory.

Do not commit the ignored `.artifacts/qtscrcpy-custom-runtime` binaries or generated `release/` artifacts. The final ZIP is a user deliverable, not a Git source artifact.

---

### Task 1: Make phone mirroring work from packaged resources

**Files:**
- Modify: `src/main/phone-mirror-launcher.mjs`
- Modify: `src/main/index.js`
- Modify: `tests/phone-mirror-launcher.test.mjs`

- [ ] **Step 1: Extend the failing launcher tests**

Replace the first runtime-resolution test in `tests/phone-mirror-launcher.test.mjs` and add the configuration-directory test:

```js
test('runtime resolution supports override, development and packaged resources', () => {
  const exists = value => value.endsWith('QtScrcpy.exe')
  assert.equal(
    resolvePhoneMirrorExecutable({ projectRoot: 'D:\\repo', override: 'D:\\runtime', exists }),
    join('D:\\runtime', 'QtScrcpy.exe')
  )
  assert.equal(
    resolvePhoneMirrorExecutable({ projectRoot: 'D:\\repo', exists }),
    join('D:\\repo', '.artifacts', 'qtscrcpy-custom-runtime', 'QtScrcpy.exe')
  )
  assert.equal(
    resolvePhoneMirrorExecutable({
      projectRoot: 'D:\\repo',
      packaged: true,
      resourcesPath: 'D:\\portable\\resources',
      exists
    }),
    join('D:\\portable\\resources', 'qtscrcpy', 'QtScrcpy.exe')
  )
})

test('launcher creates and passes the QtScrcpy user-data config directory', async () => {
  const child = new EventEmitter()
  child.pid = 9021
  child.exitCode = null
  const created = []
  let spawnOptions
  const launcher = createPhoneMirrorLauncher({
    projectRoot: 'D:\\repo',
    packaged: true,
    resourcesPath: 'D:\\portable\\resources',
    configDirectory: 'C:\\Users\\tester\\AppData\\Roaming\\moyu\\qtscrcpy',
    env: {},
    exists: () => true,
    ensureDirectory: (path, options) => created.push([path, options]),
    startTransport: async () => ({ send() {}, close: async () => {} }),
    spawnProcess: (_file, _args, options) => {
      spawnOptions = options
      queueMicrotask(() => child.emit('spawn'))
      return child
    },
    killTree: async () => {},
    randomHex: () => 'nonce',
    focusMainApp() {}
  })
  await launcher.openOrFocus()
  assert.deepEqual(created, [['C:\\Users\\tester\\AppData\\Roaming\\moyu\\qtscrcpy', { recursive: true }]])
  assert.equal(spawnOptions.env.QTSCRCPY_CONFIG_PATH, 'C:\\Users\\tester\\AppData\\Roaming\\moyu\\qtscrcpy')
  child.exitCode = 0
  child.emit('exit', 0)
  await launcher.shutdown()
})
```

Keep the existing missing-runtime, transport, focus, spawn-failure, shutdown, and startup-race tests unchanged.

- [ ] **Step 2: Run the focused test and confirm the new cases fail**

Run:

```powershell
node --test tests/phone-mirror-launcher.test.mjs
```

Expected: the packaged path and `QTSCRCPY_CONFIG_PATH` assertions fail because the launcher does not yet accept those inputs.

- [ ] **Step 3: Implement explicit packaged-path resolution**

Change the imports and resolver in `src/main/phone-mirror-launcher.mjs`:

```js
import { existsSync, mkdirSync } from 'node:fs'
import { dirname, extname, resolve } from 'node:path'

export function resolvePhoneMirrorExecutable({
  projectRoot,
  packaged = false,
  resourcesPath,
  override,
  exists = existsSync
}) {
  const candidate = override
    ? (extname(override).toLowerCase() === '.exe'
        ? resolve(override)
        : resolve(override, 'QtScrcpy.exe'))
    : packaged
      ? resolve(resourcesPath, 'qtscrcpy', 'QtScrcpy.exe')
      : resolve(projectRoot, '.artifacts', 'qtscrcpy-custom-runtime', 'QtScrcpy.exe')

  if (!exists(candidate)) {
    throw new Error(`手机投屏组件不存在：${candidate}。可通过 MOYU_QTSCRCPY_RUNTIME 指定运行库目录。`)
  }
  return candidate
}
```

- [ ] **Step 4: Pass the user-data directory to QtScrcpy**

Extend `createPhoneMirrorLauncher` parameters:

```js
export function createPhoneMirrorLauncher({
  projectRoot,
  packaged = false,
  resourcesPath,
  configDirectory,
  env = process.env,
  exists = existsSync,
  ensureDirectory = mkdirSync,
  startTransport = startPhoneMirrorTransport,
  spawnProcess = spawn,
  killTree = defaultKillTree,
  randomHex = () => randomBytes(16).toString('hex'),
  focusMainApp,
  shutdownTimeoutMs = 1500
}) {
```

Inside `openOrFocus()`, resolve the packaged path and create the Qt config directory before starting the transport:

```js
const executable = resolvePhoneMirrorExecutable({
  projectRoot,
  packaged,
  resourcesPath,
  override: env.MOYU_QTSCRCPY_RUNTIME,
  exists
})
if (configDirectory) ensureDirectory(configDirectory, { recursive: true })
```

Add the config path to the existing child environment:

```js
env: {
  ...env,
  ...(configDirectory ? { QTSCRCPY_CONFIG_PATH: configDirectory } : {}),
  MOYU_IPC_PIPE: pipePath,
  MOYU_IPC_TOKEN: token,
  MOYU_PARENT_PID: String(process.pid)
}
```

- [ ] **Step 5: Wire Electron package and smoke paths**

Change the first import in `src/main/index.js` to:

```js
import { join } from 'node:path'
```

No import change is required, but immediately before `app.whenReady()` add:

```js
if (process.env.MOYU_SMOKE_DATA_DIR) {
  app.setPath('userData', process.env.MOYU_SMOKE_DATA_DIR)
}
```

Replace the launcher construction with:

```js
phoneMirrorLauncher = createPhoneMirrorLauncher({
  projectRoot: join(__dirname, '../..'),
  packaged: app.isPackaged,
  resourcesPath: process.resourcesPath,
  configDirectory: join(app.getPath('userData'), 'qtscrcpy'),
  focusMainApp: () => focus('main')
})
```

After `createTray()` add the controlled packaged smoke exit:

```js
if (process.env.MOYU_RELEASE_SMOKE === '1') {
  setTimeout(() => app.quit(), 2000)
}
```

- [ ] **Step 6: Run the launcher tests**

Run:

```powershell
node --test tests/phone-mirror-launcher.test.mjs
```

Expected: all launcher tests pass.

- [ ] **Step 7: Commit packaged runtime support**

```powershell
git add src/main/phone-mirror-launcher.mjs src/main/index.js tests/phone-mirror-launcher.test.mjs
git commit -m "feat: resolve phone mirroring in packaged app"
```

---

### Task 2: Pin electron-builder and define the x64 directory package

**Files:**
- Create: `electron-builder.yml`
- Create: `tests/packaging-config.test.mjs`
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `.gitignore`

- [ ] **Step 1: Write a failing package-boundary test**

Create `tests/packaging-config.test.mjs`:

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const config = readFileSync(new URL('../electron-builder.yml', import.meta.url), 'utf8')
const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
const gitignore = readFileSync(new URL('../.gitignore', import.meta.url), 'utf8')

test('builder emits only a Windows x64 unpacked directory', () => {
  assert.match(config, /productName:\s*摸鱼大师/)
  assert.match(config, /executableName:\s*摸鱼大师/)
  assert.match(config, /target:\s*dir/)
  assert.match(config, /-\s*x64/)
  assert.doesNotMatch(config, /nsis|portable|appx|msix/i)
  assert.match(config, /asar:\s*true/)
})

test('builder places the release Qt runtime outside app.asar and excludes debug files', () => {
  assert.match(config, /from:\s*\.artifacts\/qtscrcpy-custom-runtime/)
  assert.match(config, /to:\s*qtscrcpy/)
  assert.match(config, /!\*\*\/\*\.pdb/)
  assert.match(config, /!\*\*\/\*\.lib/)
  assert.match(config, /QtScrcpy-LICENSE\.txt/)
  assert.match(config, /QtScrcpy-UPSTREAM\.md/)
})

test('packager is pinned and generated releases stay untracked', () => {
  assert.equal(packageJson.devDependencies['electron-builder'], '26.15.3')
  assert.match(packageJson.scripts['package:win'], /package-portable\.ps1/)
  assert.match(gitignore, /^release\/$/m)
})
```

- [ ] **Step 2: Run the test and confirm it fails**

Run:

```powershell
node --test tests/packaging-config.test.mjs
```

Expected: FAIL because `electron-builder.yml` does not exist.

- [ ] **Step 3: Install the exact packager version**

Run:

```powershell
npm install --save-dev --save-exact electron-builder@26.15.3
```

Expected: `package.json` and `package-lock.json` record exactly `26.15.3`; installation completes without changing production dependency versions.

- [ ] **Step 4: Add release commands and ignore generated output**

Add these scripts to `package.json`:

```json
"test:packaging": "node --test tests/packaging-*.test.mjs tests/portable-smoke-script.test.mjs tests/phone-mirror-launcher.test.mjs",
"package:win": "powershell -NoProfile -ExecutionPolicy Bypass -File scripts/package-portable.ps1",
"test:portable": "node scripts/run-portable-smoke.mjs"
```

Append to `.gitignore`:

```gitignore
release/
```

- [ ] **Step 5: Create the builder configuration**

Create `electron-builder.yml`:

```yaml
appId: com.moyumaster.desktop
productName: 摸鱼大师
asar: true
directories:
  output: .artifacts/electron-builder
  buildResources: build
files:
  - out/**/*
  - package.json
extraResources:
  - from: .artifacts/qtscrcpy-custom-runtime
    to: qtscrcpy
    filter:
      - '**/*'
      - '!**/*.pdb'
      - '!**/*.lib'
  - from: native/QtScrcpy/LICENSE
    to: licenses/QtScrcpy-LICENSE.txt
  - from: native/QtScrcpy/UPSTREAM.md
    to: licenses/QtScrcpy-UPSTREAM.md
  - from: .artifacts/qtscrcpy-custom-runtime/LICENSE-QtScrcpy.txt
    to: licenses/QtScrcpy-runtime-license.txt
extraFiles:
  - from: build/使用说明.txt
    to: 使用说明.txt
win:
  executableName: 摸鱼大师
  target:
    - target: dir
      arch:
        - x64
```

- [ ] **Step 6: Run the configuration test**

Run:

```powershell
node --test tests/packaging-config.test.mjs
```

Expected: 3 tests pass.

- [ ] **Step 7: Commit packaging configuration**

```powershell
git add .gitignore package.json package-lock.json electron-builder.yml tests/packaging-config.test.mjs
git commit -m "build: configure Windows portable directory"
```

---

### Task 3: Add the redistributable user guide and license boundary

**Files:**
- Create: `build/使用说明.txt`
- Modify: `tests/packaging-config.test.mjs`

- [ ] **Step 1: Add a failing user-guide content test**

Append to `tests/packaging-config.test.mjs`:

```js
test('Chinese guide explains extraction, wireless-only use, hashes and unsigned warnings', () => {
  const guide = readFileSync(new URL('../build/使用说明.txt', import.meta.url), 'utf8')
  for (const text of [
    'Windows 10/11 64 位',
    '完整解压',
    '摸鱼大师.exe',
    '无线调试',
    '不提供 USB 模式',
    'SHA256',
    '未知发布者',
    '不要关闭安全软件',
    '退出摸鱼大师'
  ]) assert.ok(guide.includes(text), `使用说明缺少：${text}`)
})
```

- [ ] **Step 2: Run the test and confirm the guide is absent**

Run:

```powershell
node --test tests/packaging-config.test.mjs
```

Expected: FAIL with `ENOENT` for `build/使用说明.txt`.

- [ ] **Step 3: Create the complete Chinese guide**

Create `build/使用说明.txt`:

```text
摸鱼大师 1.0.0 绿色便携版使用说明

一、系统要求
1. 仅支持 Windows 10/11 64 位。
2. 网页、视频和在线阅读功能需要正常联网。
3. 手机投屏仅支持 Android 无线调试，不提供 USB 模式。

二、启动方法
1. 必须完整解压整个 ZIP，不能只复制“摸鱼大师.exe”。
2. 打开解压后的 MoYuMaster-1.0.0-win-x64 文件夹。
3. 双击“摸鱼大师.exe”，无需安装，也不需要管理员权限。
4. 用户设置保存在当前 Windows 账户的应用数据目录；替换程序文件夹不会自动清除设置。

三、手机无线投屏
1. 手机与电脑应处于能够互相访问的网络环境。
2. 在 Android 开发者选项中启用无线调试，按应用中文界面输入配对地址、配对码和连接地址。
3. 手机投屏组件必须与主程序文件保持原有目录结构。
4. 退出摸鱼大师后，由本次运行启动的 QtScrcpy 也应退出。

四、首次运行与安全提示
本版本没有 Windows 代码签名证书，首次运行时可能显示“未知发布者”或 Microsoft Defender SmartScreen 提示。请先向发布者取得 SHA256 值，并用发布包旁的 SHA256SUMS.txt 核对文件完整性。不要为了运行本软件关闭 Windows Defender 或其他安全软件；如果安全软件隔离了文件，请先核对来源和哈希，再决定是否继续使用。

五、SHA256 校验
在 ZIP 所在目录打开 PowerShell，执行：
Get-FileHash -Algorithm SHA256 .\MoYuMaster-1.0.0-win-x64.zip
显示的哈希应与 SHA256SUMS.txt 完全一致。

六、常见问题
1. 双击没有反应：确认已经完整解压，且文件没有被安全软件隔离。
2. 网页无法显示：检查网络、站点可用性和系统时间。
3. 无线投屏无法连接：重新核对手机无线调试地址、端口和配对码。
4. 只有主程序、缺少 resources 或 DLL：说明压缩包没有完整解压，请重新解压全部文件。
```

- [ ] **Step 4: Run the guide test**

Run:

```powershell
node --test tests/packaging-config.test.mjs
```

Expected: 4 tests pass.

- [ ] **Step 5: Commit the release guide**

```powershell
git add build/使用说明.txt tests/packaging-config.test.mjs
git commit -m "docs: add portable release guide"
```

---

### Task 4: Implement the guarded portable-release script

**Files:**
- Create: `scripts/package-portable.ps1`
- Create: `tests/packaging-script.test.mjs`

- [ ] **Step 1: Write a failing release-script safety test**

Create `tests/packaging-script.test.mjs`:

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const script = readFileSync(new URL('../scripts/package-portable.ps1', import.meta.url), 'utf8')

test('release script checks platform, clean Git state and required Qt files', () => {
  assert.match(script, /RuntimeInformation.*OSArchitecture.*X64/)
  assert.match(script, /git status --porcelain/)
  for (const file of ['QtScrcpy.exe', 'adb.exe', 'scrcpy-server', 'platforms\\qwindows.dll']) {
    assert.ok(script.includes(file), `missing runtime check: ${file}`)
  }
})

test('release script validates exact versioned targets before removal', () => {
  assert.match(script, /GetFullPath/)
  assert.match(script, /StartsWith/)
  assert.match(script, /Remove-Item -LiteralPath/)
  assert.doesNotMatch(script, /Remove-Item\s+[^\r\n]*\*/)
  assert.doesNotMatch(script, /rm\s+-rf/i)
})

test('release script builds, packages, checks exclusions, zips and hashes', () => {
  assert.match(script, /npm run build/)
  assert.match(script, /electron-builder.*--win.*--x64.*--dir/)
  assert.match(script, /\.pdb|\.lib/)
  assert.match(script, /Compress-Archive/)
  assert.match(script, /Get-FileHash.*SHA256/)
  assert.match(script, /package-manifest\.txt/)
})
```

- [ ] **Step 2: Run the test and confirm the script is absent**

Run:

```powershell
node --test tests/packaging-script.test.mjs
```

Expected: FAIL with `ENOENT` for `scripts/package-portable.ps1`.

- [ ] **Step 3: Create the complete release script**

Create `scripts/package-portable.ps1`:

```powershell
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$repoRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$packageJson = Get-Content -Raw -LiteralPath (Join-Path $repoRoot 'package.json') | ConvertFrom-Json
$version = [string]$packageJson.version
$folderName = "MoYuMaster-$version-win-x64"
$releaseRoot = [IO.Path]::GetFullPath((Join-Path $repoRoot 'release'))
$portableDir = [IO.Path]::GetFullPath((Join-Path $releaseRoot $folderName))
$zipPath = [IO.Path]::GetFullPath((Join-Path $releaseRoot "$folderName.zip"))
$builderRoot = [IO.Path]::GetFullPath((Join-Path $repoRoot '.artifacts\electron-builder'))
$unpackedDir = [IO.Path]::GetFullPath((Join-Path $builderRoot 'win-unpacked'))
$runtimeRoot = [IO.Path]::GetFullPath((Join-Path $repoRoot '.artifacts\qtscrcpy-custom-runtime'))

if ($env:OS -ne 'Windows_NT') { throw '只能在 Windows 上生成便携版' }
if ([Runtime.InteropServices.RuntimeInformation]::OSArchitecture -ne [Runtime.InteropServices.Architecture]::X64) { throw '只能在 Windows x64 环境生成此发布包' }

Push-Location $repoRoot
try {
  $dirty = @(git status --porcelain)
  if ($LASTEXITCODE -ne 0) { throw '无法读取 Git 状态' }
  if ($dirty.Count) { throw "工作区不干净，拒绝生成发布包：`n$($dirty -join "`n")" }
  $commit = (git rev-parse HEAD).Trim()
  if ($LASTEXITCODE -ne 0) { throw '无法读取 Git 提交' }

  $requiredSourceFiles = @(
    'QtScrcpy.exe',
    'adb.exe',
    'scrcpy-server',
    'platforms\qwindows.dll',
    'LICENSE-QtScrcpy.txt'
  )
  foreach ($relative in $requiredSourceFiles) {
    $candidate = Join-Path $runtimeRoot $relative
    if (-not (Test-Path -LiteralPath $candidate -PathType Leaf)) { throw "QtScrcpy 运行库缺少：$candidate" }
  }
  foreach ($sourceLicense in @('native\QtScrcpy\LICENSE', 'native\QtScrcpy\UPSTREAM.md', 'build\使用说明.txt')) {
    if (-not (Test-Path -LiteralPath (Join-Path $repoRoot $sourceLicense) -PathType Leaf)) { throw "发布文件缺少：$sourceLicense" }
  }

  npm run build
  if ($LASTEXITCODE -ne 0) { throw 'electron-vite build 失败' }
  npx electron-builder --win --x64 --dir --config electron-builder.yml
  if ($LASTEXITCODE -ne 0) { throw 'electron-builder 失败' }

  $requiredPackagedFiles = @(
    '摸鱼大师.exe',
    '使用说明.txt',
    'resources\app.asar',
    'resources\qtscrcpy\QtScrcpy.exe',
    'resources\qtscrcpy\adb.exe',
    'resources\qtscrcpy\scrcpy-server',
    'resources\qtscrcpy\platforms\qwindows.dll',
    'resources\licenses\QtScrcpy-LICENSE.txt',
    'resources\licenses\QtScrcpy-UPSTREAM.md',
    'resources\licenses\QtScrcpy-runtime-license.txt'
  )
  foreach ($relative in $requiredPackagedFiles) {
    $candidate = Join-Path $unpackedDir $relative
    if (-not (Test-Path -LiteralPath $candidate -PathType Leaf)) { throw "打包目录缺少：$candidate" }
  }
  $debugFiles = @(Get-ChildItem -LiteralPath $unpackedDir -Recurse -File | Where-Object { $_.Extension -in @('.pdb', '.lib') })
  if ($debugFiles.Count) { throw "打包目录包含调试文件：$($debugFiles.FullName -join ', ')" }

  New-Item -ItemType Directory -Path $releaseRoot -Force | Out-Null
  $releasePrefix = $releaseRoot.TrimEnd([IO.Path]::DirectorySeparatorChar) + [IO.Path]::DirectorySeparatorChar
  foreach ($target in @($portableDir, $zipPath, (Join-Path $releaseRoot 'SHA256SUMS.txt'), (Join-Path $releaseRoot 'package-manifest.txt'))) {
    $fullTarget = [IO.Path]::GetFullPath($target)
    if (-not $fullTarget.StartsWith($releasePrefix, [StringComparison]::OrdinalIgnoreCase)) { throw "拒绝操作发布目录之外的路径：$fullTarget" }
    if (Test-Path -LiteralPath $fullTarget) { Remove-Item -LiteralPath $fullTarget -Recurse -Force }
  }

  Copy-Item -LiteralPath $unpackedDir -Destination $portableDir -Recurse
  Compress-Archive -LiteralPath $portableDir -DestinationPath $zipPath -CompressionLevel Optimal
  $hash = (Get-FileHash -LiteralPath $zipPath -Algorithm SHA256).Hash.ToUpperInvariant()
  "$hash *$folderName.zip" | Set-Content -LiteralPath (Join-Path $releaseRoot 'SHA256SUMS.txt') -Encoding ascii
  $fileCount = @(Get-ChildItem -LiteralPath $portableDir -Recurse -File).Count
  $zipBytes = (Get-Item -LiteralPath $zipPath).Length
  @(
    "Product=MoYuMaster",
    "Version=$version",
    'Platform=Windows',
    'Architecture=x64',
    "GitCommit=$commit",
    "GeneratedAt=$([DateTimeOffset]::Now.ToString('o'))",
    "PortableFileCount=$fileCount",
    "ZipBytes=$zipBytes",
    "ZipSha256=$hash"
  ) | Set-Content -LiteralPath (Join-Path $releaseRoot 'package-manifest.txt') -Encoding utf8
  Write-Host "便携版已生成：$zipPath"
  Write-Host "SHA256：$hash"
} finally {
  Pop-Location
}
```

- [ ] **Step 4: Parse the PowerShell script without running it**

Run:

```powershell
$tokens = $null
$errors = $null
[Management.Automation.Language.Parser]::ParseFile((Resolve-Path 'scripts/package-portable.ps1'), [ref]$tokens, [ref]$errors) | Out-Null
if ($errors.Count) { $errors | Format-List | Out-String | Write-Error } else { 'PowerShell syntax OK' }
```

Expected: `PowerShell syntax OK`.

- [ ] **Step 5: Run the release-script tests**

Run:

```powershell
node --test tests/packaging-script.test.mjs
```

Expected: 3 tests pass.

- [ ] **Step 6: Commit the release script**

```powershell
git add scripts/package-portable.ps1 tests/packaging-script.test.mjs
git commit -m "build: add guarded portable release script"
```

---

### Task 5: Add an extracted-package startup smoke runner

**Files:**
- Create: `scripts/run-portable-smoke.mjs`
- Create: `tests/portable-smoke-script.test.mjs`

- [ ] **Step 1: Write a failing smoke-runner structure test**

Create `tests/portable-smoke-script.test.mjs`:

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const script = readFileSync(new URL('../scripts/run-portable-smoke.mjs', import.meta.url), 'utf8')

test('portable smoke extracts into a temporary directory and isolates user data', () => {
  assert.match(script, /mkdtempSync/)
  assert.match(script, /Expand-Archive/)
  assert.match(script, /MOYU_SMOKE_DATA_DIR/)
  assert.match(script, /MOYU_RELEASE_SMOKE/)
})

test('portable smoke checks main app and packaged phone runtime before launch', () => {
  for (const file of ['摸鱼大师.exe', 'resources/qtscrcpy/QtScrcpy.exe', 'resources/qtscrcpy/adb.exe', 'resources/qtscrcpy/scrcpy-server']) {
    assert.ok(script.includes(file), `missing portable check: ${file}`)
  }
  assert.match(script, /timeout/i)
  assert.match(script, /exitCode/)
})
```

- [ ] **Step 2: Run the test and confirm the script is absent**

Run:

```powershell
node --test tests/portable-smoke-script.test.mjs
```

Expected: FAIL with `ENOENT` for `scripts/run-portable-smoke.mjs`.

- [ ] **Step 3: Create the smoke runner**

Create `scripts/run-portable-smoke.mjs`:

```js
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { spawn, spawnSync } from 'node:child_process'
import { basename, join, resolve } from 'node:path'
import { tmpdir } from 'node:os'

const zipPath = resolve(process.argv[2] || 'release/MoYuMaster-1.0.0-win-x64.zip')
if (!existsSync(zipPath)) throw new Error(`便携版 ZIP 不存在：${zipPath}`)
const temporaryRoot = mkdtempSync(join(tmpdir(), 'moyu-portable-smoke-'))
const extractedRoot = join(temporaryRoot, 'extracted')
const userData = join(temporaryRoot, 'user-data')

function powershellLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`
}

try {
  const expanded = spawnSync('powershell', [
    '-NoProfile', '-NonInteractive', '-Command',
    `Expand-Archive -LiteralPath ${powershellLiteral(zipPath)} -DestinationPath ${powershellLiteral(extractedRoot)} -Force`
  ], { encoding: 'utf8', windowsHide: true })
  if (expanded.status !== 0) throw new Error(`ZIP 解压失败：${expanded.stderr || expanded.stdout}`)

  const folderName = basename(zipPath, '.zip')
  const portableRoot = join(extractedRoot, folderName)
  const required = [
    '摸鱼大师.exe',
    'resources/qtscrcpy/QtScrcpy.exe',
    'resources/qtscrcpy/adb.exe',
    'resources/qtscrcpy/scrcpy-server'
  ]
  for (const relative of required) {
    const candidate = join(portableRoot, ...relative.split('/'))
    if (!existsSync(candidate)) throw new Error(`解压目录缺少：${candidate}`)
  }

  const executable = join(portableRoot, '摸鱼大师.exe')
  const child = spawn(executable, [], {
    cwd: portableRoot,
    windowsHide: true,
    env: {
      ...process.env,
      MOYU_SMOKE_DATA_DIR: userData,
      MOYU_RELEASE_SMOKE: '1'
    },
    stdio: 'ignore'
  })
  const exitCode = await new Promise((resolveExit, reject) => {
    const timeout = setTimeout(() => {
      child.kill()
      reject(new Error('便携版启动 smoke timeout：20 秒内未自行退出'))
    }, 20_000)
    child.once('error', error => {
      clearTimeout(timeout)
      reject(error)
    })
    child.once('exit', code => {
      clearTimeout(timeout)
      resolveExit(code)
    })
  })
  if (exitCode !== 0) throw new Error(`便携版进程异常退出：${exitCode}`)
  console.log(JSON.stringify({ portableSmoke: 'passed', zip: zipPath, isolatedUserData: true }))
} finally {
  const resolvedTemporary = resolve(temporaryRoot)
  const resolvedBase = resolve(tmpdir())
  if (!resolvedTemporary.startsWith(resolvedBase + '\\')) throw new Error(`拒绝清理临时目录之外的路径：${resolvedTemporary}`)
  rmSync(resolvedTemporary, { recursive: true, force: true })
}
```

- [ ] **Step 4: Run the structure test**

Run:

```powershell
node --test tests/portable-smoke-script.test.mjs
```

Expected: 2 tests pass. Do not run the smoke script until a ZIP exists.

- [ ] **Step 5: Commit the smoke runner**

```powershell
git add scripts/run-portable-smoke.mjs tests/portable-smoke-script.test.mjs
git commit -m "test: add extracted portable startup smoke"
```

---

### Task 6: Build the real package and verify the extracted artifact

**Files:**
- Generate, ignored: `release/MoYuMaster-1.0.0-win-x64/`
- Generate, ignored: `release/MoYuMaster-1.0.0-win-x64.zip`
- Generate, ignored: `release/SHA256SUMS.txt`
- Generate, ignored: `release/package-manifest.txt`

- [ ] **Step 1: Run the focused packaging tests**

Run:

```powershell
npm run test:packaging
```

Expected: builder configuration, release-script, portable-smoke, and phone-mirror launcher tests all pass.

- [ ] **Step 2: Run the existing project tests and production build**

Run:

```powershell
npm test
npm run build
```

Expected: existing Node tests pass and `electron-vite build` succeeds. Do not use the disabled `verification-before-completion` skill; these are explicit release-plan commands.

- [ ] **Step 3: Confirm the exact release source state**

Run:

```powershell
git status --short --branch
git rev-parse HEAD
```

Expected: branch `main`, no working-tree changes, and a concrete commit hash to record in the manifest.

- [ ] **Step 4: Generate the versioned portable ZIP**

Run:

```powershell
npm run package:win
```

Expected: `release/MoYuMaster-1.0.0-win-x64.zip`, `release/SHA256SUMS.txt`, and `release/package-manifest.txt` are created. The command prints the same uppercase SHA256 written to the checksum file.

- [ ] **Step 5: Run the extracted-package startup smoke**

Run:

```powershell
npm run test:portable -- release/MoYuMaster-1.0.0-win-x64.zip
```

Expected: one JSON line whose `portableSmoke` field is `passed`, whose `isolatedUserData` field is `true`, and whose `zip` field is the absolute ZIP path.

- [ ] **Step 6: Inspect release exclusions and checksums**

Run:

```powershell
$releaseFolder = Resolve-Path 'release\MoYuMaster-1.0.0-win-x64'
$forbidden = @(Get-ChildItem -LiteralPath $releaseFolder -Recurse -File | Where-Object { $_.Extension -in @('.pdb', '.lib', '.cpp', '.h', '.vue', '.test.mjs') })
if ($forbidden.Count) { $forbidden.FullName; throw '发布目录包含禁止文件' }
$expected = ((Get-Content 'release\SHA256SUMS.txt') -split '\s+')[0]
$actual = (Get-FileHash 'release\MoYuMaster-1.0.0-win-x64.zip' -Algorithm SHA256).Hash
if ($expected -ne $actual) { throw 'ZIP SHA256 不一致' }
Get-Content 'release\package-manifest.txt'
```

Expected: no forbidden files, hash equality, and manifest values for version `1.0.0`, Windows, x64, Git commit, file count, ZIP bytes, and SHA256.

- [ ] **Step 7: Perform the user-visible extracted acceptance**

From a newly extracted copy outside the repository:

1. Double-click `摸鱼大师.exe` and confirm the main page appears.
2. Open one reading entry, one video entry, one chat-disguise entry, local reading, and local video.
3. Open “手机投屏模式”; confirm QtScrcpy starts from the extracted package.
4. Click the entry again; confirm the same QtScrcpy process is focused rather than duplicated.
5. Trigger the boss key twice; confirm both applications hide and restore as previously accepted.
6. Exit MoYuMaster; confirm its owned QtScrcpy process exits.
7. If an Android wireless-debugging device is available, reconnect once and confirm projection/input. If none is available, record “真实无线连接未复验” rather than marking it passed.

- [ ] **Step 8: Record the release result without committing binaries**

Create ignored `.artifacts/portable-release-1.0.0-verification.md` containing observed values:

```markdown
# MoYuMaster 1.0.0 Portable Release Verification

- Git commit: value from package-manifest.txt
- ZIP SHA256: value from SHA256SUMS.txt
- Extracted startup smoke: PASS or FAIL
- Main-page launch: PASS or FAIL
- Reading/video/chat/local entries: PASS or FAIL
- Packaged QtScrcpy launch and focus: PASS or FAIL
- Boss hide and restore: PASS or FAIL
- Owned QtScrcpy exits with main app: PASS or FAIL
- Real Android wireless projection: PASS, FAIL, or NOT RECHECKED
- Unsigned build warning observed: YES or NO
- Notes: non-secret observations only
```

Do not add the ZIP, unpacked directory, checksum, manifest, or ignored verification note to Git.

- [ ] **Step 9: Add a source checkpoint tag only after acceptance**

If the extracted startup and core acceptance items pass, run:

```powershell
git tag -a portable-v1.0.0 -m "MoYuMaster 1.0.0 Windows x64 portable release"
```

If a core acceptance item fails, do not create the tag; diagnose and repair the exact failure first.

---

## Self-review results

- Spec coverage: x64-only output, unpacked ZIP structure, packaged QtScrcpy path, user-data configuration, debug-file exclusion, licenses, Chinese guide, unsigned warning, checksum, manifest, clean-source check, isolated smoke, and manual acceptance each map to a concrete task.
- Scope boundary: no step modifies application features, transparent modes, wireless pairing behavior, the read-only source application, or the postponed WeChat authentication proof of concept.
- Placeholder scan: all created code/config files, tests, commands, expected outcomes, and release paths are explicit; observation fields in the ignored verification note are intentionally filled from the real run.
- Type consistency: `packaged`, `resourcesPath`, `configDirectory`, `MOYU_SMOKE_DATA_DIR`, and `MOYU_RELEASE_SMOKE` use the same names across launcher code, Electron startup, tests, and smoke runner.
- Safety: release deletion is limited to validated absolute children of `release/`; smoke cleanup is limited to a `mkdtempSync` child of the system temporary directory.
