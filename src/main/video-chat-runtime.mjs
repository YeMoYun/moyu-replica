import { chatContext, chatContextFromWindowKey } from '../shared/chat-context.mjs'
import { validateChatUrl } from '../shared/chat-state.mjs'

export const CHAT_WINDOW_OPTIONS = Object.freeze({
  wechat: Object.freeze({ width: 980, height: 760 }),
  dingtalk: Object.freeze({ width: 980, height: 760 }),
  feishu: Object.freeze({ width: 1200, height: 800 })
})

export function tryChatContext(key) {
  try { return chatContextFromWindowKey(key) }
  catch { return null }
}

export function createVideoChatNotifier(windows) {
  const legacyChannels = Object.freeze({
    wechat: 'chat-mode:updated',
    dingtalk: 'dingtalk-mode:updated',
    feishu: 'feishu-mode:updated'
  })
  return (context, state) => {
    const window = windows.get(context.windowKey)
    if (!window || window.isDestroyed() || window.webContents.isDestroyed()) return
    window.webContents.send('video-chat:updated', state)
    if (context.platform === 'douyin') window.webContents.send(legacyChannels[context.skin], state)
  }
}

export function createVideoChatRuntime({ chatServices, chatWindowControls, openRoute }) {
  async function openVideoChat(platform, skin, address) {
    const context = chatContext(platform, skin)
    const service = chatServices.service(context)

    if (address !== undefined) {
      const url = validateChatUrl(address, context.platform)
      const state = service.get()
      state.settings.address = url
      const selected = state.conversations.find(conversation => conversation.id === state.selectedId)
      const player = selected?.messages.find(message => message.type === 'player')
      if (player) player.address = url
      await service.save(state, state.revision)
    }

    const size = CHAT_WINDOW_OPTIONS[context.skin]
    return openRoute(context.windowKey, context.route, {
      ...size,
      frame: false,
      skipTaskbar: true,
      webPreferences: { webSecurity: false }
    })
  }

  function createIpcHandlers(keyFromSender) {
    const senderChat = event => chatContextFromWindowKey(keyFromSender(event))
    return {
      getContext: event => senderChat(event),
      get: event => {
        const context = senderChat(event)
        return chatServices.service(context).get()
      },
      save: (event, state, revision) => {
        const context = senderChat(event)
        return chatServices.service(context).save(state, revision)
      },
      state: event => {
        const context = senderChat(event)
        return {
          ...chatWindowControls.state(context.windowKey),
          warning: chatServices.service(context).getWarning(),
          context
        }
      },
      close: event => {
        const context = senderChat(event)
        return chatWindowControls.close(context.windowKey)
      }
    }
  }

  return { openVideoChat, createIpcHandlers }
}
