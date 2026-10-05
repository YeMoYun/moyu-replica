import test from 'node:test'
import assert from 'node:assert/strict'
import { Window } from 'happy-dom'
const { createResizeSession, mountResizeHandles } = await import('../src/renderer/src/features/window-resize/resize-handles.mjs').catch((e) => {
  if (e.code === 'ERR_MODULE_NOT_FOUND') return {}
  throw e
})

const pointer = (type, x, y) => {
  const event = { screenX: x, screenY: y, button: 0, pointerId: 1 }
  event.type = type
  return event
}
const domPointer = (window, type, x, y) => {
  const event = new window.Event(type)
  event.screenX = x
  event.screenY = y
  event.button = 0
  event.pointerId = 1
  return event
}

test('resize session turns pointer deltas into incremental resize deltas', () => {
  assert.equal(typeof createResizeSession, 'function')
  const applied = []
  let committed = 0
  const session = createResizeSession({ apply: (delta) => applied.push(delta), commit: () => { committed++ } })
  assert.equal(session.move(pointer('pointermove', 100, 100)), false, 'moves before begin are ignored')
  session.begin({ h: 1, v: 1 }, pointer('pointerdown', 100, 100))
  assert.ok(session.active)
  assert.equal(session.move(pointer('pointermove', 92, 130)), true)
  assert.deepEqual(applied, [{ widthDelta: -8, heightDelta: 30, xDelta: 0, yDelta: 0 }])
  assert.equal(session.move(pointer('pointermove', 92, 130)), false, 'no delta means no apply')
  assert.equal(session.move(pointer('pointermove', 80, 118)), true)
  assert.deepEqual(applied[1], { widthDelta: -12, heightDelta: -12, xDelta: 0, yDelta: 0 })
  assert.equal(session.end(), true)
  assert.equal(committed, 1)
  assert.equal(session.end(), false, 'second end is a no-op')
  assert.equal(committed, 1)
  assert.equal(session.move(pointer('pointermove', 70, 110)), false, 'moves after end are ignored')
})

test('east-only session keeps height untouched and commit fires once per drag', () => {
  const applied = []
  const session = createResizeSession({ apply: (delta) => applied.push(delta), commit: () => {} })
  session.begin({ h: 1, v: 0 }, pointer('pointerdown', 10, 10))
  session.move(pointer('pointermove', 40, 999))
  assert.deepEqual(applied, [{ widthDelta: 30, heightDelta: 0, xDelta: 0, yDelta: 0 }])
})

test('west and north drags move the window origin so the opposite edge stays fixed', () => {
  const applied = []
  const session = createResizeSession({ apply: (delta) => applied.push(delta), commit: () => {} })
  session.begin({ h: -1, v: 0 }, pointer('pointerdown', 100, 100))
  session.move(pointer('pointermove', 130, 100))
  assert.deepEqual(applied[0], { widthDelta: -30, heightDelta: 0, xDelta: 30, yDelta: 0 })
  session.begin({ h: 0, v: -1 }, pointer('pointerdown', 100, 100))
  session.move(pointer('pointermove', 100, 60))
  assert.deepEqual(applied[1], { widthDelta: 0, heightDelta: 40, xDelta: 0, yDelta: -40 })
  session.begin({ h: -1, v: -1 }, pointer('pointerdown', 100, 100))
  session.move(pointer('pointermove', 110, 90))
  assert.deepEqual(applied[2], { widthDelta: -10, heightDelta: 10, xDelta: 10, yDelta: -10 })
})

test('all eight handles mount as transparent edge strips that drive the session', () => {
  const window = new Window()
  const document = window.document
  const host = document.createElement('div')
  document.body.appendChild(host)
  const applied = []
  let committed = 0
  const session = createResizeSession({ apply: (delta) => applied.push(delta), commit: () => { committed++ } })
  const dispose = mountResizeHandles({ doc: document, host, session })
  const names = ['east', 'west', 'south', 'north', 'cornerSe', 'cornerNw', 'cornerNe', 'cornerSw']
  for (const name of names) {
    const handle = host.querySelector(`[data-resize="${name}"]`)
    assert.ok(handle, `${name} handle must exist`)
    assert.equal(handle.getAttribute('aria-hidden'), 'true')
    assert.match(handle.style.cssText, /position:\s*absolute/)
  }
  assert.match(host.querySelector('[data-resize="east"]').style.cssText, /cursor:\s*ew-resize/)
  assert.match(host.querySelector('[data-resize="east"]').style.cssText, /right:\s*0/)
  assert.match(host.querySelector('[data-resize="west"]').style.cssText, /left:\s*0/)
  assert.match(host.querySelector('[data-resize="south"]').style.cssText, /bottom:\s*0/)
  assert.match(host.querySelector('[data-resize="north"]').style.cssText, /top:\s*0/)
  assert.match(host.querySelector('[data-resize="north"]').style.cssText, /cursor:\s*ns-resize/)
  assert.match(host.querySelector('[data-resize="cornerNe"]').style.cssText, /cursor:\s*nesw-resize/)
  assert.match(host.querySelector('[data-resize="cornerNw"]').style.cssText, /left:\s*0/)
  assert.match(host.querySelector('[data-resize="cornerNw"]').style.cssText, /top:\s*0/)
  assert.match(host.querySelector('[data-resize="cornerSe"]').style.cssText, /cursor:\s*nwse-resize/)

  const corner = host.querySelector('[data-resize="cornerSe"]')
  corner.dispatchEvent(domPointer(window, 'pointerdown', 500, 400))
  corner.dispatchEvent(domPointer(window, 'pointermove', 470, 380))
  assert.deepEqual(applied, [{ widthDelta: -30, heightDelta: -20, xDelta: 0, yDelta: 0 }])
  corner.dispatchEvent(domPointer(window, 'pointerup', 470, 380))
  assert.equal(committed, 1)

  const west = host.querySelector('[data-resize="west"]')
  west.dispatchEvent(domPointer(window, 'pointerdown', 100, 300))
  west.dispatchEvent(domPointer(window, 'pointermove', 140, 300))
  west.dispatchEvent(domPointer(window, 'pointerup', 140, 300))
  assert.deepEqual(applied[1], { widthDelta: -40, heightDelta: 0, xDelta: 40, yDelta: 0 })
  assert.equal(committed, 2)

  dispose()
  assert.equal(host.querySelectorAll('.window-resize-handle').length, 0, 'dispose removes every handle')
})
