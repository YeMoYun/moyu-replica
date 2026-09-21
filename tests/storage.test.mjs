import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const { createFileStore } = await import('../src/main/storage.mjs').catch((e) => {
  if (e.code === 'ERR_MODULE_NOT_FOUND') return {}
  throw e
})
function fixture(t) {
  assert.equal(typeof createFileStore, 'function', 'file store API must exist')
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'moyu-store-test-'))
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }))
  return path.join(dir, 'config.json')
}
test('settings round trip through disk without losing unrelated data', (t) => {
  const file = fixture(t)
  const store = createFileStore(file, { shortcuts: { boss: 'Ctrl+D' } })
  store.set('web.opacity', 0.4)
  store.set('token', 'local-test-only')
  const reopened = createFileStore(file)
  assert.equal(reopened.get('web.opacity'), 0.4)
  assert.equal(reopened.get('token'), 'local-test-only')
})
test('legacy flat dotted keys remain readable and update without shadow copies', (t) => {
  const file = fixture(t)
  fs.writeFileSync(file, JSON.stringify({ 'web.opacity': 0.3, token: 'retained' }))
  const store = createFileStore(file)
  store.set('web.opacity', 0.6)
  assert.equal(store.get('web.opacity'), 0.6)
  assert.equal(JSON.parse(fs.readFileSync(file)).token, 'retained')
  assert.equal(JSON.parse(fs.readFileSync(file))['web.opacity'], 0.6)
})
test('disk write failure is reported and memory remains unchanged', (t) => {
  const file = fixture(t)
  const store = createFileStore(file, { value: 1 })
  fs.mkdirSync(file)
  assert.throws(() => store.set('value', 2))
  assert.equal(store.get('value'), 1)
})
test('defaults and returned data are isolated from mutation', (t) => {
  const file = fixture(t)
  const defaults = { shortcuts: { boss: 'Ctrl+D' } }
  const store = createFileStore(file, defaults)
  store.get('shortcuts').boss = 'Ctrl+Z'
  store.all().shortcuts.boss = 'Ctrl+X'
  store.clear()
  assert.equal(store.get('shortcuts').boss, 'Ctrl+D')
  assert.equal(defaults.shortcuts.boss, 'Ctrl+D')
})
test('unsafe prototype paths are rejected', (t) => {
  const store = createFileStore(fixture(t))
  assert.throws(() => store.set('__proto__.polluted', true))
  assert.equal({}.polluted, undefined)
})
