import test from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter, once } from 'node:events'
import { connect } from 'node:net'
import { join } from 'node:path'
import {
  createPhoneMirrorLauncher,
  resolvePhoneMirrorExecutable,
  startPhoneMirrorTransport
} from '../src/main/phone-mirror-launcher.mjs'
import {
  createPhoneMirrorPipe,
  encodePhoneMirrorMessage
} from '../src/main/phone-mirror-protocol.mjs'

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

test('transport authenticates Qt before dispatching or flushing Electron commands', async () => {
  const pipePath = createPhoneMirrorPipe({
    pid: process.pid,
    nonce: `transport-${Date.now()}`,
    platform: process.platform
  })
  const messages = []
  let resolveFocus
  const focusReceived = new Promise(resolve => { resolveFocus = resolve })
  const transport = await startPhoneMirrorTransport({
    pipePath,
    token: 'secret',
    onMessage: type => {
      messages.push(type)
      resolveFocus()
    }
  })
  transport.send('boss-hide')

  const socket = connect(pipePath)
  await once(socket, 'connect')
  socket.setEncoding('utf8')
  socket.write(encodePhoneMirrorMessage('wrong', 'ready'))
  socket.write(encodePhoneMirrorMessage('secret', 'focus-main-app'))
  socket.write(encodePhoneMirrorMessage('secret', 'ready'))

  const [data] = await once(socket, 'data')
  assert.equal(data, encodePhoneMirrorMessage('secret', 'boss-hide'))

  socket.write(encodePhoneMirrorMessage('secret', 'focus-main-app'))
  await focusReceived
  assert.deepEqual(messages, ['focus-main-app'])

  socket.destroy()
  await transport.close()
})

test('second open focuses the owned child and Qt can focus the main app', async () => {
  const child = new EventEmitter()
  child.pid = 314
  child.exitCode = null
  const spawned = []
  const sent = []
  let receive
  let mainFocuses = 0
  const launcher = createPhoneMirrorLauncher({
    projectRoot: 'D:\\repo',
    env: {},
    exists: () => true,
    startTransport: async ({ onMessage }) => {
      receive = onMessage
      return { send: type => sent.push(type), close: async () => {} }
    },
    spawnProcess: (...args) => {
      spawned.push(args)
      queueMicrotask(() => child.emit('spawn'))
      return child
    },
    killTree: async () => {},
    randomHex: () => 'nonce',
    focusMainApp: () => { mainFocuses += 1 }
  })

  assert.deepEqual(await launcher.openOrFocus(), { status: 'started' })
  assert.deepEqual(await launcher.openOrFocus(), { status: 'focused' })
  receive('focus-main-app')

  assert.equal(spawned.length, 1)
  assert.equal(spawned[0][2].windowsHide, false)
  assert.deepEqual(sent, ['focus-qtscrcpy-main'])
  assert.equal(mainFocuses, 1)

  child.exitCode = 0
  child.emit('exit', 0)
  await launcher.shutdown()
})

test('spawn failure rejects with Chinese context and closes its transport', async () => {
  const child = new EventEmitter()
  child.exitCode = null
  let closed = 0
  const launcher = createPhoneMirrorLauncher({
    projectRoot: 'D:\\repo',
    env: {},
    exists: () => true,
    startTransport: async () => ({ send: () => {}, close: async () => { closed += 1 } }),
    spawnProcess: () => {
      queueMicrotask(() => child.emit('error', new Error('access denied')))
      return child
    },
    killTree: async () => {},
    randomHex: () => 'nonce',
    focusMainApp: () => {}
  })

  await assert.rejects(launcher.openOrFocus(), /手机投屏启动失败.*access denied/)
  assert.equal(closed, 1)
  assert.equal(launcher.isRunning(), false)
})

test('shutdown force-kills only the owned child after the grace period', async () => {
  const child = new EventEmitter()
  child.pid = 2718
  child.exitCode = null
  const sent = []
  const killed = []
  const launcher = createPhoneMirrorLauncher({
    projectRoot: 'D:\\repo',
    env: {},
    exists: () => true,
    startTransport: async () => ({ send: type => sent.push(type), close: async () => {} }),
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

  assert.deepEqual(sent, ['shutdown'])
  assert.deepEqual(killed, [2718])
})

test('shutdown during transport startup prevents a late child process', async () => {
  let resolveTransport
  let closed = 0
  let spawned = 0
  const pendingTransport = new Promise(resolve => { resolveTransport = resolve })
  const launcher = createPhoneMirrorLauncher({
    projectRoot: 'D:\\repo',
    env: {},
    exists: () => true,
    startTransport: () => pendingTransport,
    spawnProcess: () => {
      spawned += 1
      throw new Error('must not spawn')
    },
    killTree: async () => {},
    randomHex: () => 'nonce',
    focusMainApp: () => {}
  })

  const opening = launcher.openOrFocus()
  const stopping = launcher.shutdown()
  resolveTransport({ send: () => {}, close: async () => { closed += 1 } })

  await assert.rejects(opening, /正在退出/)
  await stopping
  assert.equal(spawned, 0)
  assert.equal(closed, 1)
})
