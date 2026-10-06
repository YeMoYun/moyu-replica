// Windows 上默认 floating 层级会被 Electron 主动排在任务栏之后；置顶必须使用
// screen-saver 层级，窗口与任务栏重叠时才能显示在任务栏上方。
const TOPMOST_LEVEL = 'screen-saver'

const opacityValue = (value) => {
  const number = Number(value)
  if (!Number.isFinite(number)) throw new Error('透明度必须是有效数值')
  return Math.min(1, Math.max(0.1, number))
}

export function fitBounds(bounds, displays) {
  if (!displays.length) return bounds
  const areas = displays.map((display) => display.workArea)
  const overlap = (area) => Math.max(0, Math.min(bounds.x + bounds.width, area.x + area.width) - Math.max(bounds.x, area.x)) *
    Math.max(0, Math.min(bounds.y + bounds.height, area.y + area.height) - Math.max(bounds.y, area.y))
  const area = areas.reduce((best, candidate) => overlap(candidate) > overlap(best) ? candidate : best)
  const width = Math.min(area.width, Math.max(100, Math.round(bounds.width)))
  const height = Math.min(area.height, Math.max(100, Math.round(bounds.height)))
  return {
    width, height,
    x: Math.round(Math.min(area.x + area.width - width, Math.max(area.x, bounds.x))),
    y: Math.round(Math.min(area.y + area.height - height, Math.max(area.y, bounds.y)))
  }
}

export function createWindowController({ windows, store, screen, liveResize, setInterval: start = setInterval, clearInterval: stop = clearInterval }) {
  const states = new Map()
  let timer = null
  let bossHidden = false
  function windowFor(key) {
    const window = windows.get(key)
    if (!window || window.isDestroyed()) throw new Error(`窗口未打开：${key}`)
    return window
  }
  function recordFor(key) {
    windowFor(key)
    const record = states.get(key)
    if (!record) throw new Error(`窗口控制未初始化：${key}`)
    return record
  }
  function state(key) {
    const record = recordFor(key)
    const window = windowFor(key)
    return {
      key, opacity: record.opacity, alwaysOnTop: window.isAlwaysOnTop(), fullscreen: record.fullscreen || window.isFullScreen(),
      fullscreenMode: record.borderlessFullscreen ? 'borderless' : 'native',
      autoHideEnabled: record.autoHideEnabled, pierceEnabled: record.pierceEnabled,
      hidden: record.autoHidden || record.bossHidden, bossHidden: record.bossHidden, bounds: window.getBounds()
    }
  }
  function notify(key) {
    try {
      const window = windows.get(key)
      if (!window || window.isDestroyed() || window.webContents?.isDestroyed?.()) return
      window.webContents.send('window-control:state', state(key))
    } catch { /* 渲染帧已销毁时保持静默，等待自愈 */ }
  }
  function save(key, patch = {}) {
    const record = recordFor(key)
    const next = { ...record, ...patch }
    store.set(`windowState.${key}`, {
      opacity: next.opacity, alwaysOnTop: next.alwaysOnTop, autoHideEnabled: next.autoHideEnabled,
      bounds: patch.normalBounds ?? (next.fullscreen || windowFor(key).isFullScreen() ? next.normalBounds : windowFor(key).getBounds())
    })
    Object.assign(record, patch)
  }
  function render(key) {
    const record = recordFor(key)
    const hidden = record.autoHidden || record.bossHidden
    const window = windowFor(key)
    if (window.isDestroyed() || window.webContents?.isDestroyed?.()) return
    try {
      window.setIgnoreMouseEvents(hidden || record.pierceIgnoring, { forward: true })
      window.setOpacity(hidden ? 0 : record.opacity)
    } catch { /* 渲染帧销毁瞬间原生调用可能失败 */ }
    notify(key)
  }
  function report(key, error) {
    if (windows.get(key) && !windows.get(key).isDestroyed()) windows.get(key).webContents.send('window-control:error', error.message)
    console.error(`Window ${key}:`, error)
  }
  async function poll() {
    const cursor = screen.getCursorScreenPoint()
    for (const [key, record] of states) {
      const window = windows.get(key)
      if (!window || window.isDestroyed() || !window.isVisible()) continue
      const bounds = window.getBounds()
      const outside = cursor.x < bounds.x || cursor.y < bounds.y || cursor.x >= bounds.x + bounds.width || cursor.y >= bounds.y + bounds.height
      if (record.autoHideEnabled && record.autoHidden !== outside) {
        record.autoHidden = outside
        try { render(key) } catch (error) { report(key, error) }
      }
      if (!record.pierceEnabled || record.captureInFlight) continue
      if (outside) {
        if (record.pierceIgnoring) { record.pierceIgnoring = false; render(key) }
        continue
      }
      record.captureInFlight = true
      try {
        const image = await window.webContents.capturePage({ x: Math.floor(cursor.x-bounds.x), y: Math.floor(cursor.y-bounds.y), width: 1, height: 1 })
        if (states.get(key) !== record || window.isDestroyed() || !record.pierceEnabled) continue
        const bitmap = image.toBitmap()
        const ignore = bitmap.length >= 4 && bitmap[3] < 10
        if (record.pierceIgnoring !== ignore) { record.pierceIgnoring = ignore; render(key) }
      } catch (error) {
        if (!window.isDestroyed() && states.get(key) === record) {
          record.pierceIgnoring = false
          record.pierceEnabled = false
          render(key); report(key, error); updateTimer()
        }
      } finally { record.captureInFlight = false }
    }
  }
  function updateTimer() {
    const needed = [...states.values()].some((record) => record.autoHideEnabled || record.pierceEnabled)
    if (needed && timer === null) { timer = start(() => poll().catch((error) => console.error(error)), 40); timer?.unref?.() }
    if (!needed && timer !== null) { stop(timer); timer = null }
  }
  function attach(key, window, options = {}) {
    const saved = store.get(`windowState.${key}`) || {}
    const legacyOpacity = store.get(`${key}.windowTransparent`) ?? store.get(`${key}.windowOpacity`)
    const rawOpacity = saved.opacity ?? legacyOpacity ?? window.getOpacity()
    const record = {
      opacity: Number.isFinite(Number(rawOpacity)) ? opacityValue(rawOpacity) : 1,
      alwaysOnTop: saved.alwaysOnTop ?? store.get(`${key}.alwaysOnTop`) ?? window.isAlwaysOnTop(),
      autoHideEnabled: saved.autoHideEnabled ?? store.get(`${key}.autoHideEnabled`) ?? store.get(`${key}.autoHide`) ?? false,
      autoHidden: false, bossHidden: bossHidden && key !== 'main', pierceEnabled: false, pierceIgnoring: false, captureInFlight: false,
      liveResizing: false,
      fullscreen: false, borderlessFullscreen: (options.platform ?? process.platform) === 'win32' && !!options.transparent,
      normalBounds: window.getBounds()
    }
    states.set(key, record)
    const aliases = { excel:'excelWindow',excelView:'excelViewWindow',bilibili:'bilibiliWindow',huya:'huyaWindow',douyu:'douyuWindow' }
    const namespaces = aliases[key] ? [key, aliases[key]] : [key]
    const legacyValue = (field) => namespaces.map((namespace) => store.get(`${namespace}.${field}`)).find((value) => Number.isFinite(value))
    const legacyFields = { width: legacyValue('baseWidth'), height: legacyValue('baseHeight'), x: legacyValue('xPosition'), y: legacyValue('yPosition') }
    const legacyBounds = Object.values(legacyFields).some((value) => value !== undefined)
      ? Object.fromEntries(Object.entries(legacyFields).map(([field, value]) => [field, value ?? window.getBounds()[field]])) : undefined
    const bounds = saved.bounds ?? store.get(`${key}.windowBounds`) ?? store.get(`${key}.bounds`) ?? legacyBounds
    if (bounds && ['x','y','width','height'].every((prop) => Number.isFinite(bounds[prop]))) window.setBounds(fitBounds(bounds, screen.getAllDisplays()))
    record.normalBounds = window.getBounds()
    window.setAlwaysOnTop(!!record.alwaysOnTop, TOPMOST_LEVEL)
    render(key)
    const saveBounds = () => {
      try {
        if (!record.fullscreen && !window.isFullScreen()) {
          record.normalBounds = window.getBounds()
          // 实时拖拽缩放期间跳过持久化，结束后由 endLiveResize 统一写入一次。
          if (!record.liveResizing) save(key)
        }
      } catch (error) { report(key, error) }
    }
    window.on('moved', saveBounds)
    window.on('resize', saveBounds)
    window.on('enter-full-screen', () => { record.fullscreen = true; notify(key) })
    window.on('leave-full-screen', () => { record.fullscreen = false; notify(key) })
    window.on('close', saveBounds)
    window.on('closed', () => {
      states.delete(key)
      if (windows.get(key) === window) windows.delete(key)
      updateTimer()
    })
    updateTimer()
  }
  function setOpacity(key, value) { save(key, { opacity: opacityValue(value) }); render(key); return state(key) }
  function setTopmost(key, enabled) { save(key, { alwaysOnTop: !!enabled }); windowFor(key).setAlwaysOnTop(!!enabled, TOPMOST_LEVEL); notify(key); return state(key) }
  function setFullscreen(key, enabled) {
    const record = recordFor(key)
    const window = windowFor(key)
    if (state(key).fullscreen === !!enabled) return state(key)
    if (enabled) record.normalBounds = window.getNormalBounds?.() ?? window.getBounds()
    record.fullscreen = !!enabled
    try {
      if (record.borderlessFullscreen) {
        if (enabled) {
          const displays = screen.getAllDisplays()
          const display = screen.getDisplayMatching?.(window.getBounds()) ?? displays[0]
          window.setBounds(display.bounds ?? display.workArea)
        } else window.setBounds(fitBounds(record.normalBounds, screen.getAllDisplays()))
      } else window.setFullScreen(!!enabled)
    } catch (error) { record.fullscreen = !enabled; throw error }
    notify(key); return state(key)
  }
  function saveBounds(key, bounds) {
    if (!bounds || !['x','y','width','height'].every((prop) => Number.isFinite(bounds[prop]))) throw new Error('窗口位置和尺寸必须是有效数值')
    const valid = fitBounds(bounds, screen.getAllDisplays())
    if (states.has(key)) {
      recordFor(key).normalBounds = valid
      save(key, { normalBounds: valid })
      if (!state(key).fullscreen) windowFor(key).setBounds(valid)
    } else store.set(`windowState.${key}`, { ...(store.get(`windowState.${key}`) || {}), bounds: valid })
    return valid
  }
  function setAutoHide(key, enabled) {
    save(key, { autoHideEnabled: !!enabled })
    if (!enabled) recordFor(key).autoHidden = false
    updateTimer(); if (enabled) poll(); render(key)
    return state(key)
  }
  function setPierce(key, enabled) {
    const record = recordFor(key)
    record.pierceEnabled = !!enabled
    record.pierceIgnoring = false
    updateTimer(); render(key)
    return state(key)
  }
  // 渲染层缩放手柄：委托共享的实时缩放状态机（边缘吸附光标、对边固定、
  // 不做工作区复位）；本控制器只负责拖动期间跳过持久化、结束后写入一次。
  function beginLiveResize(key, directions, cursor) {
    const record = recordFor(key)
    const window = windowFor(key)
    if (record.fullscreen || window.isFullScreen()) return false
    record.liveResizing = liveResize.begin(window, directions, cursor)
    return record.liveResizing
  }
  function moveLiveResize(key, cursor) {
    const record = recordFor(key)
    const window = windowFor(key)
    if (record.fullscreen || window.isFullScreen() || !liveResize.tracks(window)) return window.getBounds()
    return liveResize.move(cursor) ?? window.getBounds()
  }
  function endLiveResize(key) {
    const record = recordFor(key)
    const window = windowFor(key)
    if (liveResize.tracks(window)) liveResize.end()
    if (!record.liveResizing) return state(key)
    record.liveResizing = false
    if (!record.fullscreen && !window.isFullScreen()) save(key)
    return state(key)
  }
  function toggleBoss() {
    bossHidden = !bossHidden
    for (const [key, record] of states) {
      if (key === 'main') continue
      const window = windowFor(key)
      if (bossHidden && !window.isVisible()) continue
      record.bossHidden = bossHidden
      render(key)
      window.webContents.send('window-control:boss', bossHidden)
    }
    return bossHidden
  }
  function close(key) { windowFor(key).close(); return true }
  function restore(key) {
    const record = recordFor(key)
    const window = windowFor(key)
    if (window.isDestroyed() || window.webContents?.isDestroyed?.()) return
    record.bossHidden = false
    record.autoHidden = false
    window.show()
    render(key)
  }
  function correctDisplays() {
    for (const [key, record] of states) {
      try {
        if (state(key).fullscreen) {
          save(key, { normalBounds: fitBounds(record.normalBounds, screen.getAllDisplays()) })
          if (record.borderlessFullscreen) {
            const display = screen.getDisplayMatching?.(windowFor(key).getBounds()) ?? screen.getAllDisplays()[0]
            windowFor(key).setBounds(display.bounds ?? display.workArea)
            notify(key)
          }
          continue
        }
        saveBounds(key, windowFor(key).getBounds())
      } catch (error) { report(key, error) }
    }
  }
  screen.on?.('display-removed', correctDisplays)
  screen.on?.('display-metrics-changed', correctDisplays)
  function dispose() {
    if (timer !== null) stop(timer); timer = null
    screen.removeListener?.('display-removed', correctDisplays)
    screen.removeListener?.('display-metrics-changed', correctDisplays)
  }
  return { attach, state, saveBounds, setOpacity, setTopmost, setFullscreen, setAutoHide, setPierce, beginLiveResize, moveLiveResize, endLiveResize, toggleBoss, close, restore, dispose }
}
