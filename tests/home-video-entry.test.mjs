import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { VIDEO_PLATFORM_ORDER, VIDEO_PLATFORMS } from '../src/shared/video-platforms.mjs'

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
  assert.match(source, /ref="closeButton"/)
  assert.match(source, /@keydown\.tab="handleKeydown"/)
})

test('home renders seven video entries and opens the shared dialog', () => {
  const source = read('src/renderer/src/views/HomeView.vue')
  assert.deepEqual(
    VIDEO_PLATFORM_ORDER.map((key) => `${VIDEO_PLATFORMS[key].label}模式`),
    ['抖音模式', 'B站模式', '虎牙模式', '斗鱼模式', '快手模式']
  )
  assert.match(source, /v-for="item in videoEntries"/)
  assert.match(source, /\{\{ item\.label \}\}模式/)
  assert.match(source, /自定义网站模式/)
  assert.match(source, /本地视频播放/)
  assert.match(source, /VideoModeDialog/)
  assert.match(source, /callBridge\(window\.videoModeControl, 'open'/)
  assert.match(source, /callBridge\(window\.videoModeControl, 'openRecentChat'/)
  assert.match(source, /role="alert"/)
  assert.doesNotMatch(source, /抖音透明化|B站透明化|虎牙透明化|快手透明化/)
})
