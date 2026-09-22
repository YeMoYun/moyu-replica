const { app, BrowserWindow, globalShortcut, session, webContents } = require('electron')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { pathToFileURL } = require('node:url')

const dataDirectory = process.env.MOYU_CHAT_MATRIX_DATA_DIR
if (!dataDirectory) throw new Error('Isolated matrix data required')
app.setPath('userData', dataDirectory)
app.disableHardwareAcceleration()

const pause = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds))
const evaluate = (window, code) => window.webContents.executeJavaScript(code, true)
const find = route => BrowserWindow.getAllWindows().find(window => window.webContents.getURL().endsWith(`#${route}`))
const watchdog = setTimeout(() => {
  console.error('Video chat matrix watchdog')
  app.exit(1)
}, 180000)

async function until(predicate, label, attempts = 180) {
  let lastError
  for (let index = 0; index < attempts; index++) {
    try {
      if (await predicate()) return
    } catch (error) {
      lastError = error
    }
    await pause(100)
  }
  throw new Error(`Timeout: ${label}${lastError ? ` (${lastError.message})` : ''}`)
}

async function closeChat(window, route) {
  await evaluate(window, 'window.videoChatModeControl.close()').catch(error => {
    if (!/destroy|closed/i.test(error.message)) throw error
  })
  await until(() => !find(route), `${route} close`)
}

app.whenReady().then(async () => {
  const { chatContext } = await import(pathToFileURL(path.join(__dirname, '../src/shared/chat-context.mjs')).href)
  const { videoPlatform } = await import(pathToFileURL(path.join(__dirname, '../src/shared/video-platforms.mjs')).href)
  const fixture = fs.readFileSync(path.join(__dirname, '../tests/fixtures/web/ad-modes/video.html'), 'utf8')
  const platforms = ['bilibili', 'huya', 'douyu', 'kuaishou']
  const skins = ['wechat', 'dingtalk', 'feishu']
  const contexts = platforms.flatMap(platform => skins.map(skin => chatContext(platform, skin)))
  const sessions = new Map()
  const blocked = { http: [], https: [] }

  for (const context of contexts) {
    const isolatedSession = session.fromPartition(context.partition)
    const allowedHosts = videoPlatform(context.platform).hosts
    isolatedSession.webRequest.onBeforeRequest({ urls: ['http://*/*'] }, (details, callback) => {
      blocked.http.push({ context: context.id, url: details.url })
      callback({ cancel: true })
    })
    await isolatedSession.protocol.handle('https', request => {
      const url = new URL(request.url)
      const allowed = allowedHosts.some(host => url.hostname === host || url.hostname.endsWith(`.${host}`))
      if (!allowed) {
        blocked.https.push({ context: context.id, url: request.url })
        return new Response('Blocked by isolated video-chat matrix', { status: 404 })
      }
      const marker = `<script>document.body.dataset.matrix=${JSON.stringify(context.id)}</script>`
      return new Response(fixture + marker, { headers: { 'content-type': 'text/html; charset=utf-8' } })
    })
    sessions.set(context.id, isolatedSession)
  }

  try {
    await until(() => find('/home'), 'home')
    const home = find('/home')
    await until(() => evaluate(home, 'Boolean(window.videoModeControl)'), 'video mode bridge')
    let passed = 0

    for (let index = 0; index < contexts.length; index++) {
      const context = contexts[index]
      const scale = 80 + index * 10
      await evaluate(home, `window.videoModeControl.open(${JSON.stringify(context.platform)},${JSON.stringify(context.skin)})`)
      await until(() => find(context.route), `${context.id} window`)
      let window = find(context.route)
      await until(
        () => evaluate(window, 'document.querySelector("[data-chat-ready]")?.dataset.chatReady==="true"'),
        `${context.id} ready`
      )

      const runtimeContext = await evaluate(window, 'window.videoChatModeControl.getContext()')
      const state = await evaluate(window, 'window.videoChatModeControl.get()')
      assert.equal(runtimeContext.id, context.id)
      assert.equal(runtimeContext.route, context.route)
      assert.equal(runtimeContext.partition, context.partition)
      assert.equal(state.settings.site, context.platform)

      await evaluate(window, 'document.querySelector("[data-action=insert]").click()')
      await until(
        () => evaluate(window, 'document.querySelector("webview")?.dataset.playerReady==="true"'),
        `${context.id} guest`
      )
      const guest = webContents.fromId(await evaluate(window, 'document.querySelector("webview").getWebContentsId()'))
      assert.ok(guest, `${context.id} guest webContents must exist`)
      assert.equal(guest.session, sessions.get(context.id))
      assert.equal(await guest.executeJavaScript('document.body.dataset.matrix'), context.id)

      const firstWindowId = window.id
      const firstGuestId = guest.id
      await evaluate(home, `window.videoModeControl.open(${JSON.stringify(context.platform)},${JSON.stringify(context.skin)})`)
      assert.equal(find(context.route).id, firstWindowId)
      assert.equal(await evaluate(window, 'document.querySelector("webview").getWebContentsId()'), firstGuestId)

      await evaluate(
        window,
        `(async()=>{const state=await window.videoChatModeControl.get();state.settings.scale=${scale};return window.videoChatModeControl.save(state,state.revision)})()`
      )
      await closeChat(window, context.route)

      await evaluate(home, `window.videoModeControl.open(${JSON.stringify(context.platform)},${JSON.stringify(context.skin)})`)
      await until(() => find(context.route), `${context.id} reopen`)
      window = find(context.route)
      await until(
        () => evaluate(window, 'document.querySelector("[data-chat-ready]")?.dataset.chatReady==="true"'),
        `${context.id} restored`
      )
      assert.equal((await evaluate(window, 'window.videoChatModeControl.get()')).settings.scale, scale)
      await closeChat(window, context.route)
      passed++
      console.log(`PASS ${context.id}`)
    }

    const bossContexts = [
      chatContext('bilibili', 'wechat'),
      chatContext('huya', 'dingtalk'),
      chatContext('douyu', 'feishu')
    ]
    for (const context of bossContexts) {
      await evaluate(home, `window.videoModeControl.open(${JSON.stringify(context.platform)},${JSON.stringify(context.skin)})`)
      await until(() => find(context.route), `${context.id} boss window`)
      const window = find(context.route)
      await until(
        () => evaluate(window, 'document.querySelector("[data-chat-ready]")?.dataset.chatReady==="true"'),
        `${context.id} boss ready`
      )
      if (!await evaluate(window, 'Boolean(document.querySelector("webview"))')) {
        await evaluate(window, 'document.querySelector("[data-action=insert]").click()')
      }
      await until(() => evaluate(window, 'document.querySelector("webview")?.dataset.playerReady==="true"'), `${context.id} boss guest`)
    }

    await evaluate(home, "window.ipcRenderer.invoke('boss-key')")
    for (const context of bossContexts) {
      const window = find(context.route)
      await until(() => evaluate(window, 'Boolean(document.querySelector("[data-cover=chat-video]"))'), `${context.id} covered`)
      assert.equal(window.getOpacity(), 1)
      assert.equal(window.isVisible(), true)
    }
    await evaluate(home, "window.ipcRenderer.invoke('boss-key')")
    for (const context of bossContexts) {
      const window = find(context.route)
      await until(() => evaluate(window, '!document.querySelector("[data-cover=chat-video]")'), `${context.id} restored`)
      await closeChat(window, context.route)
    }

    assert.deepEqual(blocked.http, [], 'matrix must not attempt plain HTTP networking')
    assert.deepEqual(blocked.https, [], 'matrix must not attempt non-whitelisted HTTPS networking')
    console.log('VIDEO_CHAT_MATRIX_RESULT ' + JSON.stringify({
      passed,
      combinations: contexts.length,
      failed: 0,
      isolatedData: true,
      remoteRequestsBlocked: true,
      onlineVerified: false
    }))
    clearTimeout(watchdog)
    globalShortcut.unregisterAll()
    app.exit(0)
  } catch (error) {
    console.error(error.stack)
    for (const window of BrowserWindow.getAllWindows().filter(value => !value.isDestroyed())) {
      console.error('WINDOW', window.webContents.getURL(), await evaluate(window, 'document.body.innerText').catch(() => ''))
    }
    clearTimeout(watchdog)
    globalShortcut.unregisterAll()
    app.exit(1)
  } finally {
    for (const isolatedSession of sessions.values()) {
      try { isolatedSession.protocol.unhandle('https') } catch {}
    }
  }
})

require('../out/main/index.js')
