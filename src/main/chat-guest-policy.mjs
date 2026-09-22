import {chatContextFromWindowKey} from '../shared/chat-context.mjs'
import {validateChatUrl} from '../shared/chat-state.mjs'

export function chatPartitionForWindow(key) {
  return chatContextFromWindowKey(key).partition
}

export function validateChatGuestAttachment(key, params) {
  const context=chatContextFromWindowKey(key)
  const address=validateChatUrl(params?.src,context.platform)
  if(params?.partition!==context.partition)throw new Error('聊天网页会话分区无效')
  return {address,partition:context.partition}
}
