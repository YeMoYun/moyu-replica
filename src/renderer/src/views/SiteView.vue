<template>
  <div class="site">
    <!-- 控制栏 -->
    <div v-if="!hideBar" class="bar" :class="{ transparent: mode === 'opacity' }">
      <button class="mini" @click="back">←</button>
      <button class="mini" @click="forward">→</button>
      <button class="mini" @click="reload">⟳</button>
      <input v-model="address" class="addr" @keydown.enter="nav" placeholder="输入网址，回车前往" />
      <button class="mini" data-action="topmost" @click="toggleAlwaysOnTop">{{ controlState.alwaysOnTop ? '取消置顶' : '📌 置顶' }}</button>
      <button class="mini" data-action="opacity-down" @click="changeOpacity(-0.1)">▽ 透明</button>
      <button class="mini" data-action="opacity-up" @click="changeOpacity(0.1)">△ 不透明</button>
      <span>{{ Math.round(controlState.opacity * 100) }}%</span>
      <button class="mini" data-action="fullscreen" @click="fullscreen">{{ controlState.fullscreen ? '退出全屏' : '⛶ 窗口全屏' }}</button>
      <label><input type="checkbox" :checked="controlState.autoHideEnabled" @change="autoHide($event.target.checked)" />移出隐藏</label>
      <button class="mini" @click="hideBar = true">– 隐藏</button>
      <button class="mini" data-action="close" @click="closeWindow">✕ 关闭</button>
    </div>
    <button v-else class="restore-bar" @click="hideBar = false">显示操作栏</button>
    <div v-if="error" class="control-error" role="alert">{{ error }}</div>

    <!-- 广告浮层皮肤 -->
    <div v-if="mode === 'ad'" class="ad-skin">
      <span class="ad-tag">广 告</span>
      <span class="ad-text">精彩视频，更多详情点击进入</span>
      <button class="ad-close" @click="showAd = false">关闭广告</button>
    </div>

    <webview
      v-if="showAd"
      ref="wv"
      :src="targetUrl"
      class="frame"
      :class="{ 'o-mode': mode === 'opacity' }"
      allowpopups="false"
    ></webview>
    <div v-else class="frame empty">广告已关闭</div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRoute } from 'vue-router'
import { SITES } from '../sites'

const route = useRoute()
const hideBar = ref(false)
const showAd = ref(true)
const address = ref('')
const wv = ref(null)
const control = window.windowControl
const controlState = ref({ opacity: 1, alwaysOnTop: false, fullscreen: false, autoHideEnabled: false })
const error = ref('')
const unsubscribes = []

const siteKey = route.meta.site || 'web'
const mode = route.meta.mode || (route.meta.custom ? 'ad' : 'normal')
const site = SITES[siteKey] || { name: '网页', url: '' }

const targetUrl = computed(() => {
  const stored = localStorage.getItem(`moyu:lastUrl:${siteKey}`)
  return stored || site.url || 'about:blank'
})

defineExpose({ openUrl });

function openUrl(url) {
  localStorage.setItem(`moyu:lastUrl:${siteKey}`, url)
  address.value = url
  if (wv.value && wv.value.src) {
    try { wv.value.loadURL(url) } catch {}
  }
}

function back() { if (wv.value && wv.value.canGoBack) wv.value.goBack() }
function forward() { if (wv.value && wv.value.canGoForward) wv.value.goForward() }
function reload() { if (wv.value && wv.value.reload) wv.value.reload() }
function nav() {
  let u = address.value.trim()
  if (!u) return
  if (!/^https?:\/\//i.test(u)) u = 'https://' + u
  openUrl(u)
}
async function perform(operation) {
  error.value = ''
  try { const next = await operation(); if (next?.key) controlState.value = next }
  catch (failure) { error.value = failure.message || String(failure) }
}
function toggleAlwaysOnTop() { return perform(() => control.setAlwaysOnTop(!controlState.value.alwaysOnTop)) }
function changeOpacity(delta) { return perform(() => control.setOpacity(controlState.value.opacity + delta)) }
function fullscreen() { return perform(() => control.setFullscreen(!controlState.value.fullscreen)) }
function autoHide(value) { return perform(() => control.setAutoHide(value)) }
function closeWindow() { return perform(() => control.close()) }

function onKey(e) {
  if (e.key === 'Escape') hideBar.value = !hideBar.value
}

onMounted(() => {
  address.value = targetUrl.value
  window.addEventListener('keydown', onKey)
  if (control) {
    unsubscribes.push(control.onState((state) => { controlState.value = state }))
    unsubscribes.push(control.onError((message) => { error.value = message }))
    perform(() => control.getState())
  } else error.value = '窗口控制桥不可用，请通过 Electron 启动软件'
})
onUnmounted(() => {
  window.removeEventListener('keydown', onKey)
  for (const unsubscribe of unsubscribes) unsubscribe()
})
</script>

<style scoped>
.site {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: transparent;
}

.bar {
  flex-wrap: wrap;
  -webkit-app-region: drag;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 8px;
  background: rgba(250, 250, 250, 0.92);
  border-bottom: 1px solid #e5e7eb;
  user-select: none;
}
.bar button, .bar input, .bar label { -webkit-app-region: no-drag; }
.restore-bar { position: absolute; right: 8px; top: 8px; z-index: 20; cursor: pointer; }
.control-error { background: #fee2e2; color: #991b1b; padding: 8px; }

.bar.transparent {
  opacity: 0.15;
  transition: opacity 0.2s;
}

.bar.transparent:hover {
  opacity: 1;
}

.mini {
  border: 1px solid #ddd;
  background: #fff;
  border-radius: 6px;
  font-size: 13px;
  padding: 4px 8px;
  cursor: pointer;
}

.addr {
  flex: 1;
  font-size: 13px;
}

.ad-skin {
  position: absolute;
  top: 40px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 10;
  display: flex;
  align-items: center;
  gap: 10px;
  background: #fffbeb;
  border: 1px solid #fde68a;
  border-radius: 8px;
  padding: 6px 12px;
  font-size: 13px;
  color: #92400e;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

.ad-tag {
  background: #ef4444;
  color: #fff;
  border-radius: 4px;
  padding: 1px 6px;
  font-size: 12px;
}

.ad-close {
  border: none;
  background: #f59e0b;
  color: #fff;
  border-radius: 4px;
  padding: 2px 8px;
  cursor: pointer;
  font-size: 12px;
}

.frame {
  flex: 1;
  border: none;
  background: #fff;
}

.o-mode {
  background: transparent;
}

.empty {
  display: flex;
  align-items: center;
  justify-content: center;
  color: #888;
}
</style>
