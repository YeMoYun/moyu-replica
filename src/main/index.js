import { join } from 'node:path'
import { existsSync, readFileSync } from 'node:fs'
import os from 'node:os'
import {
  app,
  shell,
  BrowserWindow,
  ipcMain,
  screen,
  globalShortcut,
  dialog,
  session,
  Tray,
  Menu,
  nativeImage
} from 'electron'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import axios from 'axios'
import iconv from 'iconv-lite'
import jschardet from 'jschardet'
import { createStore } from './store.js'
import { createWindowController } from './window-controls.mjs'
import { createAdWindowController } from './ad-window-controls.mjs'
import { createChatWindowController } from './chat-window-controls.mjs'
import { createChatServiceRegistry } from './chat-service-registry.mjs'
import { createVideoChatNotifier, createVideoChatRuntime, tryChatContext } from './video-chat-runtime.mjs'
import { createRegisteredAdOpener, createVideoModeLauncher } from './video-mode-launcher.mjs'
import { createVideoModeIpcHandlers } from './video-mode-ipc.mjs'
import { createScopedAdCloser, transferToTransparentGuest } from './ad-transparent-transfer.mjs'
import { validateChatGuestAttachment } from './chat-guest-policy.mjs'
import { validateChatUrl } from '../shared/chat-state.mjs'
import { chatContext } from '../shared/chat-context.mjs'
import { AD_MODES, normalizeAdSettings, normalizeAdPatch, validateAdUrl } from '../shared/ad-modes.mjs'
import { createShortcutManager } from './shortcuts.mjs'
import { normalizeShortcuts } from '../shared/shortcuts.mjs'
import { validateUnmanagedSettings, validateUnmanagedSettingRead, sanitizeUnmanagedSettings } from './settings-guard.mjs'
import { installGuestFrameNavigationGuard } from './guest-frame-navigation.mjs'
import { installVideoGuestLinks } from './video-guest-links.mjs'
import { SITES, SITE_ROUTES, SHORTCUTS, API_BASE, IP_API } from './sites.js'
import { getDeviceFingerprint, getMac, tokenSignature } from './auth.js'

// ── 常量 ────────────────────────────────────────────────────────────────
const preload = join(__dirname, '../preload/index.js')
const rendererIndex = join(__dirname, '../renderer/index.html')

const windows = new Map()
let mainWindow = null

// electron-store 等价物：单实例，点号路径键，全部读写同一 config.json。
const store = createStore('config', {
  shortcuts: { ...SHORTCUTS },
  opacity: 1
})
const settings = store
const auth = store
const bookStore = store
const videoStore = store
let windowControls = null
let adWindowControls = null
let chatWindowControls = null
let chatServices = null
let videoChatRuntime = null
let videoModeLauncher = null
let shortcutManager = null
let shortcutStatus = { success: false, errors: [] }
let tray = null

function loadRoute(win, route) {
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(`${process.env['ELECTRON_RENDERER_URL']}#${route}`)
  } else {
    win.loadFile(rendererIndex, { hash: route })
  }
}

function makeWindow(key, opts) {
  const chat = tryChatContext(key)
  const win = new BrowserWindow({
    show: false,
    autoHideMenuBar: true,
    hasShadow: false,
    ...opts,
    webPreferences: { preload, webviewTag: true, ...(opts.webPreferences || {}) }
  })
  windows.set(key, win)
  if (['douyinOpacity', 'bilibiliOpacity', 'huyaOpacity', 'kuaishouOpacity'].includes(key)) {
    win.webContents.on('did-attach-webview', (_event, guest) => {
      installGuestFrameNavigationGuard(guest)
      const site = { bilibiliOpacity: 'bilibili', huyaOpacity: 'huya', kuaishouOpacity: 'kuaishou' }[key]
      if (site) installVideoGuestLinks(guest, {
        site,
        openExternal: url => shell.openExternal(url),
        report: message => { if (!win.isDestroyed() && !win.webContents.isDestroyed()) win.webContents.send('window-control:error', message) }
      })
    })
  }
  if (['fanQue', 'jinJiang'].includes(key)) {
    win.webContents.on('did-attach-webview', (_event, guest) => {
      installGuestFrameNavigationGuard(guest)
      installVideoGuestLinks(guest, { site: key, openExternal: url => shell.openExternal(url),
        report: message => { if (!win.isDestroyed() && !win.webContents.isDestroyed()) win.webContents.send('window-control:error', message) }
      })
    })
  }
  if (Object.hasOwn(AD_MODES, key)) {
    win.webContents.on('did-attach-webview', (_event, guest) => installGuestFrameNavigationGuard(guest))
    adWindowControls.attach(key, win)
  } else if (chat) chatWindowControls.attach(key, win)
  else windowControls.attach(key, win, { transparent: !!opts.transparent })
  if (chat) {
    win.webContents.on('will-attach-webview', (event, preferences, params) => {
      try { validateChatGuestAttachment(key, params) } catch (error) {
        event.preventDefault()
        if (!win.isDestroyed() && !win.webContents.isDestroyed()) win.webContents.send('chat-mode:error', error.message)
        return
      }
      delete preferences.preload
      preferences.nodeIntegration = false
      preferences.contextIsolation = true
      preferences.sandbox = true
      preferences.webSecurity = true
    })
    win.webContents.on('did-attach-webview', (_event, guest) => {
      installGuestFrameNavigationGuard(guest)
      const denied = message => { if (!win.isDestroyed() && !win.webContents.isDestroyed()) win.webContents.send('chat-mode:error', message) }
      guest.on('will-navigate', (event, address) => { try { validateChatUrl(address, chat.platform) } catch (error) { event.preventDefault(); denied(error.message) } })
      guest.on('will-redirect', (event, address, _inPlace, isMainFrame) => {
        if(isMainFrame===false)return
        try { validateChatUrl(address, chat.platform) } catch(error){event.preventDefault();denied(error.message)}
      })
      guest.setWindowOpenHandler(({url}) => {
        try { const address=validateChatUrl(url, chat.platform);guest.loadURL(address).catch(error=>denied(error.message)) }
        catch(error){denied(error.message)}
        return {action:'deny'}
      })
      guest.session.setPermissionRequestHandler((_wc,_permission,callback)=>callback(false))
    })
  }
  win.on('ready-to-show', () => win.show())
  win.on('closed', () => { if (windows.get(key) === win) windows.delete(key) })
  return win
}

function focus(key) {
  const w = windows.get(key)
  if (w && !w.isDestroyed()) {
    if (w.isMinimized()) w.restore()
    if (Object.hasOwn(AD_MODES, key)) w.show()
    else if (tryChatContext(key)) chatWindowControls.restore(key)
    else windowControls.restore(key)
    w.focus()
  }
}

function bottomRight(w, h) {
  const { workArea } = screen.getPrimaryDisplay()
  return { x: workArea.x + workArea.width - w - 20, y: workArea.y + workArea.height - h - 20 }
}

// ── 窗口工厂 ────────────────────────────────────────────────────────────
function openRoute(key, route, opts = {}) {
  const existing = windows.get(key)
  if (existing && !existing.isDestroyed()) {
    focus(key)
    return existing
  }
  const win = makeWindow(key, opts)
  loadRoute(win, route)
  if (opts.rightBottom && !settings.get(Object.hasOwn(AD_MODES,key)?`adModes.${key}.window`:`windowState.${key}`)?.bounds) {
    const pos = bottomRight(opts.width || 800, opts.height || 600)
    win.setPosition(pos.x, pos.y)
  }
  return win
}

function openSite(key) {
  const def = SITE_ROUTES[key] || { route: '/web', width: 1000, height: 720 }
  return openRoute(key, def.route, {
    width: def.width,
    height: def.height,
    frame: def.frame ?? false,
    skipTaskbar: def.skipTaskbar ?? true,
    transparent: !!def.transparent,
    backgroundColor: def.transparent ? '#00000000' : undefined,
    alwaysOnTop: !!def.alwaysOnTop,
    rightBottom: !!def.rightBottom,
    webPreferences: def.webSecurity === false ? { webSecurity: false } : {}
  })
}

function openVideoChat(platform, skin, address) {
  if (!videoChatRuntime) throw new Error('聊天模式尚未初始化')
  return videoChatRuntime.openVideoChat(platform, skin, address)
}

// ── 老板键 / 快捷键 ──────────────────────────────────────────────────────
function broadcast(channel, ...args) {
  for (const w of windows.values()) {
    if (w && !w.isDestroyed()) w.webContents.send(channel, ...args)
  }
}

function toggleBossKey() {
  const hidden = windowControls.toggleBoss()
  adWindowControls.toggleBoss()
  chatWindowControls.toggleBoss()
  return hidden
}

function applyShortcuts(map) {
  if (!shortcutManager) return { success: false, errors: [{ message: '快捷键管理器尚未初始化' }] }
  const previous = shortcutManager.getCurrent()
  const result = shortcutManager.apply(map)
  if (!result.success) return result
  try { settings.set('shortcuts', result.shortcuts) }
  catch (error) {
    const rollback = shortcutManager.apply(previous)
    return { success: false, shortcuts: previous, errors: [{ code: 'storage-failed', message: error.message }, ...rollback.errors] }
  }
  shortcutStatus = result
  return result
}

function initializeShortcuts() {
  const changeOpacity = (delta) => {
    for (const key of windows.keys()) {
      if (key === 'main') continue
      if (tryChatContext(key)) {
        chatWindowControls.setOpacity(key,windows.get(key).getOpacity()+delta)
        continue
      }
      if (Object.hasOwn(AD_MODES,key)) {
        adWindowControls.setOpacity(key,adWindowControls.state(key).opacity+delta)
        continue
      }
      try { windowControls.setOpacity(key, windowControls.state(key).opacity + delta) }
      catch (error) { windows.get(key)?.webContents.send('window-control:error', error.message) }
    }
  }
  const actions = {
    boss: () => toggleBossKey(),
    opacityUp: () => changeOpacity(0.1),
    opacityDown: () => changeOpacity(-0.1),
    allPrev: () => broadcast('all-prev'),
    allNext: () => broadcast('all-next'),
    allScreen: () => broadcast('all-screen'),
    allLike: () => broadcast('all-like'),
    bindSoft: () => { if (mainWindow && !mainWindow.isDestroyed()) dialog.showMessageBox(mainWindow, { type: 'info', message: '当前复刻版未安装原生软件绑定模块，不能绑定外部软件。' }) },
    stopOrContinue: () => broadcast('stop-or-continue')
  }
  shortcutManager = createShortcutManager(globalShortcut, actions, settings.get('shortcuts') || SHORTCUTS)
  shortcutStatus = shortcutManager.initialResult
  if (!shortcutManager.initialResult.success) {
    const message = shortcutManager.initialResult.errors.map((error) => error.message).join('\n')
    console.error(message)
    mainWindow.webContents.once('did-finish-load', () => mainWindow.webContents.send('window-control:error', `快捷键无法启用，请在快捷键设置中检查：${message}`))
  }
}

function keyFromSender(event) {
  const window = BrowserWindow.fromWebContents(event.sender)
  for (const [key, value] of windows) if (value === window) return key
  throw new Error('未知窗口，不能执行窗口操作')
}

// ── TXT / MOBI / PDF ─────────────────────────────────────────────────────
function readTxt(filePath) {
  const buf = readFileSync(filePath)
  const det = jschardet.detect(buf)
  let enc = (det && det.encoding ? det.encoding.toLowerCase() : 'utf-8')
  if (enc === 'gb2312' || enc === 'gb18030') enc = 'gbk'
  const allowed = ['utf-8', 'gbk', 'gb2312', 'gb18030', 'big5', 'utf-16le', 'utf-16be']
  if (!allowed.includes(enc) || (det && det.confidence && det.confidence < 0.5)) {
    for (const cand of ['utf-8', 'gbk', 'gb2312', 'gb18030', 'big5']) {
      try {
        const text = iconv.decode(buf, cand)
        if (!text.includes('\uFFFD') && (/[\u4e00-\u9fa5]/.test(text) || text.length < 1000)) {
          enc = cand
          break
        }
      } catch {}
    }
  }
  try {
    return enc === 'utf-8' ? buf.toString('utf-8') : iconv.decode(buf, enc)
  } catch {
    return buf.toString('utf-8')
  }
}

const CHAPTER_RES = [
  /^第[一二三四五六七八九十百千零\d]+[章节]/,
  /^Chapter\s+\d+/i,
  /^卷[一二三四五六七八九十百千零\d]+/,
  /^[序楔正][言章文]/,
  /^\d+[\.、]\s+\S{2,}/,
  /^【[^】]{2,20}】/
]

function splitTxtChapters(content) {
  const lines = content.split(/\r?\n/)
  const chapters = []
  let cur = null
  for (const line of lines) {
    const t = line.trim()
    if (t.length < 80 && CHAPTER_RES.some((re) => re.test(t))) {
      if (cur && cur.end > cur.start) chapters.push(cur)
      cur = { title: t, start: 0, end: 0 }
    }
    if (!cur) cur = { title: '正文', start: 0, end: 0 }
  }
  // 简化：返回按字符偏移的章节
  const out = []
  let offset = 0
  const simple = content.split(/\r?\n/)
  let heading = null
  let start = 0
  for (const line of simple) {
    const t = line.trim()
    if (t.length < 80 && CHAPTER_RES.some((re) => re.test(t))) {
      if (heading && offset - start > 10) out.push({ title: heading, start, end: offset })
      heading = t
      start = offset
    }
    offset += line.length + 1
  }
  if (heading && offset - start > 10) out.push({ title: heading, start, end: offset })
  if (out.length < 2) return []
  return out
}

async function readMobi(filePath) {
  const mod = await import('@lingo-reader/mobi-parser')
  const { initKf8File, initMobiFile } = mod
  const tmp = join(os.tmpdir(), `mobi-${Date.now()}-${Math.random().toString(16).slice(2)}`)
  const fs = await import('node:fs')
  fs.mkdirSync(tmp, { recursive: true })
  let reader = null
  let spine = []
  try {
    reader = await initKf8File(filePath, tmp)
    spine = reader.getSpine()
  } catch {
    reader = await initMobiFile(filePath, tmp)
    spine = reader.getSpine()
  }
  const chapters = []
  for (const s of spine) {
    try {
      const html = (reader.loadChapter && reader.loadChapter(s.id).html) || ''
      chapters.push({ title: `第 ${chapters.length + 1} 章`, content: html })
    } catch {
      chapters.push({ title: `第 ${chapters.length + 1} 章`, content: '' })
    }
  }
  try {
    reader.destroy()
  } catch {}
  fs.rmSync(tmp, { recursive: true, force: true })
  return { type: 'epub', chapters, toc: chapters.map((c, i) => ({ title: c.title, chapterIndex: i })) }
}

async function getBookContent(filePath) {
  const ext = filePath.split('.').pop().toLowerCase()
  if (ext === 'txt') {
    const content = readTxt(filePath)
    return { type: 'txt', content, chapters: splitTxtChapters(content) }
  }
  if (ext === 'mobi' || ext === 'azw' || ext === 'azw3') {
    try {
      return await readMobi(filePath)
    } catch (e) {
      return { type: 'epub', chapters: [], toc: [], error: String(e) }
    }
  }
  if (ext === 'pdf') {
    return existsSync(filePath) ? { type: 'pdf', filePath } : { type: 'pdf', filePath: '', error: '文件不存在' }
  }
  return { type: 'txt', content: readTxt(filePath), chapters: [] }
}

// ── IPC ─────────────────────────────────────────────────────────────────
function handle(ch, fn) {
  ipcMain.handle(ch, (e, ...a) => fn(e, ...a))
}

function registerOpacityControls(prefix, key) {
  handle(`${prefix}:getToggleAlwaysTop`, () => {
    const w = windows.get(key)
    return w && !w.isDestroyed() ? w.isAlwaysOnTop() : false
  })
  handle(`${prefix}:setWindowTransparent`, (_e, v) => {
    return windowControls.setOpacity(key, v)
  })
  handle(`${prefix}:getWindowTransparent`, () => {
    const w = windows.get(key)
    return w ? windowControls.state(key).opacity : (settings.get(`windowState.${key}`)?.opacity ?? 1)
  })
  handle(`${prefix}:setAutoHideEnabled`, (_e, v) => {
    return windowControls.setAutoHide(key, v)
  })
  handle(`${prefix}:showWindow`, () => focus(key))
  handle(`${prefix}:hideWindow`, () => {
    const w = windows.get(key)
    if (w) w.hide()
  })
  handle(`${prefix}:getOpenNumber`, () => settings.get(`${prefix}.openNumber`) || 0)
  handle(`${prefix}:setOpenNumber`, (_e, v) => settings.set(`${prefix}.openNumber`, v))
}

function registerStyleControls(prefix, key) {
  handle(`${prefix}:setTransparent`, (_e, v) => {
    const w = windows.get(key)
    if (w) w.setBackgroundColor(v ? '#00000000' : '#ffffff')
  })
  handle(`${prefix}:getTransparent`, () => {
    const w = windows.get(key)
    return w ? w.getBackgroundColor() === '#00000000' : false
  })
  registerOpacityControls(prefix, key)
  handle(`${prefix}:setBackgroundColor`, (_e, v) => settings.set(`${prefix}.backgroundColor`, v))
  handle(`${prefix}:getBackgroundColor`, () => settings.get(`${prefix}.backgroundColor`))
  handle(`${prefix}:clearBackgroundColor`, () => settings.set(`${prefix}.backgroundColor`, undefined))
  handle(`${prefix}:setFontColor`, (_e, v) => settings.set(`${prefix}.fontColor`, v))
  handle(`${prefix}:getFontColor`, () => settings.get(`${prefix}.fontColor`))
  handle(`${prefix}:clearFontColor`, () => settings.set(`${prefix}.fontColor`, undefined))
  handle(`${prefix}:setLastAddress`, (_e, v) => settings.set(`${prefix}.lastAddress`, v))
  handle(`${prefix}:getLastAddress`, () => settings.get(`${prefix}.lastAddress`))
}

function registerIpc() {
  const videoModeIpc = createVideoModeIpcHandlers({ keyFromSender, launcher: videoModeLauncher })
  handle('video-mode:open', videoModeIpc.open)
  handle('video-mode:open-recent-chat', videoModeIpc.openRecentChat)
  const videoChatIpc = videoChatRuntime.createIpcHandlers(keyFromSender)
  handle('video-chat:get-context', videoChatIpc.getContext)
  handle('video-chat:get', videoChatIpc.get)
  handle('video-chat:save', videoChatIpc.save)
  handle('video-chat:state', videoChatIpc.state)
  handle('video-chat:close', videoChatIpc.close)

  const requireWechatLegacy = event => { if (!['wechat','wechatConfig'].includes(keyFromSender(event))) throw Error('仅微信窗口可操作旧聊天配置') }
  const requireDingtalkLegacy = event => { if (!['dingding','dingdingConfig'].includes(keyFromSender(event))) throw Error('仅钉钉窗口可操作旧聊天配置') }

  const registerLegacyChatBridge = (prefix, skin) => {
    const expected = chatContext('douyin', skin)
    const requireLegacy = event => {
      const actual = videoChatIpc.getContext(event)
      if (actual.id !== expected.id) throw Error(`仅${skin}抖音窗口可操作此聊天配置`)
    }
    handle(`${prefix}:get`, event => { requireLegacy(event); return chatServices.service(expected).get() })
    handle(`${prefix}:save`, (event,state,revision) => { requireLegacy(event); return chatServices.service(expected).save(state,revision) })
    handle(`${prefix}:state`, event => {
      requireLegacy(event)
      const service = chatServices.service(expected)
      return {...chatWindowControls.state(expected.windowKey),warning:service.getWarning()}
    })
    handle(`${prefix}:close`, event => { requireLegacy(event); return chatWindowControls.close(expected.windowKey) })
    handle(`${prefix}:open`, async (event,address) => {
      if(keyFromSender(event)!=='main')throw Error('仅主窗口可打开伪装模式')
      await openVideoChat('douyin',skin,address)
      return true
    })
  }
  registerLegacyChatBridge('chat-mode','wechat')
  registerLegacyChatBridge('dingtalk-mode','dingtalk')
  registerLegacyChatBridge('feishu-mode','feishu')
  const adKind = event => {
    const key = keyFromSender(event)
    if (!Object.hasOwn(AD_MODES,key)) throw new Error('此接口仅供广告窗口使用')
    return key
  }
  handle('ad-mode:open', (_event,key) => {
    if (!Object.hasOwn(AD_MODES,key)) throw new Error('不支持的广告模式')
    openSite(key); return true
  })
  handle('ad-mode:get-state', event => adWindowControls.state(adKind(event)))
  handle('ad-mode:get-settings', event => normalizeAdSettings(adKind(event),settings.get(`adModes.${adKind(event)}`)||{}))
  handle('ad-mode:save-settings', (event,patch) => {
    const key=adKind(event),normalized=normalizeAdPatch(key,patch)
    for (const [field,value] of Object.entries(normalized)) settings.set(`adModes.${key}.${field}`,value)
    return normalizeAdSettings(key,settings.get(`adModes.${key}`)||{})
  })
  handle('ad-mode:expand', event => adWindowControls.expand(adKind(event)))
  handle('ad-mode:close', event => adWindowControls.close(adKind(event)))
  handle('ad-mode:open-transparent', async(event,url) => {
    const key=adKind(event),sourceWindow=BrowserWindow.fromWebContents(event.sender)
    if(!sourceWindow||windows.get(key)!==sourceWindow)throw new Error('源广告窗口已关闭')
    const closeAd=createScopedAdCloser({
      source:sourceWindow,
      getCurrent:()=>windows.get(key),
      close:()=>adWindowControls.close(key)
    })
    const address=validateAdUrl(key,url),targetKey=AD_MODES[key].transparentKey
    const target=openSite(targetKey)
    // Only navigate through the existing renderer; never write transparent preferences here.
    return transferToTransparentGuest({
      target,
      address,
      closeAd
    })
  })
  handle('window-control:get-state', (event) => windowControls.state(keyFromSender(event)))
  handle('window-control:set-opacity', (event, value) => windowControls.setOpacity(keyFromSender(event), value))
  handle('window-control:set-topmost', (event, value) => windowControls.setTopmost(keyFromSender(event), value))
  handle('window-control:set-fullscreen', (event, value) => windowControls.setFullscreen(keyFromSender(event), value))
  handle('window-control:set-auto-hide', (event, value) => windowControls.setAutoHide(keyFromSender(event), value))
  handle('window-control:close', (event) => windowControls.close(keyFromSender(event)))
  handle('testPierce:setPierceEnabled', (_event, value) => windowControls.setPierce('testPierce', value))
  handle('testPierce:setWindowTransparent', (_event, value) => windowControls.setOpacity('testPierce', value))
  handle('testPierce:close', () => windowControls.close('testPierce'))
  handle('app:getVersion', () => app.getVersion())
  handle('app:quit', () => app.quit())
  handle('focus-main-window', () => focus('main'))
  handle('MODEL_PATH', () => join(app.getPath('userData'), 'model'))
  handle('open-url', (_e, u) => shell.openExternal(u))

  // 老板键 / 透明度
  handle('alpha:getValue', () => settings.get('alpha.value') ?? 175)
  const unavailableAlpha = () => { throw new Error('当前复刻版未安装原生绑定模块，不能操作外部软件或系统任务栏。') }
  for (const channel of ['alpha-lock','alpha-set-alpha','alpha-hide','alpha-show','alpha-stop']) handle(channel, unavailableAlpha)
  handle('set-opacity', (event, value) => windowControls.setOpacity(keyFromSender(event), value))
  handle('get-opacity', (event) => windowControls.state(keyFromSender(event)).opacity)
  handle('boss-key', () => toggleBossKey())
  handle('face-boss-key', () => toggleBossKey())
  handle('boss-alpha', () => toggleBossKey())

  // 窗口创建
  const creators = {
    web: 'web',
    'test-pierce': 'testPierce',
    'custom-webpage': 'customWebpage',
    excel: 'excel',
    'excel-view': 'excelView',
    bilibili: 'bilibili',
    douyin: 'douyin',
    zhihu: 'zhihu',
    fanQue: 'fanQue',
    jinJiang: 'jinJiang',
    huya: 'huya',
    douyu: 'douyu',
    'bilibili-opacity-window': 'bilibiliOpacity',
    'douyin-opacity-window': 'douyinOpacity',
    weRead: 'weRead',
    'we-read-ad': 'weReadAd',
    'custom-website': 'customWebsiteAd',
    'standalone-game': 'standaloneGameAd',
    'custom-website-opacity-window': 'customWebsiteOpacity',
    'standalone-game-opacity-window': 'standaloneGameOpacity',
    'book-reader-ad-window': 'bookReaderAd',
    'read-view': 'readView',
    keyword: 'keyword',
    'huya-control': 'huyaControl',
    'douyu-control': 'douyuControl',
    wechat: 'wechat',
    dingding: 'dingding',
    'wechat-config': 'wechatConfig',
    'dingding-config': 'dingdingConfig',
    book: 'book',
    'book-reader-window': 'bookReader',
    'local-video-window': 'localVideo',
    'local-video-opacity-window': 'localVideoOpacity'
  }
  for (const [channel, key] of Object.entries(creators)) {
    handle(`create-${channel}`, () => {
      if (SITE_ROUTES[key]) openSite(key)
      else openRoute(key, `/${key}`)
      return true
    })
  }
  handle('douyin-opacity-window', () => { openSite('douyinOpacity'); return true })
  handle('kuaishou-opacity-window', () => { openSite('kuaishouOpacity'); return true })
  handle('huya-opacity-window', () => { openSite('huyaOpacity'); return true })
  handle('douyu-opacity-window', () => openSite('douyuOpacity'))
  handle('open-douyu-opacity-window', () => openSite('douyuOpacity'))
  handle('open-huya-opacity-window', () => openSite('huyaOpacity'))

  // 通用网页 / 阅读站点样式与透明度
  registerStyleControls('web', 'web')
  registerStyleControls('weRead', 'weRead')
  registerStyleControls('zhihu', 'zhihu')
  registerStyleControls('fanQue', 'fanQue')
  registerStyleControls('jinJiang', 'jinJiang')
  registerOpacityControls('customWebpage', 'customWebpage')
  for (const p of ['douyinOpacity', 'kuaishouOpacity', 'bilibiliOpacity', 'huyaOpacity', 'douyuOpacity', 'customWebsiteOpacity', 'standaloneGameOpacity', 'localVideoOpacity', 'bookReader']) {
    registerOpacityControls(p, p)
  }

  // 伪装聊天配置
  handle('wechat:setCurrentSiteKey', (e, k) => { requireWechatLegacy(e); return settings.set('wechat.currentSiteKey', k) })
  handle('wechat:getCurrentSiteKey', e => { requireWechatLegacy(e); return settings.get('wechat.currentSiteKey') || 'fanQue' })
  handle('wechat:setReaderFilePath', (e, p) => { requireWechatLegacy(e); return settings.set('wechat.readerFilePath', p) })
  handle('wechat:getReaderFilePath', e => { requireWechatLegacy(e); return settings.get('wechat.readerFilePath') })
  handle('dingding:setCurrentSiteKey', (e, k) => { requireDingtalkLegacy(e); return settings.set('dingding.currentSiteKey', k) })
  handle('dingding:getCurrentSiteKey', e => { requireDingtalkLegacy(e); return settings.get('dingding.currentSiteKey') || 'jinJiang' })
  handle('wechat-config:getCurrentConfig', e => { requireWechatLegacy(e); return settings.get('wechatConfig') || {} })
  handle('wechat-config:applyConfig', (e, cfg) => { requireWechatLegacy(e); return settings.set('wechatConfig', cfg) })
  handle('dingding-config:getCurrentConfig', e => { requireDingtalkLegacy(e); return settings.get('dingdingConfig') || {} })
  handle('dingding-config:applyConfig', (e, cfg) => { requireDingtalkLegacy(e); return settings.set('dingdingConfig', cfg) })
  handle('get-gif-path', (_e, k) => join(app.getPath('userData'), 'gifs', k || 'default.gif'))
  handle('check-window-status', (_e, key) => {
    const w = windows.get(key)
    return w ? { visible: w.isVisible(), bounds: w.getBounds() } : null
  })
  handle('change-window-position', (_e, key, x, y) => {
    const w = windows.get(key)
    if (w) w.setPosition(x, y)
  })

  // 授权
  handle('auth:setToken', (_e, t) => {
    const { fingerprint } = getDeviceFingerprint()
    auth.setMany({
      token: t,
      deviceFingerprint: fingerprint,
      macAddress: getMac(),
      tokenSignature: tokenSignature(t, fingerprint)
    })
  })
  handle('auth:getToken', () => {
    const t = auth.get('token')
    if (!t) return null
    const { fingerprint } = getDeviceFingerprint()
    if (auth.get('deviceFingerprint') !== fingerprint || auth.get('tokenSignature') !== tokenSignature(t, fingerprint)) {
      auth.set('token', undefined)
      return null
    }
    return t
  })
  handle('auth:getDeviceFingerprint', () => getDeviceFingerprint())
  handle('mac:setMac', (_e, m) => auth.set('mac', m))
  handle('mac:getMac', () => auth.get('mac') || getMac())
  handle('mac:clearMac', () => auth.set('mac', undefined))
  handle('login:clearToken', () => auth.set('token', undefined))
  handle('login:rememberUserName', (_e, v) => auth.set('userName', v))
  handle('login:rememberPassword', (_e, v) => auth.set('password', v))
  handle('login:getUserName', () => auth.get('userName'))
  handle('login:getPassword', () => auth.get('password'))
  handle('login:unRemeber', () => { auth.set('userName', undefined); auth.set('password', undefined) })
  handle('clear-all-info', event => {
    if(keyFromSender(event)!=='main')throw Error('仅主窗口可清除登录信息')
    return auth.setMany({token:undefined,deviceFingerprint:undefined,macAddress:undefined,tokenSignature:undefined,mac:undefined,userName:undefined,password:undefined})
  })
  handle('system:getIpInfo', async () => {
    try {
      const r = await axios.get(IP_API, { timeout: 8000 })
      return { ip: r.data.ip || r.data }
    } catch {
      return { ip: '' }
    }
  })
  handle('export-log-to-desktop', () => join(app.getPath('desktop'), 'moyu-log.txt'))

  // 设置 / 快捷键
  handle('setting:setSetting', (_e, k, v) => {
    if (k === 'shortcuts') return applyShortcuts(v)
    validateUnmanagedSettings({ [k]: v })
    return settings.set(k, v)
  })
  handle('setting:setSettings', (_e, values) => {
    if (values && Object.keys(values).length === 1 && Object.hasOwn(values, 'shortcuts')) return applyShortcuts(values.shortcuts)
    validateUnmanagedSettings(values)
    return settings.setMany(values)
  })
  handle('setting:getSetting', (_e, k) => settings.get(validateUnmanagedSettingRead(k)))
  handle('setting:getAllSettings', () => sanitizeUnmanagedSettings(settings.all()))
  handle('get-shortcuts', () => normalizeShortcuts(settings.get('shortcuts') || SHORTCUTS))
  handle('get-shortcut-status', () => shortcutStatus)
  handle('set-shortcuts', (_e, m) => applyShortcuts(m))
  handle('update-shortcuts', (_e, m) => applyShortcuts(m))

  // 本地视频
  handle('select-video-file', async () => {
    const r = await dialog.showOpenDialog({
      filters: [{ name: 'Video Files', extensions: ['mp4', 'avi', 'mov', 'wmv', 'flv', 'mkv', 'webm', 'm4v', '3gp'] }, { name: 'All Files', extensions: ['*'] }],
      properties: ['openFile']
    })
    if (r.canceled || !r.filePaths.length) return null
    return { filePath: r.filePaths[0], fileName: r.filePaths[0].split(/[\\/]/).pop() }
  })
  handle('get-local-video-history', () => videoStore.get('localVideo.history') || [])
  handle('clear-local-video-history', () => { videoStore.set('localVideo.history', []) })
  handle('save-local-video-position', (_e, filePath, currentTime, duration) => {
    const list = videoStore.get('localVideo.history') || []
    const item = { filePath, fileName: filePath.split(/[\\/]/).pop(), currentTime, duration }
    const idx = list.findIndex((x) => x.filePath === filePath)
    if (idx >= 0) list[idx] = item
    else list.push(item)
    if (list.length > 20) list.shift()
    videoStore.set('localVideo.history', list)
  })

  // 阅读器（旧 TXT）
  handle('choose-txt-file', async () => {
    const r = await dialog.showOpenDialog({ filters: [{ name: 'Text Files', extensions: ['txt'] }], properties: ['openFile'] })
    if (r.canceled || !r.filePaths.length) return null
    const filePath = r.filePaths[0]
    return { content: readTxt(filePath), filePath }
  })
  handle('book:saveProgress', (_e, payload) => {
    if (payload && payload.filePath) bookStore.set(`book.progress.${payload.filePath}`, payload.index)
  })
  handle('book:getProgress', (_e, filePath) => bookStore.get(`book.progress.${filePath}`) || 0)
  for (const k of ['fontColor', 'fontSize', 'fontOpacity']) {
    handle(`book:set${k[0].toUpperCase() + k.slice(1)}`, (_e, v) => bookStore.set(`book.${k}`, v))
    handle(`book:get${k[0].toUpperCase() + k.slice(1)}`, () => bookStore.get(`book.${k}`))
  }

  // 阅读器（新版：书架/历史/字体/进度）
  handle('select-book-file', async () => {
    const r = await dialog.showOpenDialog({ filters: [{ name: 'Books', extensions: ['txt', 'mobi', 'azw', 'azw3', 'epub', 'pdf'] }], properties: ['openFile'] })
    return r.canceled || !r.filePaths.length ? null : r.filePaths[0]
  })
  handle('select-book-files', async () => {
    const r = await dialog.showOpenDialog({ filters: [{ name: 'Books', extensions: ['txt', 'mobi', 'azw', 'azw3', 'epub', 'pdf'] }], properties: ['openFile', 'multiSelections'] })
    return r.canceled ? [] : r.filePaths
  })
  handle('get-book-cover', (_e, p) => p)
  handle('get-book-file-content', (_e, filePath) => getBookContent(filePath))
  handle('get-pdf-data', (_e, filePath) => {
    if (!filePath || !existsSync(filePath)) return null
    const buf = readFileSync(filePath)
    return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
  })
  handle('get-book-reader-history', () => (bookStore.get('bookReader.history') || []).sort((a, b) => (b.lastReadTime || 0) - (a.lastReadTime || 0)))
  handle('save-book-reader-progress', (_e, filePath, progress) => {
    const list = bookStore.get('bookReader.history') || []
    const idx = list.findIndex((x) => x.filePath === filePath)
    const item = { filePath, fileName: filePath.split(/[\\/]/).pop(), progress, lastReadTime: Date.now() }
    if (idx >= 0) list[idx] = item
    else list.push(item)
    bookStore.set('bookReader.history', list)
  })
  handle('get-book-reader-progress', (_e, filePath) => (bookStore.get('bookReader.history') || []).find((x) => x.filePath === filePath)?.progress ?? null)
  handle('delete-book-reader-history', (_e, filePath) => {
    bookStore.set('bookReader.history', (bookStore.get('bookReader.history') || []).filter((x) => x.filePath !== filePath))
  })
  for (const [k, dft] of [['fontSize', 14], ['fontColor', '#000000'], ['fontOpacity', 1]]) {
    handle(`bookReader:get${k[0].toUpperCase() + k.slice(1)}`, () => bookStore.get(`bookReader.${k}`) ?? dft)
    handle(`bookReader:set${k[0].toUpperCase() + k.slice(1)}`, (_e, v) => {
      bookStore.set(`bookReader.${k}`, v)
      broadcast(`book-reader-font-${k.toLowerCase()}-changed`, v)
    })
  }
  handle('bookReader:getAlwaysOnTop', () => { const w = windows.get('bookReader'); return w ? w.isAlwaysOnTop() : false })
  handle('bookReader:setAlwaysOnTop', (_e, v) => windowControls.setTopmost('bookReader', v))
  handle('bookReader:getAutoHide', () => settings.get('windowState.bookReader')?.autoHideEnabled ?? settings.get('bookReader.autoHide') ?? false)
  handle('bookReader:setAutoHide', (_e, v) => windowControls.setAutoHide('bookReader', v))
  handle('localVideoOpacity:setToggleAlwaysTop', (_e, v) => windowControls.setTopmost('localVideoOpacity', v))
  handle('bookReader:getWindowBounds', () => { const w = windows.get('bookReader'); return w ? w.getBounds() : null })
  handle('bookReader:saveWindowBounds', (_e, b) => windowControls.saveBounds('bookReader', b))

  // 窗口尺寸记忆
  for (const [channel, key] of Object.entries({
    'custom-list': 'web',
    'bilibili-custom-list': 'bilibili',
    'douyin-custom-list': 'douyin',
    'weread-custom-list': 'weRead',
    'book-custom-list': 'book',
    'excel-custom-list': 'excel',
    'bilibili-opacity-custom-list': 'bilibiliOpacity',
    'huya-opacity-custom-list': 'huyaOpacity',
    'douyin-opacity-custom-list': 'douyinOpacity',
    'custom-website-opacity-custom-list': 'customWebsiteOpacity',
    'standalone-game-opacity-custom-list': 'standaloneGameOpacity'
  })) {
    handle(channel, (_e, pos) => {
      const w = windows.get(key)
      if (w && pos && pos.appX !== undefined) w.setPosition(pos.appX, pos.appY)
    })
  }
  handle('custom-website-set-window-size', (_e, w, h) => { const x = windows.get('customWebsiteAd'); if (x) x.setSize(w, h) })
  handle('standalone-game-set-window-size', (_e, w, h) => { const x = windows.get('standaloneGameAd'); if (x) x.setSize(w, h) })
  handle('bilibili-set-window-size', (_e, w, h) => { const x = windows.get('bilibili'); if (x) x.setSize(w, h) })
  handle('douyin-set-window-size', (_e, w, h) => { const x = windows.get('douyin'); if (x) x.setSize(w, h) })

  // 关闭（send 型）
  const closes = {
    'close-web-window': 'web',
    'close-custom-webpage-window': 'customWebpage',
    'close-excel-window': 'excel',
    'close-excel-view-window': 'excelView',
    'close-bilibili-window': 'bilibili',
    'close-ad-bilibili-window': 'bilibili',
    'close-opacity-bilibili-window': 'bilibiliOpacity',
    'close-bilibili-opacity-window': 'bilibiliOpacity',
    'close-huya-ad-window': 'huya',
    'close-huya-opacity-window': 'huyaOpacity',
    'close-huya-control-window': 'huyaControl',
    'close-douyu-ad-window': 'douyu',
    'close-douyuAd-window': 'douyu',
    'close-douyu-opacity-window': 'douyuOpacity',
    'close-douyu-control-window': 'douyuControl',
    'close-weRead-window': 'weRead',
    'close-weReadAd-window': 'weReadAd',
    'close-custom-website-window': 'customWebsiteAd',
    'close-standalone-game-window': 'standaloneGameAd',
    'close-custom-website-opacity-window': 'customWebsiteOpacity',
    'close-standalone-game-opacity-window': 'standaloneGameOpacity',
    'close-book-reader-ad-window': 'bookReaderAd',
    'close-read-view-window': 'readView',
    'close-wechat-window': 'wechat',
    'close-dingding-window': 'dingding',
    'close-wechat-config-window': 'wechatConfig',
    'close-dingding-config-window': 'dingdingConfig',
    'close-book-window': 'book',
    'close-keyword-window': 'keyword',
    'close-book-reader-window': 'bookReader',
    'close-local-video-ad-window': 'localVideo',
    'close-local-video-window': 'localVideo',
    'close-local-video-opacity-window': 'localVideoOpacity'
  }
  for (const [channel, key] of Object.entries(closes)) {
    ipcMain.on(channel, () => {
      const w = windows.get(key)
      if (w) w.close()
    })
  }
  ipcMain.on('toggle-always-on-top', (event, enabled) => {
    try {
      const key = keyFromSender(event)
      windowControls.setTopmost(key, enabled === undefined ? !windowControls.state(key).alwaysOnTop : !!enabled)
    } catch (error) { event.sender.send('window-control:error', error.message) }
  })
  ipcMain.on('home-close-action', () => {})
  ipcMain.on('pause-video', () => broadcast('pause-video'))
}

// ── 托盘 ────────────────────────────────────────────────────────────────
function createTray() {
  const icon = nativeImage.createEmpty()
  tray = new Tray(icon)
  tray.setToolTip('MoYuMaster')
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: '显示窗口', click: () => focus('main') },
      { label: '退出', click: () => app.quit() }
    ])
  )
  tray.on('click', () => {
    if (mainWindow && mainWindow.isVisible()) mainWindow.hide()
    else focus('main')
  })
}

// ── 生命周期 ────────────────────────────────────────────────────────────
app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.xueqiu.MoYuMaster')
  app.on('browser-window-created', (_e, window) => optimizer.watchWindowShortcuts(window))

  session.defaultSession.setPermissionRequestHandler((_wc, permission, cb) => {
    cb(false)
  })
  app.on('web-contents-created', (_e, contents) => {
    contents.setWindowOpenHandler(({ url }) => {
      if (/^https?:/i.test(url)) shell.openExternal(url)
      return { action: 'deny' }
    })
  })

  windowControls = createWindowController({ windows, store, screen })
  adWindowControls = createAdWindowController({store,screen})
  chatWindowControls = createChatWindowController({store,screen})
  chatServices = createChatServiceRegistry({store,notify:createVideoChatNotifier(windows)})
  videoChatRuntime = createVideoChatRuntime({chatServices,chatWindowControls,openRoute})
  const openRegisteredAd=createRegisteredAdOpener({registry:AD_MODES,openSite})
  videoModeLauncher=createVideoModeLauncher({
    openAd:openRegisteredAd,
    openOpacity:key=>openSite(key),
    openChat:(platform,skin)=>openVideoChat(platform,skin),
    readRecent:skin=>settings.get(`videoModes.lastPlatform.${skin}`),
    writeRecent:(skin,platform)=>settings.set(`videoModes.lastPlatform.${skin}`,platform)
  })
  registerIpc()
  mainWindow = makeWindow('main', {
    width: 1000,
    height: 770,
    webPreferences: { webviewTag: true }
  })
  loadRoute(mainWindow, '/home')
  initializeShortcuts()
  createTray()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = makeWindow('main', { width: 1000, height: 770 })
      loadRoute(mainWindow, '/home')
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('will-quit', () => {
  windowControls?.dispose()
  globalShortcut.unregisterAll()
})

export { API_BASE }
