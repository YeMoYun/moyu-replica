<template>
  <div class="home">
    <header class="top">
      <div class="logo">MoYuMaster <span>🐟</span></div>
      <button class="logout" type="button" @click="logout">退出登录</button>
    </header>

    <div v-if="appError" class="app-error" role="alert">{{ appError }}</div>

    <main class="dashboard">
      <section class="group">
        <h3>阅读模式</h3>
        <div class="grid">
          <button type="button" @click="open('weRead')">微信读书</button>
          <button type="button" @click="open('fanQue')">番茄小说</button>
          <button type="button" @click="open('jinJiang')">晋江文学城</button>
          <button type="button" @click="go('/bookReader')">本地阅读模式</button>
        </div>
      </section>

      <section class="group">
        <h3>网页模式</h3>
        <div class="grid">
          <button type="button" @click="open('web')">网页端</button>
          <button type="button" @click="open('zhihu')">知乎模式</button>
        </div>
      </section>

      <section class="group">
        <h3>视频模式</h3>
        <div class="grid video-grid">
          <button
            v-for="item in videoEntries"
            :key="item.key"
            type="button"
            @click="choosePlatform(item.key)"
          >
            {{ item.label }}模式
          </button>
          <button type="button" @click="open('customWebpage')">自定义网站模式</button>
          <button class="wide" type="button" @click="open('localVideo')">本地视频播放</button>
        </div>
      </section>

      <section class="group">
        <h3>游戏模式</h3>
        <div class="grid">
          <button type="button" @click="open('standaloneGame')">单机模式</button>
        </div>
      </section>

      <section class="group">
        <h3>伪装模式</h3>
        <div class="grid">
          <button type="button" @click="openRecentChat('wechat')">微信模式</button>
          <button type="button" @click="openRecentChat('dingtalk')">钉钉模式</button>
          <button type="button" @click="openRecentChat('feishu')">飞书模式</button>
        </div>
      </section>

      <section class="group">
        <h3>系统设置</h3>
        <div class="grid">
          <button type="button" @click="go('/userInfo')">个人中心</button>
          <button type="button" @click="go('/keyword')">快捷键设置</button>
          <button type="button" @click="clearCache">清除缓存</button>
          <button type="button" @click="showUnavailable('操作指南')">操作指南</button>
          <button type="button" @click="showUnavailable('联系客服')">联系客服</button>
        </div>
      </section>
    </main>

    <button class="ad-cover-entry" type="button" @click="showUnavailable('广告遮挡')">
      广告遮挡 →
    </button>

    <VideoModeDialog
      v-if="selectedPlatform"
      :platform="selectedPlatform"
      @close="selectedKey = ''"
      @select="openSelectedMode"
    />
  </div>
</template>

<script setup>
import { useRouter } from 'vue-router'
import { computed, onMounted, onUnmounted, ref } from 'vue'
import VideoModeDialog from '../components/VideoModeDialog.vue'
import { VIDEO_PLATFORM_ORDER, VIDEO_PLATFORMS } from '../../../shared/video-platforms.mjs'

const router = useRouter()
const api = window.homeElectronAPI || {}
const appError = ref('')
const selectedKey = ref('')
const videoEntries = VIDEO_PLATFORM_ORDER.map((key) => VIDEO_PLATFORMS[key])
const selectedPlatform = computed(() =>
  selectedKey.value ? VIDEO_PLATFORMS[selectedKey.value] : null
)
let unsubscribe = null

onMounted(async () => {
  if (window.windowControl) {
    unsubscribe = window.windowControl.onError((message) => {
      appError.value = message
    })
  }
  try {
    const status = await window.ipcRenderer.invoke('get-shortcut-status')
    if (!status.success) {
      appError.value =
        '快捷键未能启用：' +
        status.errors.map((error) => error.message).join('；') +
        '。请打开快捷键设置调整。'
    }
  } catch (error) {
    appError.value = '读取快捷键状态失败：' + error.message
  }
})

onUnmounted(() => {
  unsubscribe?.()
})

function go(path) {
  router.push(path)
}

function open(key) {
  const calls = {
    weRead: () => api.createWeRead(),
    weReadAd: () => window.adModeControl.open('weReadAd'),
    fanQue: () => api.createFanQue(),
    jinJiang: () => api.createJinJiang(),
    web: () => api.createWeb(),
    zhihu: () => api.createZhiHu(),
    customWebpage: () => api.createCustomWebpage(),
    localVideo: () => {
      const videoApi = window.localVideoAPI || {}
      if (videoApi.createLocalVideoWindow) videoApi.createLocalVideoWindow()
    },
    standaloneGame: () => api.createStandaloneGame(),
    excel: () => api.createExcel(),
    testPierce: () => window.ipcRenderer && window.ipcRenderer.invoke('create-test-pierce')
  }
  if (calls[key]) calls[key]()
}

function choosePlatform(key) {
  appError.value = ''
  selectedKey.value = key
}

async function openSelectedMode(mode) {
  const platform = selectedKey.value
  selectedKey.value = ''
  try {
    await window.videoModeControl.open(platform, mode)
  } catch (error) {
    appError.value = error.message
  }
}

async function openRecentChat(skin) {
  try {
    await window.videoModeControl.openRecentChat(skin)
  } catch (error) {
    appError.value = error.message
  }
}

function showUnavailable(name) {
  appError.value = `${name}入口已保留，当前版本未连接对应服务。`
}

function logout() {
  window.authApi && window.authApi.clearAllInfo()
  router.push('/login')
}

async function clearCache() {
  const { ipcRenderer } = window
  if (ipcRenderer && ipcRenderer.invoke) {
    await ipcRenderer.invoke('setting:setSetting', 'cacheCleared', Date.now())
  }
  alert('缓存已清除')
}
</script>

<style scoped>
.home {
  height: 100%;
  overflow: auto;
  color: #f7f8ff;
  background: radial-gradient(circle at 50% 0, #292b4b 0, #20223e 38%, #191a31 100%);
  font-family: "Microsoft YaHei", sans-serif;
}

.top {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  height: 118px;
}

.logo {
  font-size: 50px;
  font-weight: 800;
  letter-spacing: 1px;
  text-shadow: 0 4px 20px #0008;
}

.logo span {
  margin-left: 14px;
  font-size: 40px;
}

.logout {
  position: absolute;
  top: 28px;
  right: 28px;
  color: #fff;
  font-size: 15px;
  cursor: pointer;
  background: none;
  border: 0;
}

.app-error {
  margin: 0 30px 14px;
  padding: 10px 14px;
  color: #664d03;
  background: #fff3cd;
  border: 1px solid #d6b76a;
  border-radius: 8px;
}

.dashboard {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 24px;
  padding: 0 30px;
}

.group {
  min-height: 242px;
  padding: 22px 24px;
  background: #35364d;
  border: 1px solid #4b4d69;
  border-radius: 15px;
  box-shadow: 0 16px 30px #0c0d1b33;
}

.group h3 {
  margin: 0 0 17px;
  padding-bottom: 9px;
  color: #9db5ff;
  font-size: 24px;
  border-bottom: 1px solid #50516b;
}

.grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.grid button {
  min-height: 58px;
  color: #fff;
  font-size: 17px;
  cursor: pointer;
  background: #5b5c73;
  border: 1px solid transparent;
  border-radius: 12px;
}

.grid button:hover,
.grid button:focus-visible {
  background: #6b6d88;
  border-color: #a6aeec;
  outline: none;
}

.grid .wide {
  grid-column: 1 / -1;
}

.ad-cover-entry {
  display: block;
  margin: 32px auto;
  color: #4f9aff;
  font-size: 17px;
  cursor: pointer;
  background: none;
  border: 0;
}

@media (max-width: 900px) {
  .dashboard {
    grid-template-columns: 1fr 1fr;
  }

  .logo {
    font-size: 38px;
  }
}

@media (max-width: 620px) {
  .dashboard {
    grid-template-columns: 1fr;
  }

  .top {
    height: 96px;
  }
}
</style>
