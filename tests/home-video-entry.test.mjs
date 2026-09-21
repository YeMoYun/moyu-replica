import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (path) => readFileSync(new URL('../' + path, import.meta.url), 'utf8')

test('mode dialog has approved order, full-width feishu and three close paths', () => {
  const source = read('src/renderer/src/components/VideoModeDialog.vue')
  const positions = ['广告模式', '透明度模式', '微信模式', '钉钉模式', '飞书模式'].map((text) =>
    source.indexOf(text)
  )

  assert.ok(
    positions.every((value, index) => value > 0 && (index === 0 || value > positions[index - 1]))
  )
  assert.match(source, /class="mode-button feishu"/)
  assert.match(source, /@click\.self="emit\('close'\)"/)
  assert.match(source, /@keydown\.escape/)
  assert.match(source, /aria-label="关闭模式选择"/)
  assert.match(source, /tabindex="-1"/)
  assert.match(source, /document\.addEventListener\('keydown', escape\)/)
  assert.match(source, /document\.removeEventListener\('keydown', escape\)/)
  assert.match(source, /scrim\.value\?\.focus\(\)/)
})
