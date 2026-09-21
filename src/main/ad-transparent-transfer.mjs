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

export async function transferToTransparentGuest({
  target,
  address,
  closeAd,
  pause = defaultPause,
  attempts = 100,
  interval = 100
}) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (target.isDestroyed() || target.webContents.isDestroyed()) {
      throw new Error('目标透明窗口已关闭')
    }

    const ready = await Promise.resolve(
      target.webContents.executeJavaScript(transparentGuestReadyScript())
    ).catch(() => false)

    if (ready) {
      await target.webContents.executeJavaScript(transparentGuestLoadScript(address))
      await closeAd()
      return true
    }

    if (attempt + 1 < attempts) await pause(interval)
  }

  throw new Error('透明窗口尚未准备好，请重试')
}
