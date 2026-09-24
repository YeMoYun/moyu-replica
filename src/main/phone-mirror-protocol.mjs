import { join } from 'node:path'
import { tmpdir } from 'node:os'

const MESSAGE_TYPES = new Set([
  'ready',
  'focus-main-app',
  'focus-qtscrcpy-main',
  'boss-hide',
  'boss-show',
  'shutdown'
])

export function createPhoneMirrorPipe({ pid, nonce, platform = process.platform }) {
  const name = `moyu-qtscrcpy-${pid}-${nonce}`
  return platform === 'win32' ? `\\\\.\\pipe\\${name}` : join(tmpdir(), `${name}.sock`)
}

export function encodePhoneMirrorMessage(token, type) {
  if (!token || !MESSAGE_TYPES.has(type)) throw new Error('无效的手机投屏通信消息')
  return `${JSON.stringify({ token, type })}\n`
}

export function parsePhoneMirrorLine(line, expectedToken) {
  try {
    const value = JSON.parse(line)
    if (!value || value.token !== expectedToken || !MESSAGE_TYPES.has(value.type)) return null
    return { token: value.token, type: value.type }
  } catch {
    return null
  }
}
