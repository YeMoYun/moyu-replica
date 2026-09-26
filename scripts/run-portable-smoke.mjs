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
