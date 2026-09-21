import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('home has one restricted video-mode bridge instead of constructing routes', () => {
  const main = read('src/main/index.js')
  const preload = read('src/preload/index.js')

  assert.match(preload, /exposeInMainWorld\('videoModeControl'/)
  assert.match(preload, /ipcRenderer\.invoke\('video-mode:open'/)
  assert.match(main, /keyFromSender\(event\)!=='main'/)
  assert.match(main, /video-mode:open-recent-chat/)
  assert.match(main, /createVideoModeLauncher/)
})
