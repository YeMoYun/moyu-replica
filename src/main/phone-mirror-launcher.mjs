import { existsSync } from 'node:fs'
import { dirname, extname, resolve } from 'node:path'
import { randomBytes } from 'node:crypto'
import { spawn } from 'node:child_process'
import { createServer } from 'node:net'
import {
  createPhoneMirrorPipe,
  encodePhoneMirrorMessage,
  parsePhoneMirrorLine
} from './phone-mirror-protocol.mjs'

export function resolvePhoneMirrorExecutable({ projectRoot, override, exists = existsSync }) {
  const candidate = override
    ? (extname(override).toLowerCase() === '.exe'
        ? resolve(override)
        : resolve(override, 'QtScrcpy.exe'))
    : resolve(projectRoot, '.artifacts', 'qtscrcpy-custom-runtime', 'QtScrcpy.exe')

  if (!exists(candidate)) {
    throw new Error(
      `手机投屏组件不存在：${candidate}。可通过 MOYU_QTSCRCPY_RUNTIME 指定运行库目录。`
    )
  }
  return candidate
}

export function startPhoneMirrorTransport({ pipePath, token, onMessage }) {
  let authenticatedSocket = null
  let closed = false
  const queue = []
  const sockets = new Set()
  const server = createServer(socket => {
    sockets.add(socket)
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
          if (authenticatedSocket && authenticatedSocket !== socket) {
            authenticatedSocket.destroy()
          }
          authenticatedSocket = socket
          while (queue.length && socket.writable) socket.write(queue.shift())
        } else if (authenticatedSocket === socket) {
          onMessage(message.type)
        }
      }
    })

    socket.on('close', () => {
      sockets.delete(socket)
      if (authenticatedSocket === socket) authenticatedSocket = null
    })
  })

  return new Promise((resolveTransport, rejectTransport) => {
    const onStartupError = error => rejectTransport(error)
    server.once('error', onStartupError)
    server.listen(pipePath, () => {
      server.off('error', onStartupError)
      resolveTransport({
        send(type) {
          if (closed) return
          const payload = encodePhoneMirrorMessage(token, type)
          if (authenticatedSocket?.writable) authenticatedSocket.write(payload)
          else queue.push(payload)
        },
        close() {
          if (closed) return Promise.resolve()
          closed = true
          queue.length = 0
          for (const socket of sockets) socket.destroy()
          sockets.clear()
          authenticatedSocket = null
          return new Promise(resolveClose => server.close(() => resolveClose()))
        }
      })
    })
  })
}

function defaultKillTree(pid) {
  if (process.platform !== 'win32') {
    try {
      process.kill(pid, 'SIGKILL')
    } catch {}
    return Promise.resolve()
  }

  return new Promise(resolveKill => {
    const killer = spawn('taskkill', ['/pid', String(pid), '/t', '/f'], {
      windowsHide: true,
      stdio: 'ignore'
    })
    let settled = false
    const finish = () => {
      if (settled) return
      settled = true
      resolveKill()
    }
    killer.once('error', finish)
    killer.once('exit', finish)
  })
}

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
    if (shuttingDown) throw new Error('摸鱼大师正在退出，无法打开手机投屏模式')
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
        onMessage: type => {
          if (type === 'focus-main-app') focusMainApp()
        }
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
          const onError = error => {
            nextChild.off('spawn', onSpawn)
            rejectSpawn(error)
          }
          const onSpawn = () => {
            nextChild.off('error', onError)
            resolveSpawn()
          }
          nextChild.once('error', onError)
          nextChild.once('spawn', onSpawn)
        })
      } catch (error) {
        child = null
        await transport?.close()
        transport = null
        throw new Error(`手机投屏启动失败：${error.message}`)
      }

      return { status: 'started' }
    })().finally(() => {
      starting = null
    })

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
