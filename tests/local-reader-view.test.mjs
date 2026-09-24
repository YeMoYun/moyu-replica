import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const toolbarPath = new URL('../src/renderer/src/components/LocalReaderToolbar.vue', import.meta.url)
const readerPath = new URL('../src/renderer/src/views/LocalReaderView.vue', import.meta.url)
const routerPath = new URL('../src/renderer/src/router/index.js', import.meta.url)

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

test('reader renders one continuous scroll surface and keeps other reader routes isolated', () => {
  const reader = fs.readFileSync(readerPath, 'utf8')
  const router = fs.readFileSync(routerPath, 'utf8')
  assert.match(reader, /import LocalReaderToolbar/)
  assert.match(reader, /import \{ normalizeLocalBook, normalizeLocalProgress, progressFromSections, targetFromProgress \}/)
  assert.match(reader, /ref="scrollSurface"/)
  assert.match(reader, /v-for="chapter in chapters"/)
  assert.match(reader, /:data-chapter-index="chapter.index"/)
  assert.match(reader, /@scroll="scheduleProgressSave"/)
  assert.match(reader, /api\.saveProgress\(currentFile\.value, progress\)/)
  assert.match(reader, /window\.windowControl/)
  assert.match(reader, /min-height:\s*0/)
  assert.match(reader, /overflow-x:\s*hidden/)
  assert.match(reader, /max-width:\s*100%/)
  assert.match(router, /path: '\/bookReader'.*LocalReaderView/)
  for (const path of ['/book', '/bookReaderOpacity', '/readView', '/bookReaderAd']) {
    assert.match(router, new RegExp(`path: '${path.replace('/', '\\/')}'.*ReaderView`), path)
  }
})
