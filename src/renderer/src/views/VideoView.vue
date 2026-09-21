<template>
  <div class="video" :class="{ o: mode === 'opacity' }">
    <header class="bar">
      <button class="btn" @click="pick">选择视频文件</button>
      <div class="spacer"></div>
      <button class="mini" @click="clearHistory">清空历史</button>
      <button class="mini" data-action="close" @click="close">关闭</button>
    </header>

    <video
      v-if="src"
      ref="videoEl"
      :src="src"
      controls
      autoplay
      class="player"
      @timeupdate="onTime"
      @ended="savePos(0, 0)"
    ></video>
    <div v-else class="empty">选择本地视频文件开始播放</div>

    <div v-if="history.length" class="history">
      <div v-for="h in history" :key="h.filePath" class="hist" @click="play(h)">
        ▶ {{ h.fileName }} —— {{ fmt(h.currentTime) }}
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRoute } from 'vue-router'

const route = useRoute()
const mode = route.meta.mode || 'normal'
const api = window.localVideoAPI || {}
const src = ref('')
const history = ref([])
const videoEl = ref(null)

function fmt(s) {
  const m = Math.floor((s || 0) / 60)
  const ss = Math.floor((s || 0) % 60)
  return `${m}:${String(ss).padStart(2, '0')}`
}

function fileFromSrc() {
  if (!src.value) return ''
  let fp = src.value.replace(/^file:\/\//i, '')
  try {
    fp = decodeURIComponent(fp)
  } catch {}
  return fp.replace(/\//g, '\\')
}

async function pick() {
  const r = await api.selectVideoFile()
  if (r && r.filePath) play(r)
}

function play(h) {
  src.value = 'file:///' + h.filePath.replace(/\\/g, '/')
  if (h.currentTime) {
    setTimeout(() => {
      if (videoEl.value) videoEl.value.currentTime = h.currentTime
    }, 300)
  }
}

function onTime() {
  if (videoEl.value) savePos(videoEl.value.currentTime, videoEl.value.duration)
}

async function savePos(t, d) {
  const fp = fileFromSrc()
  if (!fp) return
  try {
    await api.savePlaybackPosition(fp, t || 0, d || 0)
  } catch {}
}

async function clearHistory() {
  await api.clearHistory()
  history.value = []
}

async function close() {
  try { await window.windowControl.close() }
  catch (error) { alert('关闭失败：' + error.message) }
}

onMounted(async () => {
  history.value = (await api.getHistory()) || []
})
</script>

<style scoped>
.video {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: #111;
  color: #fff;
}

.video.o {
  background: transparent;
}

.bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: rgba(0, 0, 0, 0.6);
}

.spacer {
  flex: 1;
}

.mini {
  border: 1px solid #444;
  background: transparent;
  color: #fff;
  border-radius: 4px;
  padding: 4px 10px;
  cursor: pointer;
}

.player {
  flex: 1;
  min-height: 0;
  width: 100%;
  background: #000;
}

.empty {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #888;
}

.history {
  max-height: 140px;
  overflow: auto;
  border-top: 1px solid #333;
  padding: 6px 10px;
}

.hist {
  padding: 5px 8px;
  font-size: 13px;
  cursor: pointer;
  border-radius: 4px;
}

.hist:hover {
  background: #222;
}
</style>
