import test from 'node:test'
import assert from 'node:assert/strict'
import {
  createPhoneMirrorPipe,
  encodePhoneMirrorMessage,
  parsePhoneMirrorLine
} from '../src/main/phone-mirror-protocol.mjs'

test('pipe name is session-specific and uses the Windows local-pipe namespace', () => {
  assert.equal(
    createPhoneMirrorPipe({ pid: 42, nonce: 'abc', platform: 'win32' }),
    '\\\\.\\pipe\\moyu-qtscrcpy-42-abc'
  )
})

test('protocol accepts only known types with the matching token', () => {
  const token = 'secret'
  assert.deepEqual(parsePhoneMirrorLine('{"token":"secret","type":"ready"}', token), {
    token,
    type: 'ready'
  })
  assert.equal(parsePhoneMirrorLine('{"token":"wrong","type":"ready"}', token), null)
  assert.equal(parsePhoneMirrorLine('{"token":"secret","type":"unknown"}', token), null)
  assert.equal(parsePhoneMirrorLine('not-json', token), null)
})

test('encoder produces one compact newline-delimited JSON message', () => {
  assert.equal(
    encodePhoneMirrorMessage('secret', 'boss-hide'),
    '{"token":"secret","type":"boss-hide"}\n'
  )
})
