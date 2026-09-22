import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8')

test('approved chat views use optional platform routes while legacy URLs still match', async () => {
  const routes = read('src/renderer/src/router/index.js')
  for (const [route, view] of [['wechat', 'WechatView'], ['dingding', 'DingTalkView'], ['feishu', 'FeishuView']]) {
    assert.match(routes, new RegExp(`path: '/${route}/:platform\\?'[^\\n]+${view}\\.vue`))
  }
})

test('main wires generic sender-scoped handlers, lazy registry, and all-platform launcher', () => {
  const main = read('src/main/index.js')
  assert.match(main, /createChatServiceRegistry/)
  assert.match(main, /createVideoChatRuntime/)
  for (const channel of ['video-chat:get-context', 'video-chat:get', 'video-chat:save', 'video-chat:state', 'video-chat:close']) {
    assert.match(main, new RegExp(`handle\\('${channel.replace(':', '\\:')}'`))
  }
  assert.match(main, /openChat:\s*\(platform,skin\)=>openVideoChat\(platform,skin\)/)
  assert.doesNotMatch(main, /CHAT_WINDOW_TO_PROFILE\s*=/)
  assert.doesNotMatch(main, /let\s+(chatService|dingtalkService|feishuService)\s*=/)
})

test('preload exposes the generic chat bridge and retains all legacy bridges', () => {
  const preload = read('src/preload/index.js')
  assert.match(preload, /exposeInMainWorld\('videoChatModeControl'/)
  for (const bridge of ['chatModeControl', 'dingtalkModeControl', 'feishuModeControl']) {
    assert.match(preload, new RegExp(`exposeInMainWorld\\('${bridge}'`))
  }
})
