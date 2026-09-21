import test from 'node:test'
import assert from 'node:assert/strict'
import {createChatState,validateChatState,insertPlayer} from '../src/shared/chat-state.mjs'

test('feishu starts with approved ten conversations and a local card but no web player',()=>{
  const state=createChatState('feishu')
  assert.deepEqual(state.conversations.map(c=>c.name),[
    '质检组','林晓','设计讨论组','陈晨','云文档助手',
    '打卡提醒群','小叶的飞书助手','标注临时任务群','考勤通知','协作机器人'
  ])
  assert.equal(state.selectedId,'group')
  assert.equal(state.conversations[0].memberCount,16)
  assert.equal(state.conversations.flatMap(c=>c.messages).filter(m=>m.type==='media-card').length,1)
  assert.equal(state.conversations.flatMap(c=>c.messages).some(m=>m.type==='player'),false)
  assert.deepEqual(state.ui,{hiddenAnnouncements:[]})
  assert.deepEqual(validateChatState(state,'feishu'),state)
})

test('feishu media cards are local, bounded and forbidden in other profiles',()=>{
  const state=createChatState('feishu'),card=state.conversations[0].messages.find(m=>m.type==='media-card')
  assert.deepEqual(Object.keys(card).sort(),['description','id','sender','time','title','type'])
  const wx=createChatState();wx.conversations[0].messages.push(card)
  assert.throws(()=>validateChatState(wx),/消息类型/)
  card.title='x'.repeat(81)
  assert.throws(()=>validateChatState(state,'feishu'),/媒体卡片标题/)
})

test('feishu announcements reference existing conversations and player stays unique',()=>{
  const state=createChatState('feishu');state.ui.hiddenAnnouncements=['group']
  assert.deepEqual(validateChatState(state,'feishu').ui.hiddenAnnouncements,['group'])
  state.ui.hiddenAnnouncements=['missing']
  assert.throws(()=>validateChatState(state,'feishu'),/公告/)
  state.ui.hiddenAnnouncements=[];const first=insertPlayer(state),second=insertPlayer(state);assert.equal(second.id,first.id)
})

test('wechat and dingtalk default structures remain unchanged',()=>{
  assert.equal(createChatState().conversations.length,7)
  assert.equal(createChatState('dingtalk').conversations.length,5)
  assert.equal(Object.hasOwn(createChatState(),'ui'),false)
  assert.equal(Object.hasOwn(createChatState('dingtalk'),'ui'),false)
})

test('invalid saved feishu state is backed up and atomically replaced by defaults',async()=>{
  const {createChatService}=await import('../src/main/chat-service.mjs')
  const invalid={version:1,revision:3,conversations:'broken'},values=new Map([['chatModes.feishu',invalid]])
  const clone=v=>v===undefined?undefined:structuredClone(v)
  const store={get:key=>clone(values.get(key)),set:(key,value)=>values.set(key,clone(value)),setMany:entries=>Object.entries(entries).forEach(([key,value])=>values.set(key,clone(value)))}
  const service=createChatService({store,key:'feishu',profile:'feishu',legacyKey:null,recoverInvalidSaved:true})
  const state=service.get(),backup=values.get('chatMigration.feishu')
  assert.equal(state.conversations.length,10)
  assert.deepEqual(backup.invalidSaved,invalid)
  assert.match(backup.warning,/已恢复默认/)
  assert.match(service.getWarning(),/已恢复默认/)
})
