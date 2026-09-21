import { contextBridge, ipcRenderer } from 'electron'
import { createEventSubscriptions } from './events.mjs'

// 复刻 MoYuMaster 的 preload 桥。保持与原版同名 API，让渲染层调用一致。
const subscriptions = createEventSubscriptions(ipcRenderer)
const on = (channel) => (cb) => subscriptions.on(channel, cb)

contextBridge.exposeInMainWorld('chatModeControl', {
  open: address => ipcRenderer.invoke('chat-mode:open', address),
  get: () => ipcRenderer.invoke('chat-mode:get'),
  save: (state, revision) => ipcRenderer.invoke('chat-mode:save', state, revision),
  getRuntime: () => ipcRenderer.invoke('chat-mode:state'),
  close: () => ipcRenderer.invoke('chat-mode:close'),
  onState: on('chat-mode:updated'),
  onBoss: on('chat-mode:boss'),
  onError: on('chat-mode:error')
})

contextBridge.exposeInMainWorld('dingtalkModeControl', {
  open: address => ipcRenderer.invoke('dingtalk-mode:open', address),
  get: () => ipcRenderer.invoke('dingtalk-mode:get'),
  save: (state, revision) => ipcRenderer.invoke('dingtalk-mode:save', state, revision),
  getRuntime: () => ipcRenderer.invoke('dingtalk-mode:state'),
  close: () => ipcRenderer.invoke('dingtalk-mode:close'),
  onState: on('dingtalk-mode:updated'),
  onBoss: on('chat-mode:boss'),
  onError: on('chat-mode:error')
})

contextBridge.exposeInMainWorld('feishuModeControl', {
  open: address => ipcRenderer.invoke('feishu-mode:open', address),
  get: () => ipcRenderer.invoke('feishu-mode:get'),
  save: (state, revision) => ipcRenderer.invoke('feishu-mode:save', state, revision),
  getRuntime: () => ipcRenderer.invoke('feishu-mode:state'),
  close: () => ipcRenderer.invoke('feishu-mode:close'),
  onState: on('feishu-mode:updated'),
  onBoss: on('chat-mode:boss'),
  onError: on('chat-mode:error')
})

contextBridge.exposeInMainWorld('adModeControl', {
  open: key => ipcRenderer.invoke('ad-mode:open',key),
  getState: () => ipcRenderer.invoke('ad-mode:get-state'),
  getSettings: () => ipcRenderer.invoke('ad-mode:get-settings'),
  saveSettings: patch => ipcRenderer.invoke('ad-mode:save-settings',patch),
  expand: () => ipcRenderer.invoke('ad-mode:expand'),
  close: () => ipcRenderer.invoke('ad-mode:close'),
  openTransparent: url => ipcRenderer.invoke('ad-mode:open-transparent',url),
  onState: on('ad-mode:state'),
  onError: on('ad-mode:error')
})

contextBridge.exposeInMainWorld('windowControl', {
  getState: () => ipcRenderer.invoke('window-control:get-state'),
  setOpacity: (value) => ipcRenderer.invoke('window-control:set-opacity', value),
  setAlwaysOnTop: (value) => ipcRenderer.invoke('window-control:set-topmost', value),
  setFullscreen: (value) => ipcRenderer.invoke('window-control:set-fullscreen', value),
  setAutoHide: (value) => ipcRenderer.invoke('window-control:set-auto-hide', value),
  close: () => ipcRenderer.invoke('window-control:close'),
  onState: on('window-control:state'),
  onError: on('window-control:error'),
  onBoss: on('window-control:boss')
})

contextBridge.exposeInMainWorld('osInfo', { platform: process.platform })

contextBridge.exposeInMainWorld('douyinOpacityControl', {
  onPrev: on('all-prev'),
  onNext: on('all-next'),
  onAllScreen: on('all-screen'),
  onStopOrContinue: on('stop-or-continue'),
  onOpacityUp: on('opacity-up'),
  onOpacityDown: on('opacity-down'),
  onBoss: on('window-control:boss')
})

contextBridge.exposeInMainWorld('videoOpacityControl', {
  onPrev: on('all-prev'),
  onNext: on('all-next'),
  onAllScreen: on('all-screen'),
  onStopOrContinue: on('stop-or-continue'),
  onOpacityUp: on('opacity-up'),
  onOpacityDown: on('opacity-down'),
  onBoss: on('window-control:boss')
})

contextBridge.exposeInMainWorld('ipcRenderer', {
  on: (channel, callback) => subscriptions.on(channel, callback),
  off: (channel, callback) => subscriptions.off(channel, callback),
  send: (...a) => ipcRenderer.send(...a),
  invoke: (...a) => ipcRenderer.invoke(...a),
  removeAllListeners: (channel) => subscriptions.removeAllListeners(channel)
})

contextBridge.exposeInMainWorld('alphaEvent', { onMessage: on('alpha-event') })

contextBridge.exposeInMainWorld('alpha', {
  lock: () => ipcRenderer.invoke('alpha-lock'),
  setAlpha: (v) => ipcRenderer.invoke('alpha-set-alpha', v),
  hideTaskbar: () => ipcRenderer.invoke('alpha-hide'),
  showTaskbar: () => ipcRenderer.invoke('alpha-show'),
  stopAlpha: () => ipcRenderer.invoke('alpha-stop')
})

contextBridge.exposeInMainWorld('MODEL_PATH', { get: () => ipcRenderer.invoke('MODEL_PATH') })
ipcRenderer.on('MODEL_PATH', (_e, v) => { window.MODEL_PATH = v })

contextBridge.exposeInMainWorld('electronAPI', {
  createWeb: () => ipcRenderer.invoke('create-web'),
  createBook: () => ipcRenderer.invoke('create-book'),
  onShortcutPrev: on('shortcut-prev'),
  onShortcutNext: on('shortcut-next'),
  removeAllShortcutListeners: () => {
    subscriptions.removeAllListeners('shortcut-prev')
    subscriptions.removeAllListeners('shortcut-next')
  },
  moveBookWindow: (x, y) => ipcRenderer.invoke('book-custom-list', { appX: x, appY: y })
})

contextBridge.exposeInMainWorld('homeElectronAPI', {
  createWeb: () => ipcRenderer.invoke('create-web'),
  createBook: () => ipcRenderer.invoke('create-book'),
  createReadView: () => ipcRenderer.invoke('create-read-view'),
  createDouyin: () => ipcRenderer.invoke('create-douyin'),
  createDouyinOpacity: () => ipcRenderer.invoke('douyin-opacity-window'),
  createKuaishou: () => ipcRenderer.invoke('kuaishou-opacity-window'),
  createWeRead: () => ipcRenderer.invoke('create-weRead'),
  createBilibili: () => ipcRenderer.invoke('create-bilibili'),
  createBilibiliOpacity: () => ipcRenderer.invoke('create-bilibili-opacity-window'),
  createExcel: () => ipcRenderer.invoke('create-excel'),
  createExcelView: () => ipcRenderer.invoke('create-excel-view'),
  createZhiHu: () => ipcRenderer.invoke('create-zhihu'),
  createKeyword: () => ipcRenderer.invoke('create-keyword'),
  createWechat: () => ipcRenderer.invoke('create-wechat'),
  createDingding: () => ipcRenderer.invoke('create-dingding'),
  createHuya: () => ipcRenderer.invoke('huya-opacity-window'),
  createHuyaOpacity: () => ipcRenderer.invoke('huya-opacity-window'),
  createWechatConfig: () => ipcRenderer.invoke('create-wechat-config'),
  createDingdingConfig: () => ipcRenderer.invoke('create-dingding-config'),
  createHuyaControl: () => ipcRenderer.invoke('create-huya-control'),
  createDouyuControl: () => ipcRenderer.invoke('create-douyu-control'),
  createDouyu: () => ipcRenderer.invoke('douyu-opacity-window'),
  createFanQue: () => ipcRenderer.invoke('create-fanQue'),
  createJinJiang: () => ipcRenderer.invoke('create-jinJiang'),
  createCustomWebsite: (cfg) => ipcRenderer.invoke('create-custom-website', cfg),
  createStandaloneGame: () => ipcRenderer.invoke('create-standalone-game'),
  createCustomWebpage: () => ipcRenderer.invoke('create-custom-webpage'),
  bindSoft: on('bind-soft'),
  bossAlpha: on('boss-alpha'),
  opacityUp: on('opacity-up'),
  opacityDown: on('opacity-down'),
  getAlphaValue: () => ipcRenderer.invoke('alpha:getValue'),
  focusMainWindow: () => ipcRenderer.invoke('focus-main-window'),
  onShowCloseConfirmDialog: on('show-close-confirm-dialog'),
  handleCloseAction: (action, arg) => ipcRenderer.send('home-close-action', action, arg)
})

contextBridge.exposeInMainWorld('authApi', {
  setToken: (t) => ipcRenderer.invoke('auth:setToken', t),
  setMac: (m) => ipcRenderer.invoke('mac:setMac', m),
  getToken: () => ipcRenderer.invoke('auth:getToken'),
  getMac: () => ipcRenderer.invoke('mac:getMac'),
  getIpInfo: () => ipcRenderer.invoke('system:getIpInfo'),
  clearMac: () => ipcRenderer.invoke('mac:clearMac'),
  clearToken: () => ipcRenderer.invoke('login:clearToken'),
  rememberUserName: (v) => ipcRenderer.invoke('login:rememberUserName', v),
  rememberPassword: (v) => ipcRenderer.invoke('login:rememberPassword', v),
  getUserName: () => ipcRenderer.invoke('login:getUserName'),
  getPassword: () => ipcRenderer.invoke('login:getPassword'),
  unRemeber: () => ipcRenderer.invoke('login:unRemeber'),
  clearAllInfo: () => ipcRenderer.invoke('clear-all-info'),
  getDeviceFingerprint: () => ipcRenderer.invoke('auth:getDeviceFingerprint'),
  exportLogToDesktop: () => ipcRenderer.invoke('export-log-to-desktop')
})

contextBridge.exposeInMainWorld('appApi', {
  getVersion: () => ipcRenderer.invoke('app:getVersion'),
  quit: () => ipcRenderer.invoke('app:quit')
})

contextBridge.exposeInMainWorld('settingApi', {
  setSetting: (k, v) => ipcRenderer.invoke('setting:setSetting', k, v),
  setSettings: (o) => ipcRenderer.invoke('setting:setSettings', o),
  getSetting: (k) => ipcRenderer.invoke('setting:getSetting', k),
  getAllSettings: () => ipcRenderer.invoke('setting:getAllSettings')
})

contextBridge.exposeInMainWorld('localVideoAPI', {
  stopOrContinue: on('stop-or-continue'),
  selectVideoFile: () => ipcRenderer.invoke('select-video-file'),
  closeLocalVideoAdWindow: () => ipcRenderer.send('close-local-video-ad-window'),
  createLocalVideoWindow: (file, opts) => ipcRenderer.invoke('create-local-video-window', file, opts),
  createLocalVideoOpacityWindow: (file, opts) => ipcRenderer.invoke('create-local-video-opacity-window', file, opts),
  getHistory: () => ipcRenderer.invoke('get-local-video-history'),
  savePlaybackPosition: (file, pos, dur) => ipcRenderer.invoke('save-local-video-position', file, pos, dur),
  clearHistory: () => ipcRenderer.invoke('clear-local-video-history')
})

contextBridge.exposeInMainWorld('localVideoOpacityAPI', {
  stopOrContinue: on('stop-or-continue'),
  closeLocalVideoOpacityWindow: () => ipcRenderer.send('close-local-video-opacity-window'),
  setWindowTransparent: (v) => ipcRenderer.invoke('localVideoOpacity:setWindowTransparent', v),
  getWindowTransparent: () => ipcRenderer.invoke('localVideoOpacity:getWindowTransparent'),
  setAutoHideEnabled: (v) => ipcRenderer.invoke('localVideoOpacity:setAutoHideEnabled', v),
  setToggleAlwaysTop: (v) => ipcRenderer.invoke('localVideoOpacity:setToggleAlwaysTop', v),
  getToggleAlwaysTop: () => ipcRenderer.invoke('localVideoOpacity:getToggleAlwaysTop'),
  opacityUp: on('opacity-up'),
  opacityDown: on('opacity-down')
})

contextBridge.exposeInMainWorld('keywordControl', { closeWindow: () => ipcRenderer.send('close-keyword-window') })

contextBridge.exposeInMainWorld('readViewAPI', {
  closeWindow: () => ipcRenderer.send('close-read-view-window'),
  selectBookFiles: () => ipcRenderer.invoke('select-book-files'),
  getBookCover: (p) => ipcRenderer.invoke('get-book-cover', p),
  openBookReader: (filePath, mode) => mode && mode !== 'normal'
    ? ipcRenderer.invoke('create-book-reader-window', { filePath, mode })
    : ipcRenderer.invoke('create-book-reader-window', filePath)
})

contextBridge.exposeInMainWorld('wechatControl', {
  stopOrContinue: on('stop-or-continue'),
  closeWechatWindow: () => ipcRenderer.send('close-wechat-window'),
  setCurrentSiteKey: (k) => ipcRenderer.invoke('wechat:setCurrentSiteKey', k),
  getCurrentSiteKey: () => ipcRenderer.invoke('wechat:getCurrentSiteKey'),
  setReaderFilePath: (p) => ipcRenderer.invoke('wechat:setReaderFilePath', p),
  getReaderFilePath: () => ipcRenderer.invoke('wechat:getReaderFilePath'),
  getBilibiliMessage: on('bilibili-message-from-main'),
  getHuyaMessage: on('huya-message-from-main'),
  getDouyuMessage: on('douyu-message-from-main'),
  bossKey: on('boss-key'),
  faceBossKey: on('face-boss-key'),
  allLike: on('all-like'),
  allScreen: on('all-screen'),
  allPrev: on('all-prev'),
  allNext: on('all-next'),
  getGifPath: (k) => ipcRenderer.invoke('get-gif-path', k),
  pauseVideo: on('pause-video')
})

contextBridge.exposeInMainWorld('wechatConfigApi', {
  closeWindow: () => ipcRenderer.send('close-wechat-config-window'),
  getCurrentConfig: () => ipcRenderer.invoke('wechat-config:getCurrentConfig'),
  applyChatConfig: (cfg) => ipcRenderer.invoke('wechat-config:applyConfig', cfg)
})

contextBridge.exposeInMainWorld('dingdingConfigApi', {
  closeWindow: () => ipcRenderer.send('close-dingding-config-window'),
  getCurrentConfig: () => ipcRenderer.invoke('dingding-config:getCurrentConfig'),
  applyChatConfig: (cfg) => ipcRenderer.invoke('dingding-config:applyConfig', cfg)
})

contextBridge.exposeInMainWorld('dingdingControl', {
  closeDingdingWindow: () => ipcRenderer.send('close-dingding-window'),
  setCurrentSiteKey: (k) => ipcRenderer.invoke('dingding:setCurrentSiteKey', k),
  getCurrentSiteKey: () => ipcRenderer.invoke('dingding:getCurrentSiteKey'),
  getBilibiliMessage: on('dingding-bilibili-message-from-main'),
  getHuyaMessage: on('dingding-huya-message-from-main'),
  getDouyuMessage: on('dingding-douyu-message-from-main'),
  bossKey: on('dingding-boss-key'),
  faceBossKey: on('dingding-face-boss-key'),
  allLike: on('dingding-all-like'),
  allScreen: on('dingding-all-screen'),
  allPrev: on('dingding-all-prev'),
  allNext: on('dingding-all-next'),
  getGifPath: (k) => ipcRenderer.invoke('get-gif-path', k),
  openDingdingWindow: (m) => ipcRenderer.send('send-message-bilibili-dingding', m),
  pauseVideo: on('pause-video'),
  stopOrContinue: on('stop-or-continue')
})

contextBridge.exposeInMainWorld('bookControl', {
  chooseTxtFile: () => ipcRenderer.invoke('choose-txt-file'),
  closeBookWindow: () => ipcRenderer.send('close-book-window'),
  saveProgress: (filePath, index) => ipcRenderer.invoke('book:saveProgress', { filePath, index }),
  setFontColor: (v) => ipcRenderer.invoke('book:setFontColor', v),
  getFontColor: () => ipcRenderer.invoke('book:getFontColor'),
  setFontSize: (v) => ipcRenderer.invoke('book:setFontSize', v),
  getFontSize: () => ipcRenderer.invoke('book:getFontSize'),
  setFontOpacity: (v) => ipcRenderer.invoke('book:setFontOpacity', v),
  getFontOpacity: () => ipcRenderer.invoke('book:getFontOpacity'),
  getProgress: (p) => ipcRenderer.invoke('book:getProgress', p)
})

contextBridge.exposeInMainWorld('bookReaderAPI', {
  selectFiles: () => ipcRenderer.invoke('select-book-files'),
  selectFile: () => ipcRenderer.invoke('select-book-file'),
  getBookCover: (p) => ipcRenderer.invoke('get-book-cover', p),
  getBookContent: (p) => ipcRenderer.invoke('get-book-file-content', p),
  getPdfData: (p) => ipcRenderer.invoke('get-pdf-data', p),
  getHistory: () => ipcRenderer.invoke('get-book-reader-history'),
  getProgress: (p) => ipcRenderer.invoke('get-book-reader-progress', p),
  saveProgress: (p, v) => ipcRenderer.invoke('save-book-reader-progress', p, v),
  deleteHistory: (p) => ipcRenderer.invoke('delete-book-reader-history', p),
  getFontSize: () => ipcRenderer.invoke('bookReader:getFontSize'),
  setFontSize: (v) => ipcRenderer.invoke('bookReader:setFontSize', v),
  getFontColor: () => ipcRenderer.invoke('bookReader:getFontColor'),
  setFontColor: (v) => ipcRenderer.invoke('bookReader:setFontColor', v),
  getFontOpacity: () => ipcRenderer.invoke('bookReader:getFontOpacity'),
  setFontOpacity: (v) => ipcRenderer.invoke('bookReader:setFontOpacity', v),
  closeWindow: () => ipcRenderer.send('close-book-reader-window')
})
