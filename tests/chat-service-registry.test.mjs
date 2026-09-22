import test from 'node:test'
import assert from 'node:assert/strict'
import {createChatService} from '../src/main/chat-service.mjs'
import {createChatServiceRegistry} from '../src/main/chat-service-registry.mjs'
import {CHAT_SKINS,chatContext} from '../src/shared/chat-context.mjs'
import {createChatState,sendText} from '../src/shared/chat-state.mjs'
import {VIDEO_PLATFORM_ORDER} from '../src/shared/video-platforms.mjs'

function memoryStore(seed=[]){
  const values=new Map(seed.map(([key,value])=>[key,structuredClone(value)]))
  const clone=value=>value===undefined?undefined:structuredClone(value)
  return {
    values,
    get:key=>clone(values.get(key)),
    set:(key,value)=>values.set(key,clone(value)),
    setMany:input=>{
      const entries=Object.entries(input).map(([key,value])=>[key,clone(value)])
      for(const [key,value] of entries)values.set(key,value)
    }
  }
}

test('one chat service applies its explicit platform to defaults migration validation and save',()=>{
  const store=memoryStore([['legacy',{contacts:['旧联系人'],messages:['旧联系人|旧消息']}],['legacy.site','douyin']])
  const service=createChatService({store,key:'huya.wechat',profile:'wechat',platform:'huya',legacyKey:'legacy',legacySiteKey:'legacy.site'})
  const state=service.get()

  assert.equal(state.settings.site,'huya')
  assert.equal(state.conversations[0].name,'旧联系人')
  assert.match(service.getWarning(),/虎牙/)
  const wrong=createChatState('wechat','douyin')
  assert.throws(()=>service.save(wrong,state.revision),/站点|平台|播放器/)
  sendText(state,'虎牙状态')
  assert.equal(service.save(state,state.revision).settings.site,'huya')
})

test('registry is lazy caches by trusted context identity and reports a stable context',()=>{
  const store=memoryStore(),events=[]
  const registry=createChatServiceRegistry({store,notify:(context,state)=>events.push({context,state})})
  const input={...chatContext('bilibili','wechat'),id:'forged',stateKey:'forged'}
  const first=registry.service(input)

  assert.equal(store.values.size,0)
  assert.equal(first,registry.service(chatContext('bilibili','wechat')))
  input.platform='huya';input.skin='feishu'
  const state=first.get();sendText(state,'B站微信');first.save(state,state.revision)
  assert.deepEqual(events.map(event=>event.context),[chatContext('bilibili','wechat')])
  assert.equal(Object.isFrozen(events[0].context),true)
  assert.equal(events[0].state.settings.site,'bilibili')
  assert.equal(store.values.has('chatModes.forged'),false)
})

test('all fifteen services keep state and notifications in their own namespace',()=>{
  const store=memoryStore(),events=[]
  const registry=createChatServiceRegistry({store,notify:(context,state)=>events.push([context.id,state.settings.site,state.revision])})
  const contexts=VIDEO_PLATFORM_ORDER.flatMap(platform=>CHAT_SKINS.map(skin=>chatContext(platform,skin)))

  for(const context of contexts){
    const state=registry.service(context).get()
    sendText(state,context.id)
    registry.service(context).save(state,state.revision)
  }

  assert.deepEqual(events,contexts.map(context=>[context.id,context.platform,1]))
  for(const context of contexts){
    const saved=store.values.get(`chatModes.${context.stateKey}`)
    assert.equal(saved.settings.site,context.platform)
    assert.equal(saved.revision,1)
    assert.equal(saved.conversations.find(chat=>chat.id===saved.selectedId).messages.at(-1).text,context.id)
  }
})

test('only douyin wechat and dingtalk consume their matching legacy keys',()=>{
  const store=memoryStore([
    ['wechatConfig',{contacts:['旧微信'],messages:['旧微信|微信旧消息']}],
    ['dingdingConfig',{contacts:['旧钉钉'],messages:['旧钉钉|钉钉旧消息']}]
  ])
  const registry=createChatServiceRegistry({store})

  assert.equal(registry.service(chatContext('douyin','wechat')).get().conversations[0].name,'旧微信')
  assert.equal(registry.service(chatContext('douyin','dingtalk')).get().conversations[0].name,'旧钉钉')
  const feishuNames=registry.service(chatContext('douyin','feishu')).get().conversations.map(chat=>chat.name)
  assert.equal(feishuNames.includes('旧微信'),false)
  assert.equal(feishuNames.includes('旧钉钉'),false)
  for(const platform of VIDEO_PLATFORM_ORDER.filter(platform=>platform!=='douyin')){
    for(const skin of CHAT_SKINS){
      const names=registry.service(chatContext(platform,skin)).get().conversations.map(chat=>chat.name)
      assert.equal(names.includes('旧微信')||names.includes('旧钉钉'),false,`${platform}:${skin}`)
    }
  }
})
