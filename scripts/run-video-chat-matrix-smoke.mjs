import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const executable = createRequire(import.meta.url)('electron')
const environment = { ...process.env }
delete environment.ELECTRON_RUN_AS_NODE

const temporaryRoot = path.resolve(os.tmpdir())
const dataDirectory = fs.mkdtempSync(path.join(temporaryRoot, 'moyu-chat-matrix-'))
environment.MOYU_CHAT_MATRIX_DATA_DIR = dataDirectory

try {
  const code = await new Promise((resolve, reject) => {
    const child = spawn(
      executable,
      [fileURLToPath(new URL('./video-chat-matrix-smoke.cjs', import.meta.url))],
      { env: environment, stdio: 'inherit', windowsHide: true }
    )
    child.once('error', reject)
    child.once('exit', value => resolve(value ?? 1))
  })
  process.exitCode = code
} finally {
  const target = path.resolve(dataDirectory)
  const safe = path.dirname(target) === temporaryRoot && path.basename(target).startsWith('moyu-chat-matrix-')
  if (!safe) throw new Error(`Refusing to remove unsafe matrix data path: ${target}`)
  fs.rmSync(target, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })
  console.log('Isolated video-chat matrix configuration removed; user settings were not used.')
}
