// Windows 上透明无边框窗口被 Electron 剥离 WS_THICKFRAME，系统缩放循环只能把
// 边缘往外推、不能往里收。这里的透明手柄覆盖窗口右缘/下缘/右下角，用 pointer
// 事件把增量通过 IPC 交给主进程调整边界，放大缩小两个方向都可用。
export function createResizeSession({ apply, commit }) {
  let active = null
  return {
    get active() { return !!active },
    begin(directions, event) {
      active = { east: !!directions.east, south: !!directions.south, lastX: event.screenX, lastY: event.screenY }
    },
    move(event) {
      if (!active) return false
      const widthDelta = active.east ? event.screenX - active.lastX : 0
      const heightDelta = active.south ? event.screenY - active.lastY : 0
      active.lastX = event.screenX
      active.lastY = event.screenY
      if (!widthDelta && !heightDelta) return false
      apply({ widthDelta, heightDelta })
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

const DIRECTIONS = {
  east: { east: true, cursor: 'ew-resize' },
  south: { south: true, cursor: 'ns-resize' },
  corner: { east: true, south: true, cursor: 'nwse-resize' }
}

export function mountResizeHandles({ doc = document, host, session, thickness = 8, cornerSize = 16 }) {
  const geometry = {
    east: `top:0;right:0;bottom:${cornerSize}px;width:${thickness}px`,
    south: `left:0;bottom:0;right:${cornerSize}px;height:${thickness}px`,
    corner: `right:0;bottom:0;width:${cornerSize}px;height:${cornerSize}px`
  }
  const cleanups = []
  for (const [name, spec] of Object.entries(DIRECTIONS)) {
    const element = doc.createElement('div')
    element.className = 'window-resize-handle'
    element.dataset.resize = name
    element.setAttribute('aria-hidden', 'true')
    element.style.cssText = [
      'position:absolute', 'z-index:60', 'user-select:none', 'touch-action:none',
      '-webkit-app-region:no-drag', `cursor:${spec.cursor}`, geometry[name]
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
