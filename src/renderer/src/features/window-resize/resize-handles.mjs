// Windows 上透明无边框窗口被 Electron 剥离 WS_THICKFRAME，系统缩放循环只能把
// 边缘往外推、不能往里收；因此窗口定义中 resizable 必须为 false，让整圈边缘
// 都交给这里的透明手柄，用 pointer 事件把增量通过 IPC 交给主进程调整边界。
// h/v 取值：1=右/下缘，-1=左/上缘（拖动时同时移动 x/y，保持对边固定），0=不涉及。
const DIRECTIONS = {
  east: { h: 1, v: 0, cursor: 'ew-resize' },
  west: { h: -1, v: 0, cursor: 'ew-resize' },
  south: { h: 0, v: 1, cursor: 'ns-resize' },
  north: { h: 0, v: -1, cursor: 'ns-resize' },
  cornerSe: { h: 1, v: 1, cursor: 'nwse-resize' },
  cornerNw: { h: -1, v: -1, cursor: 'nwse-resize' },
  cornerNe: { h: 1, v: -1, cursor: 'nesw-resize' },
  cornerSw: { h: -1, v: 1, cursor: 'nesw-resize' }
}

export function createResizeSession({ apply, commit }) {
  let active = null
  return {
    get active() { return !!active },
    begin(directions, event) {
      active = { ...directions, lastX: event.screenX, lastY: event.screenY }
    },
    move(event) {
      if (!active) return false
      const dx = event.screenX - active.lastX
      const dy = event.screenY - active.lastY
      active.lastX = event.screenX
      active.lastY = event.screenY
      const widthDelta = active.h === 1 ? dx : active.h === -1 ? -dx : 0
      const heightDelta = active.v === 1 ? dy : active.v === -1 ? -dy : 0
      const xDelta = active.h === -1 ? dx : 0
      const yDelta = active.v === -1 ? dy : 0
      if (!widthDelta && !heightDelta) return false
      apply({ widthDelta, heightDelta, xDelta, yDelta })
      return true
    },
    end() {
      if (!active) return false
      active = null
      commit()
      return true
    }
  }
}

const STRIP = 8
const CORNER = 16

const GEOMETRY = {
  east: `top:0;right:0;bottom:${CORNER}px;width:${STRIP}px`,
  west: `top:0;left:0;bottom:${CORNER}px;width:${STRIP}px`,
  south: `left:${CORNER}px;right:${CORNER}px;bottom:0;height:${STRIP}px`,
  north: `left:${CORNER}px;right:${CORNER}px;top:0;height:${STRIP}px`,
  cornerSe: `right:0;bottom:0;width:${CORNER}px;height:${CORNER}px`,
  cornerSw: `left:0;bottom:0;width:${CORNER}px;height:${CORNER}px`,
  cornerNe: `right:0;top:0;width:${CORNER}px;height:${CORNER}px`,
  cornerNw: `left:0;top:0;width:${CORNER}px;height:${CORNER}px`
}

export function mountResizeHandles({ doc = document, host, session }) {
  const cleanups = []
  for (const [name, spec] of Object.entries(DIRECTIONS)) {
    const element = doc.createElement('div')
    element.className = 'window-resize-handle'
    element.dataset.resize = name
    element.setAttribute('aria-hidden', 'true')
    element.style.cssText = [
      'position:absolute', 'z-index:60', 'user-select:none', 'touch-action:none',
      '-webkit-app-region:no-drag', `cursor:${spec.cursor}`, GEOMETRY[name]
    ].join(';')
    element.addEventListener('pointerdown', (event) => {
      if (event.button !== 0) return
      event.preventDefault()
      try { element.setPointerCapture?.(event.pointerId) } catch {}
      session.begin(spec, event)
    })
    element.addEventListener('pointermove', (event) => session.move(event))
    const finish = (event) => {
      if (!session.active) return
      try { element.releasePointerCapture?.(event.pointerId) } catch {}
      session.end()
    }
    element.addEventListener('pointerup', finish)
    element.addEventListener('pointercancel', finish)
    host.appendChild(element)
    cleanups.push(() => element.remove())
  }
  return () => cleanups.forEach((cleanup) => cleanup())
}
