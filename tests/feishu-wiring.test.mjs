import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8')

test('formal feishu has an isolated route bridge service and guest partition',()=>{
  const routes=read('src/renderer/src/router/index.js'),preload=read('src/preload/index.js')
  const main=read('src/main/index.js'),home=read('src/renderer/src/views/HomeView.vue')
  assert.match(routes,/path: '\/feishu'.*FeishuView\.vue/)
  assert.match(preload,/exposeInMainWorld\('feishuModeControl'/)
  assert.match(main,/feishu-mode:get/)
  assert.match(main,/createChatService\(\{store,key:'feishu',profile:'feishu'/s)
  assert.match(home,/飞书模式/)
})

test('feishu webview policy requires its own fixed session',async()=>{
  const {validateChatGuestAttachment}=await import('../src/main/chat-guest-policy.mjs')
  assert.equal(validateChatGuestAttachment('feishu',{src:'https://www.douyin.com/',partition:'persist:moyu-chat-feishu'}).partition,'persist:moyu-chat-feishu')
  assert.throws(()=>validateChatGuestAttachment('feishu',{src:'https://www.douyin.com/',partition:'persist:moyu-chat-dingtalk'}),/分区/)
})

test('approved feishu structure is local-first and mounts stable real guests only for players',()=>{
  const view=read('src/renderer/src/views/FeishuView.vue'),css=read('src/renderer/src/features/chat/feishu.css')
  assert.match(view,/class="feishu formal-feishu"/)
  assert.match(view,/class="quick-conversations"/)
  assert.match(view,/class="chat-tabs"/)
  assert.match(view,/class="group-announcement"/)
  assert.match(view,/m\.type==='media-card'/)
  assert.match(view,/v-show="c\.id === state\.selectedId"/)
  assert.match(view,/partition="persist:moyu-chat-feishu"/)
  assert.match(view,/window\.feishuModeControl/)
  assert.doesNotMatch(view,/window\.(chatModeControl|dingtalkModeControl)/)
  assert.match(css,/\.formal-feishu \.navigation\{[^}]*width:176px/)
  assert.match(css,/\.formal-feishu \.composer\{[^}]*height:52px/)
  assert.match(css,/-webkit-app-region:drag/)
  assert.doesNotMatch(css,/(^|})\.(chat-startup|navigation|composer)\{/)
})

test('feishu lifecycle cannot bypass its source-restricted IPC and logout preserves app state',()=>{
  const main=read('src/main/index.js')
  assert.doesNotMatch(main,/\n\s+feishu:\s*'feishu',/)
  assert.doesNotMatch(main,/['"]close-feishu-window['"]/)
  assert.match(main,/handle\('clear-all-info',\s*event\s*=>\s*\{\s*if\s*\(keyFromSender\(event\)\s*!==\s*'main'\)/s)
  assert.match(main,/handle\('clear-all-info',[\s\S]*?auth\.setMany\(/)
  assert.doesNotMatch(main,/handle\('clear-all-info',[^\n]*auth\.clear\(\)/)
})
