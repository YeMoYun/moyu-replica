import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync,existsSync} from 'node:fs'
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8')
test('formal wechat route and entry use isolated view and bridge without replacing transparent routes',()=>{
  const routes=read('src/renderer/src/router/index.js'),preload=read('src/preload/index.js'),home=read('src/renderer/src/views/HomeView.vue'),main=read('src/main/index.js')
  assert.match(routes,/path: '\/wechat'.*WechatView.vue/)
  assert.match(routes,/path: '\/dingding'.*DingTalkView.vue/)
  assert.match(routes,/path: '\/douyinOpacity'.*DouyinOpacityView.vue/)
  assert.match(preload,/exposeInMainWorld\('chatModeControl'/);assert.match(home,/抖音微信模式/)
  assert.match(main,/chatWindowControls\.toggleBoss/);assert.match(main,/chat-mode:save/)
  assert.match(main,/CHAT_WINDOW_TO_PROFILE\s*=\s*Object\.freeze\(\{[^}]*wechat:\s*'wechat'[^}]*dingding:\s*'dingtalk'[^}]*feishu:\s*'feishu'/)
  assert.match(main,/CHAT_WINDOW_KEYS\.has\(key\)\) chatWindowControls\.attach\(CHAT_WINDOW_TO_PROFILE\[key\]/)
})
test('approved layout mounts stable per-conversation guests and no remote preload or Node integration',()=>{
  const p=new URL('../src/renderer/src/views/WechatView.vue',import.meta.url);assert.ok(existsSync(p),'正式微信视图尚未实现')
  const view=read('src/renderer/src/views/WechatView.vue'),player=read('src/renderer/src/features/chat/ChatPlayer.vue')
  assert.match(view,/v-show="c.id === state.selectedId"/);assert.match(view,/:key="m.id"/)
  assert.match(view,/isComposing/);assert.match(view,/更多/);assert.match(player,/persist:moyu-chat-wechat/)
  assert.doesNotMatch(player,/\bpreload=|\bnodeintegration\b/)
})
