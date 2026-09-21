import test from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
const { createEventSubscriptions } = await import('../src/preload/events.mjs').catch((e) => {
  if (e.code === 'ERR_MODULE_NOT_FOUND') return {}
  throw e
})
test('subscriptions strip Electron event and unsubscribe idempotently', () => {
  assert.equal(typeof createEventSubscriptions,'function','subscription API must exist')
  const ipc=new EventEmitter(); const events=createEventSubscriptions(ipc); const seen=[]
  const callback=(...args)=>seen.push(args)
  const unsubscribe=events.on('sample',callback)
  ipc.emit('sample',{secret:'electron-event'},42)
  unsubscribe(); unsubscribe(); ipc.emit('sample',{},99)
  assert.deepEqual(seen,[[42]])
  assert.equal(ipc.listenerCount('sample'),0)
})
test('off removes only matching channel/callback subscriptions', () => {
  assert.equal(typeof createEventSubscriptions,'function')
  const ipc=new EventEmitter(); const events=createEventSubscriptions(ipc); const seen=[]
  const cb=(v)=>seen.push(v)
  events.on('a',cb); events.on('b',cb); events.off('a',cb)
  ipc.emit('a',{},1); ipc.emit('b',{},2)
  assert.deepEqual(seen,[2])
  events.removeAllListeners('b'); assert.equal(ipc.listenerCount('b'),0)
})
