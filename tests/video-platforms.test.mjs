import test from 'node:test'
import assert from 'node:assert/strict'
import {
  VIDEO_PLATFORM_ORDER, VIDEO_MODE_ORDER, videoPlatform, resolveVideoMode
} from '../src/shared/video-platforms.mjs'

test('the approved five platforms and five modes have stable order', () => {
  assert.deepEqual(VIDEO_PLATFORM_ORDER, ['douyin','bilibili','huya','douyu','kuaishou'])
  assert.deepEqual(VIDEO_MODE_ORDER, ['ad','opacity','wechat','dingtalk','feishu'])
  assert.equal(new Set(VIDEO_PLATFORM_ORDER).size, 5)
})

test('each platform resolves ad, existing opacity and three chat targets', () => {
  for (const key of VIDEO_PLATFORM_ORDER) {
    const definition = videoPlatform(key)
    assert.ok(definition.label && definition.home.startsWith('https://'))
    assert.deepEqual(resolveVideoMode(key,'ad'), {kind:'ad',key})
    assert.deepEqual(resolveVideoMode(key,'opacity'), {kind:'opacity',key:definition.opacityKey})
    for (const skin of ['wechat','dingtalk','feishu']) {
      assert.deepEqual(resolveVideoMode(key,skin), {kind:'chat',platform:key,skin})
    }
  }
  assert.throws(() => videoPlatform('unknown'), /视频平台/)
  assert.throws(() => resolveVideoMode('douyin','excel'), /视频模式/)
})
