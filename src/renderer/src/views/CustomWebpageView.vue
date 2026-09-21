<template>
  <div class="custom">
    <header class="bar">
      <input v-model="url" placeholder="输入网址" class="addr" @keydown.enter="nav" />
      <button class="mini" @click="nav">前往</button>
      <button class="mini" @click="fontColor = fontColor === '#ffffff' ? '#000000' : '#ffffff'">改字色</button>
      <button class="mini" @click="bg = bg === '#000000' ? '#ffffff' : '#000000'">改背景</button>
      <button class="mini" @click="reset">恢复默认</button>
      <button class="mini" @click="store">保存样式</button>
    </header>
    <webview ref="wv" :src="url" class="frame"></webview>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'

const url = ref('https://www.baidu.com/')
const fontColor = ref('#ffffff')
const bg = ref('#000000')

function nav() {
  let u = url.value.trim()
  if (!u) return
  if (!/^https?:\/\//i.test(u)) u = 'https://' + u
  url.value = u
  try {
    if (wv.value && wv.value.loadURL) wv.value.loadURL(u)
  } catch {}
}

function reset() {
  fontColor.value = '#ffffff'
  bg.value = '#000000'
}

function store() {
  localStorage.setItem('moyu:customPageStyle', JSON.stringify({ fontColor: fontColor.value, bg: bg.value }))
  alert('样式已保存')
}

onMounted(() => {
  const s = localStorage.getItem('moyu:customPageStyle')
  if (s) {
    try {
      const o = JSON.parse(s)
      fontColor.value = o.fontColor
      bg.value = o.bg
    } catch {}
  }
  const last = localStorage.getItem('moyu:lastUrl:customWebpage')
  if (last) url.value = last
})
</script>

<style scoped>
.custom {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: transparent;
}

.bar {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 8px;
  background: rgba(30, 30, 30, 0.85);
}

.addr {
  flex: 1;
}

.mini {
  border: 1px solid #555;
  background: #333;
  color: #fff;
  border-radius: 4px;
  padding: 4px 10px;
  cursor: pointer;
}

.frame {
  flex: 1;
  border: none;
  filter: invert(1) hue-rotate(180deg);
  background: #111;
}
</style>