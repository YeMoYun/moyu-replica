<template>
  <router-view />
  <div v-if="resizeReady" ref="resizeHost" class="window-resize-layer" aria-hidden="true"></div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { createResizeSession, mountResizeHandles } from './features/window-resize/resize-handles.mjs'

// 所有透明功能窗口的边缘缩放手柄在此统一挂载：主进程按窗口归属返回能力，
// 手柄只覆盖窗口最外圈（pointer-events 穿透），不干扰页面内容与其他控件。
const resizeHost = ref(null)
const resizeReady = ref(false)
let disposeResize = null
onMounted(async () => {
  if (!window.windowControl) return
  try {
    const capabilities = await window.windowControl.getResizeCapabilities()
    if (!capabilities?.handles) return
    resizeReady.value = true
    await Promise.resolve()
    if (!resizeHost.value) return
    disposeResize = mountResizeHandles({ host: resizeHost.value, session: createResizeSession({
      begin: (directions, cursor) => { window.windowControl.setLiveResizeBegin(directions, cursor).catch(() => {}) },
      apply: (cursor) => { window.windowControl.setLiveResize(cursor).catch(() => {}) },
      commit: () => { window.windowControl.setLiveResizeEnd().catch(() => {}) }
    }) })
  } catch { /* 能力探测失败时保持原生行为 */ }
})
onUnmounted(() => { disposeResize?.(); disposeResize = null })
</script>

<style>
.window-resize-layer{position:fixed;inset:0;pointer-events:none;z-index:60}
.window-resize-layer .window-resize-handle{pointer-events:auto}
</style>
