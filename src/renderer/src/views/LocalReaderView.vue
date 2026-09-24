<template>
  <div class="local-reader">
    <template v-if="view === 'shelf'">
      <header class="shelf-head">
        <h1>我的书架</h1>
        <div class="shelf-drag"></div>
        <button type="button" class="import-button" @click="importBooks">导入书籍</button>
        <button type="button" class="shelf-close" aria-label="关闭本地阅读" @click="closeWindow">×</button>
      </header>
      <div v-if="error" class="shelf-error" role="alert">{{ error }}<button type="button" aria-label="关闭提示" @click="error=''">×</button></div>
      <div v-if="history.length === 0" class="empty">书架空空如也，点击“导入书籍”开始阅读</div>
      <div v-else class="book-grid">
        <article v-for="book in history" :key="book.filePath" class="book-card" @click="openBook(book)">
          <div class="book-cover">{{ (book.fileName || '书')[0] }}</div>
          <div class="book-name" :title="book.fileName">{{ book.fileName }}</div>
          <div class="book-time">{{ formatTime(book.lastReadTime) }}</div>
          <button type="button" class="remove-book" :aria-label="`移除 ${book.fileName}`" @click.stop="removeBook(book)">移除</button>
        </article>
      </div>
    </template>

    <template v-else>
      <LocalReaderToolbar
        :title="currentTitle"
        :always-on-top="nativeState.alwaysOnTop"
        :auto-hide-enabled="nativeState.autoHideEnabled"
        :opacity="nativeState.opacity"
        :toc-disabled="documentKind !== 'chapters' || chapters.length === 0"
        @close="closeWindow"
        @topmost="toggleTopmost"
        @auto-hide="toggleAutoHide"
        @opacity="setOpacity"
        @shelf="returnToShelf"
        @toc="tocOpen = !tocOpen"
        @font-down="changeFont(-1)"
        @font-up="changeFont(1)"
        @previous="previousChapter"
        @next="nextChapter"
      />

      <div v-if="error" class="reader-error" role="alert">{{ error }}<button type="button" aria-label="关闭提示" @click="error=''">×</button></div>

      <aside v-if="tocOpen" class="toc-panel" aria-label="书籍目录">
        <button v-for="chapter in chapters" :key="chapter.index" type="button" @click="jumpTo(chapter.index)">{{ chapter.title }}</button>
      </aside>

      <main
        v-if="documentKind === 'chapters'"
        ref="scrollSurface"
        class="scroll-surface"
        :style="{ fontSize: `${fontSize}px` }"
        @scroll="scheduleProgressSave"
      >
        <section v-for="chapter in chapters" :key="chapter.index" class="book-chapter" :data-chapter-index="chapter.index">
          <h2>{{ chapter.title }}</h2>
          <div v-if="chapter.html" class="chapter-html" v-html="chapter.html"></div>
          <p v-else class="chapter-text">{{ chapter.text }}</p>
        </section>
        <div v-if="chapters.length === 0" class="empty-content">未读取到可显示内容</div>
      </main>

      <iframe v-else-if="documentKind === 'pdf'" class="pdf-frame" :src="fileSrc"></iframe>
    </template>
  </div>
</template>

<script setup>
import { nextTick, onMounted, onUnmounted, reactive, ref } from 'vue'
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
let resizeFrame = null
let rememberedProgress = normalizeLocalProgress(null, 1)

function formatTime(timestamp) {
  if (!timestamp) return ''
  const date = new Date(timestamp)
  return `${date.getMonth() + 1}/${date.getDate()} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

function showError(failure) {
  error.value = failure?.message || String(failure)
}

async function loadHistory() {
  try {
    history.value = (await api.getHistory()) || []
  } catch (failure) {
    history.value = []
    showError(failure)
  }
}

async function importBooks() {
  error.value = ''
  try {
    const files = (await api.selectFiles()) || []
    for (const filePath of files) await api.saveProgress(filePath, 0)
    await loadHistory()
  } catch (failure) {
    showError(failure)
  }
}

async function removeBook(book) {
  error.value = ''
  try {
    await api.deleteHistory(book.filePath)
    await loadHistory()
  } catch (failure) {
    showError(failure)
  }
}

const sectionElements = () => [...(scrollSurface.value?.querySelectorAll('[data-chapter-index]') || [])]

const afterLayout = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))

async function openBook(book) {
  error.value = ''
  currentFile.value = book.filePath
  currentTitle.value = book.fileName
  tocOpen.value = false
  try {
    const normalized = normalizeLocalBook(await api.getBookContent(book.filePath))
    documentKind.value = normalized.kind
    chapters.value = normalized.chapters
    fileSrc.value = normalized.kind === 'pdf' ? `file:///${normalized.filePath.replace(/\\/g, '/')}` : ''
    view.value = 'read'
    await nextTick()
    if (normalized.kind === 'chapters') {
      rememberedProgress = normalizeLocalProgress(await api.getProgress(book.filePath), chapters.value.length)
      await afterLayout()
      if (scrollSurface.value) scrollSurface.value.scrollTop = targetFromProgress(rememberedProgress, sectionElements())
    }
  } catch (failure) {
    documentKind.value = 'chapters'
    chapters.value = []
    fileSrc.value = ''
    view.value = 'read'
    showError(failure)
  }
}

function currentProgress() {
  if (!scrollSurface.value || !chapters.value.length) return rememberedProgress
  return progressFromSections(scrollSurface.value.scrollTop, sectionElements())
}

async function saveProgressNow() {
  if (!currentFile.value || documentKind.value !== 'chapters' || !scrollSurface.value || !chapters.value.length) return
  const progress = currentProgress()
  rememberedProgress = progress
  await api.saveProgress(currentFile.value, progress)
}

function scheduleProgressSave() {
  rememberedProgress = currentProgress()
  clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    saveProgressNow().catch(showError)
  }, 250)
}

function jumpTo(index, behavior = 'smooth') {
  const safeIndex = Math.max(0, Math.min(Number(index) || 0, chapters.value.length - 1))
  const section = sectionElements()[safeIndex]
  if (section && scrollSurface.value) {
    rememberedProgress = normalizeLocalProgress({ chapterIndex: safeIndex, chapterOffset: 0 }, chapters.value.length)
    scrollSurface.value.scrollTo({ top: section.offsetTop, behavior })
  }
  tocOpen.value = false
}

function activeChapterIndex() {
  return currentProgress().chapterIndex
}

function previousChapter() {
  jumpTo(activeChapterIndex() - 1)
}

function nextChapter() {
  jumpTo(activeChapterIndex() + 1)
}

async function returnToShelf() {
  clearTimeout(saveTimer)
  try {
    await saveProgressNow()
  } catch (failure) {
    showError(failure)
  }
  view.value = 'shelf'
  tocOpen.value = false
  await loadHistory()
}

async function performControl(operation) {
  error.value = ''
  try {
    const state = await operation()
    if (state) Object.assign(nativeState, state)
  } catch (failure) {
    showError(failure)
  }
}

function setOpacity(value) {
  return performControl(() => control.setOpacity(value))
}

function toggleTopmost() {
  return performControl(() => control.setAlwaysOnTop(!nativeState.alwaysOnTop))
}

function toggleAutoHide() {
  return performControl(() => control.setAutoHide(!nativeState.autoHideEnabled))
}

function closeWindow() {
  if (control.close) return performControl(() => control.close())
  if (api.closeWindow) api.closeWindow()
}

async function changeFont(delta) {
  const progress = currentProgress()
  fontSize.value = Math.max(10, Math.min(36, fontSize.value + delta))
  try {
    await api.setFontSize(fontSize.value)
    await nextTick()
    if (scrollSurface.value) scrollSurface.value.scrollTop = targetFromProgress(progress, sectionElements())
    rememberedProgress = progress
  } catch (failure) {
    showError(failure)
  }
}

function handleResize() {
  if (view.value !== 'read' || documentKind.value !== 'chapters') return
  cancelAnimationFrame(resizeFrame)
  resizeFrame = requestAnimationFrame(() => {
    if (scrollSurface.value) scrollSurface.value.scrollTop = targetFromProgress(rememberedProgress, sectionElements())
  })
}

onMounted(async () => {
  window.addEventListener('resize', handleResize)
  await loadHistory()
  try {
    fontSize.value = (await api.getFontSize()) || 16
    if (control.getState) Object.assign(nativeState, await control.getState())
  } catch (failure) {
    showError(failure)
  }
  if (control.onState) subscriptions.push(control.onState(state => Object.assign(nativeState, state)))
  if (control.onError) subscriptions.push(control.onError(message => { error.value = message }))
})

onUnmounted(() => {
  window.removeEventListener('resize', handleResize)
  clearTimeout(saveTimer)
  cancelAnimationFrame(resizeFrame)
  saveProgressNow().catch(() => {})
  subscriptions.splice(0).forEach(dispose => dispose())
})
</script>

<style scoped>
.local-reader{height:100%;min-width:0;display:flex;flex-direction:column;background:transparent;position:relative;overflow:hidden;color:#252525}
.shelf-head{height:48px;flex:none;display:flex;align-items:center;gap:8px;padding:0 10px 0 14px;background:#fff;border-bottom:1px solid #e5e7eb}
.shelf-head h1{margin:0;font-size:16px;white-space:nowrap}.shelf-drag{height:100%;flex:1;-webkit-app-region:drag}
.import-button,.shelf-close,.remove-book{border:0;cursor:pointer;-webkit-app-region:no-drag}.import-button{height:30px;padding:0 12px;border-radius:6px;background:#1a202c;color:#fff}.shelf-close{width:28px;height:28px;border-radius:5px;background:#f1f5f9;color:#334155;font-size:20px}
.shelf-error,.reader-error{position:absolute;left:8px;right:8px;z-index:40;background:#7f1d1d;color:#fff;padding:8px 28px 8px 9px;border-radius:5px;font-size:12px;overflow-wrap:anywhere}.shelf-error{top:54px}.reader-error{top:34px}.shelf-error button,.reader-error button{position:absolute;right:5px;top:4px;border:0;background:transparent;color:#fff;font-size:17px;cursor:pointer}
.empty,.empty-content{flex:1;display:flex;align-items:center;justify-content:center;padding:18px;color:#64748b;text-align:center;background:rgba(255,253,245,.96)}
.book-grid{flex:1;min-height:0;overflow:auto;display:grid;grid-template-columns:repeat(auto-fill,minmax(112px,1fr));align-content:start;gap:12px;padding:14px;background:rgba(255,253,245,.96)}
.book-card{position:relative;min-width:0;padding:10px;border:1px solid #e5e7eb;border-radius:9px;background:#fff;text-align:center;cursor:pointer}.book-card:hover{box-shadow:0 5px 16px rgba(15,23,42,.12)}
.book-cover{width:52px;height:68px;margin:0 auto 7px;border-radius:5px;display:flex;align-items:center;justify-content:center;background:linear-gradient(145deg,#d89a4c,#a84632);color:#fff;font-size:23px}.book-name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px}.book-time{min-height:16px;color:#94a3b8;font-size:10px}.remove-book{margin-top:5px;padding:3px 7px;border-radius:4px;background:#fee2e2;color:#b91c1c;font-size:10px}
.scroll-surface{flex:1;min-height:0;min-width:0;overflow-y:auto;overflow-x:hidden;padding:clamp(14px,4vw,34px);background:rgba(255,253,245,.94);color:#252525;line-height:1.9;scroll-behavior:smooth}
.book-chapter{width:min(100%,760px);margin:0 auto 2.5em;overflow-wrap:anywhere}.book-chapter h2{text-align:center;font-size:1.15em;margin:0 0 1.4em}.chapter-text{margin:0;white-space:pre-wrap}
.chapter-html :deep(img),.chapter-html :deep(table),.chapter-html :deep(pre){max-width:100%}.chapter-html :deep(img){height:auto}.chapter-html :deep(table){display:block;overflow-x:auto}.chapter-html :deep(pre){overflow-x:auto;white-space:pre-wrap}
.pdf-frame{width:100%;flex:1;min-height:0;border:0;background:#fff}
.toc-panel{position:absolute;top:32px;left:8px;width:min(280px,calc(100% - 16px));max-height:calc(100% - 40px);overflow:auto;z-index:25;background:#fff;color:#222;border:1px solid #e5e7eb;border-radius:8px;box-shadow:0 10px 32px rgba(0,0,0,.28)}
.toc-panel button{display:block;width:100%;padding:9px 12px;border:0;border-bottom:1px solid #f1f5f9;background:#fff;text-align:left;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;cursor:pointer}.toc-panel button:hover{background:#f8fafc}
@media (max-width:359px){.shelf-head{padding-left:9px}.shelf-head h1{font-size:14px}.import-button{padding:0 8px}.book-grid{grid-template-columns:repeat(auto-fill,minmax(96px,1fr));padding:10px;gap:8px}}
</style>
