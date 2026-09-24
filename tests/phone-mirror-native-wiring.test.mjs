import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const main = readFileSync(new URL('../native/QtScrcpy/QtScrcpy/main.cpp', import.meta.url), 'utf8')
const dialogHeader = readFileSync(
  new URL('../native/QtScrcpy/QtScrcpy/ui/dialog.h', import.meta.url),
  'utf8'
)
const dialogSource = readFileSync(
  new URL('../native/QtScrcpy/QtScrcpy/ui/dialog.cpp', import.meta.url),
  'utf8'
)

test('Qt main wires Electron focus, boss visibility, and shutdown to the accepted window', () => {
  assert.match(main, /MoyuIpcBridge::fromEnvironment/)
  assert.match(main, /focusMainAppRequested/)
  assert.match(main, /focusQtScrcpyRequested/)
  assert.match(main, /bossHideRequested/)
  assert.match(main, /bossShowRequested/)
  assert.match(main, /shutdownRequested/)
  assert.match(main, /QApplication::topLevelWidgets/)
  assert.match(dialogHeader, /void restoreAndPresent\(\);/)
  assert.match(dialogSource, /void Dialog::restoreAndPresent\(\)/)
  assert.match(dialogSource, /m_moyuWindow->restoreAndPresent\(\)/)
})
