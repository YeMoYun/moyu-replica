// Electron 31's guest-view-manager forwards will-frame-navigate by reading
// event.frame.processId/routingId. A late event may refer to a disposed native
// frame and throw synchronously from that internal callback (browser_init).
// Keep this version-scoped shim here, not in node_modules or a global exception
// handler. Re-evaluate/remove it when upgrading the pinned Electron runtime.
const installed = new WeakMap()
const disposedFrameMessage = 'Render frame was disposed before WebFrameMain could be accessed'

export function installGuestFrameNavigationGuard(guest, {
  electronVersion = process.versions.electron,
  report = message => console.warn(message)
} = {}) {
  if (!/^31\./.test(electronVersion || '')) return () => {}
  if (installed.has(guest)) return installed.get(guest)

  const replacements = []
  for (const listener of guest.listeners('will-frame-navigate')) {
    const source = Function.prototype.toString.call(listener)
    // Match only the known Electron forwarding callback, never app listeners.
    if (!source.includes('GUEST_VIEW_INTERNAL_DISPATCH_EVENT') ||
        !source.includes('will-frame-navigate') || !/\.frame\s*\.\s*processId/.test(source)) continue
    function guardedNavigation(...args) {
      try { return listener.apply(this, args) }
      catch (error) {
        if (error?.message !== disposedFrameMessage) throw error
        report('抖音透明度：已跳过销毁子页面的过期导航事件（Electron 31 兼容处理）')
      }
    }
    const first = guest.listeners('will-frame-navigate')[0] === listener
    guest.removeListener('will-frame-navigate', listener)
    if (first) guest.prependListener('will-frame-navigate', guardedNavigation)
    else guest.on('will-frame-navigate', guardedNavigation)
    replacements.push({ listener, guardedNavigation, first })
  }
  if (!replacements.length) {
    report('抖音透明度：未找到 Electron 31 导航转发回调，请检查运行时兼容性')
    return () => {}
  }

  let disposed = false
  function dispose() {
    if (disposed) return
    disposed = true
    guest.removeListener('destroyed', dispose)
    for (const { listener, guardedNavigation, first } of replacements) {
      guest.removeListener('will-frame-navigate', guardedNavigation)
      if (!guest.isDestroyed()) {
        if (first) guest.prependListener('will-frame-navigate', listener)
        else guest.on('will-frame-navigate', listener)
      }
    }
    installed.delete(guest)
  }
  guest.once('destroyed', dispose)
  installed.set(guest, dispose)
  return dispose
}
