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

test('resize session streams the raw cursor position to begin and move', () => {
  assert.equal(typeof createResizeSession, 'function')
  const cursors = []
  let committed = 0
  const begun = []
  const session = createResizeSession({
    begin: (directions, cursor) => begun.push([directions, cursor]),
    apply: (cursor) => cursors.push(cursor),
    commit: () => { committed++ }
  })
  session.move(pointer('pointermove', 500, 400))
  assert.deepEqual(cursors, [], 'moves before begin are ignored')
  session.begin({ h: 1, v: 1 }, pointer('pointerdown', 1000, 1000))
  assert.ok(begun[0][0].h === 1 && begun[0][0].v === 1)
  assert.deepEqual(begun[0][1], { x: 1000, y: 1000 })
  assert.ok(session.active)
  session.move(pointer('pointermove', 992, 1030))
  assert.deepEqual(cursors, [{ x: 992, y: 1030 }])
  assert.equal(session.end(), true)
  assert.equal(committed, 1)
  assert.equal(session.end(), false, 'second end is a no-op')
  assert.equal(committed, 1)
  assert.equal(session.move(pointer('pointermove', 70, 110)), false, 'moves after end are ignored')
})

test('all eight handles mount as transparent edge strips that drive the session', () => {
  const window = new Window()
  const document = window.document
  const host = document.createElement('div')
  document.body.appendChild(host)
  const cursors = []
  let committed = 0
  const session = createResizeSession({
    begin: () => {},
    apply: (cursor) => cursors.push(cursor),
    commit: () => { committed++ }
  })
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
  assert.deepEqual(cursors, [{ x: 470, y: 380 }])
  corner.dispatchEvent(domPointer(window, 'pointerup', 470, 380))
  assert.equal(committed, 1)

  dispose()
  assert.equal(host.querySelectorAll('.window-resize-handle').length, 0, 'dispose removes every handle')
})
