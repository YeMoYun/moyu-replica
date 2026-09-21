<template>
  <div class="reader" :class="{ ad: mode === 'ad', o: mode === 'opacity' }">
    <!-- 书架 -->
    <template v-if="view === 'shelf'">
      <header class="head">
        <h2>我的书架</h2>
        <button class="btn" @click="importBooks">导入书籍</button>
      </header>
      <div v-if="history.length === 0" class="empty">书架空空如也，点击「导入书籍」开始阅读</div>
      <div class="grid">
        <div v-for="b in history" :key="b.filePath" class="book" @click="openBook(b)">
          <div class="cover">{{ (b.fileName || '书')[0] }}</div>
          <div class="name">{{ b.fileName }}</div>
          <div class="time">{{ fmt(b.lastReadTime) }}</div>
          <button class="del" @click.stop="removeBook(b)">移除</button>
        </div>
      </div>
    </template>

    <!-- 阅读 -->
    <template v-else>
      <header class="head">
        <button class="btn ghost" @click="view = 'shelf'">← 书架</button>
        <span class="title">{{ currentTitle }}</span>
        <div class="ops">
          <button class="mini" @click="fontSize--">A-</button>
          <button class="mini" @click="fontSize++">A+</button>
          <button class="mini" @click="prev">上一章</button>
          <button class="mini" @click="next">下一章</button>
        </div>
      </header>
      <div class="toc" v-if="tocOpen">
        <div v-for="(c, i) in content" :key="i" class="toc-item" @click="jump(i)">
          {{ c.title }}
        </div>
      </div>
      <div class="content" :style="{ fontSize: fontSize + 'px', color: fontColor, opacity: fontOpacity }">
        <template v-if="type === 'txt'">
          <h3>{{ current.title }}</h3>
          <p class="text">{{ current.text }}</p>
        </template>
        <iframe v-else-if="type === 'pdf'" :src="fileSrc" class="pdf-frame"></iframe>
        <div v-else-if="type === 'epub'" class="epub" v-html="current.text"></div>
        <div v-else class="loading">加载中…</div>
      </div>
    </template>
  </div>
</template>

<script setup>
import { ref, computed, watchEffect, onMounted } from 'vue'
import { useRoute } from 'vue-router'

const route = useRoute()
const mode = route.meta.mode || 'shelf'
const view = ref(mode === 'shelf' ? 'shelf' : 'read')

const api = window.bookReaderAPI || {}
const history = ref([])
const content = ref([])
const current = ref({ title: '', text: '' })
const currentIndex = ref(0)
const currentFile = ref('')
const currentTitle = ref('')
const tocOpen = ref(true)
const type = ref('txt')
const fileSrc = ref('')
const fontSize = ref(16)
const fontColor = ref('#000000')
const fontOpacity = ref(1)

function fmt(ts) {
  if (!ts) return ''
  const d = new Date(ts)
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

async function loadHistory() {
  try {
    history.value = (await api.getHistory()) || []
  } catch {
    history.value = []
  }
}

async function importBooks() {
  try {
    const files = (await api.selectFiles()) || []
    for (const f of files) await api.saveProgress(f, 0)
    await loadHistory()
  } catch {}
}

async function removeBook(b) {
  try {
    await api.deleteHistory(b.filePath)
    await loadHistory()
  } catch {}
}

async function openBook(b) {
  view.value = 'read'
  currentFile.value = b.filePath
  currentTitle.value = b.fileName
  try {
    const data = await api.getBookContent(b.filePath)
    type.value = data.type
    if (data.type === 'txt') {
      const full = data.content
      const pages = data.chapters && data.chapters.length
        ? data.chapters.map((c) => ({ title: c.title, text: full.slice(c.start, c.end) }))
        : splitPages(full)
      content.value = pages
      const saved = (await api.getProgress(b.filePath)) || 0
      currentIndex.value = Math.min(Math.floor(saved), content.value.length - 1 || 0)
      current.value = content.value[currentIndex.value] || { title: '', text: '' }
    } else if (data.type === 'pdf') {
      fileSrc.value = 'file:///' + data.filePath.replace(/\\/g, '/')
      current.value = { title: b.fileName, text: '' }
    } else if (data.type === 'epub') {
      content.value = data.chapters.map((c) => ({ title: c.title, text: c.content }))
      current.value = content.value[0] || { title: '', text: '' }
    }
  } catch (e) {
    current.value = { title: b.fileName, text: '读取失败：' + String(e) }
  }
}

function splitPages(full, size = 2000) {
  const pages = []
  for (let i = 0; i < full.length; i += size) pages.push({ title: '正文', text: full.slice(i, i + size) })
  return pages
}

function jump(i) {
  currentIndex.value = i
  current.value = content.value[i] || current.value
}

function prev() {
  if (currentIndex.value > 0) jump(currentIndex.value - 1)
}

async function next() {
  if (currentIndex.value < content.value.length - 1) jump(currentIndex.value + 1)
  if (currentFile.value) await api.saveProgress(currentFile.value, currentIndex.value)
}

async function loadFont() {
  try {
    fontSize.value = (await api.getFontSize()) || 16
    fontColor.value = (await api.getFontColor()) || '#000000'
    fontOpacity.value = (await api.getFontOpacity()) ?? 1
  } catch {}
}

watchEffect(async () => {
  if (fontSize.value && view.value === 'read') {
    try { await api.setFontSize(fontSize.value) } catch {}
  }
})

onMounted(() => {
  loadHistory()
  loadFont()
})
</script>

<style scoped>
.reader {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: #fffdf5;
}

.reader.ad {
  background: #fff;
}

.reader.o {
  background: transparent;
}

.head {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 16px;
  border-bottom: 1px solid #eee;
  background: #fff;
}

.head h2 {
  margin: 0;
  font-size: 17px;
}

.title {
  flex: 1;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ops {
  display: flex;
  gap: 6px;
}

.mini {
  border: 1px solid #ddd;
  background: #fff;
  border-radius: 4px;
  padding: 3px 8px;
  font-size: 12px;
  cursor: pointer;
}

.empty {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #999;
}

.grid {
  flex: 1;
  overflow: auto;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
  gap: 14px;
  padding: 18px;
}

.book {
  background: #fff;
  border: 1px solid #eee;
  border-radius: 10px;
  padding: 12px;
  cursor: pointer;
  position: relative;
  text-align: center;
}

.book:hover {
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.1);
}

.cover {
  width: 64px;
  height: 84px;
  margin: 0 auto 8px;
  background: linear-gradient(140deg, #f59e0b, #ef4444);
  color: #fff;
  font-size: 26px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
}

.name {
  font-size: 13px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.time {
  font-size: 11px;
  color: #999;
  margin-top: 2px;
}

.del {
  position: absolute;
  top: 6px;
  right: 6px;
  border: none;
  background: #fee2e2;
  color: #dc2626;
  border-radius: 4px;
  font-size: 11px;
  padding: 2px 6px;
  cursor: pointer;
}

.toc {
  position: absolute;
  top: 46px;
  right: 12px;
  width: 240px;
  max-height: 60%;
  overflow: auto;
  background: #fff;
  border: 1px solid #eee;
  border-radius: 8px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
  z-index: 5;
}

.toc-item {
  padding: 8px 12px;
  font-size: 13px;
  cursor: pointer;
  border-bottom: 1px solid #f5f5f5;
}

.toc-item:hover {
  background: #f0f0f0;
}

.content {
  flex: 1;
  overflow: auto;
  padding: 22px 34px;
  line-height: 1.9;
}

.text {
  margin: 0;
  white-space: pre-wrap;
}

.pdf-frame {
  width: 100%;
  height: 100%;
  border: none;
}

.epub {
  max-width: 760px;
  margin: 0 auto;
}

.loading {
  color: #999;
}
</style>