<template>
  <div class="wx">
    <div class="card">
      <h1>MoYuMaster 🐟</h1>
      <p class="sub">微信扫码登录（新用户扫码后关注公众号即可登录）</p>
      <img v-if="qr" :src="qr" class="qr" />
      <div v-else class="qr loading">二维码加载中…</div>
      <button class="btn ghost full" @click="back">返回账号登录</button>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import axios from 'axios'

const router = useRouter()
const API = 'https://www.zxjy1234.com/admin-api'
const qr = ref('')
let timer = null

async function load() {
  try {
    const r = await axios.get(`${API}/wx/web/qrcode`, { timeout: 8000 })
    if (r.data && r.data.url) {
      qr.value = r.data.url // 二维码图片 URL
      poll(r.data.uuid)
    }
  } catch {
    qr.value = ''
  }
}

async function poll(uuid) {
  clearInterval(timer)
  timer = setInterval(async () => {
    try {
      const r = await axios.get(`${API}/wx/web/uuid/login`, { params: { uuid }, timeout: 6000 })
      if (r.data && r.data.token) {
        await window.authApi.setToken(r.data.token)
        clearInterval(timer)
        router.replace('/home')
      }
    } catch {}
  }, 2500)
}

function back() {
  router.push('/login')
}

onMounted(load)
onUnmounted(() => clearInterval(timer))
</script>

<style scoped>
.wx {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(160deg, #d1fae5, #e0f2fe);
}

.card {
  width: 380px;
  background: #fff;
  border-radius: 16px;
  padding: 30px;
  text-align: center;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.12);
}

h1 {
  margin: 0;
}

.sub {
  color: #888;
  font-size: 13px;
}

.qr {
  width: 240px;
  height: 240px;
  margin: 18px auto;
  display: block;
  border: 1px solid #eee;
  border-radius: 8px;
}

.loading {
  color: #999;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #fafafa;
}

.full {
  width: 100%;
}
</style>