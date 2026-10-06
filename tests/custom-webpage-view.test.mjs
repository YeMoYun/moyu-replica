import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const view = () => fs.readFileSync(new URL('../src/renderer/src/views/CustomWebpageView.vue', import.meta.url), 'utf8')

test('custom webpage window uses the unified video toolbar controls', () => {
  const source = view()
  for (const action of ['hide-bar', 'topmost', 'close', 'reload', 'help', 'zoom', 'style', 'opacity', 'auto-hide', 'show-bar']) {
    assert.ok(source.includes(`data-action="${action}"`), action)
  }
  assert.ok(source.includes('class="addr"'), 'custom navigation keeps the address input')
  assert.match(source, /height:\s*34px/)
  assert.match(source, /role="alert"/)
  assert.match(source, /onUnmounted/)
  assert.match(source, /role="dialog"/)
  // 旧版遗留控件（文字按钮与死代码样式）必须消失。
  assert.doesNotMatch(source, /改字色|改背景|class="mini"|alert\(|保存样式/)
})

test('custom webpage persists navigation, zoom and style preferences', () => {
  const source = view()
  assert.match(source, /moyu:lastUrl:customWebpage/)
  assert.match(source, /customWebpage\.zoom/)
  assert.match(source, /insertCSS/)
  assert.match(source, /removeInsertedCSS/)
  assert.match(source, /setZoomFactor/)
})
