import test from 'node:test'
import assert from 'node:assert/strict'
import {
  normalizeLocalBook,
  normalizeLocalProgress,
  progressFromSections,
  targetFromProgress
} from '../src/renderer/src/features/local-reader/model.mjs'

test('TXT chapter offsets become one continuous ordered document', () => {
  const content = '第一章\n甲乙丙\n第二章\n丁戊己'
  const book = normalizeLocalBook({
    type: 'txt',
    content,
    chapters: [
      { title: '第一章', start: 0, end: 8 },
      { title: '第二章', start: 8, end: content.length }
    ]
  })
  assert.equal(book.kind, 'chapters')
  assert.deepEqual(book.chapters.map(({ index, title }) => ({ index, title })), [
    { index: 0, title: '第一章' },
    { index: 1, title: '第二章' }
  ])
  assert.equal(book.chapters.map(chapter => chapter.text).join(''), content)
})

test('parsed HTML chapters stay ordered and an empty book reports a Chinese error', () => {
  const book = normalizeLocalBook({
    type: 'epub',
    chapters: [{ title: '序章', content: '<p>开始</p>' }]
  })
  assert.equal(book.chapters[0].html, '<p>开始</p>')
  assert.throws(() => normalizeLocalBook({ type: 'epub', chapters: [] }), /未读取到可显示内容/)
})

test('legacy numeric progress migrates and versioned progress is clamped', () => {
  assert.deepEqual(normalizeLocalProgress(4, 3), {
    version: 2, kind: 'continuous', chapterIndex: 2, chapterOffset: 0
  })
  assert.deepEqual(normalizeLocalProgress({
    version: 2, kind: 'continuous', chapterIndex: -1, chapterOffset: 8
  }, 3), {
    version: 2, kind: 'continuous', chapterIndex: 0, chapterOffset: 1
  })
})

test('scroll progress and restore target are chapter-relative across resize', () => {
  const before = [{ offsetTop: 0, offsetHeight: 600 }, { offsetTop: 600, offsetHeight: 900 }]
  const saved = progressFromSections(1050, before)
  assert.deepEqual(saved, {
    version: 2, kind: 'continuous', chapterIndex: 1, chapterOffset: 0.5
  })
  const after = [{ offsetTop: 0, offsetHeight: 800 }, { offsetTop: 800, offsetHeight: 1200 }]
  assert.equal(targetFromProgress(saved, after), 1400)
})
