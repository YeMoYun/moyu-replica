import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
test('ordinary WeRead retains its dedicated view independently of ad and other site routes',()=>{
  const router=fs.readFileSync(new URL('../src/renderer/src/router/index.js',import.meta.url),'utf8')
  assert.match(router,/path: '\/weRead',.*import\('\.\.\/views\/WeReadView.vue'\)/)
  assert.match(router,/path: '\/weReadAd',.*import\('\.\.\/views\/ReadingAdView.vue'\)/)
  assert.match(router,/path: '\/web',.*import\('\.\.\/views\/SiteView.vue'\)/)
})
test('WeRead compact controls entirely replace the generic toolbar',()=>{
  const path=new URL('../src/renderer/src/views/WeReadView.vue',import.meta.url)
  assert.ok(fs.existsSync(path),'dedicated WeRead view must exist')
  const source=fs.readFileSync(path,'utf8')
  for(const action of ['hide-bar','close','topmost','auto-hide','web-transparent','opacity','reader-controls','more','show-bar']) assert.ok(source.includes(`data-action="${action}"`),action)
  assert.doesNotMatch(source,/class="addr"|data-action="fullscreen"|placeholder="输入网址|>显示操作栏</)
  assert.match(source,/<svg/); assert.match(source,/height:\s*30px/)
  assert.match(source,/min="0.1".*max="1".*step="0.01"/)
  assert.match(source,/onUnmounted/); assert.match(source,/role="alert"/)
})
