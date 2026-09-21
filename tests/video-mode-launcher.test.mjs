import test from 'node:test'
import assert from 'node:assert/strict'
import { createVideoModeLauncher } from '../src/main/video-mode-launcher.mjs'

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
