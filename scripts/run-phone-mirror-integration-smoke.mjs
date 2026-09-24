import { spawn, execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const executable = createRequire(import.meta.url)('electron')
const environment = { ...process.env }
delete environment.ELECTRON_RUN_AS_NODE

const temporaryRoot = path.resolve(os.tmpdir())
const dataDirectory = fs.mkdtempSync(path.join(temporaryRoot, 'moyu-phone-smoke-'))
const projectRoot = path.resolve(fileURLToPath(new URL('..', import.meta.url)))
const runtime = path.resolve(projectRoot, '.artifacts', 'qtscrcpy-custom-runtime', 'QtScrcpy.exe')
environment.MOYU_SMOKE_DATA_DIR = dataDirectory
environment.MOYU_PHONE_MIRROR_DEBUG = '1'

try {
  const code = await new Promise((resolve, reject) => {
    const child = spawn(
      executable,
      [fileURLToPath(new URL('./phone-mirror-integration-smoke.cjs', import.meta.url))],
      { env: environment, stdio: 'inherit', windowsHide: true }
    )
    child.once('error', reject)
    child.once('exit', value => resolve(value ?? 1))
  })

  await new Promise(resolve => setTimeout(resolve, 500))
  const remaining = Number(execFileSync(
    'powershell.exe',
    [
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      '@(Get-Process QtScrcpy -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq $env:MOYU_QT_RUNTIME_CHECK }).Count'
    ],
    {
      env: { ...process.env, MOYU_QT_RUNTIME_CHECK: runtime },
      encoding: 'utf8',
      windowsHide: true
    }
  ).trim())
  if (remaining !== 0) throw new Error(`MoYuMaster exited with ${remaining} owned QtScrcpy process still running`)
  console.log('PHONE_MIRROR_CLEANUP {"remaining":0}')
  process.exitCode = code
} finally {
  const target = path.resolve(dataDirectory)
  const safe = path.dirname(target) === temporaryRoot && path.basename(target).startsWith('moyu-phone-smoke-')
  if (!safe) throw new Error(`Refusing to remove unsafe phone smoke data path: ${target}`)
  fs.rmSync(target, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })
}
