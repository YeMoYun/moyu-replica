import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const toolbarPath = new URL('../src/renderer/src/components/LocalReaderToolbar.vue', import.meta.url)

test('local reader toolbar exposes accepted window and reading actions', () => {
  const toolbar = fs.readFileSync(toolbarPath, 'utf8')
  for (const action of [
    'hide-bar', 'show-bar', 'close', 'topmost', 'auto-hide', 'opacity',
    'shelf', 'toc', 'font-down', 'font-up', 'previous', 'next', 'more'
  ]) assert.match(toolbar, new RegExp(`data-action="${action}"`), action)
  assert.match(toolbar, /-webkit-app-region:\s*drag/)
  assert.match(toolbar, /-webkit-app-region:\s*no-drag/)
  assert.match(toolbar, /@media \(max-width:\s*559px\)/)
  assert.match(toolbar, /@media \(max-width:\s*359px\)/)
})
