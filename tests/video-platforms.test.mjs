import test from 'node:test'
import assert from 'node:assert/strict'
import {
  VIDEO_PLATFORM_ORDER, VIDEO_MODE_ORDER, VIDEO_PLATFORMS, videoPlatform, resolveVideoMode,
  validateVideoPlatformUrl
} from '../src/shared/video-platforms.mjs'

test('the approved five platforms and five modes have stable order', () => {
  assert.deepEqual(VIDEO_PLATFORM_ORDER, ['douyin','bilibili','huya','douyu','kuaishou'])
  assert.deepEqual(VIDEO_MODE_ORDER, ['ad','opacity','wechat','dingtalk','feishu'])
  assert.equal(new Set(VIDEO_PLATFORM_ORDER).size, 5)
})

test('the catalog is deeply immutable and matches the declared platform order', () => {
  assert.equal(Object.isFrozen(VIDEO_PLATFORM_ORDER), true)
  assert.equal(Object.isFrozen(VIDEO_MODE_ORDER), true)
  assert.equal(Object.isFrozen(VIDEO_PLATFORMS), true)
  assert.deepEqual(Object.keys(VIDEO_PLATFORMS), VIDEO_PLATFORM_ORDER)

  for (const [key, definition] of Object.entries(VIDEO_PLATFORMS)) {
    assert.equal(definition.key, key)
    assert.equal(Object.isFrozen(definition), true)
    assert.equal(Object.isFrozen(definition.hosts), true)
  }
})

test('inherited object keys are rejected as unsupported platforms', () => {
  for (const key of ['__proto__', 'constructor', 'toString']) {
    assert.throws(() => videoPlatform(key), /不支持的视频平台/)
  }
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

test('platform URL validation accepts only its own official HTTP(S) hosts', () => {
  assert.equal(validateVideoPlatformUrl('bilibili','https://www.bilibili.com/video/BV1'),'https://www.bilibili.com/video/BV1')
  assert.equal(validateVideoPlatformUrl('huya','http://www.huya.com/123'),'http://www.huya.com/123')
  assert.equal(validateVideoPlatformUrl('douyu','https://v.douyu.com/show/abc'),'https://v.douyu.com/show/abc')
  assert.equal(validateVideoPlatformUrl('kuaishou','https://www.kuaishou.com/short-video/abc'),'https://www.kuaishou.com/short-video/abc')

  for (const value of [
    'javascript:alert(1)',
    'ftp://www.huya.com/123',
    'https://user:pass@www.huya.com/',
    'https://huya.com.evil.test/',
    'https://www.douyu.com/1',
    'https://huy\u0430.com/'
  ]) assert.throws(() => validateVideoPlatformUrl('huya',value))
})

test('platform URL validation rejects implicit coercion and invalid platform keys', () => {
  const trap={toString(){throw new Error('must not coerce')}}
  for (const value of [undefined,null,123,new String('https://www.huya.com/'),new URL('https://www.huya.com/'),trap]) {
    assert.throws(() => validateVideoPlatformUrl('huya',value), /地址|文字/)
  }
  for (const platform of [undefined,null,123,new String('huya'),trap,'__proto__','constructor','prototype']) {
    assert.throws(() => validateVideoPlatformUrl(platform,'https://www.huya.com/'), /视频平台/)
  }
})
