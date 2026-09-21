export function isTransparentGuestReady(guest) {
  try {
    return Boolean(
      guest &&
      typeof guest.getWebContentsId === 'function' &&
      guest.getWebContentsId() > 0 &&
      typeof guest.isLoading === 'function' &&
      !guest.isLoading()
    )
  } catch {
    return false
  }
}

export function transparentGuestReadyScript() {
  return `(() => {
    /* isTransparentGuestReady */
    const guest = document.querySelector('webview')
    try {
      return Boolean(
        guest &&
        typeof guest.getWebContentsId === 'function' &&
        guest.getWebContentsId() > 0 &&
        typeof guest.isLoading === 'function' &&
        !guest.isLoading()
      )
    } catch {
      return false
    }
  })()`
}

export function transparentGuestLoadScript(address) {
  return `(() => {
    const guest = document.querySelector('webview')
    if (!guest || typeof guest.getWebContentsId !== 'function' || guest.getWebContentsId() <= 0) {
      throw new Error('透明窗口的网页容器尚未附着')
    }
    return guest.loadURL(${JSON.stringify(address)})
  })()`
}

const defaultPause = delay => new Promise(resolve => setTimeout(resolve, delay))

function withWallClockTimeout(operation, timeoutMs, message) {
  const duration = Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 3000
  return new Promise((resolve, reject) => {
    let finished = false
    const finish = (settle, value) => {
      if (finished) return
      finished = true
      clearTimeout(timer)
      settle(value)
    }
    const timer = setTimeout(() => finish(reject, new Error(message)), duration)
    Promise.resolve()
      .then(operation)
      .then(
        value => finish(resolve, value),
        error => finish(reject, error)
      )
  })
}

export function createScopedAdCloser({ source, getCurrent, close }) {
  return () => {
    if (!source || source.isDestroyed() || getCurrent() !== source) return false
    return close()
  }
}

export async function transferToTransparentGuest({
  target,
  address,
  closeAd,
  pause = defaultPause,
  attempts = 100,
  interval = 100,
  timeoutMs = 3000
}) {
  let readinessError = null
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (target.isDestroyed() || target.webContents.isDestroyed()) {
      throw new Error('目标透明窗口已关闭')
    }

    let ready = false
    try {
      ready = await withWallClockTimeout(
        () => target.webContents.executeJavaScript(transparentGuestReadyScript()),
        timeoutMs,
        '透明窗口状态检查超时，请重试'
      )
    } catch (error) {
      if (/超时/.test(error?.message || '')) readinessError = error
    }

    if (ready) {
      await withWallClockTimeout(
        () => target.webContents.executeJavaScript(transparentGuestLoadScript(address)),
        timeoutMs,
        '透明窗口导航超时，请重试'
      )
      await closeAd()
      return true
    }

    if (attempt + 1 < attempts) await pause(interval)
  }

  if (readinessError) throw readinessError
  throw new Error('透明窗口尚未准备好，请重试')
}
