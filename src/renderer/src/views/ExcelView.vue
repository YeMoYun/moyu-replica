<template>
  <div class="excel">
    <div class="toolbar">
      <span class="app">视频播放器</span>
      <button class="mini" @click="refresh">刷新列表</button>
      <button class="mini" @click="fullscreen">网页全屏</button>
      <button class="mini" @click="showHistory = !showHistory">历史记录</button>
      <button class="mini" @click="help = !help">操作引导</button>
    </div>

    <div class="ribbon">
      <span v-for="t in ['开始', '插入', '页面布局', '公式', '数据', '审阅', '视图']" :key="t" class="tab">{{ t }}</span>
    </div>

    <div class="body">
      <div class="grid">
        <div class="corner"></div>
        <div v-for="c in 8" :key="'h' + c" class="colhead">{{ String.fromCharCode(64 + c) }}</div>
        <template v-for="r in 24" :key="'r' + r">
          <div class="rowhead">{{ r }}</div>
          <div v-for="c in 8" :key="r + '-' + c" class="cell"></div>
        </template>
      </div>

      <aside class="side" v-if="!showHistory">
        <h4>视频列表</h4>
        <div v-for="v in videos" :key="v.title" class="video" @click="openVideo(v)">
          <div class="vh">{{ v.title }}</div>
          <div class="vm">{{ v.author }} · {{ v.play }}播放 · {{ v.duration }}</div>
        </div>
      </aside>

      <aside class="side" v-else>
        <h4>历史记录</h4>
        <div v-for="h in history" :key="h.filePath" class="video" @click="openLocal(h)">
          <div class="vh">{{ h.fileName }}</div>
          <div class="vm">{{ fmt(h.currentTime) }} / {{ fmt(h.duration) }}</div>
        </div>
      </aside>
    </div>

    <webview v-if="webUrl" ref="wv" :src="webUrl" class="preview"></webview>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'

const videos = [
  { title: '程序员如何高效摸鱼', author: '极客日常', play: '12.6万', duration: '08:32' },
  { title: '上班必学摸鱼姿势合集', author: '职场研究所', play: '88万', duration: '15:07' },
  { title: '办公桌下的秘密', author: '沙雕动画', play: '45.2万', duration: '03:21' },
  { title: '老板来了怎么装忙', author: '职场老油条', play: '23万', duration: '06:44' },
  { title: 'Excel 高级隐藏技巧', author: '办公效率', play: '9.8万', duration: '11:15' }
]
const history = ref([])
const webUrl = ref('')
const showHistory = ref(false)
const help = ref(false)

function fmt(s) {
  const m = Math.floor((s || 0) / 60)
  const ss = Math.floor((s || 0) % 60)
  return `${m}:${String(ss).padStart(2, '0')}`
}

function refresh() {
  alert('推荐列表已刷新（演示数据）')
}

function fullscreen() {
  window.ipcRenderer && window.ipcRenderer.send('excel-ad-full-screen')
}

function openVideo(v) {
  webUrl.value = 'https://www.bilibili.com/search?keyword=' + encodeURIComponent(v.title)
}

function openLocal(h) {
  webUrl.value = 'file:///' + h.filePath.replace(/\\/g, '/')
}

function closeWin() {
  window.ipcRenderer && window.ipcRenderer.send('close-excel-window')
}

onMounted(async () => {
  try {
    history.value = (await window.localVideoAPI.getHistory()) || []
  } catch {}
})
</script>

<style scoped>
.excel {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: #f3f2f1;
  color: #333;
}

.toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  background: #fff;
  border-bottom: 1px solid #e1dfdd;
}

.app {
  font-weight: 700;
  margin-right: 8px;
}

.mini {
  border: 1px solid #d0d0d0;
  background: #fff;
  border-radius: 3px;
  font-size: 12px;
  padding: 3px 10px;
  cursor: pointer;
}

.ribbon {
  display: flex;
  gap: 14px;
  padding: 6px 12px;
  background: #e9f1fb;
  border-bottom: 1px solid #c8d9f0;
  font-size: 13px;
}

.tab {
  cursor: pointer;
  padding: 2px 4px;
}

.body {
  flex: 1;
  display: flex;
  overflow: hidden;
}

.grid {
  flex: 1;
  display: grid;
  grid-template-columns: 36px repeat(8, 1fr);
  grid-auto-rows: 24px;
  overflow: auto;
  background: #fff;
  border-right: 1px solid #e1dfdd;
}

.corner,
.colhead,
.rowhead {
  border: 1px solid #e8e8e8;
  background: #f8f8f8;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  color: #666;
}

.cell {
  border: 1px solid #eee;
}

.side {
  width: 280px;
  overflow: auto;
  background: #fff;
  padding: 10px;
}

.side h4 {
  margin: 0 0 8px;
}

.video {
  padding: 8px;
  border: 1px solid #eee;
  border-radius: 6px;
  margin-bottom: 8px;
  cursor: pointer;
}

.video:hover {
  background: #f5f5f5;
}

.vh {
  font-size: 13px;
  font-weight: 600;
}

.vm {
  font-size: 12px;
  color: #888;
  margin-top: 3px;
}

.preview {
  position: absolute;
  right: 0;
  bottom: 0;
  width: 55%;
  height: 45%;
  border: 1px solid #ccc;
  background: #fff;
  z-index: 10;
}
</style>