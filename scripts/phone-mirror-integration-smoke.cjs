// Runs inside Electron with isolated settings and the accepted development QtScrcpy runtime.
const { app, BrowserWindow } = require('electron')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { promisify } = require('node:util')
const { execFile } = require('node:child_process')

const execFileAsync = promisify(execFile)
const data = process.env.MOYU_SMOKE_DATA_DIR || fs.mkdtempSync(path.join(os.tmpdir(), 'moyu-phone-smoke-'))
const runtime = path.resolve(__dirname, '..', '.artifacts', 'qtscrcpy-custom-runtime', 'QtScrcpy.exe')
app.setPath('userData', data)
app.disableHardwareAcceleration()

const pause = ms => new Promise(resolve => setTimeout(resolve, ms))
async function until(operation, label) {
  for (let attempt = 0; attempt < 80; attempt++) {
    const value = await operation()
    if (value) return value
    await pause(100)
  }
  throw new Error(`Timed out: ${label}`)
}

function homeWindow() {
  return BrowserWindow.getAllWindows().find(window => window.webContents.getURL().endsWith('#/home'))
}

function evaluate(window, source) {
  return window.webContents.executeJavaScript(source, true)
}

async function qtWindowState(action = 'state') {
  const command = `
Add-Type -Name WinApi -Namespace MoyuSmoke -MemberDefinition '[DllImport("user32.dll")] public static extern bool ShowWindowAsync(IntPtr hWnd, int nCmdShow); [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr hWnd); [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);'
$matches = @(Get-Process QtScrcpy -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq $env:MOYU_QT_RUNTIME_CHECK })
$process = $matches | Select-Object -First 1
if ($process -and $env:MOYU_SMOKE_ACTION -eq 'minimize') { [MoyuSmoke.WinApi]::ShowWindowAsync([IntPtr]$process.MainWindowHandle, 6) | Out-Null; Start-Sleep -Milliseconds 150 }
[pscustomobject]@{
  count = $matches.Count
  pid = if ($process) { $process.Id } else { 0 }
  handle = if ($process) { [Int64]$process.MainWindowHandle } else { 0 }
  visible = if ($process) { [MoyuSmoke.WinApi]::IsWindowVisible([IntPtr]$process.MainWindowHandle) } else { $false }
  minimized = if ($process) { [MoyuSmoke.WinApi]::IsIconic([IntPtr]$process.MainWindowHandle) } else { $false }
} | ConvertTo-Json -Compress
`
  const { stdout } = await execFileAsync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', command], {
    env: {
      ...process.env,
      MOYU_QT_RUNTIME_CHECK: runtime,
      MOYU_SMOKE_ACTION: action
    },
    windowsHide: true
  })
  return JSON.parse(stdout.trim())
}

const watchdog = setTimeout(() => {
  console.error('PHONE_MIRROR_SMOKE timeout')
  process.exitCode = 1
  app.quit()
}, 45000)

app.whenReady().then(async () => {
  try {
    console.log('PHONE_MIRROR_STEP waiting-home')
    const home = await until(() => homeWindow(), 'home window')
    console.log('PHONE_MIRROR_STEP waiting-bridge')
    await until(
      async () => evaluate(home, 'typeof window.homeElectronAPI?.openPhoneMirror === "function"'),
      'phone mirror preload bridge'
    )
    assert.match(await evaluate(home, 'document.body.innerText'), /游戏与投屏/)
    assert.match(await evaluate(home, 'document.body.innerText'), /手机投屏模式/)

    console.log('PHONE_MIRROR_STEP opening-first')
    const first = await evaluate(home, 'window.homeElectronAPI.openPhoneMirror()')
    console.log(`PHONE_MIRROR_STEP first-result ${JSON.stringify(first)}`)
    assert.deepEqual(first, { status: 'started' })
    const started = await until(async () => {
      const state = await qtWindowState()
      return state.count === 1 && state.handle !== 0 ? state : null
    }, 'one QtScrcpy main window')
    console.log(`PHONE_MIRROR_STEP first-window ${JSON.stringify(started)}`)

    const minimized = await qtWindowState('minimize')
    console.log(`PHONE_MIRROR_STEP minimized ${JSON.stringify(minimized)}`)
    assert.equal(minimized.pid, started.pid)
    assert.equal(minimized.minimized, true)

    const second = await evaluate(home, 'window.homeElectronAPI.openPhoneMirror()')
    console.log(`PHONE_MIRROR_STEP second-result ${JSON.stringify(second)}`)
    assert.deepEqual(second, { status: 'focused' })
    await until(async () => {
      const state = await qtWindowState()
      return state.pid === started.pid && state.visible && !state.minimized
    }, 'existing QtScrcpy restored')
    console.log('PHONE_MIRROR_STEP restored')

    await evaluate(home, 'window.ipcRenderer.invoke("boss-key")')
    await until(async () => !(await qtWindowState()).visible, 'QtScrcpy hidden by boss key')
    console.log('PHONE_MIRROR_STEP boss-hidden')
    await evaluate(home, 'window.ipcRenderer.invoke("boss-key")')
    await until(async () => (await qtWindowState()).visible, 'QtScrcpy restored by boss key')
    console.log('PHONE_MIRROR_STEP boss-restored')

    console.log(`PHONE_MIRROR_SMOKE ${JSON.stringify({
      homeEntry: true,
      processId: started.pid,
      singleInstance: true,
      restoredAfterMinimize: true,
      bossMainWindow: true
    })}`)
    clearTimeout(watchdog)
    app.quit()
  } catch (error) {
    console.error(error.stack)
    process.exitCode = 1
    clearTimeout(watchdog)
    app.quit()
  }
})

require('../out/main/index.js')
