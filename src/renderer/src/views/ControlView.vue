<template>
  <div class="ctrl">
    <header class="head">
      <h3>{{ title }}</h3>
      <button class="mini" @click="close">关闭</button>
    </header>

    <div class="row">
      <input v-model="roomId" placeholder="请输入房间ID 然后点击开始观看" class="input" />
      <button class="btn" @click="watchRoom">开始观看</button>
    </div>

    <webview v-if="src" :src="src" class="frame"></webview>
    <div v-else class="empty">暂无播放</div>

    <div class="history">
      <button class="mini" @click="tab = 'hist'" :class="{ on: tab === 'hist' }">观看历史</button>
      <button class="mini" @click="tab = 'fav'" :class="{ on: tab === 'fav' }">我的关注</button>
      <div v-if="tab === 'hist'" class="list">
        <div v-for="(h, i) in history" :key="i" class="item" @click="watchId(h.id)">
          {{ h.name }}（{{ h.id }}）
        </div>
      </div>
      <div v-else class="list">
        <div v-for="(f, i) in favs" :key="i" class="item" @click="watchId(f.id)">
          {{ f.name }}（{{ f.id }}）
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRoute } from 'vue-router'

const route = useRoute()
const kind = route.meta.kind || 'huya'
const title = kind === 'huya' ? '虎牙控制器' : '斗鱼控制器'
const base = kind === 'huya' ? 'https://www.huya.com/' : 'https://www.douyu.com/'

const roomId = ref('')
const src = ref('')
const tab = ref('hist')
const history = ref([])
const favs = ref([])

function watchRoom() {
  if (!roomId.value.trim()) return
  watchId(roomId.value)
}

function watchId(id) {
  src.value = base + id
  history.value = [{ id, name: '房间 ' + id }, ...history.value.filter((h) => h.id !== id)].slice(0, 20)
  roomId.value = ''
}

function close() {
  window.ipcRenderer && window.ipcRenderer.send(kind === 'huya' ? 'close-huya-control-window' : 'close-douyu-control-window')
}

onMounted(() => {
  // 演示数据
  history.value = [{ id: '660000', name: '知名主播' }, { id: '88088', name: '人气直播间' }]
  favs.value = [{ id: '719778', name: '我的关注主播' }]
})
</script>

<style scoped>
.ctrl {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: #f7f8fa;
}

.head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  background: #fff;
  border-bottom: 1px solid #e5e7eb;
}

.head h3 {
  margin: 0;
}

.mini {
  border: 1px solid #ddd;
  background: #fff;
  border-radius: 4px;
  padding: 3px 10px;
  cursor: pointer;
}

.row {
  display: flex;
  gap: 8px;
  padding: 12px 14px;
}

.input {
  flex: 1;
}

.frame {
  flex: 1;
  border: none;
  background: #fff;
}

.empty {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #999;
}

.history {
  padding: 10px 14px;
  border-top: 1px solid #eee;
  background: #fff;
}

.on {
  background: #07c160;
  color: #fff;
  border-color: #07c160;
}

.list {
  margin-top: 8px;
  max-height: 130px;
  overflow: auto;
}

.item {
  padding: 6px 8px;
  font-size: 13px;
  cursor: pointer;
  border-radius: 4px;
}

.item:hover {
  background: #f0f0f0;
}
</style>