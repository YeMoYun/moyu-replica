import test from 'node:test'
import assert from 'node:assert/strict'

async function runtimeModule() {
  return import('../src/main/video-chat-runtime.mjs')
}

test('openVideoChat validates and saves the selected platform player before opening its isolated route', async () => {
  const { createVideoChatRuntime } = await runtimeModule()
  const calls = []
  const window = { kind: 'BrowserWindow sentinel' }
  const state = {
    revision: 7,
    selectedId: 'active',
    settings: { address: 'https://www.douyin.com/' },
    conversations: [
      { id: 'active', messages: [{ id: 'player', type: 'player', address: 'https://www.douyin.com/' }] }
    ]
  }
  const service = {
    get: () => structuredClone(state),
    save: async (next, revision) => {
      calls.push(['save', next, revision])
      return next
    }
  }
  const runtime = createVideoChatRuntime({
    chatServices: { service: context => { calls.push(['service', context]); return service } },
    chatWindowControls: {},
    openRoute: (...args) => { calls.push(['openRoute', ...args]); return window }
  })

  const result = await runtime.openVideoChat('bilibili', 'wechat', 'https://www.bilibili.com/video/BV1xx')

  assert.equal(result, window)
  assert.equal(calls[0][0], 'service')
  assert.equal(calls[0][1].id, 'bilibili:wechat')
  assert.equal(calls[1][0], 'save')
  assert.equal(calls[1][2], 7)
  assert.equal(calls[1][1].settings.address, 'https://www.bilibili.com/video/BV1xx')
  assert.equal(calls[1][1].conversations[0].messages[0].address, 'https://www.bilibili.com/video/BV1xx')
  assert.deepEqual(calls[2], [
    'openRoute',
    'chat-bilibili-wechat',
    '/wechat/bilibili',
    { width: 980, height: 760, frame: false, skipTaskbar: true, webPreferences: { webSecurity: false } }
  ])
})

test('openVideoChat does not save or open when a URL belongs to another platform', async () => {
  const { createVideoChatRuntime } = await runtimeModule()
  let saved = false
  let opened = false
  const runtime = createVideoChatRuntime({
    chatServices: { service: () => ({
      get: () => ({ revision: 0, settings: {}, selectedId: 'x', conversations: [] }),
      save: () => { saved = true }
    }) },
    chatWindowControls: {},
    openRoute: () => { opened = true }
  })

  await assert.rejects(
    runtime.openVideoChat('huya', 'feishu', 'https://www.bilibili.com/video/BV1xx'),
    /虎牙/
  )
  assert.equal(saved, false)
  assert.equal(opened, false)
})

test('generic handlers derive platform and skin only from the sender window identity', async () => {
  const { createVideoChatRuntime } = await runtimeModule()
  const { createSenderWindowKeyResolver } = await import('../src/main/sender-window-key.mjs')
  const seen = []
  const service = {
    get: () => ({ marker: 'bilibili-wechat' }),
    save: (state, revision) => ({ ...state, revision: revision + 1 }),
    getWarning: () => 'warning'
  }
  const runtime = createVideoChatRuntime({
    chatServices: { service: context => { seen.push(context.id); return service } },
    chatWindowControls: {
      state: key => ({ key, covered: false }),
      close: key => `closed:${key}`
    },
    openRoute: () => { throw new Error('not used') }
  })
  const bilibiliWindow = { id: 'bilibili-window' }
  const windows = new Map([['chat-bilibili-wechat', bilibiliWindow]])
  const senderContents = { id: 'sender-contents' }
  const keyFromSender = createSenderWindowKeyResolver({
    windows,
    fromWebContents: sender => sender === senderContents ? bilibiliWindow : null
  })
  const handlers = runtime.createIpcHandlers(keyFromSender)
  const event = { sender: senderContents }

  assert.equal(handlers.getContext(event, 'huya', 'feishu').id, 'bilibili:wechat')
  assert.deepEqual(handlers.get(event, 'huya', 'feishu'), { marker: 'bilibili-wechat' })
  assert.deepEqual(handlers.save(event, { ok: true }, 4, 'huya'), { ok: true, revision: 5 })
  assert.deepEqual(handlers.state(event), {
    key: 'chat-bilibili-wechat', covered: false, warning: 'warning',
    context: {
      id: 'bilibili:wechat', platform: 'bilibili', skin: 'wechat',
      windowKey: 'chat-bilibili-wechat', stateKey: 'bilibili.wechat',
      partition: 'persist:moyu-chat-bilibili-wechat', route: '/wechat/bilibili'
    }
  })
  assert.equal(handlers.close(event), 'closed:chat-bilibili-wechat')
  assert.deepEqual(seen, ['bilibili:wechat', 'bilibili:wechat', 'bilibili:wechat'])
  assert.throws(() => handlers.get({ sender: { id: 'unknown-contents' } }), /未知窗口/)
})

test('registry notifications stay in the target window and legacy events are Douyin-only', async () => {
  const { createVideoChatNotifier } = await runtimeModule()
  const huyaSent = []
  const douyinSent = []
  const huyaWindow = {
    isDestroyed: () => false,
    webContents: { isDestroyed: () => false, send: (...args) => huyaSent.push(args) }
  }
  const douyinWindow = {
    isDestroyed: () => false,
    webContents: { isDestroyed: () => false, send: (...args) => douyinSent.push(args) }
  }
  const windows = new Map([
    ['wechat', douyinWindow],
    ['chat-huya-wechat', huyaWindow]
  ])
  const notify = createVideoChatNotifier(windows)

  notify({ platform: 'huya', skin: 'wechat', windowKey: 'chat-huya-wechat' }, { revision: 1 })
  assert.deepEqual(huyaSent, [['video-chat:updated', { revision: 1 }]])
  assert.deepEqual(douyinSent, [])

  huyaSent.length = 0
  notify({ platform: 'douyin', skin: 'wechat', windowKey: 'wechat' }, { revision: 2 })
  assert.deepEqual(douyinSent, [
    ['video-chat:updated', { revision: 2 }],
    ['chat-mode:updated', { revision: 2 }]
  ])
  assert.deepEqual(huyaSent, [])

  douyinSent.length = 0
  notify({ platform: 'douyin', skin: 'dingtalk', windowKey: 'missing' }, { revision: 3 })
  assert.deepEqual(huyaSent, [])
  assert.deepEqual(douyinSent, [])
})
