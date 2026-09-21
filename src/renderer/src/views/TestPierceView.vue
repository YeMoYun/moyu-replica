<template>
  <div class="pierce">
    <header class="bar">
      <span>穿透测试 · 百度首页</span>
      <button class="btn" @click="togglePierce">{{ pierce ? '关闭点击穿透' : '开启点击穿透' }}</button>
      <button class="mini" @click="toggleTransparent">{{ transparent ? '还原网页背景' : '设置网页透明' }}</button>
      <button class="mini" @click="close">关闭</button>
    </header>
    <p v-if="error" role="alert">{{ error }}</p>
    <webview ref="wv" src="https://www.baidu.com/" class="frame" @dom-ready="onReady"></webview>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'

const pierce = ref(false)
const error = ref('')
const subscriptions = []
const wv = ref(null)
const transparent = ref(false)
let cssKey = null

async function togglePierce() {
  try {
    const state = await window.ipcRenderer.invoke('testPierce:setPierceEnabled', !pierce.value)
    pierce.value = state.pierceEnabled
    error.value = ''
  } catch (failure) { error.value = failure.message || String(failure) }
}

async function toggleTransparent() {
  try {
    if (!wv.value) throw new Error('网页尚未就绪')
    if (cssKey) {
      await wv.value.removeInsertedCSS(cssKey)
      cssKey = null
      transparent.value = false
    } else {
      cssKey = await wv.value.insertCSS('html, body { background-color: rgba(0,0,0,0.001) !important; } * { background: transparent !important; }')
      transparent.value = true
    }
    error.value = ''
  } catch (failure) { error.value = failure.message || String(failure) }
}
async function onReady() {
  cssKey = null
  if (transparent.value) { transparent.value = false; await toggleTransparent() }
}
async function close() {
  try { await window.windowControl.close() }
  catch (failure) { error.value = failure.message || String(failure) }
}
onMounted(async () => {
  if (!window.windowControl) { error.value = '窗口控制桥不可用'; return }
  subscriptions.push(window.windowControl.onState((state) => { pierce.value = state.pierceEnabled }))
  subscriptions.push(window.windowControl.onError((message) => { error.value = message }))
  try { pierce.value = (await window.windowControl.getState()).pierceEnabled }
  catch (failure) { error.value = failure.message || String(failure) }
})
onUnmounted(() => { for (const unsubscribe of subscriptions) unsubscribe() })
</script>

<style scoped>
.pierce {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.bar {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  background: #f5f5f5;
  border-bottom: 1px solid #e5e5e5;
  font-size: 14px;
}

.mini {
  border: 1px solid #ddd;
  background: #fff;
  border-radius: 4px;
  padding: 4px 10px;
  cursor: pointer;
}

.frame {
  flex: 1;
  border: none;
}
</style>
