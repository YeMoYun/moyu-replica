<template>
  <div
    ref="scrim"
    class="mode-scrim"
    tabindex="-1"
    @click.self="emit('close')"
    @keydown.escape.stop.prevent="handleKeydown"
    @keydown.tab="handleKeydown"
  >
    <section
      class="mode-dialog"
      role="dialog"
      aria-modal="true"
      :aria-label="`选择${platform.label}模式`"
    >
      <header>
        <h2>选择{{ platform.label }}模式</h2>
        <button
          ref="closeButton"
          type="button"
          aria-label="关闭模式选择"
          @click="close"
        >
          ×
        </button>
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
    required: true,
    validator: (value) => typeof value?.label === 'string' && value.label.trim().length > 0
  }
})

const emit = defineEmits(['close', 'select'])
const scrim = ref(null)
const closeButton = ref(null)
let previouslyFocused = null

const choose = (mode) => emit('select', mode)
const close = () => emit('close')
const focusableControls = () => Array.from(scrim.value?.querySelectorAll('button:not([disabled])') ?? [])
const handleKeydown = (event) => {
  if (event.key === 'Escape') {
    event.stopPropagation()
    event.preventDefault()
    close()
    return
  }

  if (event.key !== 'Tab') return
  const controls = focusableControls()
  const first = controls[0]
  const last = controls.at(-1)
  if (!first || !last) return

  const focusIsOutside = !scrim.value?.contains(document.activeElement)
  if (event.shiftKey && (document.activeElement === first || focusIsOutside)) {
    event.preventDefault()
    last.focus()
  } else if (!event.shiftKey && (document.activeElement === last || focusIsOutside)) {
    event.preventDefault()
    first.focus()
  }
}

onMounted(async () => {
  previouslyFocused = document.activeElement
  await nextTick()
  closeButton.value?.focus()
})

onBeforeUnmount(() => {
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
  overflow-y: auto;
  background: #090a14b8;
  backdrop-filter: blur(5px);
}

.mode-dialog {
  width: min(526px, 100%);
  max-height: calc(100dvh - 40px);
  overflow-y: auto;
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

@media (max-width: 560px) {
  .mode-scrim {
    padding: 12px;
  }

  .mode-dialog {
    max-height: calc(100dvh - 24px);
    border-radius: 15px;
  }

  header {
    height: 70px;
    padding: 0 18px;
  }

  h2 {
    font-size: 20px;
  }

  .mode-grid {
    grid-template-columns: 1fr;
    gap: 10px;
    padding: 18px;
  }

  .mode-button {
    height: 52px;
    font-size: 16px;
  }

  .feishu {
    grid-column: 1 / -1;
  }
}

@media (max-height: 520px) {
  .mode-scrim {
    padding: 8px;
  }

  .mode-dialog {
    max-height: calc(100dvh - 16px);
    border-radius: 13px;
  }

  header {
    height: 58px;
    padding: 0 16px;
  }

  h2 {
    font-size: 19px;
  }

  .mode-grid {
    gap: 8px;
    padding: 14px;
  }

  .mode-button {
    height: 44px;
    font-size: 16px;
  }
}
</style>
