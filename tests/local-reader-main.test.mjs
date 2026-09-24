import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const source = fs.readFileSync(new URL('../src/main/index.js', import.meta.url), 'utf8')

test('raw EPUB is rejected clearly instead of being decoded as TXT', () => {
  assert.match(source, /if \(ext === 'epub'\)/)
  assert.match(source, /当前版本暂不支持 EPUB/)
  const epub = source.indexOf("if (ext === 'epub')")
  const txtFallback = source.indexOf("return { type: 'txt', content: readTxt(filePath)", epub)
  assert.ok(epub >= 0 && txtFallback > epub)
})

test('site window factory forwards explicit resize constraints', () => {
  assert.match(source, /minWidth:\s*def\.minWidth/)
  assert.match(source, /minHeight:\s*def\.minHeight/)
  assert.match(source, /resizable:\s*def\.resizable/)
})
