const { app, BrowserWindow, session, globalShortcut, webContents, screen } = require('electron')
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict')
const { pathToFileURL } = require('node:url')
if (!process.env.MOYU_VIDEO_OPACITY_DATA_DIR) throw Error('Isolated userData is required')
app.setPath('userData', process.env.MOYU_VIDEO_OPACITY_DATA_DIR); app.disableHardwareAcceleration()
const pause = ms => new Promise(resolve => setTimeout(resolve, ms))
const evaluate = (window, code) => window.webContents.executeJavaScript(code, true)
const find = route => BrowserWindow.getAllWindows().find(w => w.webContents.getURL().endsWith(`#${route}`))
const fixturePath = path.join(__dirname, '../tests/fixtures/web/video-opacity/video.html')
const fixtureHTML = fs.readFileSync(fixturePath, 'utf8')
const artifacts = path.join(__dirname, '../.artifacts/video-opacity-demo-20260917')
const snapshotPath = path.join(process.env.MOYU_VIDEO_OPACITY_DATA_DIR, 'smoke-bounds-snapshots.json')
const snapshots = process.argv.includes('--restore-only') ? JSON.parse(fs.readFileSync(snapshotPath, 'utf8')) : {}
const profiles = [
  { site: 'bilibili', name: 'B站', api: 'createBilibiliOpacity', zoom: .75, opacity: .33, topmost: true },
  { site: 'huya', name: '虎牙', api: 'createHuyaOpacity', zoom: .4, opacity: .47, topmost: false },
  { site: 'kuaishou', name: '快手', api: 'createKuaishou', zoom: 1, opacity: .61, topmost: true }
]
let passed = 0, fixtureRequests = 0
const watchdog = setTimeout(() => { console.error('VIDEO_OPACITY smoke timeout'); app.exit(1) }, 120000)
async function until(predicate, label) {
  for (let n = 0; n < 100; n++) { const result = await predicate(); if (result) return result; await pause(100) }
  throw Error(`Timed out: ${label}`)
}
async function check(name, operation) { await operation(); passed++; console.log(`PASS ${name}`) }
const click = (window, action) => evaluate(window, `document.querySelector('[data-action="${action}"]').click()`)
const ready = window => until(() => evaluate(window, "Boolean(document.querySelector('[data-action=zoom]')&&!document.querySelector('[data-action=zoom]').disabled)"), 'renderer ready')
async function loadFixture(window, site) {
  await until(() => evaluate(window, 'Boolean(document.querySelector("webview"))'), 'webview')
  const url = `${pathToFileURL(fixturePath).href}?platform=${site}`
  await evaluate(window, `document.querySelector('webview').loadURL(${JSON.stringify(url)})`); await ready(window)
  return webContents.fromId(await evaluate(window, "document.querySelector('webview').getWebContentsId()"))
}
async function screenshot(window, name) {
  // Software-rendered smoke windows may not have emitted ready-to-show yet.
  // Show this isolated window without taking keyboard focus before visual QA.
  if (!window.isVisible()) window.showInactive()
  await evaluate(window, 'new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))')
  await pause(100)
  fs.mkdirSync(artifacts, { recursive: true }); fs.writeFileSync(path.join(artifacts, name), (await window.webContents.capturePage()).toPNG())
}
async function closeDialog(window) { await evaluate(window, "document.querySelector('.dialog-close').click()") }
function assertRestoredBounds(window, expected) {
  const actual = window.getBounds()
  // Restoring the same integer DIP bounds can differ by 1–2 pixels in native
  // transparent Windows under display scaling. Keep a small explicit tolerance.
  for (const field of ['x', 'y', 'width', 'height']) assert.ok(Math.abs(actual[field] - expected[field]) <= 2,
    `${field}: saved=${expected[field]}, actual=${actual[field]}, scale=${screen.getDisplayMatching(actual).scaleFactor}`)
}
app.whenReady().then(async () => {
  // Built-in HTTPS is intercepted, never forwarded to net.fetch: only this
  // isolated fixture path is served. Every other remote request receives 503.
  session.defaultSession.protocol.handle('https', request => {
    const url = new URL(request.url)
    if (profiles.some(p => url.hostname === `www.${p.site}.com`) && url.pathname === '/__moyu_fixture__/next') {
      fixtureRequests++; return new Response(fixtureHTML, { headers: { 'content-type': 'text/html; charset=utf-8' } })
    }
    return new Response('Remote networking blocked in isolated smoke test', { status: 503 })
  })
  session.defaultSession.webRequest.onBeforeRequest({ urls: ['http://*/*'] }, (_details, callback) => callback({ cancel: true }))
  try {
    const home = await until(() => find('/home'), 'home')
    await until(() => evaluate(home, 'Boolean(window.homeElectronAPI&&window.windowControl)'), 'preload')
    if (!process.argv.includes('--restore-only')) await check('home only offers four transparent platform entries', async () => {
      const labels = await evaluate(home, "Array.from(document.querySelectorAll('.group'))[2].querySelector('.grid').textContent")
      for (const label of ['抖音透明化', 'B站透明化', '虎牙透明化', '快手透明化']) assert.ok(labels.includes(label))
      assert.doesNotMatch(labels, /抖音模式|B站模式|虎牙直播/)
      await screenshot(home, 'home-transparent-entries.png')
    })
    for (const p of profiles) {
      const key = `${p.site}Opacity`, prefix = p.site
      assert.equal(await evaluate(home, `window.homeElectronAPI.${p.api}()`), true)
      let window = await until(() => find(`/${key}`), key), guest = await loadFixture(window, p.site)
      if (process.argv.includes('--restore-only')) {
        await check(`${prefix} process restart restores independent native state and bounds`, async () => {
          assert.ok(Math.abs(window.getOpacity() - p.opacity) < .03); assert.equal(window.isAlwaysOnTop(), p.topmost)
          // Compare against the actual pre-close OS geometry, not requested DIP
          // sizes: Windows may round dimensions under display scaling.
          assertRestoredBounds(window, snapshots[p.site])
        })
        await check(`${prefix} process restart restores independent manual zoom`, async () => {
          assert.ok(Math.abs(guest.getZoomFactor() - p.zoom) < .01)
          assert.equal(await evaluate(window, `window.settingApi.getSetting('${key}.autoFit')`), false)
        })
        await click(window, 'close').catch(error => { if (!/destroy|closed/i.test(error.message)) throw error })
        continue
      }
      await check(`${prefix} genuine disposed native frame cannot crash Electron forwarder`, async () => {
        await guest.executeJavaScript("(()=>{const f=document.createElement('iframe');f.id='disposal';f.name='disposal';f.src='about:blank';document.body.appendChild(f)})()")
        const frame = await until(() => guest.mainFrame.frames.find(f => f.name === 'disposal'), 'native frame')
        await guest.executeJavaScript("document.querySelector('#disposal').remove()")
        await until(() => { try { void frame.processId; return false } catch (error) { return error.message === 'Render frame was disposed before WebFrameMain could be accessed' } }, 'disposed frame')
        assert.doesNotThrow(() => guest.emit('will-frame-navigate', { url: 'about:blank', isMainFrame: false, frame }))
      })
      await check(`${prefix} 34px eight-icon toolbar has no legacy generic controls`, async () => {
        assert.equal(await evaluate(window, "getComputedStyle(document.querySelector('.toolbar')).height"), '34px')
        assert.deepEqual(await evaluate(window, "Array.from(document.querySelectorAll('.toolbar button')).map(b=>b.dataset.action)"), ['hide-bar', 'topmost', 'close', 'reload', 'help', 'zoom', 'opacity', 'auto-hide'])
        assert.equal(await evaluate(window, "Boolean(document.querySelector('.addr,.bar,[data-action=fullscreen],input[type=checkbox]'))"), false)
        await screenshot(window, `${prefix}-compact.png`)
      })
      await check(`${prefix} eye restores toolbar without changing guest`, async () => {
        const id = guest.id, zoom = guest.getZoomFactor(); await click(window, 'hide-bar')
        await until(() => evaluate(window, "Boolean(document.querySelector('[data-action=show-bar]'))"), 'eye')
        await click(window, 'show-bar'); await ready(window); assert.equal(guest.id, id); assert.equal(guest.getZoomFactor(), zoom)
      })
      await check(`${prefix} help shows platform and configured shortcuts with Escape focus restoration`, async () => {
        await evaluate(window, "document.querySelector('[data-action=help]').focus()"); await click(window, 'help')
        await until(() => evaluate(window, "document.querySelector('.shortcut-list')?.textContent.includes('Ctrl+J')"), 'shortcuts')
        assert.ok((await evaluate(window, "document.querySelector('[role=dialog]').textContent")).includes(p.name))
        assert.equal(await evaluate(window, "document.activeElement.getAttribute('role')"), 'dialog')
        await screenshot(window, `${prefix}-help.png`)
        await evaluate(window, "window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}))")
        await until(() => evaluate(window, "!document.querySelector('[role=dialog]')"), 'dismissed')
        assert.equal(await evaluate(window, 'document.activeElement.dataset.action'), 'help')
      })
      await check(`${prefix} native resize fits actual guest and internal scroll remains functional`, async () => {
        window.setSize(700, 600); await until(() => Math.abs(guest.getZoomFactor() - .55) < .01, 'fit')
        assert.equal(await guest.executeJavaScript("getComputedStyle(document.querySelector('.feed')).overflowY"), 'auto')
        await guest.executeJavaScript("document.querySelector('.feed').scrollTop=100")
        assert.ok(Math.abs(await guest.executeJavaScript("document.querySelector('.feed').scrollTop") - 100) < 2)
      })
      await check(`${prefix} presets are manual, restore fits, and refresh preserves final selection`, async () => {
        await click(window, 'zoom'); await until(() => evaluate(window, "Boolean(document.querySelector('[data-zoom]'))"), 'zoom')
        await evaluate(window, "document.querySelector('[data-zoom=\"0.75\"]').click()"); await ready(window)
        window.setSize(500, 450); await pause(250); assert.ok(Math.abs(guest.getZoomFactor() - .75) < .01)
        await click(window, 'auto-fit'); await ready(window); assert.ok(Math.abs(guest.getZoomFactor() - .39) < .01)
        await evaluate(window, `document.querySelector('[data-zoom="${p.zoom}"]').click()`); await ready(window)
        await screenshot(window, `${prefix}-zoom.png`); await closeDialog(window)
        await click(window, 'reload'); await pause(150); await ready(window)
        assert.ok(Math.abs(guest.getZoomFactor() - p.zoom) < .01)
        assert.equal(await guest.executeJavaScript(`document.querySelectorAll('#__moyu_${key}_fit__').length`), 1)
      })
      await check(`${prefix} previous/next events use platform controls exactly once with safe missing-button behavior`, async () => {
        window.webContents.send('all-next'); await until(() => guest.executeJavaScript("document.body.dataset.next==='1'"), 'next')
        window.webContents.send('all-prev'); await until(() => guest.executeJavaScript("document.body.dataset.prev==='1'"), 'prev')
        await guest.executeJavaScript("document.querySelector('[aria-label=下一条视频]').remove()")
        window.webContents.send('all-next')
        if (p.site === 'kuaishou') await until(() => guest.executeJavaScript("document.body.dataset.key==='ArrowDown'"), 'fallback')
        else {
          await until(() => evaluate(window, "document.querySelector('[role=alert]')?.textContent.includes('未找到')"), 'missing next error')
          assert.equal(await guest.executeJavaScript('document.body.dataset.key||null'), null)
          await evaluate(window, "document.querySelector('[role=alert] button').click()")
        }
      })
      await check(`${prefix} player fullscreen stays separate from native fullscreen and reports missing target`, async () => {
        window.webContents.send('all-screen'); await until(() => guest.executeJavaScript(p.site==='huya' ? "Boolean(document.querySelector('[data-moyu-huya-player=true]'))" : "document.body.dataset.fullscreen==='clicked'"), 'player fullscreen')
        assert.equal(window.isFullScreen(), false); assert.equal(window.isAlwaysOnTop(), false)
        if(p.site==='huya') {
          const box=await guest.executeJavaScript("(()=>{const r=document.querySelector('#J_playerMain').getBoundingClientRect();return {width:r.width,height:r.height,vw:innerWidth,vh:innerHeight}})()")
          assert.ok(Math.abs(box.width-box.vw)<2&&Math.abs(box.height-box.vh)<2)
          window.webContents.send('all-screen');await until(()=>guest.executeJavaScript("!document.querySelector('[data-moyu-huya-player=true]')"),'exit fullscreen')
          await guest.executeJavaScript("document.querySelector('#J_playerMain').removeAttribute('id')")
        } else await guest.executeJavaScript("document.querySelector('[aria-label=播放器全屏]').remove()")
        window.webContents.send('all-screen'); await until(() => evaluate(window, "document.querySelector('[role=alert]')?.textContent.includes('未找到')"), 'fullscreen error')
        await evaluate(window, "document.querySelector('[role=alert] button').click()")
        if(p.site==='huya')await guest.executeJavaScript("document.querySelector('[data-huya-fixture]').id='J_playerMain'")
      })
      await check(`${prefix} genuine videos play/pause and boss resumes only those previously playing`, async () => {
        await until(() => guest.executeJavaScript("Array.from(document.querySelectorAll('video')).every(v=>!v.paused)"), 'playing')
        window.webContents.send('stop-or-continue'); await until(() => guest.executeJavaScript("Array.from(document.querySelectorAll('video')).every(v=>v.paused)"), 'paused')
        window.webContents.send('stop-or-continue'); await until(() => guest.executeJavaScript("Array.from(document.querySelectorAll('video')).every(v=>!v.paused)"), 'resumed')
        await guest.executeJavaScript("document.querySelectorAll('video')[1].pause()")
        await evaluate(home, 'window.ipcRenderer.invoke("boss-key")'); await until(() => window.getOpacity() === 0, 'boss hidden')
        await until(() => guest.executeJavaScript("Array.from(document.querySelectorAll('video')).every(v=>v.paused)"), 'boss paused')
        await evaluate(home, 'window.ipcRenderer.invoke("boss-key")')
        await until(() => guest.executeJavaScript("!document.querySelectorAll('video')[0].paused&&document.querySelectorAll('video')[1].paused"), 'selective resumed')
      })
      await check(`${prefix} fast opacity inputs commit final value and topmost is window-scoped`, async () => {
        await click(window, 'opacity'); await until(() => evaluate(window, "Boolean(document.querySelector('[data-setting=opacity]'))"), 'opacity')
        assert.deepEqual(await evaluate(window, "['min','max','step'].map(k=>document.querySelector('[data-setting=opacity]').getAttribute(k))"), ['0.1', '1', '0.01'])
        await evaluate(window, `(()=>{const input=document.querySelector('[data-setting=opacity]');for(const value of [.8,.7,${p.opacity}]){input.value=value;input.dispatchEvent(new Event('input',{bubbles:true}))}})()`)
        await until(() => Math.abs(window.getOpacity() - p.opacity) < .03, 'opacity committed'); assert.equal(home.getOpacity(), 1)
        await screenshot(window, `${prefix}-opacity.png`); await closeDialog(window)
        if (p.topmost) { await click(window, 'topmost'); await until(() => window.isAlwaysOnTop(), 'topmost') }
        assert.equal(window.isFullScreen(), false)
      })
      await check(`${prefix} cursor auto-hide restores configured opacity`, async () => {
        const area = screen.getPrimaryDisplay().workArea, cursor = screen.getCursorScreenPoint()
        window.setBounds({ x: cursor.x < area.x + area.width / 2 ? area.x + area.width - 500 : area.x, y: area.y, width: 500, height: 450 })
        await click(window, 'auto-hide'); await until(() => window.getOpacity() === 0, 'auto hidden')
        await click(window, 'auto-hide'); await until(() => Math.abs(window.getOpacity() - p.opacity) < .03, 'auto restored')
      })
      await check(`${prefix} actual target=_blank station link navigates same guest without a native popup`, async () => {
        const id = guest.id, count = BrowserWindow.getAllWindows().length
        assert.equal(guest.getLastWebPreferences().disablePopups, false)
        await guest.executeJavaScript("document.querySelector('#same-guest-link').click()")
        await until(() => guest.getURL().startsWith(`https://www.${p.site}.com/__moyu_fixture__/next`), 'same guest navigation')
        await ready(window); assert.equal(guest.id, id); assert.equal(BrowserWindow.getAllWindows().length, count)
        assert.ok(Math.abs(guest.getZoomFactor() - p.zoom) < .01)
      })
      await check(`${prefix} close/reopen preserves distinct preferences and subscriptions do not duplicate`, async () => {
        const index = profiles.indexOf(p)
        window.setBounds({ x: 20 + index * 40, y: 20 + index * 40, width: 500 + index * 40, height: 450 + index * 40 })
        snapshots[p.site] = window.getBounds()
        fs.writeFileSync(snapshotPath, JSON.stringify(snapshots))
        const old = window
        await click(window, 'close').catch(error => { if (!/destroy|closed/i.test(error.message)) throw error }); await until(() => old.isDestroyed(), 'closed')
        assert.deepEqual(await evaluate(home, `window.settingApi.getSetting('windowState.${key}.bounds')`), snapshots[p.site])
        await evaluate(home, `window.homeElectronAPI.${p.api}()`); window = await until(() => find(`/${key}`), 'reopened'); guest = await loadFixture(window, p.site)
        assert.ok(Math.abs(window.getOpacity() - p.opacity) < .03); assert.equal(window.isAlwaysOnTop(), p.topmost)
        assertRestoredBounds(window, snapshots[p.site])
        assert.ok(Math.abs(guest.getZoomFactor() - p.zoom) < .01)
        window.webContents.send('all-next'); await until(() => guest.executeJavaScript("document.body.dataset.next==='1'"), 'single next')
        await click(window, 'close').catch(error => { if (!/destroy|closed/i.test(error.message)) throw error }); await until(() => window.isDestroyed(), 'closed again')
      })
    }
    if (!process.argv.includes('--restore-only')) assert.equal(fixtureRequests, 3)
    console.log(`VIDEO_OPACITY_${process.argv.includes('--restore-only') ? 'RESTART_' : ''}RESULT ${JSON.stringify({ passed, failed: 0, fixtureRequests, isolatedData: true, remoteRequestsBlocked: true, onlineSiteVerified: false, physicalKeyboardVerified: false })}`)
    clearTimeout(watchdog); globalShortcut.unregisterAll(); app.exit(0)
  } catch (error) { console.error(error); console.log(`VIDEO_OPACITY_RESULT ${JSON.stringify({ passed, failed: 1 })}`); clearTimeout(watchdog); globalShortcut.unregisterAll(); app.exit(1) }
})
require('../out/main/index.js')
