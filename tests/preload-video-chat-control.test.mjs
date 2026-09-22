import test from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'

test('generic chat bridge maps sender-bound commands to exact IPC channels', async () => {
  const { createVideoChatModeControl } = await import('../src/preload/video-chat-mode-control.mjs')
  const calls = []
  const invoke = async (...args) => {
    calls.push(args)
    return args[0]
  }
  const control = createVideoChatModeControl({ invoke, on: () => () => {} })
  const state = { revision: 3 }

  assert.equal(await control.getContext(), 'video-chat:get-context')
  assert.equal(await control.get(), 'video-chat:get')
  assert.equal(await control.save(state, 3), 'video-chat:save')
  assert.equal(await control.getRuntime(), 'video-chat:state')
  assert.equal(await control.close(), 'video-chat:close')
  assert.deepEqual(calls, [
    ['video-chat:get-context'],
    ['video-chat:get'],
    ['video-chat:save', state, 3],
    ['video-chat:state'],
    ['video-chat:close']
  ])
})

test('generic chat bridge subscriptions strip Electron events and unsubscribe idempotently', async () => {
  const { createEventSubscriptions } = await import('../src/preload/events.mjs')
  const { createVideoChatModeControl } = await import('../src/preload/video-chat-mode-control.mjs')
  const ipc = new EventEmitter()
  const subscriptions = createEventSubscriptions(ipc)
  const control = createVideoChatModeControl({
    invoke: () => Promise.resolve(),
    on: channel => callback => subscriptions.on(channel, callback)
  })
  const seen = []
  const stopState = control.onState((...args) => seen.push(['state', ...args]))
  const stopBoss = control.onBoss((...args) => seen.push(['boss', ...args]))
  const stopError = control.onError((...args) => seen.push(['error', ...args]))

  ipc.emit('video-chat:updated', { sender: true }, { revision: 1 })
  ipc.emit('chat-mode:boss', { sender: true }, true)
  ipc.emit('chat-mode:error', { sender: true }, 'failed')
  stopState()
  stopState()
  stopBoss()
  stopBoss()
  stopError()
  stopError()

  assert.deepEqual(seen, [
    ['state', { revision: 1 }],
    ['boss', true],
    ['error', 'failed']
  ])
  assert.equal(ipc.listenerCount('video-chat:updated'), 0)
  assert.equal(ipc.listenerCount('chat-mode:boss'), 0)
  assert.equal(ipc.listenerCount('chat-mode:error'), 0)
})
