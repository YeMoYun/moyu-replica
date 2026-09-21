<template>
  <div class="upd">
    <div class="logo">MoYuMaster 🐟</div>
    <div class="status">{{ text }}</div>
    <button v-if="showAction" class="btn" @click="go">前往更新</button>
    <button v-else class="btn ghost" @click="home">进入软件</button>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'

const router = useRouter()
const text = ref('检查更新中…')
const showAction = ref(false)

function home() {
  router.replace('/home')
}

function go() {
  home()
}

onMounted(() => {
  setTimeout(() => {
    text.value = '当前已是最新版本 1.0.0'
    showAction.value = false
    setTimeout(() => home(), 600)
  }, 1200)
})
</script>

<style scoped>
.upd {
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 20px;
  background: linear-gradient(160deg, #d1fae5, #e0f2fe);
}

.logo {
  font-size: 30px;
  font-weight: 800;
}

.status {
  color: #666;
}
</style>