import test from 'node:test'
import assert from 'node:assert/strict'
import {VIDEO_PLATFORM_ORDER} from '../src/shared/video-platforms.mjs'
import {
  CHAT_SKINS,
  chatContext,
  chatContextFromWindowKey
} from '../src/shared/chat-context.mjs'
import {chatProfile} from '../src/shared/chat-profiles.mjs'

const allContexts = () => VIDEO_PLATFORM_ORDER.flatMap(platform =>
  CHAT_SKINS.map(skin => chatContext(platform, skin))
)

test('fifteen chat contexts have unique stable window storage partition route and id identities', () => {
  const contexts = allContexts()

  assert.equal(contexts.length, 15)
  for (const field of ['id', 'windowKey', 'stateKey', 'partition', 'route']) {
    assert.equal(new Set(contexts.map(context => context[field])).size, 15, `${field} must be unique`)
  }

  for (const context of contexts) {
    assert.deepEqual(chatContextFromWindowKey(context.windowKey), context)
  }
})

test('douyin contexts retain all approved legacy identities', () => {
  assert.deepEqual(chatContext('douyin', 'wechat'), {
    id: 'douyin:wechat',
    platform: 'douyin',
    skin: 'wechat',
    windowKey: 'wechat',
    stateKey: 'wechat',
    partition: 'persist:moyu-chat-wechat',
    route: '/wechat'
  })

  assert.equal(chatContext('douyin', 'dingtalk').windowKey, 'dingding')
  assert.equal(chatContext('douyin', 'dingtalk').stateKey, 'dingtalk')
  assert.equal(chatContext('douyin', 'dingtalk').partition, 'persist:moyu-chat-dingtalk')
  assert.equal(chatContext('douyin', 'dingtalk').route, '/dingding')
  assert.equal(chatContext('douyin', 'feishu').windowKey, 'feishu')
  assert.equal(chatContext('douyin', 'feishu').route, '/feishu')
})

test('new combinations use explicit composite identities', () => {
  const context = chatContext('bilibili', 'wechat')

  assert.equal(context.windowKey, 'chat-bilibili-wechat')
  assert.equal(context.stateKey, 'bilibili.wechat')
  assert.equal(context.partition, 'persist:moyu-chat-bilibili-wechat')
  assert.equal(context.route, '/wechat/bilibili')
})

test('public identity values are immutable', () => {
  assert.equal(Object.isFrozen(CHAT_SKINS), true)

  for (const context of allContexts()) {
    assert.equal(Object.isFrozen(context), true)
    assert.throws(() => {
      context.windowKey = 'tampered'
    }, TypeError)
  }
})

test('unknown prototype and malformed keys are rejected safely', () => {
  for (const platform of ['unknown', '__proto__', 'constructor', 'toString']) {
    assert.throws(() => chatContext(platform, 'wechat'), /视频平台/)
  }
  for (const skin of ['qq', '__proto__', 'constructor', 'toString']) {
    assert.throws(() => chatContext('douyin', skin), /伪装界面/)
  }
  for (const windowKey of ['chat-evil-wechat', '__proto__', '', null, {}, new String('wechat')]) {
    assert.throws(() => chatContextFromWindowKey(windowKey), /聊天窗口/)
  }
})

test('context and profile APIs require primitive explicit identity strings', () => {
  const trap={toString(){throw new Error('must not coerce')}}
  for(const args of [[],[undefined,'wechat'],['douyin',undefined],[null,'wechat'],['douyin',null],[new String('douyin'),'wechat'],['douyin',new String('wechat')],[trap,'wechat'],['douyin',trap]]){
    assert.throws(()=>chatContext(...args),/视频平台|伪装界面/)
  }
  for(const skin of [undefined,null,123,new String('wechat'),trap,'__proto__','constructor','prototype']){
    assert.throws(()=>chatProfile(skin),/聊天平台/)
  }
})
