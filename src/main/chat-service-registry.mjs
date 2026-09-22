import {createChatService} from './chat-service.mjs'
import {chatContext} from '../shared/chat-context.mjs'

export function createChatServiceRegistry({store,notify=()=>{}}){
  const services=new Map()

  function service(input){
    const context=chatContext(input.platform,input.skin)
    if(services.has(context.id))return services.get(context.id)

    const legacy=context.platform==='douyin'
    const options={
      store,
      key:context.stateKey,
      profile:context.skin,
      platform:context.platform,
      recoverInvalidSaved:!legacy||context.skin==='feishu',
      notify:state=>notify(context,state)
    }
    if(legacy&&context.skin==='wechat')Object.assign(options,{legacyKey:'wechatConfig',legacySiteKey:'wechat.currentSiteKey'})
    else if(legacy&&context.skin==='dingtalk')Object.assign(options,{legacyKey:'dingdingConfig',legacySiteKey:'dingding.currentSiteKey'})
    else Object.assign(options,{legacyKey:null,legacySiteKey:null})

    const created=createChatService(options)
    services.set(context.id,created)
    return created
  }

  return {service}
}
