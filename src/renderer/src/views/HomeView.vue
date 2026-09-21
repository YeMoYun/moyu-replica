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
      @close="closeModeDialog"
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
const shortcutError = ref('')
const actionError = ref('')
const appError = computed(() => [shortcutError.value, actionError.value].filter(Boolean).join(' '))
const selectedKey = ref('')
const videoEntries = VIDEO_PLATFORM_ORDER.map((key) => VIDEO_PLATFORMS[key])
const selectedPlatform = computed(() =>
  selectedKey.value ? VIDEO_PLATFORMS[selectedKey.value] : null
)
let unsubscribe = null
let operationToken = 0

onMounted(async () => {
  if (typeof window.windowControl?.onError === 'function') {
    const dispose = window.windowControl.onError((message) => {
      const token = beginAction()
      setActionFailure(token, '窗口操作', message)
    })
    if (typeof dispose === 'function') unsubscribe = dispose
  }
  try {
    const status = await callBridge(
      window.ipcRenderer,
      'invoke',
      '快捷键状态',
      'get-shortcut-status'
    )
    if (!status.success) {
      const errors = Array.isArray(status.errors) ? status.errors : []
      shortcutError.value =
        '快捷键未能启用：' +
        (errors.map((error) => readableError(error)).filter(Boolean).join('；') || '未知错误') +
        '。请打开快捷键设置调整。'
    } else {
      shortcutError.value = ''
    }
  } catch (error) {
    shortcutError.value = '读取快捷键状态失败：' + readableError(error)
  }
})

onUnmounted(() => {
  unsubscribe?.()
})

function go(path) {
  router.push(path)
}

function readableError(error) {
  if (typeof error === 'string' && error.trim()) return error.trim()
  if (typeof error?.message === 'string' && error.message.trim()) return error.message.trim()
  return '未知错误'
}

function callBridge(owner, method, name, ...args) {
  const handler = owner?.[method]
  if (typeof handler !== 'function') throw new Error(`${name}接口不可用`)
  return handler.apply(owner, args)
}

function beginAction() {
  const token = ++operationToken
  actionError.value = ''
  return token
}

function setActionFailure(token, action, error) {
  if (token !== operationToken) return
  actionError.value = `${action}失败：${readableError(error)}`
}

async function runAction(action, operation) {
  const token = beginAction()
  try {
    return await operation()
  } catch (error) {
    setActionFailure(token, action, error)
    return undefined
  }
}

function open(key) {
  const calls = {
    weRead: { action: '打开微信读书', run: () => callBridge(api, 'createWeRead', '微信读书') },
    weReadAd: { action: '打开微信读书广告模式', run: () => callBridge(window.adModeControl, 'open', '微信读书广告模式', 'weReadAd') },
    fanQue: { action: '打开番茄小说', run: () => callBridge(api, 'createFanQue', '番茄小说') },
    jinJiang: { action: '打开晋江文学城', run: () => callBridge(api, 'createJinJiang', '晋江文学城') },
    web: { action: '打开网页端', run: () => callBridge(api, 'createWeb', '网页端') },
    zhihu: { action: '打开知乎模式', run: () => callBridge(api, 'createZhiHu', '知乎模式') },
    customWebpage: { action: '打开自定义网站', run: () => callBridge(api, 'createCustomWebpage', '自定义网站') },
    localVideo: { action: '打开本地视频', run: () => callBridge(window.localVideoAPI, 'createLocalVideoWindow', '本地视频') },
    standaloneGame: { action: '打开单机模式', run: () => callBridge(api, 'createStandaloneGame', '单机模式') },
    excel: { action: '打开 Excel 模式', run: () => callBridge(api, 'createExcel', 'Excel 模式') },
    testPierce: { action: '打开穿透测试', run: () => callBridge(window.ipcRenderer, 'invoke', '穿透测试', 'create-test-pierce') }
  }
  const entry = calls[key]
  if (!entry) return runAction('打开入口', async () => { throw new Error('不支持的入口') })
  return runAction(entry.action, entry.run)
}

function choosePlatform(key) {
  beginAction()
  selectedKey.value = key
}

function closeModeDialog() {
  beginAction()
  selectedKey.value = ''
}

async function openSelectedMode(mode) {
  const platform = selectedKey.value
  selectedKey.value = ''
  const platformLabel = VIDEO_PLATFORMS[platform]?.label || '视频'
  const modeLabel = { ad: '广告', opacity: '透明度', wechat: '微信', dingtalk: '钉钉', feishu: '飞书' }[mode] || mode
  return runAction(`打开${platformLabel}${modeLabel}模式`, () =>
    callBridge(window.videoModeControl, 'open', '视频模式', platform, mode)
  )
}

async function openRecentChat(skin) {
  const skinLabel = { wechat: '微信', dingtalk: '钉钉', feishu: '飞书' }[skin] || skin
  return runAction(`打开${skinLabel}模式`, () =>
    callBridge(window.videoModeControl, 'openRecentChat', '伪装模式', skin)
  )
}

function showUnavailable(name) {
  beginAction()
  actionError.value = `${name}入口已保留，当前版本未连接对应服务。`
}

function logout() {
  window.authApi && window.authApi.clearAllInfo()
  router.push('/login')
}

async function clearCache() {
  return runAction('清除缓存', async () => {
    await callBridge(
      window.ipcRenderer,
      'invoke',
      '设置存储',
      'setting:setSetting',
      'cacheCleared',
      Date.now()
    )
    alert('缓存已清除')
  })
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
    flex-direction: column;
    gap: 8px;
    min-height: 116px;
    height: auto;
    padding: 16px 18px;
    box-sizing: border-box;
  }

  .logo {
    font-size: 31px;
  }

  .logo span {
    margin-left: 7px;
    font-size: 28px;
  }

  .logout {
    position: static;
    align-self: flex-end;
  }
}
</style>
