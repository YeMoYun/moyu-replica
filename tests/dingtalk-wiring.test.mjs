import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync,existsSync} from 'node:fs'
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8')
test('formal dingtalk has an isolated route, bridge, service and guest partition',()=>{
  const path=new URL('../src/renderer/src/views/DingTalkView.vue',import.meta.url);assert.ok(existsSync(path),'正式钉钉视图尚未实现')
  const routes=read('src/renderer/src/router/index.js'),preload=read('src/preload/index.js'),main=read('src/main/index.js'),view=read('src/renderer/src/views/DingTalkView.vue')
  assert.match(routes,/path: '\/dingding'.*DingTalkView.vue/);assert.match(preload,/exposeInMainWorld\('dingtalkModeControl'/);assert.match(main,/dingtalk-mode:get/);assert.match(main,/keyFromSender\(event\).*dingding/s)
  assert.match(main,/createChatService\(\{store,.*key:'dingtalk'/s);assert.match(view,/persist:moyu-chat-dingtalk/);assert.doesNotMatch(view,/window\.chatModeControl/)
})
test('approved dingtalk structure keeps stable guests and composition-safe input',()=>{
  const path=new URL('../src/renderer/src/views/DingTalkView.vue',import.meta.url);assert.ok(existsSync(path),'正式钉钉视图尚未实现');const view=read('src/renderer/src/views/DingTalkView.vue')
  assert.match(view,/class="dingtalk formal-dingtalk"/);assert.match(view,/v-show="c.id === state.selectedId"/);assert.match(view,/:key="m.id"/);assert.match(view,/isComposing/);assert.match(view,/Shift\+Enter/)
})
test('chat webviews are checked against their fixed session partition before attachment',async()=>{
  const {validateChatGuestAttachment}=await import('../src/main/chat-guest-policy.mjs').catch((e)=>{
    if(e.code==='ERR_MODULE_NOT_FOUND')return {};throw e
  })
  assert.equal(typeof validateChatGuestAttachment,'function')
  assert.equal(validateChatGuestAttachment('dingding',{src:'https://www.douyin.com/video/1',partition:'persist:moyu-chat-dingtalk'}).partition,'persist:moyu-chat-dingtalk')
  assert.deepEqual(validateChatGuestAttachment('chat-bilibili-wechat',{src:'https://www.bilibili.com/video/BV1',partition:'persist:moyu-chat-bilibili-wechat'}),{address:'https://www.bilibili.com/video/BV1',partition:'persist:moyu-chat-bilibili-wechat'})
  assert.throws(()=>validateChatGuestAttachment('chat-bilibili-wechat',{src:'https://www.huya.com/1',partition:'persist:moyu-chat-bilibili-wechat'}),/B站/)
  assert.throws(()=>validateChatGuestAttachment('chat-bilibili-wechat',{src:'https://www.bilibili.com/',partition:'persist:moyu-chat-huya-wechat'}),/分区/)
  assert.throws(()=>validateChatGuestAttachment('chat-bilibili-wechat',{}))
  assert.throws(()=>validateChatGuestAttachment('__proto__',{src:'https://www.bilibili.com/',partition:'persist:moyu-chat-bilibili-wechat'}),/未知聊天窗口/)
})
test('frameless dingtalk window has a scoped draggable title bar',()=>{
  const css=read('src/renderer/src/features/chat/dingtalk.css'),view=read('src/renderer/src/views/DingTalkView.vue')
  assert.match(css,/\.formal-dingtalk \.top-bar\{[^}]*-webkit-app-region:drag/)
  assert.match(css,/\.formal-dingtalk \.top-bar label[^}]*-webkit-app-region:no-drag/)
  assert.doesNotMatch(css,/(^|})\.chat-startup\{/)
  assert.match(view,/class="formal-dingtalk chat-startup"/)
})
