import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import * as launcherModule from '../src/main/video-mode-launcher.mjs'
import { AD_MODES } from '../src/shared/ad-modes.mjs'
import { VIDEO_PLATFORM_ORDER } from '../src/shared/video-platforms.mjs'

const { createVideoModeLauncher } = launcherModule

function createTestAdOpener(openSite) {
  assert.equal(
    typeof launcherModule.createRegisteredAdOpener,
    'function',
    'registered advertisement opener must be exported'
  )
  return launcherModule.createRegisteredAdOpener({ registry: AD_MODES, openSite })
}

test('launcher dispatches every registered video platform to its advertisement key', () => {
  const opened = []
  const launcher = createVideoModeLauncher({
    openAd: (key) => opened.push(key),
    openOpacity: () => {},
    openChat: () => {},
    readRecent: () => undefined,
    writeRecent: () => {}
  })

  for (const platform of VIDEO_PLATFORM_ORDER) launcher.open(platform, 'ad')

  assert.deepEqual(opened, VIDEO_PLATFORM_ORDER)
})

test('registered advertisement opener delegates every video platform and returns its result', () => {
  const calls = []
  const openAd = createTestAdOpener((key) => {
    calls.push(key)
    return { opened: key }
  })

  for (const key of VIDEO_PLATFORM_ORDER) assert.deepEqual(openAd(key), { opened: key })
  assert.deepEqual(calls, VIDEO_PLATFORM_ORDER)
})

test('registered advertisement opener rejects inherited and unknown keys', () => {
  const calls = []
  const openAd = createTestAdOpener((key) => calls.push(key))

  for (const key of ['unknown', '__proto__', 'constructor']) {
    assert.throws(() => openAd(key), /不支持的广告模式/)
  }
  assert.deepEqual(calls, [])
})

test('registered advertisement opener preserves downstream throws and rejections', async () => {
  const thrown = new Error('同步打开失败')
  const rejected = new Error('异步打开失败')

  assert.throws(
    () => createTestAdOpener(() => { throw thrown })('douyin'),
    error => error === thrown
  )
  await assert.rejects(
    createTestAdOpener(() => Promise.reject(rejected))('bilibili'),
    error => error === rejected
  )
})

test('main launcher uses the registered advertisement opener', () => {
  const source = readFileSync(new URL('../src/main/index.js', import.meta.url), 'utf8')

  assert.doesNotMatch(source, /广告模式尚未接入/)
  assert.match(source, /createRegisteredAdOpener/)
  assert.match(source, /registry:\s*AD_MODES/)
  assert.match(source, /openSite/)
})

test('launcher delegates resolved targets and records successful chat platform only', () => {
  const calls = []
  const recent = new Map()
  const launcher = createVideoModeLauncher({
    openAd: (key) => calls.push(['ad', key]),
    openOpacity: (key) => calls.push(['opacity', key]),
    openChat: (platform, skin) => calls.push(['chat', platform, skin]),
    readRecent: (skin) => recent.get(skin),
    writeRecent: (skin, platform) => recent.set(skin, platform)
  })

  launcher.open('douyin', 'ad')
  launcher.open('huya', 'opacity')
  launcher.open('bilibili', 'wechat')

  assert.deepEqual(calls, [
    ['ad', 'douyin'],
    ['opacity', 'huyaOpacity'],
    ['chat', 'bilibili', 'wechat']
  ])
  assert.equal(recent.get('wechat'), 'bilibili')

  launcher.openRecentChat('wechat')
  assert.deepEqual(calls.at(-1), ['chat', 'bilibili', 'wechat'])
})

test('recent chat defaults to douyin and failed opens do not overwrite recent state', () => {
  const writes = []
  const launcher = createVideoModeLauncher({
    openAd: () => {},
    openOpacity: () => {},
    openChat: (platform) => {
      if (platform === 'huya') throw Error('尚未接入')
    },
    readRecent: () => undefined,
    writeRecent: (...args) => writes.push(args)
  })

  launcher.openRecentChat('feishu')
  assert.deepEqual(writes, [['feishu', 'douyin']])
  assert.throws(() => launcher.open('huya', 'feishu'), /尚未接入/)
  assert.deepEqual(writes, [['feishu', 'douyin']])
})

test('async chat writes recent only after open resolves and preserves the open result', async () => {
  const calls = []
  let resolveOpen
  const opened = new Promise((resolve) => {
    resolveOpen = resolve
  })
  const launcher = createVideoModeLauncher({
    openAd: () => {},
    openOpacity: () => {},
    openChat: () => {
      calls.push('open')
      return opened
    },
    readRecent: () => undefined,
    writeRecent: () => calls.push('write')
  })

  const pending = launcher.open('bilibili', 'wechat')
  assert.deepEqual(calls, ['open'])

  resolveOpen('opened')
  assert.equal(await pending, 'opened')
  assert.deepEqual(calls, ['open', 'write'])
})

test('async chat rejection leaves recent state unchanged', async () => {
  const writes = []
  const launcher = createVideoModeLauncher({
    openAd: () => {},
    openOpacity: () => {},
    openChat: async () => {
      throw Error('打开失败')
    },
    readRecent: () => undefined,
    writeRecent: (...args) => writes.push(args)
  })

  await assert.rejects(launcher.openRecentChat('dingtalk'), /打开失败/)
  assert.deepEqual(writes, [])
})

test('async recent write rejection is returned to the caller', async () => {
  let rejectWrite
  const failedWrite = new Promise((resolve, reject) => {
    rejectWrite = reject
  })
  failedWrite.catch(() => {})
  const launcher = createVideoModeLauncher({
    openAd: () => {},
    openOpacity: () => {},
    openChat: async () => 'opened',
    readRecent: () => undefined,
    writeRecent: () => failedWrite
  })

  const pending = launcher.open('kuaishou', 'feishu')
  rejectWrite(Error('保存失败'))

  await assert.rejects(pending, /保存失败/)
})

test('synchronous chat dependencies preserve a synchronous return value', () => {
  const opened = { window: 'sync' }
  const launcher = createVideoModeLauncher({
    openAd: () => {},
    openOpacity: () => {},
    openChat: () => opened,
    readRecent: () => undefined,
    writeRecent: () => undefined
  })

  assert.equal(launcher.open('douyin', 'wechat'), opened)
})

test('recent chat rejects unsupported skins before opening a chat window', () => {
  const calls = []
  const launcher = createVideoModeLauncher({
    openAd: () => {},
    openOpacity: () => {},
    openChat: (...args) => calls.push(args),
    readRecent: () => 'bilibili',
    writeRecent: () => {}
  })

  assert.throws(() => launcher.openRecentChat('slack'), /不支持的视频模式/)
  assert.deepEqual(calls, [])
})
