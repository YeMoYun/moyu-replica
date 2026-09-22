import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync,existsSync} from 'node:fs'
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8')
test('formal wechat route and entry use isolated view and bridge without replacing transparent routes',()=>{
  const routes=read('src/renderer/src/router/index.js'),preload=read('src/preload/index.js'),home=read('src/renderer/src/views/HomeView.vue'),main=read('src/main/index.js')
  assert.match(routes,/path: '\/wechat\/:platform\?'.*WechatView.vue/)
  assert.match(routes,/path: '\/dingding\/:platform\?'.*DingTalkView.vue/)
  assert.match(routes,/path: '\/douyinOpacity'.*DouyinOpacityView.vue/)
  assert.match(preload,/exposeInMainWorld\('chatModeControl'/)
  assert.match(home,/openRecentChat\('wechat'\)/)
  assert.match(home,/VideoModeDialog/)
  assert.match(preload,/exposeInMainWorld\('videoModeControl'/)
  assert.match(main,/chatWindowControls\.toggleBoss/);assert.match(main,/registerLegacyChatBridge\('chat-mode','wechat'\)/)
  assert.match(main,/createChatServiceRegistry/)
  assert.match(main,/else if \(chat\) chatWindowControls\.attach\(key, win\)/)
})
test('approved layout mounts stable per-conversation guests and no remote preload or Node integration',()=>{
  const p=new URL('../src/renderer/src/views/WechatView.vue',import.meta.url);assert.ok(existsSync(p),'正式微信视图尚未实现')
  const view=read('src/renderer/src/views/WechatView.vue'),player=read('src/renderer/src/features/chat/ChatPlayer.vue')
  assert.match(view,/v-show="c.id === state.selectedId"/);assert.match(view,/:key="m.id"/)
  assert.match(view,/isComposing/);assert.match(view,/更多/);assert.doesNotMatch(player,/persist:moyu-chat-wechat/)
  assert.doesNotMatch(player,/\bpreload=|\bnodeintegration\b/)
})
