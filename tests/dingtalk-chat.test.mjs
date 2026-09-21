import test from 'node:test'
import assert from 'node:assert/strict'
import {createChatState,validateChatState,migrateLegacy,sendText} from '../src/shared/chat-state.mjs'

test('dingtalk profile starts with approved five conversations and no automatic player',()=>{
  const s=createChatState('dingtalk')
  assert.deepEqual(s.conversations.map(c=>c.name),['研发项目组','林晓','设计讨论组','陈晨','文件传输助手'])
  assert.equal(s.selectedId,'group');assert.equal(s.conversations.flatMap(c=>c.messages).some(m=>m.type==='player'),false)
  assert.deepEqual(validateChatState(s,'dingtalk'),s)
})
test('dingtalk seed structure is unchanged on every additional video platform',()=>{
  const expected=createChatState('dingtalk').conversations.map(c=>c.name)
  for(const platform of ['bilibili','huya','douyu','kuaishou']){
    const state=createChatState('dingtalk',platform)
    assert.deepEqual(state.conversations.map(c=>c.name),expected)
    assert.equal(state.settings.site,platform)
    assert.deepEqual(validateChatState(state,'dingtalk',platform),state)
  }
})
test('wechat and dingtalk avatar vocabularies cannot cross',()=>{
  const ding=createChatState('dingtalk'),wx=createChatState();ding.conversations[0].avatar='manager';wx.conversations[0].avatar='blue'
  assert.throws(()=>validateChatState(ding,'dingtalk'),/头像/);assert.throws(()=>validateChatState(wx),/头像/)
})
test('legacy dingtalk messages preserve delimiters and warn about non-douyin sites',()=>{
  const old={contacts:['林晓'],messages:['林晓|第一段|保留分隔符'],siteKey:'jinJiang'},result=migrateLegacy(old,'dingtalk')
  assert.match(result.warning,/抖音/);assert.equal(result.state.conversations[0].messages[0].text,'第一段|保留分隔符');assert.equal(result.state.conversations[0].avatar,'blue')
})
test('dingtalk service uses an independent namespace and keeps legacy backup',async()=>{
  const {createChatService}=await import('../src/main/chat-service.mjs');const values=new Map([
    ['dingdingConfig',{contacts:['林晓'],messages:['林晓|迁移消息']}],['dingding.currentSiteKey','huya']])
  const clone=v=>v===undefined?undefined:structuredClone(v),store={get:k=>clone(values.get(k)),set:(k,v)=>values.set(k,clone(v)),setMany:o=>Object.entries(o).forEach(([k,v])=>values.set(k,clone(v)))}
  const service=createChatService({store,key:'dingtalk',profile:'dingtalk',legacyKey:'dingdingConfig',legacySiteKey:'dingding.currentSiteKey'}),state=service.get()
  assert.equal(state.conversations[0].name,'林晓');assert.equal(values.get('chatModes.dingtalk').revision,0)
  assert.deepEqual(values.get('chatMigration.dingtalk').legacy,{contacts:['林晓'],messages:['林晓|迁移消息']});assert.equal(values.get('chatMigration.dingtalk').legacySiteKey,'huya');assert.equal(values.has('chatModes.wechat'),false)
  sendText(state,'独立保存');assert.equal(service.save(state,0).revision,1)
})
test('a legacy dingtalk site preference alone is backed up and warned about',async()=>{
  const {createChatService}=await import('../src/main/chat-service.mjs');const values=new Map([['dingding.currentSiteKey','jinJiang']]),clone=v=>v===undefined?undefined:structuredClone(v)
  const store={get:k=>clone(values.get(k)),set:(k,v)=>values.set(k,clone(v)),setMany:o=>Object.entries(o).forEach(([k,v])=>values.set(k,clone(v)))}
  const service=createChatService({store,key:'dingtalk',profile:'dingtalk',legacyKey:'dingdingConfig',legacySiteKey:'dingding.currentSiteKey'});service.get()
  assert.equal(values.get('chatMigration.dingtalk').legacySiteKey,'jinJiang');assert.match(service.getWarning(),/抖音/)
})
test('malformed legacy dingtalk config falls back safely and preserves the original backup',async()=>{
  const {createChatService}=await import('../src/main/chat-service.mjs');const legacy={contacts:'not-an-array',messages:[]},values=new Map([['dingdingConfig',legacy]]),clone=v=>v===undefined?undefined:structuredClone(v)
  const store={get:k=>clone(values.get(k)),set:(k,v)=>values.set(k,clone(v)),setMany:o=>Object.entries(o).forEach(([k,v])=>values.set(k,clone(v)))}
  const service=createChatService({store,key:'dingtalk',profile:'dingtalk',legacyKey:'dingdingConfig',legacySiteKey:'dingding.currentSiteKey'}),state=service.get()
  assert.deepEqual(state.conversations.map(c=>c.name),['研发项目组','林晓','设计讨论组','陈晨','文件传输助手'])
  assert.deepEqual(values.get('chatMigration.dingtalk').legacy,legacy)
  assert.match(values.get('chatMigration.dingtalk').warning,/无法迁移.*原配置已保留/)
  assert.match(service.getWarning(),/无法迁移/)
})
