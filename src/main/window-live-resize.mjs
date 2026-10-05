// 无边框窗口实时缩放的共享状态机：按下时快照边界与光标，拖动中把被抓边缘
// 直接放到光标处（边缘与鼠标严格贴合），未涉及的边保持固定，不做工作区复位。
// 由 window-controls（普通窗口）与 ad-window-controls（广告窗口）共享注入使用。
export function createLiveResizeTracker({ screen, floor = 60 } = {}) {
  let active = null
  function displayArea(window) {
    return screen.getDisplayMatching?.(window.getBounds())?.workArea
      ?? screen.getAllDisplays?.()[0]?.workArea
      ?? null
  }
  return {
    begin(window, directions, cursor) {
      if (window.isDestroyed()) return false
      const bounds = window.getBounds()
      active = {
        window,
        h: directions?.h === 1 ? 1 : directions?.h === -1 ? -1 : 0,
        v: directions?.v === 1 ? 1 : directions?.v === -1 ? -1 : 0,
        left: bounds.x, top: bounds.y,
        right: bounds.x + bounds.width, bottom: bounds.y + bounds.height
      }
      return true
    },
    move(cursor) {
      if (!active || active.window.isDestroyed()) return null
      const { window, h, v, left, top, right, bottom } = active
      const cursorX = Number(cursor?.x)
      const cursorY = Number(cursor?.y)
      const next = { x: left, y: top, width: right - left, height: bottom - top }
      if (h === 1 && Number.isFinite(cursorX)) next.width = cursorX - left
      if (h === -1 && Number.isFinite(cursorX)) { next.x = cursorX; next.width = right - cursorX }
      if (v === 1 && Number.isFinite(cursorY)) next.height = cursorY - top
      if (v === -1 && Number.isFinite(cursorY)) { next.y = cursorY; next.height = bottom - cursorY }
      if (next.width < floor) {
        next.width = floor
        if (h === -1) next.x = right - floor
      }
      if (next.height < floor) {
        next.height = floor
        if (v === -1) next.y = bottom - floor
      }
      const area = displayArea(window)
      if (area) {
        if (next.width > area.width) {
          next.width = area.width
          if (h === -1) next.x = right - area.width
        }
        if (next.height > area.height) {
          next.height = area.height
          if (v === -1) next.y = bottom - area.height
        }
      }
      window.setBounds(next)
      return window.getBounds()
    },
    end() {
      const window = active?.window ?? null
      active = null
      return window && !window.isDestroyed() ? window.getBounds() : null
    },
    tracks(window) {
      return !!active && active.window === window
    }
  }
}
