<template>
  <div class="cfg">
    <header class="head">
      <h3>{{ title }}聊天数据配置</h3>
      <button class="btn" @click="save">保存配置</button>
    </header>

    <div class="form">
      <label>联系人（每行一个：名字）</label>
      <textarea v-model="contacts" rows="6" placeholder="张三&#10;李四&#10;王五"></textarea>

      <label>近期消息（每行一条：名字|内容）</label>
      <textarea v-model="messages" rows="8" placeholder="张三|在吗？"></textarea>

      <label>发送按钮文案</label>
      <input v-model="sendText" />

      <label>站点选择</label>
      <select v-model="siteKey">
        <option v-for="(s, k) in sites" :key="k" :value="k">{{ s.name }}</option>
      </select>
    </div>

    <div class="preview">
      <h4>预览</h4>
      <div class="pv-item" v-for="m in previewList" :key="m">{{ m }}</div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { SITES } from '../sites'

const route = useRoute()
const isWechat = route.meta.kind === 'wechat'
const title = isWechat ? '微信' : '钉钉'
const api = isWechat ? window.wechatConfigApi || {} : window.dingdingConfigApi || {}

const sites = SITES
const contacts = ref('')
const messages = ref('')
const sendText = ref('发送(S)')
const siteKey = ref('fanQue')

const previewList = computed(() =>
  messages.value.split('\n').filter((l) => l.trim()).slice(0, 5)
)

async function save() {
  const cfg = {
    contacts: contacts.value.split('\n').map((s) => s.trim()).filter(Boolean),
    messages: messages.value.split('\n').map((s) => s.trim()).filter(Boolean),
    sendText: sendText.value,
    siteKey: siteKey.value
  }
  try {
    await api.applyChatConfig(cfg)
    if (isWechat && window.wechatControl) await window.wechatControl.setCurrentSiteKey(cfg.siteKey)
    if (!isWechat && window.dingdingControl) await window.dingdingControl.setCurrentSiteKey(cfg.siteKey)
    alert('已保存')
  } catch {
    alert('保存失败')
  }
}

onMounted(async () => {
  try {
    const cfg = await api.getCurrentConfig()
    if (cfg) {
      contacts.value = (cfg.contacts || []).join('\n')
      messages.value = (cfg.messages || []).join('\n')
      sendText.value = cfg.sendText || sendText.value
      siteKey.value = cfg.siteKey || siteKey.value
    }
  } catch {}
})
</script>

<style scoped>
.cfg {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: #f7f8fa;
  padding: 14px;
  gap: 10px;
}

.head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.head h3 {
  margin: 0;
}

.form {
  background: #fff;
  border-radius: 10px;
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

label {
  font-size: 13px;
  color: #555;
}

textarea,
input {
  width: 100%;
}

.preview {
  background: #fff;
  border-radius: 10px;
  padding: 12px;
}

.preview h4 {
  margin: 0 0 8px;
  font-size: 13px;
  color: #666;
}

.pv-item {
  background: #f0f0f0;
  border-radius: 6px;
  padding: 6px 10px;
  margin-bottom: 6px;
  font-size: 13px;
}
</style>