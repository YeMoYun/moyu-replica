import {videoPlatform} from './video-platforms.mjs'

export const CHAT_SKINS = Object.freeze(['wechat', 'dingtalk', 'feishu'])

const LEGACY_WINDOWS = Object.freeze({
  wechat: 'wechat',
  dingtalk: 'dingding',
  feishu: 'feishu'
})

const LEGACY_STATES = Object.freeze({
  wechat: 'wechat',
  dingtalk: 'dingtalk',
  feishu: 'feishu'
})

const LEGACY_PARTITIONS = Object.freeze({
  wechat: 'persist:moyu-chat-wechat',
  dingtalk: 'persist:moyu-chat-dingtalk',
  feishu: 'persist:moyu-chat-feishu'
})

const ROUTES = Object.freeze({
  wechat: 'wechat',
  dingtalk: 'dingding',
  feishu: 'feishu'
})

function skinKey(value) {
  if (!CHAT_SKINS.includes(value)) throw new Error('不支持的伪装界面')
  return value
}

export function chatContext(platform = 'douyin', skin = 'wechat') {
  const site = videoPlatform(platform).key
  const type = skinKey(skin)
  const legacy = site === 'douyin'

  return Object.freeze({
    id: `${site}:${type}`,
    platform: site,
    skin: type,
    windowKey: legacy ? LEGACY_WINDOWS[type] : `chat-${site}-${type}`,
    stateKey: legacy ? LEGACY_STATES[type] : `${site}.${type}`,
    partition: legacy ? LEGACY_PARTITIONS[type] : `persist:moyu-chat-${site}-${type}`,
    route: legacy ? `/${ROUTES[type]}` : `/${ROUTES[type]}/${site}`
  })
}

export function chatContextFromWindowKey(windowKey) {
  if (typeof windowKey !== 'string') throw new Error('未知聊天窗口')

  for (const skin of CHAT_SKINS) {
    const context = chatContext('douyin', skin)
    if (context.windowKey === windowKey) return context
  }

  const match = /^chat-([a-z]+)-(wechat|dingtalk|feishu)$/.exec(windowKey)
  if (!match) throw new Error('未知聊天窗口')

  let context
  try {
    context = chatContext(match[1], match[2])
  } catch {
    throw new Error('未知聊天窗口')
  }
  if (context.windowKey !== windowKey) throw new Error('未知聊天窗口')
  return context
}
