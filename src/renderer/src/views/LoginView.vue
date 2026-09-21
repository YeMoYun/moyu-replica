<template>
  <div class="login">
    <div class="card">
      <h1>MoYuMaster 🐟</h1>
      <p class="sub">工作再忙，也要抽空登录摸个鱼~</p>

      <label>账号</label>
      <input v-model="username" placeholder="请输入账号" />

      <label>密码</label>
      <input v-model="password" type="password" placeholder="请输入密码" />

      <label>验证码</label>
      <div class="caprow">
        <input v-model="code" placeholder="验证码" />
        <img v-if="captchaImg" :src="captchaImg" class="cap" title="点击更换" @click="loadCaptcha" />
        <button v-else class="btn ghost" @click="loadCaptcha">获取验证码</button>
      </div>

      <label class="remember"><input type="checkbox" v-model="remember" /> 记住密码</label>

      <button class="btn login-btn" :disabled="loading" @click="login">
        {{ loading ? '登录中…' : '登 录' }}
      </button>

      <div class="links">
        <a @click="wx">微信登录</a>
        <a @click="offline">离线进入</a>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import axios from 'axios'

const router = useRouter()
const API = 'https://www.zxjy1234.com/admin-api'
const auth = window.authApi || {}

const username = ref('')
const password = ref('')
const code = ref('')
const captchaImg = ref('')
const uuid = ref('')
const remember = ref(true)
const loading = ref(false)

async function loadCaptcha() {
  try {
    const r = await axios.get(`${API}/captchaImage`, { timeout: 8000 })
    if (r.data && r.data.img) {
      captchaImg.value = 'data:image/gif;base64,' + r.data.img
      uuid.value = r.data.uuid
    }
  } catch {
    captchaImg.value = ''
  }
}

async function login() {
  loading.value = true
  try {
    const r = await axios.post(`${API}/login`, {
      username: username.value,
      password: password.value,
      code: code.value,
      uuid: uuid.value
    }, { timeout: 10000 })
    const token = r.data && r.data.token
    if (token) {
      await auth.setToken(token)
      if (remember.value) {
        await auth.rememberUserName(username.value)
        await auth.rememberPassword(password.value)
      }
      router.push('/home')
      return
    }
    alert((r.data && r.data.msg) || '登录失败')
  } catch (e) {
    alert('登录服务不可用：' + (e.message || '网络错误') + '\n可点击「离线进入」继续使用')
  } finally {
    loading.value = false
  }
}

function wx() {
  router.push('/wxlogin')
}

function offline() {
  router.push('/home')
}

onMounted(async () => {
  loadCaptcha()
  try {
    const u = await auth.getUserName()
    const p = await auth.getPassword()
    if (u) username.value = u
    if (p) password.value = p
    const t = await auth.getToken()
    if (t) router.replace('/home')
  } catch {}
})
</script>

<style scoped>
.login {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(160deg, #d1fae5, #e0f2fe);
}

.card {
  width: 360px;
  background: #fff;
  border-radius: 16px;
  padding: 30px 28px;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.12);
}

h1 {
  margin: 0;
  text-align: center;
  font-size: 24px;
}

.sub {
  text-align: center;
  color: #888;
  font-size: 13px;
  margin: 8px 0 20px;
}

label {
  display: block;
  font-size: 13px;
  color: #555;
  margin: 12px 0 4px;
}

input {
  width: 100%;
}

.caprow {
  display: flex;
  gap: 8px;
}

.caprow input {
  flex: 1;
}

.cap {
  height: 36px;
  border-radius: 6px;
  cursor: pointer;
  border: 1px solid #ddd;
}

.remember {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
}

.login-btn {
  width: 100%;
  margin-top: 18px;
  padding: 12px;
  font-size: 16px;
}

.links {
  display: flex;
  justify-content: space-between;
  margin-top: 14px;
  font-size: 13px;
}

.links a {
  color: #07c160;
  cursor: pointer;
}
</style>