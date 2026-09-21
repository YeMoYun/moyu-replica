const roots = { bilibili: 'bilibili.com', huya: 'huya.com', kuaishou: 'kuaishou.com', fanQue: 'fanqienovel.com', jinJiang: 'jjwxc.net' }
export function isPlatformURL(site, value) {
  try {
    const url = new URL(value), root = roots[site]
    return !!root && url.protocol === 'https:' && !url.port && !url.username && !url.password &&
      (url.hostname === root || url.hostname.endsWith(`.${root}`))
  } catch { return false }
}
export function installVideoGuestLinks(guest, { site, openExternal, report }) {
  let disposed = false
  const alive = () => !disposed && !guest.isDestroyed()
  const failure = error => { if (alive()) report(`视频页面跳转失败：${error.message || String(error)}`) }
  const dispose = () => { disposed = true; guest.removeListener('destroyed', dispose) }
  guest.once('destroyed', dispose)
  guest.setWindowOpenHandler(({ url }) => {
    if (alive()) {
      if (isPlatformURL(site, url)) {
        // Deny the popup first, then navigate the existing guest outside this callback.
        Promise.resolve().then(() => { if (alive()) return guest.loadURL(url) }).catch(failure)
      } else if (/^https?:\/\//i.test(url)) {
        try { Promise.resolve(openExternal(url)).catch(failure) } catch (error) { failure(error) }
      }
    }
    return { action: 'deny' }
  })
  return dispose
}
