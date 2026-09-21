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
