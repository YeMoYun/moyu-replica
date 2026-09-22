import test from 'node:test'
import assert from 'node:assert/strict'
import {existsSync} from 'node:fs'
import {createFileStore} from '../src/main/storage.mjs'
import {mkdtempSync,rmSync} from 'node:fs'
import os from 'node:os'
import path from 'node:path'
const modelPath=new URL('../src/shared/chat-state.mjs',import.meta.url)
const M=existsSync(modelPath)?await import(modelPath):{}
test('formal WeChat state starts with approved seven conversations and sparse group',()=>{
  assert.equal(typeof M.createChatState,'function','正式聊天模型尚未实现')
  const s=M.createChatState();assert.equal(s.version,1);assert.equal(s.conversations.length,7)
  assert.equal(M.currentChat(s).name,'项目小组');assert.equal(M.currentChat(s).messages.length,3)
  assert.equal(M.currentChat(s).memberCount,5);assert.ok(M.currentChat(s).messages.every(m=>m.type==='text'))
})
test('local text sends safely and one player per conversation keeps its identity',()=>{
  assert.equal(typeof M.sendText,'function');const s=M.createChatState()
  assert.equal(M.sendText(s,'  '),false);M.sendText(s,' <img onerror=bad> ')
  assert.equal(M.currentChat(s).messages.at(-1).text,'<img onerror=bad>')
  assert.throws(()=>M.sendText(s,'x'.repeat(2001)));const m=M.insertPlayer(s)
  assert.equal(M.insertPlayer(s).id,m.id);assert.equal(m.address,M.DOUYIN_HOME)
  s.selectedId='lin';assert.notEqual(M.insertPlayer(s).id,m.id)
})
test('player geometry and navigation are chat-specific and restricted',()=>{
  assert.equal(typeof M.playerSize,'function')
  assert.deepEqual(M.playerSize({orientation:'landscape',scale:140}),{width:308,height:196})
  assert.deepEqual(M.playerSize({orientation:'portrait',scale:100}),{width:160,height:260})
  assert.equal(M.validateChatUrl('https://www.douyin.com/video/123'),'https://www.douyin.com/video/123')
  assert.equal(M.validateChatUrl('http://www.douyin.com/'),'http://www.douyin.com/')
  for(const u of ['javascript:alert(1)','https://user:pass@douyin.com/','https://douyin.com.evil.test/'])assert.throws(()=>M.validateChatUrl(u))
})
test('chat defaults and validation follow the expected video platform',()=>{
  const homes={
    bilibili:'https://www.bilibili.com/',huya:'https://www.huya.com/',
    douyu:'https://www.douyu.com/',kuaishou:'https://www.kuaishou.com/'
  }
  for(const [platform,home] of Object.entries(homes)){
    const state=M.createChatState('wechat',platform)
    assert.equal(state.settings.site,platform);assert.equal(state.settings.address,home)
    assert.equal(M.validateChatState(state,'wechat',platform).settings.site,platform)
    assert.equal(M.validateChatUrl(state.settings.address,platform),state.settings.address)
    assert.throws(()=>M.validateChatState(state,'wechat','douyin'),/站点|平台|播放器/)
    assert.throws(()=>M.validateChatUrl('https://www.douyin.com/',platform))
  }
})
test('chat state parameters are primitive strings and settings.site is exact',()=>{
  const trap={toString(){throw new Error('must not coerce')}}
  for(const skin of [null,123,new String('wechat'),trap,'__proto__','constructor','prototype']){
    assert.throws(()=>M.createChatState(skin,'douyin'),/聊天平台/)
  }
  for(const platform of [null,123,new String('douyin'),trap,'__proto__','constructor','prototype']){
    assert.throws(()=>M.createChatState('wechat',platform),/视频平台/)
  }
  const state=M.createChatState('wechat','huya')
  for(const site of ['HUYA','huya ',new String('huya'),null]){
    const invalid=structuredClone(state);invalid.settings.site=site
    assert.throws(()=>M.validateChatState(invalid,'wechat','huya'),/站点|平台|播放器/)
  }
})
test('legacy migration is scoped to its video platform and names that platform in warnings',()=>{
  const source={contacts:['张三'],messages:['张三|你好'],siteKey:'douyin'}
  const {state,warning}=M.migrateLegacy(source,'wechat','huya')
  assert.equal(state.settings.site,'huya');assert.equal(state.settings.address,'https://www.huya.com/')
  assert.match(warning,/虎牙/);assert.doesNotMatch(warning,/仅支持抖音/)
  assert.equal(M.migrateLegacy({...source,siteKey:'huya'},'wechat','huya').warning,'')
})
test('configuration rejects duplicates, pollution, unsupported site and bad messages atomically',()=>{
  assert.equal(typeof M.validateChatState,'function');const s=M.createChatState()
  for(const mutate of [n=>n.conversations.push(n.conversations[0]),n=>n.settings.site='huya',n=>n.conversations[0].messages.push({id:'bad',type:'html',sender:'other',text:'x',time:'10:00'}),n=>n.drafts={unknown:'x'}]){
    const n=structuredClone(s);mutate(n);const before=structuredClone(n);assert.throws(()=>M.validateChatState(n));assert.deepEqual(n,before)
  }
  assert.throws(()=>M.validateChatState(JSON.parse('{"__proto__":{},"version":1}')))
  assert.deepEqual(M.validateChatState(s),s)
})
test('legacy contact messages migrate without losing delimiters or unmatched authors',()=>{
  assert.equal(typeof M.migrateLegacy,'function')
  const old={contacts:['张三'],messages:['张三|第一段|第二段','李四|未匹配联系人消息'],siteKey:'huya'}
  const {state,warning}=M.migrateLegacy(old)
  assert.ok(warning.includes('抖音'));assert.equal(state.conversations.length,2)
  assert.equal(state.conversations[0].messages[0].text,'第一段|第二段')
  assert.equal(state.conversations[1].name,'李四');assert.deepEqual(old.contacts,['张三'])
  assert.throws(()=>M.migrateLegacy({contacts:['张三'],messages:['没有归属分隔符']}))
})
test('store migration backs up old data, commits revisions, and rejects stale writes',async()=>{
  const p=new URL('../src/main/chat-service.mjs',import.meta.url);assert.ok(existsSync(p),'正式聊天存储服务尚未实现')
  const {createChatService}=await import(p),dir=mkdtempSync(path.join(os.tmpdir(),'moyu-chat-unit-'))
  try{
    const store=createFileStore(path.join(dir,'config.json'));const old={contacts:['张三'],messages:['张三|你好']};store.set('wechatConfig',old)
    let notices=0;const service=createChatService({store,notify:()=>notices++}),s=service.get()
    assert.deepEqual(store.get('chatMigration.wechat.legacy'),old);assert.deepEqual(store.get('wechatConfig'),old)
    M.sendText(s,'持久化');const saved=service.save(s,s.revision);assert.equal(saved.revision,1);assert.equal(notices,1)
    assert.throws(()=>service.save(s,0),/版本|更新/);assert.equal(notices,1)
    assert.deepEqual(createChatService({store}).get(),saved)
    const invalid=structuredClone(saved);invalid.settings.site='huya';assert.throws(()=>service.save(invalid,1));assert.deepEqual(service.get(),saved)
  }finally{rmSync(dir,{recursive:true,force:true})}
})
test('failed persistence leaves previous state and never broadcasts success',async()=>{
  const p=new URL('../src/main/chat-service.mjs',import.meta.url);assert.ok(existsSync(p))
  const {createChatService}=await import(p);let data=M.createChatState(),notices=0
  const service=createChatService({store:{get:()=>structuredClone(data),set:()=>{throw Error('磁盘写入失败')}},notify:()=>notices++})
  const next=service.get();M.sendText(next,'失败消息');assert.throws(()=>service.save(next,0),/磁盘/)
  assert.deepEqual(service.get(),data);assert.equal(notices,0)
})
