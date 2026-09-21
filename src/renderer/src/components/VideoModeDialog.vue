<template>
  <div
    ref="scrim"
    class="mode-scrim"
    tabindex="-1"
    @click.self="emit('close')"
    @keydown.escape.stop.prevent="emit('close')"
  >
    <section
      class="mode-dialog"
      role="dialog"
      aria-modal="true"
      :aria-label="`选择${platform.label}模式`"
    >
      <header>
        <h2>选择{{ platform.label }}模式</h2>
        <button type="button" aria-label="关闭模式选择" @click="emit('close')">×</button>
      </header>
      <div class="mode-grid">
        <button type="button" class="mode-button" @click="choose('ad')">广告模式</button>
        <button type="button" class="mode-button" @click="choose('opacity')">
          透明度模式
        </button>
        <button type="button" class="mode-button" @click="choose('wechat')">
          微信模式
        </button>
        <button type="button" class="mode-button" @click="choose('dingtalk')">
          钉钉模式
        </button>
        <button type="button" class="mode-button feishu" @click="choose('feishu')">
          飞书模式
        </button>
      </div>
    </section>
  </div>
</template>

<script setup>
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue'

defineProps({
  platform: {
    type: Object,
    required: true
  }
})

const emit = defineEmits(['close', 'select'])
const scrim = ref(null)
let previouslyFocused = null

const choose = (mode) => emit('select', mode)
const escape = (event) => {
  if (event.key === 'Escape') emit('close')
}

onMounted(async () => {
  previouslyFocused = document.activeElement
  document.addEventListener('keydown', escape)
  await nextTick()
  scrim.value?.focus()
})

onBeforeUnmount(() => {
  document.removeEventListener('keydown', escape)
  previouslyFocused?.focus?.()
})
</script>

<style scoped>
.mode-scrim {
  position: fixed;
  inset: 0;
  z-index: 100;
  display: grid;
  place-items: center;
  padding: 20px;
  background: #090a14b8;
  backdrop-filter: blur(5px);
}

.mode-dialog {
  width: min(526px, 100%);
  overflow: hidden;
  color: #fff;
  background: #2d2e45;
  border: 1px solid #555873;
  border-radius: 20px;
  box-shadow: 0 30px 70px #050611a8;
}

header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 90px;
  padding: 0 30px;
  border-bottom: 1px solid #474961;
}

h2 {
  margin: 0;
  font-size: 24px;
}

header button {
  color: #fff;
  font-size: 31px;
  cursor: pointer;
  background: none;
  border: 0;
}

.mode-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px;
  padding: 30px;
}

.mode-button {
  height: 62px;
  color: #fff;
  font-size: 18px;
  cursor: pointer;
  background: #46485d;
  border: 1px solid #70738e;
  border-radius: 13px;
}

.mode-button:hover,
.mode-button:focus-visible {
  background: #565970;
  border-color: #9fa7dc;
  outline: none;
}

.feishu {
  grid-column: 1 / -1;
  background: #424b67;
  border-color: #7588c8;
}
</style>
