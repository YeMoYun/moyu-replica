<template>
  <div class="home">
    <header class="top">
      <div class="logo">MoYuMaster 🐟</div>
      <div class="actions">
        <button class="btn ghost" @click="go('/userInfo')">个人中心</button>
        <button class="btn ghost" @click="go('/pay')">升级为Pro版本</button>
        <button class="btn danger" @click="logout">退出登录</button>
      </div>
    </header>
    <div v-if="appError" class="app-error" role="alert">{{ appError }}</div>

    <main>
      <section class="group">
        <h3>📖 阅读模式</h3>
        <div class="grid">
          <button class="tile" @click="open('weRead')">微信读书</button>
          <button class="tile" @click="open('weReadAd')">微信读书广告模式</button>
          <button class="tile" @click="open('fanQue')">番茄小说</button>
          <button class="tile" @click="open('jinJiang')">晋江文学城</button>
          <button class="tile" @click="go('/bookReader')">本地阅读模式</button>
        </div>
      </section>

      <section class="group">
        <h3>🌐 网页模式</h3>
        <div class="grid">
          <button class="tile" @click="open('web')">网页端</button>
          <button class="tile" @click="open('zhihu')">知乎模式</button>
          <button class="tile" @click="open('customWebpage')">自定义网页</button>
        </div>
      </section>

      <section class="group">
        <h3>🎬 视频模式</h3>
        <div class="grid">
          <button class="tile" @click="open('douyinOpacity')">抖音透明化</button>
          <button class="tile" @click="open('douyinAd')">抖音广告模式</button>
          <button class="tile" @click="open('douyinWechat')">抖音微信模式</button>
          <button class="tile" @click="open('bilibiliOpacity')">B站透明化</button>
          <button class="tile" @click="open('huyaOpacity')">虎牙透明化</button>
          <button class="tile" @click="open('douyu')">斗鱼直播</button>
          <button class="tile" @click="open('kuaishouOpacity')">快手透明化</button>
          <button class="tile" @click="open('localVideo')">本地视频播放</button>
        </div>
      </section>

      <section class="group">
        <h3>🎮 游戏与伪装</h3>
        <div class="grid">
          <button class="tile" @click="open('standaloneGame')">单机模式</button>
          <button class="tile" @click="open('wechat')">微信模式</button>
          <button class="tile" @click="open('dingding')">钉钉模式</button>
          <button class="tile" @click="open('feishu')">飞书模式</button>
          <button class="tile" @click="open('excel')">Excel 伪装</button>
        </div>
      </section>

      <section class="group">
        <h3>⚙️ 系统设置</h3>
        <div class="grid">
          <button class="tile" @click="go('/keyword')">快捷键设置</button>
          <button class="tile" @click="open('testPierce')">穿透测试</button>
          <button class="tile" @click="clearCache">清除缓存</button>
        </div>
      </section>
    </main>
  </div>
</template>

<script setup>
import { useRouter } from 'vue-router'
import { ref, onMounted, onUnmounted } from 'vue'

const router = useRouter()
const api = window.homeElectronAPI || {}
const appError = ref('')
let unsubscribe = null
onMounted(async () => {
  if (window.windowControl) unsubscribe = window.windowControl.onError((message) => { appError.value = message })
  try {
    const status = await window.ipcRenderer.invoke('get-shortcut-status')
    if (!status.success) appError.value = '快捷键未能启用：' + status.errors.map((error) => error.message).join('；') + '。请打开快捷键设置调整。'
  } catch (error) { appError.value = '读取快捷键状态失败：' + error.message }
})
onUnmounted(() => { unsubscribe?.() })

function go(path) {
  router.push(path)
}

function open(key) {
  const calls = {
    weRead: () => api.createWeRead(),
    weReadAd: () => window.adModeControl.open('weReadAd'),
    douyinAd: () => window.adModeControl.open('douyin'),
    douyinWechat: () => window.chatModeControl.open().catch(error=>{ appError.value=error.message }),
    fanQue: () => api.createFanQue(),
    jinJiang: () => api.createJinJiang(),
    web: () => api.createWeb(),
    zhihu: () => api.createZhiHu(),
    customWebpage: () => api.createCustomWebpage(),
    douyinOpacity: () => api.createDouyinOpacity(),
    bilibiliOpacity: () => api.createBilibiliOpacity(),
    huyaOpacity: () => api.createHuyaOpacity(),
    douyu: () => api.createDouyuControl(),
    kuaishouOpacity: () => api.createKuaishou(),
    localVideo: () => {
      const v = window.localVideoAPI || {}
      if (v.createLocalVideoWindow) v.createLocalVideoWindow()
    },
    standaloneGame: () => api.createStandaloneGame(),
    wechat: () => api.createWechat(),
    dingding: () => window.dingtalkModeControl.open().catch(error=>{ appError.value=error.message }),
    feishu: () => window.feishuModeControl.open().catch(error=>{ appError.value=error.message }),
    excel: () => api.createExcel(),
    testPierce: () => window.ipcRenderer && window.ipcRenderer.invoke('create-test-pierce')
  }
  if (calls[key]) calls[key]()
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
  display: flex;
  flex-direction: column;
  background: linear-gradient(160deg, #f0fdf4 0%, #e0f2fe 100%);
}
.app-error { padding: 10px 20px; background: #fff3cd; color: #664d03; font-size: 13px; }

.top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 20px;
  background: rgba(255, 255, 255, 0.85);
  backdrop-filter: blur(8px);
  border-bottom: 1px solid #e5e7eb;
}

.logo {
  font-size: 20px;
  font-weight: 700;
}

main {
  flex: 1;
  overflow: auto;
  padding: 18px 22px;
}

.group h3 {
  margin: 14px 0 10px;
  font-size: 15px;
  color: #374151;
}

.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 10px;
}

.tile {
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  padding: 16px 10px;
  background: #fff;
  font-size: 14px;
  cursor: pointer;
  transition: transform 0.12s, box-shadow 0.12s;
}

.tile:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.1);
}
</style>
