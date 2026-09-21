<template>
  <div class="kw">
    <h3>⚙️ 快捷键设置</h3>
    <div class="rows">
      <div v-for="item in list" :key="item.key" class="row">
        <span>{{ item.label }}</span>
        <input v-model="items[item.key]" :placeholder="SHORTCUTS[item.key]" :disabled="saving" />
      </div>
    </div>
    <div class="btns">
      <button class="btn" :disabled="saving" @click="save">保存设置</button>
      <button class="btn ghost" :disabled="saving" @click="reset">恢复默认</button>
    </div>
    <p>留空可禁用对应快捷键；保存后立即生效。</p>
    <p v-if="message" role="status">{{ message }}</p>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { SHORTCUTS, normalizeShortcuts } from '../../../shared/shortcuts.mjs'

const labels = {
  boss: '老板键',
  opacityUp: '透明度增加',
  opacityDown: '透明度减少',
  allPrev: '上一个 / 上一页',
  allNext: '下一个 / 下一页',
  allScreen: '全屏',
  allLike: '点赞',
  bindSoft: '绑定软件',
  stopOrContinue: '停止 / 继续'
}

const list = Object.keys(SHORTCUTS).map((k) => ({ key: k, label: labels[k] }))
const items = reactive({ ...SHORTCUTS })
const saving = ref(false)
const message = ref('')

async function save() {
  if (saving.value) return
  saving.value = true
  message.value = ''
  try {
    const result = await window.ipcRenderer.invoke('set-shortcuts', { ...items })
    if (!result || !result.success) {
      message.value = '保存失败：' + (result?.errors?.map((error) => error.message).join('；') || '未收到成功确认')
      return
    }
    Object.assign(items, result.shortcuts)
    message.value = '已保存并立即生效'
  } catch (error) {
    message.value = `保存失败：${error.message || error}`
  } finally {
    saving.value = false
  }
}

async function reset() {
  Object.assign(items, SHORTCUTS)
  await save()
}

onMounted(async () => {
  try {
    const cur = (await window.ipcRenderer.invoke('get-shortcuts')) || SHORTCUTS
    Object.assign(items, normalizeShortcuts(cur))
  } catch (error) {
    message.value = `读取快捷键失败：${error.message || error}；未更改已保存设置`
  }
})
</script>

<style scoped>
.kw {
  padding: 16px;
  background: #f7f8fa;
  height: 100%;
  overflow: auto;
}

.rows {
  background: #fff;
  border-radius: 10px;
  padding: 10px 14px;
}

.row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 0;
  border-bottom: 1px solid #f0f0f0;
}

.row input {
  width: 200px;
  text-align: center;
}

.btns {
  margin-top: 14px;
  display: flex;
  gap: 10px;
  justify-content: center;
}
</style>
