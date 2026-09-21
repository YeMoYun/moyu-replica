import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createVideoModeIpcHandlers } from '../src/main/video-mode-ipc.mjs'

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('home preload exposes one bridge and main delegates both channels to restricted handlers', () => {
  const main = read('src/main/index.js')
  const preload = read('src/preload/index.js')

  assert.match(preload, /exposeInMainWorld\('videoModeControl'/)
  assert.match(preload, /ipcRenderer\.invoke\('video-mode:open'/)
  assert.match(main, /import \{ createVideoModeIpcHandlers \} from '\.\/video-mode-ipc\.mjs'/)
  assert.match(main, /handle\('video-mode:open', videoModeIpc\.open\)/)
  assert.match(main, /handle\('video-mode:open-recent-chat', videoModeIpc\.openRecentChat\)/)
})

test('main-window open resolves true only after launcher completion', async () => {
  let finishOpen
  const calls = []
  const openFinished = new Promise(resolve => { finishOpen = resolve })
  const handlers = createVideoModeIpcHandlers({
    keyFromSender: () => 'main',
    launcher: {
      open: (...args) => {
        calls.push(args)
        return openFinished
      },
      openRecentChat: () => { throw new Error('unexpected recent open') }
    }
  })

  let settled = false
  const result = handlers.open({ sender: 'main' }, 'douyin', 'wechat')
  result.then(() => { settled = true }, () => {})
  await Promise.resolve()

  assert.equal(settled, false)
  assert.deepEqual(calls, [['douyin', 'wechat']])
  finishOpen({ nonCloneable: 'BrowserWindow' })
  assert.equal(await result, true)
})

test('non-main senders are rejected before either launcher action runs', async () => {
  let calls = 0
  const handlers = createVideoModeIpcHandlers({
    keyFromSender: () => 'wechat',
    launcher: {
      open: () => { calls += 1 },
      openRecentChat: () => { calls += 1 }
    }
  })

  await assert.rejects(handlers.open({}, 'douyin', 'ad'), /仅主窗口可打开视频模式/)
  await assert.rejects(handlers.openRecentChat({}, 'wechat'), /仅主窗口可打开伪装模式/)
  assert.equal(calls, 0)
})

test('synchronous launcher and recent-storage failures propagate', async () => {
  const openError = new Error('launcher failed')
  const storageError = new Error('storage failed')
  const handlers = createVideoModeIpcHandlers({
    keyFromSender: () => 'main',
    launcher: {
      open: () => { throw openError },
      openRecentChat: () => { throw storageError }
    }
  })

  await assert.rejects(handlers.open({}, 'douyin', 'ad'), error => error === openError)
  await assert.rejects(handlers.openRecentChat({}, 'wechat'), error => error === storageError)
})

test('asynchronous launcher rejection propagates instead of succeeding early', async () => {
  let rejectOpen
  const openFinished = new Promise((_resolve, reject) => { rejectOpen = reject })
  const handlers = createVideoModeIpcHandlers({
    keyFromSender: () => 'main',
    launcher: {
      open: () => openFinished,
      openRecentChat: () => { throw new Error('unexpected recent open') }
    }
  })

  let fulfilled = false
  const result = handlers.open({}, 'douyin', 'dingtalk')
  result.then(() => { fulfilled = true }, () => {})
  await Promise.resolve()

  assert.equal(fulfilled, false)
  const rejection = new Error('async launcher failed')
  rejectOpen(rejection)
  await assert.rejects(result, error => error === rejection)
})
