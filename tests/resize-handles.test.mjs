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
  session.begin({ east: true, south: true }, pointer('pointerdown', 100, 100))
  assert.ok(session.active)
  assert.equal(session.move(pointer('pointermove', 92, 130)), true)
  assert.deepEqual(applied, [{ widthDelta: -8, heightDelta: 30 }])
  assert.equal(session.move(pointer('pointermove', 92, 130)), false, 'no delta means no apply')
  assert.equal(session.move(pointer('pointermove', 80, 118)), true)
  assert.deepEqual(applied[1], { widthDelta: -12, heightDelta: -12 })
  assert.equal(session.end(), true)
  assert.equal(committed, 1)
  assert.equal(session.end(), false, 'second end is a no-op')
  assert.equal(committed, 1)
  assert.equal(session.move(pointer('pointermove', 70, 110)), false, 'moves after end are ignored')
})

test('east-only session keeps height untouched and commit fires once per drag', () => {
  const applied = []
  const session = createResizeSession({ apply: (delta) => applied.push(delta), commit: () => {} })
  session.begin({ east: true }, pointer('pointerdown', 10, 10))
  session.move(pointer('pointermove', 40, 999))
  assert.deepEqual(applied, [{ widthDelta: 30, heightDelta: 0 }])
})

test('handles mount transparent edge strips that drive the session', () => {
  const window = new Window()
  const document = window.document
  const host = document.createElement('div')
  document.body.appendChild(host)
  const applied = []
  let committed = 0
  const session = createResizeSession({ apply: (delta) => applied.push(delta), commit: () => { committed++ } })
  const dispose = mountResizeHandles({ doc: document, host, session })
  const byName = (name) => host.querySelector(`[data-resize="${name}"]`)
  for (const name of ['east', 'south', 'corner']) {
    const handle = byName(name)
    assert.ok(handle, `${name} handle must exist`)
    assert.equal(handle.getAttribute('aria-hidden'), 'true')
    assert.match(handle.style.cssText, /position:\s*absolute/)
  }
  assert.match(byName('east').style.cssText, /cursor:\s*ew-resize/)
  assert.match(byName('south').style.cssText, /cursor:\s*ns-resize/)
  assert.match(byName('corner').style.cssText, /cursor:\s*nwse-resize/)

  const corner = byName('corner')
  corner.dispatchEvent(domPointer(window, 'pointerdown', 500, 400))
  corner.dispatchEvent(domPointer(window, 'pointermove', 470, 380))
  assert.deepEqual(applied, [{ widthDelta: -30, heightDelta: -20 }])
  corner.dispatchEvent(domPointer(window, 'pointerup', 470, 380))
  assert.equal(committed, 1)

  const east = byName('east')
  east.dispatchEvent(domPointer(window, 'pointerdown', 500, 100))
  east.dispatchEvent(domPointer(window, 'pointermove', 530, 100))
  east.dispatchEvent(domPointer(window, 'pointerup', 530, 100))
  assert.deepEqual(applied[1], { widthDelta: 30, heightDelta: 0 })
  assert.equal(committed, 2)

  dispose()
  assert.equal(host.querySelectorAll('.window-resize-handle').length, 0, 'dispose removes every handle')
})
