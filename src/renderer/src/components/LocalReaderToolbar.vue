<template>
  <div class="local-reader-toolbar" :class="{ hidden: !showBar }">
    <svg class="icon-definitions" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <symbol id="lr-eye" viewBox="0 0 24 24"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></symbol>
        <symbol id="lr-close" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="m8 8 8 8m0-8-8 8"/></symbol>
        <symbol id="lr-pin" viewBox="0 0 24 24"><path d="m14 3 7 7-3 1-4 5-2-2-7 7-2-2 7-7-2-2 5-4Z"/></symbol>
        <symbol id="lr-hide" viewBox="0 0 24 24"><path d="M13 3H4v18h9m1-14 5 5-5 5m-6-5h11"/></symbol>
        <symbol id="lr-drop" viewBox="0 0 24 24"><path d="M12 3c-3 5-7 8-7 12a7 7 0 0 0 14 0c0-4-4-7-7-12Z"/></symbol>
        <symbol id="lr-shelf" viewBox="0 0 24 24"><path d="M4 4h5v16H4Zm11 0h5v16h-5ZM9 7h6M9 17h6"/></symbol>
        <symbol id="lr-toc" viewBox="0 0 24 24"><path d="M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01"/></symbol>
        <symbol id="lr-left" viewBox="0 0 24 24"><path d="m15 18-6-6 6-6"/></symbol>
        <symbol id="lr-right" viewBox="0 0 24 24"><path d="m9 18 6-6-6-6"/></symbol>
      </defs>
    </svg>

    <template v-if="showBar">
      <button type="button" data-action="hide-bar" title="隐藏操作栏" aria-label="隐藏操作栏" @click="hideBar"><svg><use href="#lr-eye"/></svg></button>
      <button type="button" data-action="close" title="关闭" aria-label="关闭" @click="trigger('close')"><svg><use href="#lr-close"/></svg></button>
      <button type="button" class="wide-control" data-action="topmost" :class="{ active: alwaysOnTop }" title="置顶" aria-label="置顶" @click="trigger('topmost')"><svg><use href="#lr-pin"/></svg></button>
      <button type="button" class="wide-control" data-action="auto-hide" :class="{ active: autoHideEnabled }" title="鼠标移出隐藏" aria-label="鼠标移出隐藏" @click="trigger('auto-hide')"><svg><use href="#lr-hide"/></svg></button>
      <button type="button" class="wide-control" data-action="opacity" title="窗口透明度" aria-label="窗口透明度" @click="toggleOpacity"><svg><use href="#lr-drop"/></svg></button>
      <button type="button" data-action="shelf" title="返回书架" aria-label="返回书架" @click="trigger('shelf')"><svg><use href="#lr-shelf"/></svg></button>
      <button type="button" class="medium-control" data-action="toc" title="目录" aria-label="目录" :disabled="tocDisabled" @click="trigger('toc')"><svg><use href="#lr-toc"/></svg></button>
      <button type="button" class="wide-control text-tool" data-action="font-down" title="缩小字号" aria-label="缩小字号" @click="trigger('font-down')">A−</button>
      <button type="button" class="wide-control text-tool" data-action="font-up" title="增大字号" aria-label="增大字号" @click="trigger('font-up')">A+</button>
      <span class="reader-title" :title="title">{{ title }}</span>
      <div class="drag-space"></div>
      <button type="button" class="wide-control" data-action="previous" title="上一章" aria-label="上一章" @click="trigger('previous')"><svg><use href="#lr-left"/></svg></button>
      <button type="button" class="wide-control" data-action="next" title="下一章" aria-label="下一章" @click="trigger('next')"><svg><use href="#lr-right"/></svg></button>
      <button type="button" class="more-button" data-action="more" :aria-expanded="showMore" @click="toggleMore">更多</button>
    </template>

    <template v-else>
      <button type="button" data-action="show-bar" title="显示操作栏" aria-label="显示操作栏" @click="showBar=true"><svg><use href="#lr-eye"/></svg></button>
      <div class="drag-space"></div>
    </template>

    <div v-if="showBar && showOpacity" class="toolbar-popover opacity-popover">
      <label><span>透明度</span><input type="range" min="0.1" max="1" step="0.01" :value="opacity" aria-label="窗口透明度" @input="emit('opacity', Number($event.target.value))"><output>{{ opacityLabel }}</output></label>
    </div>

    <div v-if="showBar && showMore" class="toolbar-popover more-popover">
      <button type="button" data-action="topmost" :class="{ active: alwaysOnTop }" @click="trigger('topmost')">置顶</button>
      <button type="button" data-action="auto-hide" :class="{ active: autoHideEnabled }" @click="trigger('auto-hide')">鼠标移出隐藏</button>
      <button type="button" data-action="opacity" @click="openOpacity">透明度</button>
      <button type="button" data-action="toc" :disabled="tocDisabled" @click="trigger('toc')">目录</button>
      <button type="button" data-action="font-down" @click="trigger('font-down')">缩小字号</button>
      <button type="button" data-action="font-up" @click="trigger('font-up')">增大字号</button>
      <button type="button" data-action="previous" @click="trigger('previous')">上一章</button>
      <button type="button" data-action="next" @click="trigger('next')">下一章</button>
    </div>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'

const props = defineProps({
  title: { type: String, default: '' },
  alwaysOnTop: Boolean,
  autoHideEnabled: Boolean,
  opacity: { type: Number, default: 1 },
  tocDisabled: Boolean
})
const emit = defineEmits([
  'close', 'topmost', 'auto-hide', 'opacity', 'shelf', 'toc',
  'font-down', 'font-up', 'previous', 'next'
])
const showBar = ref(true)
const showMore = ref(false)
const showOpacity = ref(false)
const opacityLabel = computed(() => `${Math.round(props.opacity * 100)}%`)

function trigger(action) {
  showMore.value = false
  emit(action)
}

function hideBar() {
  showMore.value = false
  showOpacity.value = false
  showBar.value = false
}

function toggleMore() {
  showOpacity.value = false
  showMore.value = !showMore.value
}

function toggleOpacity() {
  showMore.value = false
  showOpacity.value = !showOpacity.value
}

function openOpacity() {
  showMore.value = false
  showOpacity.value = true
}
</script>

<style scoped>
.local-reader-toolbar{height:30px;flex:none;display:flex;align-items:center;gap:6px;padding:0 8px;background:#1a202c;color:#fff;position:relative;user-select:none;border-bottom:1px solid #4a5568}
.local-reader-toolbar.hidden{background:transparent;border-bottom-color:rgba(255,255,255,.1)}
.icon-definitions{position:absolute;width:0;height:0;overflow:hidden}
.drag-space{height:100%;flex:1;min-width:4px;-webkit-app-region:drag}
button,input,.toolbar-popover{-webkit-app-region:no-drag}
button{height:22px;min-width:22px;padding:0 4px;border:0;border-radius:4px;background:transparent;color:inherit;display:inline-flex;align-items:center;justify-content:center;cursor:pointer}
button:hover,button.active{background:rgba(255,255,255,.15)}
button:disabled{opacity:.45;cursor:not-allowed}
button svg{width:16px;height:16px;fill:none;stroke:currentColor;stroke-width:1.6;stroke-linecap:round;stroke-linejoin:round}
.text-tool{font-size:11px;white-space:nowrap}
.reader-title{min-width:0;max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px}
.more-button{font-size:11px;padding:0 7px;white-space:nowrap}
.toolbar-popover{position:absolute;top:32px;right:6px;z-index:30;background:#2d3748;border:1px solid #4a5568;border-radius:7px;padding:8px;box-shadow:0 10px 28px rgba(0,0,0,.35)}
.opacity-popover label{display:flex;align-items:center;gap:8px;font-size:12px;white-space:nowrap}
.opacity-popover input{width:130px;padding:0;accent-color:#fff}
.opacity-popover output{min-width:34px;text-align:right}
.more-popover{display:grid;grid-template-columns:repeat(2,minmax(88px,1fr));gap:5px;width:210px}
.more-popover button{justify-content:flex-start;padding:0 8px;background:rgba(255,255,255,.06);font-size:12px}
@media (max-width:559px){.wide-control{display:none}.reader-title{max-width:90px}.more-popover .wide-control{display:flex}}
@media (max-width:359px){.medium-control,.reader-title{display:none}}
</style>
