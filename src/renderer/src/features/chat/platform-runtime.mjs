import {chatContext} from '../../../../shared/chat-context.mjs'
import {videoPlatform} from '../../../../shared/video-platforms.mjs'

export async function loadChatPlatform(api,expectedSkin) {
  const received=await api.getContext()
  if(received===null||typeof received!=='object'||!Object.hasOwn(received,'platform')){
    throw new Error('不支持的视频平台')
  }
  if(!Object.hasOwn(received,'skin'))throw new Error('不支持的伪装界面')

  const context=chatContext(received.platform,received.skin)
  if(context.skin!==expectedSkin)throw new Error('伪装界面身份不匹配')
  const partition=Object.hasOwn(received,'partition')?received.partition:undefined
  if(partition!==context.partition)throw new Error('聊天网页会话分区无效')

  return Object.freeze({...context,definition:videoPlatform(context.platform)})
}
