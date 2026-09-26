import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const script = readFileSync(new URL('../scripts/run-portable-smoke.mjs', import.meta.url), 'utf8')

test('portable smoke extracts into a temporary directory and isolates user data', () => {
  assert.match(script, /mkdtempSync/)
  assert.match(script, /Expand-Archive/)
  assert.match(script, /MOYU_SMOKE_DATA_DIR/)
  assert.match(script, /MOYU_RELEASE_SMOKE/)
})

test('portable smoke checks main app and packaged phone runtime before launch', () => {
  for (const file of ['摸鱼大师.exe', 'resources/qtscrcpy/QtScrcpy.exe', 'resources/qtscrcpy/adb.exe', 'resources/qtscrcpy/scrcpy-server']) {
    assert.ok(script.includes(file), `missing portable check: ${file}`)
  }
  assert.match(script, /timeout/i)
  assert.match(script, /exitCode/)
})
