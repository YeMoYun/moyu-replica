# Responsive Local Reader Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the post-shelf local book view with a transparent-reader-style, single-toolbar, continuously scrolling and resize-safe reading experience without changing any existing web reading mode.

**Architecture:** Keep the existing `bookReader` BrowserWindow and shelf APIs. Move chapter/progress math into a pure renderer module, put the responsive toolbar in a local-reader-only component, and let `ReaderView.vue` coordinate DOM scrolling, window controls, persistence and errors. Preserve the existing IPC names and accept legacy numeric progress while writing a versioned chapter-relative progress object.

**Tech Stack:** Electron 31, Vue 3 SFCs, Node.js ES modules and `node:test`, existing `windowControl`/`bookReaderAPI` preload bridges.

---

## File map

- Create `src/renderer/src/features/local-reader/model.mjs`: normalize chapter data and convert between DOM scroll positions and persisted progress.
- Create `src/renderer/src/components/LocalReaderToolbar.vue`: local-reader-only responsive single toolbar and dialogs.
- Modify `src/renderer/src/views/ReaderView.vue`: retain the shelf, render all chapters continuously, coordinate scroll restoration and window controls.
- Modify `src/main/index.js`: reject raw EPUB clearly instead of reading it as TXT.
- Modify `src/main/window-definitions.mjs`: define `320 × 240` minimum local-reader size while preserving the `400 × 300` default.
- Create `tests/local-reader-model.test.mjs`: pure behavior tests for chapter normalization and progress migration/math.
- Create `tests/local-reader-view.test.mjs`: focused source-contract tests for the local toolbar and continuous reader wiring.
- Modify `tests/window-definitions.test.mjs`: assert the resize contract.
- Create `docs/superpowers/verification/2026-09-24-local-reader-responsive.md`: record only directly observed acceptance evidence.

### Task 1: Add pure chapter and progress behavior

**Files:**
- Create: `tests/local-reader-model.test.mjs`
- Create: `src/renderer/src/features/local-reader/model.mjs`

- [ ] **Step 1: Write failing model tests**

```js
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
```

- [ ] **Step 2: Run the model tests and confirm RED**

Run:

```powershell
node --test tests/local-reader-model.test.mjs
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `features/local-reader/model.mjs`.

- [ ] **Step 3: Implement the pure model**

Create `src/renderer/src/features/local-reader/model.mjs`:

```js
const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, Number(value) || 0))

const chapter = (value, index) => ({
  index,
  title: String(value?.title || `第 ${index + 1} 章`),
  text: value?.text == null ? '' : String(value.text),
  html: value?.html == null ? '' : String(value.html)
})

export function normalizeLocalBook(data) {
  if (!data || data.error) throw new Error(data?.error || '书籍读取失败')
  if (data.type === 'pdf') {
    if (!data.filePath) throw new Error('PDF 文件不存在')
    return { kind: 'pdf', filePath: data.filePath, chapters: [] }
  }
  if (data.type === 'txt') {
    const content = String(data.content || '')
    const ranges = Array.isArray(data.chapters) ? data.chapters : []
    const chapters = ranges.length
      ? ranges.map((item, index) => chapter({
          title: item.title,
          text: content.slice(clamp(item.start, 0, content.length), clamp(item.end, 0, content.length))
        }, index))
      : [chapter({ title: '正文', text: content }, 0)]
    if (!chapters.some(item => item.text.trim())) throw new Error('未读取到可显示内容')
    return { kind: 'chapters', chapters }
  }
  if (data.type === 'epub') {
    const chapters = (Array.isArray(data.chapters) ? data.chapters : []).map((item, index) => chapter({
      title: item.title,
      html: item.content ?? item.text ?? ''
    }, index))
    if (!chapters.some(item => item.html.trim())) throw new Error('未读取到可显示内容')
    return { kind: 'chapters', chapters }
  }
  throw new Error('不支持的书籍格式')
}

export function normalizeLocalProgress(value, chapterCount) {
  const last = Math.max(0, Number(chapterCount) - 1)
  if (typeof value === 'number') {
    return { version: 2, kind: 'continuous', chapterIndex: clamp(Math.floor(value), 0, last), chapterOffset: 0 }
  }
  return {
    version: 2,
    kind: 'continuous',
    chapterIndex: clamp(Math.floor(value?.chapterIndex), 0, last),
    chapterOffset: clamp(value?.chapterOffset, 0, 1)
  }
}

export function progressFromSections(scrollTop, sections) {
  if (!sections.length) return normalizeLocalProgress(null, 1)
  const top = Math.max(0, Number(scrollTop) || 0)
  let index = 0
  for (let cursor = 1; cursor < sections.length; cursor++) {
    if (Number(sections[cursor].offsetTop) > top) break
    index = cursor
  }
  const section = sections[index]
  const offset = (top - Number(section.offsetTop || 0)) / Math.max(1, Number(section.offsetHeight || 1))
  return normalizeLocalProgress({ chapterIndex: index, chapterOffset: offset }, sections.length)
}

export function targetFromProgress(value, sections) {
  if (!sections.length) return 0
  const progress = normalizeLocalProgress(value, sections.length)
  const section = sections[progress.chapterIndex]
  return Number(section.offsetTop || 0) + Number(section.offsetHeight || 0) * progress.chapterOffset
}
```

- [ ] **Step 4: Run the model tests and confirm GREEN**

Run:

```powershell
node --test tests/local-reader-model.test.mjs
```

Expected: 4 tests PASS.

- [ ] **Step 5: Commit the model**

```powershell
git add src/renderer/src/features/local-reader/model.mjs tests/local-reader-model.test.mjs
git commit -m "feat: add continuous local reader model"
```

### Task 2: Make the local-reader window resize contract explicit

**Files:**
- Modify: `tests/window-definitions.test.mjs`
- Modify: `src/main/window-definitions.mjs`
- Create: `tests/local-reader-main.test.mjs`
- Modify: `src/main/index.js`

- [ ] **Step 1: Write failing window and EPUB handling tests**

Add to `tests/window-definitions.test.mjs`:

```js
test('local reader keeps its default size and has an explicit resize floor', () => {
  assert.deepEqual(
    [SITE_ROUTES.bookReader.width, SITE_ROUTES.bookReader.height],
    [400, 300]
  )
  assert.deepEqual(
    [SITE_ROUTES.bookReader.minWidth, SITE_ROUTES.bookReader.minHeight, SITE_ROUTES.bookReader.resizable],
    [320, 240, true]
  )
})
```

Create `tests/local-reader-main.test.mjs`:

```js
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
```

- [ ] **Step 2: Run both tests and confirm RED**

Run:

```powershell
node --test tests/window-definitions.test.mjs tests/local-reader-main.test.mjs
```

Expected: FAIL because `bookReader.minWidth`, `bookReader.minHeight`, `bookReader.resizable` and the EPUB branch do not exist.

- [ ] **Step 3: Add the minimum size and explicit EPUB error**

Change the `bookReader` definition in `src/main/window-definitions.mjs` to:

```js
bookReader: definition('/bookReader',400,300,{
  ...transparent,
  webSecurity:false,
  minWidth:320,
  minHeight:240,
  resizable:true
}),
```

In `getBookContent` in `src/main/index.js`, insert this branch immediately before the PDF branch:

```js
if (ext === 'epub') {
  return { type: 'unsupported', error: '当前版本暂不支持 EPUB，请转换为 TXT、MOBI、AZW、AZW3 或 PDF 后重新导入。' }
}
```

- [ ] **Step 4: Run both tests and confirm GREEN**

Run:

```powershell
node --test tests/window-definitions.test.mjs tests/local-reader-main.test.mjs
```

Expected: all tests PASS.

- [ ] **Step 5: Commit the window contract**

```powershell
git add src/main/index.js src/main/window-definitions.mjs tests/window-definitions.test.mjs tests/local-reader-main.test.mjs
git commit -m "fix: define local reader format and resize bounds"
```

### Task 3: Add the isolated responsive toolbar

**Files:**
- Create: `src/renderer/src/components/LocalReaderToolbar.vue`
- Create: `tests/local-reader-view.test.mjs`

- [ ] **Step 1: Write the failing toolbar contract test**

Create `tests/local-reader-view.test.mjs`:

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const toolbar = fs.readFileSync(new URL('../src/renderer/src/components/LocalReaderToolbar.vue', import.meta.url), 'utf8')

test('local reader toolbar exposes accepted window and reading actions', () => {
  for (const action of [
    'hide-bar', 'show-bar', 'close', 'topmost', 'auto-hide', 'opacity',
    'shelf', 'toc', 'font-down', 'font-up', 'previous', 'next', 'more'
  ]) assert.match(toolbar, new RegExp(`data-action="${action}"`), action)
  assert.match(toolbar, /-webkit-app-region:\s*drag/)
  assert.match(toolbar, /-webkit-app-region:\s*no-drag/)
  assert.match(toolbar, /@media \(max-width:\s*559px\)/)
  assert.match(toolbar, /@media \(max-width:\s*359px\)/)
})
```

- [ ] **Step 2: Run the view test and confirm RED**

Run:

```powershell
node --test tests/local-reader-view.test.mjs
```

Expected: FAIL with `ENOENT` for `LocalReaderToolbar.vue`.

- [ ] **Step 3: Implement `LocalReaderToolbar.vue`**

Create a local-only SFC with this public contract:

```vue
<script setup>
import { ref } from 'vue'

defineProps({
  title: { type: String, default: '' },
  alwaysOnTop: Boolean,
  autoHideEnabled: Boolean,
  opacity: { type: Number, default: 1 },
  tocDisabled: Boolean
})
const emit = defineEmits([
  'close', 'topmost', 'auto-hide', 'opacity', 'shelf', 'toc',
  'font-down', 'font-up', 'previous', 'next'
])
const showBar = ref(true)
const showMore = ref(false)
const showOpacity = ref(false)
</script>
```

The template must use inline SVG paths (not font glyph icons), set the accepted action markers on each button, and wire them exactly as follows:

```vue
<template>
  <div class="local-reader-toolbar" :class="{ hidden: !showBar }">
    <svg class="icon-definitions" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <symbol id="lr-eye" viewBox="0 0 24 24"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></symbol>
        <symbol id="lr-close" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="m8 8 8 8m0-8-8 8"/></symbol>
        <symbol id="lr-pin" viewBox="0 0 24 24"><path d="m14 3 7 7-3 1-4 5-2-2-7 7-2-2 7-7-2-2 5-4Z"/></symbol>
        <symbol id="lr-hide" viewBox="0 0 24 24"><path d="M13 3H4v18h9m1-14 5 5-5 5m-6-5h11"/></symbol>
        <symbol id="lr-drop" viewBox="0 0 24 24"><path d="M12 3c-3 5-7 8-7 12a7 7 0 0 0 14 0c0-4-4-7-7-12Z"/></symbol>
        <symbol id="lr-shelf" viewBox="0 0 24 24"><path d="M4 4h5v16H4Zm11 0h5v16h-5ZM9 7h6M9 17h6"/></symbol>
        <symbol id="lr-toc" viewBox="0 0 24 24"><path d="M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01"/></symbol>
        <symbol id="lr-left" viewBox="0 0 24 24"><path d="m15 18-6-6 6-6"/></symbol>
        <symbol id="lr-right" viewBox="0 0 24 24"><path d="m9 18 6-6-6-6"/></symbol>
      </defs>
    </svg>
    <template v-if="showBar">
      <button data-action="hide-bar" title="隐藏操作栏" @click="showBar=false"><svg><use href="#lr-eye"/></svg></button>
      <button data-action="close" title="关闭" @click="emit('close')"><svg><use href="#lr-close"/></svg></button>
      <button class="wide-control" data-action="topmost" :class="{active:alwaysOnTop}" title="置顶" @click="emit('topmost')"><svg><use href="#lr-pin"/></svg></button>
      <button class="wide-control" data-action="auto-hide" :class="{active:autoHideEnabled}" title="鼠标移出隐藏" @click="emit('auto-hide')"><svg><use href="#lr-hide"/></svg></button>
      <button class="wide-control" data-action="opacity" title="窗口透明度" @click="showOpacity=!showOpacity"><svg><use href="#lr-drop"/></svg></button>
      <button data-action="shelf" title="返回书架" @click="emit('shelf')"><svg><use href="#lr-shelf"/></svg></button>
      <button class="medium-control" data-action="toc" title="目录" :disabled="tocDisabled" @click="emit('toc')"><svg><use href="#lr-toc"/></svg></button>
      <button class="wide-control" data-action="font-down" title="缩小字号" @click="emit('font-down')">A−</button>
      <button class="wide-control" data-action="font-up" title="增大字号" @click="emit('font-up')">A+</button>
      <span class="reader-title">{{title}}</span>
      <button class="wide-control" data-action="previous" title="上一章" @click="emit('previous')"><svg><use href="#lr-left"/></svg></button>
      <button class="wide-control" data-action="next" title="下一章" @click="emit('next')"><svg><use href="#lr-right"/></svg></button>
      <button data-action="more" :aria-expanded="showMore" @click="showMore=!showMore">更多</button>
    </template>
    <button v-else data-action="show-bar" title="显示操作栏" @click="showBar=true"><svg><use href="#lr-eye"/></svg></button>
    <div v-if="showOpacity" class="toolbar-popover opacity-popover">
      <label>透明度 <input type="range" min="0.1" max="1" step="0.01" :value="opacity" @input="emit('opacity',Number($event.target.value))"></label>
    </div>
    <div v-if="showMore" class="toolbar-popover more-popover">
      <button data-action="topmost" @click="emit('topmost')">置顶</button>
      <button data-action="auto-hide" @click="emit('auto-hide')">鼠标移出隐藏</button>
      <button data-action="opacity" @click="showOpacity=true">透明度</button>
      <button data-action="toc" :disabled="tocDisabled" @click="emit('toc')">目录</button>
      <button data-action="font-down" @click="emit('font-down')">缩小字号</button>
      <button data-action="font-up" @click="emit('font-up')">增大字号</button>
      <button data-action="previous" @click="emit('previous')">上一章</button>
      <button data-action="next" @click="emit('next')">下一章</button>
    </div>
  </div>
</template>
```

Use these layout rules in the scoped style, with the same `30px` bar height and dark palette as `WeReadView.vue`:

```css
.local-reader-toolbar{height:30px;flex:none;display:flex;align-items:center;gap:6px;padding:0 8px;background:#1a202c;color:#fff;position:relative;user-select:none}
.icon-definitions{position:absolute;width:0;height:0;overflow:hidden}
.local-reader-toolbar::after{content:"";height:100%;flex:1;min-width:4px;-webkit-app-region:drag;order:8}
button,input,.toolbar-popover{-webkit-app-region:no-drag}
button{height:22px;min-width:22px;border:0;border-radius:4px;background:transparent;color:inherit;display:inline-flex;align-items:center;justify-content:center}
button svg{width:16px;height:16px;fill:none;stroke:currentColor;stroke-width:1.6;stroke-linecap:round;stroke-linejoin:round}
button:hover,button.active{background:rgba(255,255,255,.15)}
.reader-title{min-width:0;max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px;order:7}
.toolbar-popover{position:absolute;top:32px;right:6px;z-index:30;background:#2d3748;border:1px solid #4a5568;border-radius:7px;padding:8px;box-shadow:0 10px 28px rgba(0,0,0,.35)}
@media (max-width:559px){.wide-control{display:none}.reader-title{max-width:90px}.more-popover .wide-control{display:flex}}
@media (max-width:359px){.medium-control,.reader-title{display:none}}
```

- [ ] **Step 4: Run the toolbar contract test and confirm GREEN**

Run:

```powershell
node --test tests/local-reader-view.test.mjs
```

Expected: PASS.

- [ ] **Step 5: Commit the toolbar**

```powershell
git add src/renderer/src/components/LocalReaderToolbar.vue tests/local-reader-view.test.mjs
git commit -m "feat: add responsive local reader toolbar"
```

### Task 4: Convert `ReaderView` to continuous responsive reading

**Files:**
- Modify: `tests/local-reader-view.test.mjs`
- Modify: `src/renderer/src/views/ReaderView.vue`

- [ ] **Step 1: Extend the view contract test and confirm RED**

Append to `tests/local-reader-view.test.mjs`:

```js
const reader = fs.readFileSync(new URL('../src/renderer/src/views/ReaderView.vue', import.meta.url), 'utf8')

test('reader renders one continuous scroll surface and keeps the shelf separate', () => {
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
})
```

Run:

```powershell
node --test tests/local-reader-view.test.mjs
```

Expected: the toolbar test stays green and the new ReaderView test FAILS because the continuous reader wiring is absent.

- [ ] **Step 2: Replace paged state with continuous document state**

In `ReaderView.vue`, import the toolbar and model, then use these state fields:

```js
import { ref, reactive, nextTick, onMounted, onUnmounted } from 'vue'
import LocalReaderToolbar from '../components/LocalReaderToolbar.vue'
import { normalizeLocalBook, normalizeLocalProgress, progressFromSections, targetFromProgress } from '../features/local-reader/model.mjs'

const api = window.bookReaderAPI || {}
const control = window.windowControl || {}
const view = ref('shelf')
const history = ref([])
const chapters = ref([])
const documentKind = ref('chapters')
const currentFile = ref('')
const currentTitle = ref('')
const fileSrc = ref('')
const fontSize = ref(16)
const tocOpen = ref(false)
const error = ref('')
const scrollSurface = ref(null)
const nativeState = reactive({ opacity: 1, alwaysOnTop: false, autoHideEnabled: false })
const subscriptions = []
let saveTimer = null
```

Keep the current shelf `loadHistory`, `importBooks`, `removeBook` and `fmt` behavior. `importBooks` must only save the imported paths and reload history; it must not call `openBook`.

- [ ] **Step 3: Implement open, restore, navigation and throttled saving**

Add these functions to `ReaderView.vue`:

```js
const sectionElements = () => [...(scrollSurface.value?.querySelectorAll('[data-chapter-index]') || [])]

async function openBook(book) {
  error.value = ''
  currentFile.value = book.filePath
  currentTitle.value = book.fileName
  try {
    const normalized = normalizeLocalBook(await api.getBookContent(book.filePath))
    documentKind.value = normalized.kind
    chapters.value = normalized.chapters
    fileSrc.value = normalized.kind === 'pdf' ? `file:///${normalized.filePath.replace(/\\/g, '/')}` : ''
    view.value = 'read'
    await nextTick()
    if (normalized.kind === 'chapters') {
      const progress = normalizeLocalProgress(await api.getProgress(book.filePath), chapters.value.length)
      scrollSurface.value.scrollTop = targetFromProgress(progress, sectionElements())
    }
  } catch (failure) {
    error.value = failure?.message || String(failure)
    view.value = 'read'
    chapters.value = []
  }
}

async function saveProgressNow() {
  if (!currentFile.value || documentKind.value !== 'chapters' || !scrollSurface.value) return
  const progress = progressFromSections(scrollSurface.value.scrollTop, sectionElements())
  await api.saveProgress(currentFile.value, progress)
}

function scheduleProgressSave() {
  clearTimeout(saveTimer)
  saveTimer = setTimeout(() => { saveProgressNow().catch(failure => { error.value = failure?.message || String(failure) }) }, 250)
}

function jumpTo(index) {
  const section = sectionElements()[Math.max(0, Math.min(index, chapters.value.length - 1))]
  if (section && scrollSurface.value) scrollSurface.value.scrollTo({ top: section.offsetTop, behavior: 'smooth' })
  tocOpen.value = false
}

function activeChapterIndex() {
  return progressFromSections(scrollSurface.value?.scrollTop || 0, sectionElements()).chapterIndex
}

const previousChapter = () => jumpTo(activeChapterIndex() - 1)
const nextChapter = () => jumpTo(activeChapterIndex() + 1)

async function returnToShelf() {
  clearTimeout(saveTimer)
  await saveProgressNow()
  view.value = 'shelf'
  tocOpen.value = false
}
```

Load and update native state only through `windowControl`:

```js
async function setOpacity(value) { Object.assign(nativeState, await control.setOpacity(value)) }
async function toggleTopmost() { Object.assign(nativeState, await control.setAlwaysOnTop(!nativeState.alwaysOnTop)) }
async function toggleAutoHide() { Object.assign(nativeState, await control.setAutoHide(!nativeState.autoHideEnabled)) }
async function changeFont(delta) {
  fontSize.value = Math.max(10, Math.min(36, fontSize.value + delta))
  await api.setFontSize(fontSize.value)
}
```

- [ ] **Step 4: Replace only the read-state template**

Keep the current shelf template. Replace the `v-else` reading branch with:

```vue
<template v-else>
  <LocalReaderToolbar
    :title="currentTitle"
    :always-on-top="nativeState.alwaysOnTop"
    :auto-hide-enabled="nativeState.autoHideEnabled"
    :opacity="nativeState.opacity"
    :toc-disabled="documentKind!=='chapters'||chapters.length===0"
    @close="control.close()"
    @topmost="toggleTopmost"
    @auto-hide="toggleAutoHide"
    @opacity="setOpacity"
    @shelf="returnToShelf"
    @toc="tocOpen=!tocOpen"
    @font-down="changeFont(-1)"
    @font-up="changeFont(1)"
    @previous="previousChapter"
    @next="nextChapter"
  />
  <div v-if="error" class="reader-error" role="alert">{{error}}<button @click="error=''">×</button></div>
  <aside v-if="tocOpen" class="toc-panel" aria-label="书籍目录">
    <button v-for="chapter in chapters" :key="chapter.index" @click="jumpTo(chapter.index)">{{chapter.title}}</button>
  </aside>
  <main
    v-if="documentKind==='chapters'"
    ref="scrollSurface"
    class="scroll-surface"
    :style="{fontSize:fontSize+'px'}"
    @scroll="scheduleProgressSave"
  >
    <section v-for="chapter in chapters" :key="chapter.index" class="book-chapter" :data-chapter-index="chapter.index">
      <h2>{{chapter.title}}</h2>
      <div v-if="chapter.html" class="chapter-html" v-html="chapter.html"></div>
      <p v-else class="chapter-text">{{chapter.text}}</p>
    </section>
  </main>
  <iframe v-else-if="documentKind==='pdf'" class="pdf-frame" :src="fileSrc"></iframe>
</template>
```

- [ ] **Step 5: Add responsive content styles and lifecycle cleanup**

Use these essential layout rules in `ReaderView.vue`:

```css
.reader{height:100%;min-width:0;display:flex;flex-direction:column;background:transparent;position:relative;overflow:hidden}
.scroll-surface{flex:1;min-height:0;min-width:0;overflow-y:auto;overflow-x:hidden;padding:clamp(14px,4vw,34px);background:rgba(255,253,245,.94);color:#252525;line-height:1.9;scroll-behavior:smooth}
.book-chapter{width:min(100%,760px);margin:0 auto 2.5em;overflow-wrap:anywhere}
.book-chapter h2{text-align:center;font-size:1.15em;margin:0 0 1.4em}
.chapter-text{margin:0;white-space:pre-wrap}
.chapter-html :deep(img),.chapter-html :deep(table),.chapter-html :deep(pre){max-width:100%}
.chapter-html :deep(img){height:auto}
.chapter-html :deep(pre){overflow-x:auto;white-space:pre-wrap}
.pdf-frame{width:100%;flex:1;min-height:0;border:0;background:#fff}
.toc-panel{position:absolute;top:32px;left:8px;width:min(280px,calc(100% - 16px));max-height:calc(100% - 40px);overflow:auto;z-index:25;background:#fff;color:#222;border-radius:8px;box-shadow:0 10px 32px rgba(0,0,0,.28)}
.toc-panel button{display:block;width:100%;padding:9px 12px;border:0;background:#fff;text-align:left;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.reader-error{position:absolute;top:34px;left:8px;right:8px;z-index:40;background:#7f1d1d;color:#fff;padding:8px 28px 8px 9px;border-radius:5px;font-size:12px}
```

Add lifecycle handling:

```js
onMounted(async () => {
  await loadHistory()
  fontSize.value = (await api.getFontSize()) || 16
  if (control.getState) Object.assign(nativeState, await control.getState())
  if (control.onState) subscriptions.push(control.onState(state => Object.assign(nativeState, state)))
  if (control.onError) subscriptions.push(control.onError(message => { error.value = message }))
})

onUnmounted(() => {
  clearTimeout(saveTimer)
  saveProgressNow().catch(() => {})
  subscriptions.splice(0).forEach(dispose => dispose())
})
```

- [ ] **Step 6: Run the model, view and window tests**

Run:

```powershell
node --test tests/local-reader-model.test.mjs tests/local-reader-view.test.mjs tests/local-reader-main.test.mjs tests/window-definitions.test.mjs
```

Expected: all focused tests PASS.

- [ ] **Step 7: Commit the continuous reader**

```powershell
git add src/renderer/src/views/ReaderView.vue tests/local-reader-view.test.mjs
git commit -m "feat: add responsive continuous local reading"
```

### Task 5: Focused build and real acceptance

**Files:**
- Create: `docs/superpowers/verification/2026-09-24-local-reader-responsive.md`

- [ ] **Step 1: Run only affected automated surfaces**

Run:

```powershell
node --test tests/local-reader-model.test.mjs tests/local-reader-view.test.mjs tests/local-reader-main.test.mjs tests/window-definitions.test.mjs tests/preload-events.test.mjs
npm run build
git diff --check
```

Expected: focused tests PASS, the Electron build succeeds and `git diff --check` reports no errors. Do not rerun unrelated video, chat or transparent-reading smoke matrices because those files are outside this batch.

- [ ] **Step 2: Start the development app**

Run:

```powershell
npm run dev
```

In the app, open “阅读模式 → 本地阅读模式”.

- [ ] **Step 3: Exercise the accepted local-reader flow**

Use one real TXT file, one currently supported MOBI/AZW/AZW3 file if available, and one PDF:

1. Import files and confirm the app remains on the shelf.
2. Open TXT and confirm the single toolbar, continuous scroll and directory navigation.
3. Scroll into a chapter, resize from the default size down to `320 × 240`, enlarge again and confirm no horizontal overflow or position reset.
4. Close and reopen the TXT; confirm the chapter-relative position is restored.
5. Test hide/show toolbar, topmost, auto-hide and opacity.
6. Open the PDF and confirm it fills the remaining space and resizes with the window.
7. If an `.epub` is selected, confirm the explicit unsupported-format message appears instead of garbled text.
8. Confirm 微信读书、番茄小说 and 晋江文学城 were not changed.

- [ ] **Step 4: Record only observed results**

Create `docs/superpowers/verification/2026-09-24-local-reader-responsive.md` with:

```markdown
# 本地阅读响应式界面验收记录

- 日期：2026-09-24
- 导入后停留书架：未验证
- 单层工具栏与窄屏折叠：未验证
- TXT 连续滚动与目录跳转：未验证
- 调整窗口大小后内容自适应：未验证
- 章节相对进度恢复：未验证
- 隐藏工具栏、置顶、自动隐藏、透明度：未验证
- PDF 自适应：未验证
- EPUB 明确错误提示：未验证
- 透明阅读模式未改动：未验证
- 说明：只记录本次直接观察到的结果；缺少样本的格式标记为“未验证”。
```

- [ ] **Step 5: Commit the acceptance record after user confirmation**

```powershell
git add docs/superpowers/verification/2026-09-24-local-reader-responsive.md
git commit -m "test: verify responsive local reader"
```
