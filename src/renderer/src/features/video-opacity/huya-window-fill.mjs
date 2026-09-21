// Serialized into the guest, never calls BrowserWindow/fullscreen permission APIs.
export function installHuyaWindowFill() {
  if (window.__moyuHuyaWindowFill) return { installed: true }
  const state = { active: false, saved: [], player: null, scroll: null }
  const selector = '.player-fullscreen-btn,.player-fullscreen,.player-fullpage-btn,.player-fullpage,[data-action="fullscreen"],[title*="全屏"],[aria-label*="全屏"]'
  const save = (node, name, value) => {
    state.saved.push({ node, name, present: node.hasAttribute(name), value: node.getAttribute(name) })
    node.setAttribute(name, value)
  }
  function restore() {
    document.getElementById('__moyu_huya_window_fill_style__')?.remove()
    for (const entry of state.saved) {
      if (entry.present) entry.node.setAttribute(entry.name, entry.value)
      else entry.node.removeAttribute(entry.name)
    }
    state.saved = []; state.active = false; state.player = null
    if (state.scroll) window.scrollTo(state.scroll.x, state.scroll.y)
    state.scroll = null
    return { fullscreen: false }
  }
  function toggle() {
    if (state.active) return restore()
    // Current Huya room HTML uses J_playerMain; legacy pages use player-wrap.
    const player = document.querySelector('#player-wrap') || document.querySelector('#J_playerMain') || document.querySelector('#player-container')
    if (!player || !player.isConnected) throw Error('虎牙当前页面未找到可操作的直播播放器，请先进入直播间')
    state.scroll = { x: window.scrollX, y: window.scrollY }; state.player = player
    save(player, 'data-moyu-huya-player', 'true')
    for (let ancestor = player.parentElement; ancestor; ancestor = ancestor.parentElement) save(ancestor, 'data-moyu-huya-ancestor', 'true')
    const style = document.createElement('style'); style.id = '__moyu_huya_window_fill_style__'
    style.textContent = '[data-moyu-huya-ancestor="true"]{transform:none!important;filter:none!important;perspective:none!important;contain:none!important;will-change:auto!important;overflow:visible!important;isolation:auto!important}' +
      '[data-moyu-huya-player="true"]{position:fixed!important;inset:0!important;left:0!important;top:0!important;width:100vw!important;height:100vh!important;min-width:0!important;min-height:0!important;max-width:none!important;max-height:none!important;margin:0!important;padding:0!important;transform:none!important;z-index:2147483647!important;background:#000!important;box-sizing:border-box!important}' +
      '[data-moyu-huya-player="true"] #player-container,[data-moyu-huya-player="true"] #hy-player,[data-moyu-huya-player="true"] .player-video,[data-moyu-huya-player="true"] .video-container{width:100%!important;height:100%!important;max-height:none!important}' +
      '[data-moyu-huya-player="true"] video{width:100%!important;height:100%!important;object-fit:contain!important;max-height:none!important}'
    document.head.appendChild(style); state.active = true
    return { fullscreen: true }
  }
  function click(event) {
    const button = event.target?.closest?.(selector)
    if (!button || button === document.body || button === document.documentElement) return
    const player = state.player || document.querySelector('#player-wrap') || document.querySelector('#J_playerMain') || document.querySelector('#player-container')
    if (!player?.contains(button)) return
    try { toggle(); event.preventDefault(); event.stopImmediatePropagation() }
    catch (error) {
      let alert = document.getElementById('__moyu_huya_window_fill_error__')
      if (!alert) { alert = document.createElement('div'); alert.id = '__moyu_huya_window_fill_error__'; alert.setAttribute('role', 'alert'); alert.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:2147483647;background:#7f1d1d;color:white;padding:8px'; document.body.appendChild(alert) }
      alert.textContent = error.message
    }
  }
  function keydown(event) { if (event.key === 'Escape' && state.active) { restore(); event.preventDefault(); event.stopImmediatePropagation() } }
  state.toggle = toggle
  state.cleanup = () => {
    restore(); document.removeEventListener('click', click, true); document.removeEventListener('keydown', keydown, true)
    document.getElementById('__moyu_huya_window_fill_error__')?.remove(); delete window.__moyuHuyaWindowFill
  }
  document.addEventListener('click', click, true); document.addEventListener('keydown', keydown, true)
  window.__moyuHuyaWindowFill = state
  return { installed: true }
}
export function toggleHuyaWindowFill() {
  if (!window.__moyuHuyaWindowFill) throw Error('虎牙直播播放器尚未准备好')
  return window.__moyuHuyaWindowFill.toggle()
}
export function cleanupHuyaWindowFill() {
  window.__moyuHuyaWindowFill?.cleanup()
  return { fullscreen: false }
}
