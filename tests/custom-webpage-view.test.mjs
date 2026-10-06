import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const view = () => fs.readFileSync(new URL('../src/renderer/src/views/CustomWebpageView.vue', import.meta.url), 'utf8')

test('custom webpage window uses the unified video toolbar controls', () => {
  const source = view()
  for (const action of ['hide-bar', 'topmost', 'close', 'reload', 'help', 'zoom', 'style', 'scrollbar', 'web-transparent', 'opacity', 'auto-hide', 'show-bar']) {
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
  assert.match(source, /__moyu_custom_page_css__/)
  assert.match(source, /el\.textContent=/)
  assert.match(source, /setZoomFactor/)
})
test('web transparency strips page background while keeping the font choice', () => {
  const source = view()
  assert.match(source, /pageTransparent/)
  assert.match(source, /background:transparent !important/)
  assert.match(source, /toggleTransparent/)
  assert.match(source, /styleSaved\.value\?`color:/)
})
test('color pickers feed the refs and the style element is idempotent', () => {
  const source = view()
  // 取色器的值必须真正写入引用（此前单向绑定导致颜色永远无法应用/保存）。
  assert.match(source, /setFontColor\(\$event\.target\.value\)/)
  assert.match(source, /setBgColor\(\$event\.target\.value\)/)
  assert.match(source, /fontColor\.value=value/)
  assert.match(source, /bg\.value=value/)
  assert.match(source, /el\.textContent=/)
})
test('scrollbar visibility is a toolbar toggle persisted with the style prefs', () => {
  const source = view()
  assert.match(source, /data-action="scrollbar"/)
  assert.match(source, /setScrollbar\(!scrollbarHidden\)/)
  assert.match(source, /-webkit-scrollbar\{display:none !important\}/)
  assert.match(source, /scrollbarHidden:scrollbarHidden\.value/)
})
