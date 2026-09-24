import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createPhoneMirrorIpcHandlers } from '../src/main/phone-mirror-ipc.mjs'

test('phone mirroring can only be opened by the main window', async () => {
  const calls = []
  const handlers = createPhoneMirrorIpcHandlers({
    keyFromSender: event => event.key,
    launcher: {
      openOrFocus: async () => {
        calls.push('open')
        return { status: 'started' }
      }
    }
  })

  assert.deepEqual(await handlers.open({ key: 'main' }), { status: 'started' })
  await assert.rejects(handlers.open({ key: 'douyinOpacity' }), /仅主窗口/)
  assert.deepEqual(calls, ['open'])
})

test('main process wires the entry, boss state, and graceful quit to one launcher', () => {
  const source = readFileSync(new URL('../src/main/index.js', import.meta.url), 'utf8')
  assert.match(source, /createPhoneMirrorLauncher/)
  assert.match(source, /createPhoneMirrorIpcHandlers/)
  assert.match(source, /phone-mirror:open/)
  assert.match(source, /phoneMirrorLauncher\?\.setBossHidden\(hidden\)/)
  assert.match(source, /app\.on\('before-quit'/)
  assert.match(source, /phoneMirrorLauncher\.shutdown\(\)/)
})
