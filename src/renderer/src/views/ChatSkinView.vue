<template>
  <div class="chat" :class="kind">
    <!-- 左侧导航 -->
    <aside class="nav">
      <div class="avatars">
        <div v-for="t in navs" :key="t" class="nav-item" :class="{ active: activeNav === t }" @click="activeNav = t">
          {{ t[0] }}
        </div>
      </div>
      <div class="nav-foot">⚙</div>
    </aside>

    <!-- 会话列表 -->
    <section class="list">
      <div class="search">搜索</div>
      <div class="chats">
        <div
          v-for="(c, i) in chats"
          :key="i"
          class="chat-item"
          :class="{ current: i === currentChat }"
          @click="switchSite(c)"
        >
          <div class="avatar">{{ c.name[0] }}</div>
          <div class="meta">
            <span class="name">{{ c.name }}</span>
            <span class="msg">{{ c.last }}</span>
          </div>
        </div>
      </div>
    </section>

    <!-- 主区域：webview 内嵌站点 -->
    <main class="panel">
      <header class="panel-head">
        <span>{{ current.name }}</span>
        <div class="ops">
          <button class="mini" @click="switchSite(nextSite)">⇄ 切换</button>
          <button class="mini" @click="openConfig">⚙ 配置</button>
          <button class="mini" @click="closeWin">✕</button>
        </div>
      </header>
      <webview ref="wv" :src="current.url" class="content"></webview>
      <footer class="input">
        <span class="fake">发送(S)</span>
        <span class="hint">按下 Ctrl+Enter 换行</span>
      </footer>
    </main>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { SITES } from '../sites'

const route = useRoute()
const kind = route.meta.kind || 'wechat'
const isWechat = kind === 'wechat'

const navs = ['消息', '通讯录', '会议', '日历', '待办']
const activeNav = ref('消息')

const pool = computed(() => {
  const keys = isWechat ? ['fanQue', 'jinJiang', 'zhihu', 'bilibili'] : ['jinJiang', 'fanQue', 'douyu', 'huya']
  return keys.map((k) => ({ key: k, name: SITES[k] ? SITES[k].name : k, url: SITES[k] ? SITES[k].url : 'about:blank', last: '你有一条新内容' }))
})

const chats = ref([])
const current = ref({})
const currentChat = ref(0)

const control = isWechat ? (window.wechatControl || {}) : (window.dingdingControl || {})

function switchSite(c) {
  if (c) current.value = c
  const key = current.value.key
  if (isWechat && control.setCurrentSiteKey) control.setCurrentSiteKey(key)
  if (!isWechat && control.setCurrentSiteKey) control.setCurrentSiteKey(key)
}

function openConfig() {
  window.homeElectronAPI &&
    (isWechat ? window.homeElectronAPI.createWechatConfig() : window.homeElectronAPI.createDingdingConfig())
}

function closeWin() {
  window.ipcRenderer && window.ipcRenderer.send(isWechat ? 'close-wechat-window' : 'close-dingding-window')
}

onMounted(async () => {
  const saved = isWechat
    ? (window.wechatControl && (await window.wechatControl.getCurrentSiteKey())) || 'fanQue'
    : (window.dingdingControl && (await window.dingdingControl.getCurrentSiteKey())) || 'jinJiang'
  chats.value = pool.value.map((c) => ({ ...c, current: c.key === saved }))
  const idx = chats.value.findIndex((c) => c.key === saved)
  currentChat.value = idx >= 0 ? idx : 0
  current.value = chats.value[currentChat.value] || pool.value[0]
})
</script>

<style scoped>
.chat {
  height: 100%;
  display: flex;
  background: #f5f5f5;
  color: #191919;
}

.nav {
  width: 58px;
  background: #2e2e2e;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 10px 0;
  gap: 8px;
}

.nav-item {
  width: 38px;
  height: 38px;
  border-radius: 8px;
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  cursor: pointer;
}

.nav-item.active {
  background: #262626;
}

.nav-foot {
  margin-top: auto;
  color: #888;
}

.list {
  width: 220px;
  background: #e7e7e7;
  padding: 10px;
}

.search {
  background: #fff;
  border-radius: 4px;
  padding: 6px 10px;
  color: #bbb;
  font-size: 13px;
  margin-bottom: 10px;
}

.chat-item {
  display: flex;
  gap: 8px;
  padding: 8px;
  border-radius: 6px;
  cursor: pointer;
}

.chat-item.current {
  background: #c9e3f6;
}

.avatar {
  width: 36px;
  height: 36px;
  border-radius: 6px;
  background: #07c160;
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
}

.meta {
  display: flex;
  flex-direction: column;
  font-size: 13px;
}

.meta .msg {
  color: #999;
  font-size: 12px;
}

.panel {
  flex: 1;
  display: flex;
  flex-direction: column;
  background: #f5f5f5;
}

.panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  border-bottom: 1px solid #e0e0e0;
  font-size: 14px;
}

.ops {
  display: flex;
  gap: 6px;
}

.mini {
  border: 1px solid #d0d0d0;
  border-radius: 4px;
  background: #fff;
  font-size: 12px;
  padding: 3px 8px;
  cursor: pointer;
}

.content {
  flex: 1;
  border: none;
  background: #fff;
}

.input {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  border-top: 1px solid #e0e0e0;
  background: #f9f9f9;
  font-size: 13px;
  color: #666;
}

.hint {
  color: #bbb;
  font-size: 12px;
}
</style>