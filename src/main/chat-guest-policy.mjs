import { validateChatUrl } from '../shared/chat-state.mjs'

const partitions = Object.freeze({
  wechat: 'persist:moyu-chat-wechat',
  dingding: 'persist:moyu-chat-dingtalk',
  feishu: 'persist:moyu-chat-feishu'
})

export function chatPartitionForWindow(key) {
  const partition = partitions[key]
  if (!partition) throw new Error('未知聊天窗口')
  return partition
}

export function validateChatGuestAttachment(key, params) {
  const address = validateChatUrl(params?.src)
  const expected = chatPartitionForWindow(key)
  if (params?.partition !== expected) throw new Error('聊天网页会话分区无效')
  return { address, partition: expected }
}
