// Runs inside Electron, uses isolated data, never loads the reference application.
const { app, BrowserWindow, session, globalShortcut } = require('electron')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const assert = require('node:assert/strict')
const data = process.env.MOYU_SMOKE_DATA_DIR || fs.mkdtempSync(path.join(os.tmpdir(), 'moyu-window-smoke-'))
app.setPath('userData', data)
app.disableHardwareAcceleration()
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
let passed = 0
async function until(predicate, label) {
  for (let n = 0; n < 80; n++) { const result = await predicate(); if (result) return result; await pause(100) }
  throw new Error(`Timed out: ${label}`)
}
async function evaluate(window, code) { return window.webContents.executeJavaScript(code, true) }
function find(hash) { return BrowserWindow.getAllWindows().find((window) => window.webContents.getURL().endsWith(`#${hash}`)) }
async function check(name, operation) { await operation(); passed++; console.log(`PASS ${name}`) }
function activeWorkArea(){
  const {screen}=require('electron')
  return screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea
}
function windowSize(window){
  const {width,height}=window.getBounds()
  return {width,height}
}
function assertCentered(window,width,height){
  const area=activeWorkArea(),bounds=window.getBounds()
  // Windows DPI conversion can shift frameless bounds by a few DIPs when moving between screen positions.
  assert.ok(Math.abs(bounds.width-width)<=4,`width ${bounds.width} should retain ${width}`)
  assert.ok(Math.abs(bounds.height-height)<=4,`height ${bounds.height} should retain ${height}`)
  assert.ok(Math.abs(bounds.x-(area.x+Math.round((area.width-bounds.width)/2)))<=2)
  assert.ok(Math.abs(bounds.y-(area.y+Math.round((area.height-bounds.height)/2)))<=2)
}
const watchdog = setTimeout(() => { console.error('SMOKE timeout'); app.exit(1) }, 60000)

app.whenReady().then(async () => {
  // Block remote requests including embedded site pages, login and authorization.
  session.defaultSession.webRequest.onBeforeRequest({ urls: ['http://*/*','https://*/*'] }, (_details, callback) => callback({cancel:true}))
  try {
    const home = await until(() => find('/home'), 'home')
    await until(async () => evaluate(home, 'Boolean(window.homeElectronAPI && window.windowControl)'), 'production preload')
    if (process.argv.includes('--restore-only')) {
      await evaluate(home,'window.homeElectronAPI.createWeb()')
      const restored=await until(()=>find('/web'),'restored web')
      await until(async()=>evaluate(restored,'Boolean(document.querySelector(".bar"))'),'restored renderer')
      const savedSize=JSON.parse(fs.readFileSync(path.join(data,'expected-web-size.json'),'utf8'))
      assertCentered(restored,savedSize.width,savedSize.height)
      assert.ok(Math.abs(restored.getOpacity()-1)<0.03);assert.equal(restored.isAlwaysOnTop(),false)
      const keys=await evaluate(home,'window.ipcRenderer.invoke("get-shortcuts")')
      assert.match(keys.boss,/Ctrl\+Alt\+Shift\+F\d+/)
      assert.equal(globalShortcut.isRegistered(keys.boss),true)
      console.log('SMOKE_RESTART_RESULT {"passed":2,"failed":0}')
      clearTimeout(watchdog);globalShortcut.unregisterAll();app.exit(0);return
    }
    await check('home exposes seven video entries and five-mode chooser', async () => {
      await until(
        async () => (await evaluate(home, 'document.querySelectorAll(".video-grid button").length')) === 7,
        'seven video entries'
      )
      assert.deepEqual(
        await evaluate(home, '[...document.querySelectorAll(".video-grid button")].map(x=>x.textContent.trim())'),
        ['抖音模式', 'B站模式', '虎牙模式', '斗鱼模式', '快手模式', '自定义网站模式', '本地视频播放']
      )
      await evaluate(home, '[...document.querySelectorAll(".video-grid button")].find(x=>x.textContent.includes("抖音")).click()')
      await until(() => evaluate(home, 'Boolean(document.querySelector("[role=dialog]"))'), 'video mode dialog')
      assert.deepEqual(
        await evaluate(home, '[...document.querySelectorAll(".mode-button")].map(x=>x.textContent.trim())'),
        ['广告模式', '透明度模式', '微信模式', '钉钉模式', '飞书模式']
      )
      await evaluate(home, 'document.querySelector("[aria-label=关闭模式选择]").click()')
      await until(
        async () => !(await evaluate(home, 'Boolean(document.querySelector("[role=dialog]"))')),
        'video mode dialog closed'
      )
      assert.equal(await evaluate(home, 'Boolean(document.querySelector("[role=dialog]"))'), false)
    })
    await check('home dashboard fits desktop viewport and keeps a readable compact fallback',async()=>{
      home.setContentSize(1234,770)
      await pause(150)
      const desktop=await evaluate(home,`(()=>{
        const page=document.querySelector('.home')
        const groups=[...document.querySelectorAll('.dashboard .group')]
        const footer=document.querySelector('.ad-cover-entry')
        return {
          groups:groups.length,
          clientHeight:page.clientHeight,
          scrollHeight:page.scrollHeight,
          footerBottom:Math.ceil(footer.getBoundingClientRect().bottom)
        }
      })()`)
      assert.equal(desktop.groups,6)
      assert.ok(desktop.scrollHeight<=desktop.clientHeight+1,`desktop home scrolls: ${desktop.scrollHeight}/${desktop.clientHeight}`)
      assert.ok(desktop.footerBottom<=desktop.clientHeight+1,`footer bottom ${desktop.footerBottom} exceeds ${desktop.clientHeight}`)

      home.setContentSize(900,650)
      await pause(150)
      const compact=await evaluate(home,`(()=>{
        const dashboard=document.querySelector('.dashboard')
        return {
          columns:getComputedStyle(dashboard).gridTemplateColumns.split(' ').filter(Boolean).length,
          buttons:document.querySelectorAll('.dashboard button').length
        }
      })()`)
      assert.equal(compact.columns,2)
      // 22 个既有入口 + 手机投屏入口（f886e40 新增）
      assert.equal(compact.buttons,23)

      home.setContentSize(1234,770)
      await pause(100)
    })
    await check('preload exposes sender-targeted window control', async () => assert.equal(await evaluate(home,'typeof window.windowControl.getState'), 'function'))
    await evaluate(home, 'window.homeElectronAPI.createWeb()')
    let web = await until(() => find('/web'), 'web')
    await until(async () => evaluate(web,'Boolean(document.querySelector(".bar") && window.windowControl)'), 'web rendered')
    await check('page transparency buttons control only their window', async () => {
      await evaluate(web, 'document.querySelector("[data-action=opacity-down]").click()')
      await until(() => web.getOpacity()<1,'opacity button')
      assert.ok(Math.abs(web.getOpacity()-0.9)<0.03)
      assert.equal(home.getOpacity(),1)
    })
    await check('fullscreen button is independent of topmost', async () => {
      const top=web.isAlwaysOnTop()
      await evaluate(web,'document.querySelector("[data-action=fullscreen]").click()')
      await until(async () => (await evaluate(web,'window.windowControl.getState()')).fullscreen,'fullscreen')
      const area=require('electron').screen.getDisplayMatching(web.getBounds()).bounds
      assert.equal(web.getBounds().width,area.width); assert.equal(web.getBounds().height,area.height)
      assert.equal(web.isAlwaysOnTop(),top)
      await evaluate(web,'window.windowControl.setFullscreen(false)')
      await until(async () => !(await evaluate(web,'window.windowControl.getState()')).fullscreen,'leave fullscreen')
    })
    await check('auto-hide restores saved opacity when disabled', async () => {
      await evaluate(web,'window.windowControl.setOpacity(0.55)')
      const {screen}=require('electron'); const area=screen.getPrimaryDisplay().workArea; const cursor=screen.getCursorScreenPoint()
      web.setBounds({x:cursor.x<area.x+area.width/2?area.x+area.width-320:area.x,y:area.y,width:300,height:300})
      await evaluate(web,'window.windowControl.setAutoHide(true)')
      await until(() => web.getOpacity()===0,'cursor auto-hide')
      await evaluate(web,'window.windowControl.setAutoHide(false)')
      assert.ok(Math.abs(web.getOpacity()-0.55)<0.03)
    })
    await check('boss key leaves main visible and restores secondary opacity', async () => {
      await evaluate(home,'window.ipcRenderer.invoke("boss-key")')
      assert.equal(web.getOpacity(),0)
      assert.equal(home.getOpacity(),1)
      await evaluate(home,'window.ipcRenderer.invoke("boss-key")')
      assert.ok(Math.abs(web.getOpacity()-0.55)<0.03)
    })
    await check('preload event subscription can unsubscribe', async () => {
      await evaluate(web,'window.smokeEventCount=0; window.smokeUnsubscribe=window.windowControl.onState(()=>window.smokeEventCount++); true')
      await evaluate(web,'window.windowControl.setOpacity(0.5)')
      await until(async()=>evaluate(web,'window.smokeEventCount>0'),'event delivery')
      const count=await evaluate(web,'window.smokeEventCount')
      await evaluate(web,'window.smokeUnsubscribe(); window.smokeUnsubscribe(); window.windowControl.setOpacity(0.55)')
      await pause(150)
      assert.equal(await evaluate(web,'window.smokeEventCount'),count)
    })
    await check('ordinary reopen keeps only size and returns centered with default appearance',async()=>{
      const area=activeWorkArea()
      web.setBounds({x:area.x,y:area.y,width:420,height:360})
      const savedSize=windowSize(web)
      fs.writeFileSync(path.join(data,'expected-web-size.json'),JSON.stringify(savedSize))
      await evaluate(web,'(async()=>{await window.windowControl.setOpacity(.55);await window.windowControl.setAlwaysOnTop(true);await window.windowControl.setAutoHide(true)})()')
      const previous=web
      await evaluate(web,'window.windowControl.close()').catch(error=>{if(!/destroy|closed/i.test(error.message))throw error})
      await until(()=>previous.isDestroyed(),'web closed')
      await evaluate(home,'window.homeElectronAPI.createWeb()')
      web=await until(()=>find('/web'),'web reopened')
      await until(async()=>evaluate(web,'Boolean(document.querySelector(".bar"))'),'reopened rendered')
      assertCentered(web,savedSize.width,savedSize.height)
      assert.ok(Math.abs(web.getOpacity()-1)<0.03)
      assert.equal(web.isAlwaysOnTop(),false)
      assert.equal((await evaluate(web,'window.windowControl.getState()')).autoHideEnabled,false)
    })
    await check('advertisement reopen keeps only size and returns centered with default appearance',async()=>{
      await evaluate(home,"window.videoModeControl.open('douyin','ad')")
      let ad=await until(()=>find('/douyin'),'douyin ad')
      await until(()=>evaluate(ad,'Boolean(window.adModeControl)'),'ad preload')
      const area=activeWorkArea();ad.setBounds({x:area.x,y:area.y,width:330,height:440});const savedSize=windowSize(ad)
      ad.setOpacity(.4);ad.setAlwaysOnTop(true);await pause(100);const previous=ad
      await evaluate(ad,'window.adModeControl.close()').catch(error=>{if(!/destroy|closed/i.test(error.message))throw error})
      await until(()=>previous.isDestroyed(),'ad closed')
      await evaluate(home,"window.videoModeControl.open('douyin','ad')")
      ad=await until(()=>find('/douyin'),'ad reopened')
      assertCentered(ad,savedSize.width,savedSize.height);assert.ok(Math.abs(ad.getOpacity()-1)<.03);assert.equal(ad.isAlwaysOnTop(),false)
      ad.close();await until(()=>ad.isDestroyed(),'ad cleanup')
    })
    await check('chat reopen keeps only size and returns centered in the foreground',async()=>{
      await evaluate(home,"window.videoModeControl.open('douyin','wechat')")
      let chat=await until(()=>find('/wechat'),'wechat')
      const area=activeWorkArea();chat.setBounds({x:area.x,y:area.y,width:720,height:560});const savedSize=windowSize(chat);chat.setOpacity(.5);chat.setAlwaysOnTop(true);await pause(100)
      chat.close();await until(()=>chat.isDestroyed(),'chat closed')
      await evaluate(home,"window.videoModeControl.open('douyin','wechat')")
      chat=await until(()=>find('/wechat'),'wechat reopened')
      assertCentered(chat,savedSize.width,savedSize.height);assert.ok(Math.abs(chat.getOpacity()-1)<.03);assert.equal(chat.isAlwaysOnTop(),false)
      chat.close();await until(()=>chat.isDestroyed(),'chat cleanup')
    })
    await check('shortcut duplicate rejection leaves configuration unchanged', async () => {
      const before=await evaluate(home,'window.ipcRenderer.invoke("get-shortcuts")')
      const result=await evaluate(home,'window.ipcRenderer.invoke("set-shortcuts",{boss:"Ctrl+D",allNext:"Control+D"})')
      assert.equal(result.success,false)
      assert.deepEqual(await evaluate(home,'window.ipcRenderer.invoke("get-shortcuts")'),before)
      assert.equal(before.allNext,'Ctrl+K')
    })
    await check('successful shortcut save is registered by the actual OS', async () => {
      const before=await evaluate(home,'window.ipcRenderer.invoke("get-shortcuts")')
      const map=Object.fromEntries(Object.keys(before).map((key)=>[key,'']))
      let accepted
      for (const key of ['F12','F11','F10']) {
        map.boss=`Ctrl+Alt+Shift+${key}`
        const result=await evaluate(home,`window.ipcRenderer.invoke('set-shortcuts',${JSON.stringify(map)})`)
        if (result.success) { accepted=result.shortcuts;break }
      }
      assert.ok(accepted,'OS must accept at least one isolated test shortcut')
      assert.equal(globalShortcut.isRegistered(accepted.boss),true)
    })
    await check('generic managed-window setting cannot bypass active control', async () => {
      assert.equal(await evaluate(home,'window.settingApi.setSetting("web.alwaysOnTop",false).then(()=>false,()=>true)'),true)
      assert.equal(web.isAlwaysOnTop(),false)
    })
    await check('missing native alpha binding explicitly rejects', async () => {
      assert.equal(await evaluate(home,'window.alpha.lock().then(()=>false,()=>true)'),true)
      assert.equal(home.getOpacity(),1)
    })
    await check('transparent local-video close targets its own window', async () => {
      await evaluate(home,'window.localVideoAPI.createLocalVideoOpacityWindow()')
      const video=await until(()=>find('/localVideoOpacity'),'opacity video')
      await until(async()=>evaluate(video,'Boolean(document.querySelector("[data-action=close]"))'),'video rendered')
      await evaluate(video,'document.querySelector("[data-action=close]").click()').catch(error=>{if(!/destroy|closed/i.test(error.message))throw error})
      await until(()=>video.isDestroyed(),'video closed')
      assert.equal(home.isDestroyed(),false)
    })
    await check('real click-through capture distinguishes transparent and opaque pixels', async () => {
      await evaluate(home,'window.ipcRenderer.invoke("create-test-pierce")')
      const pierce=await until(()=>find('/testPierce'),'pierce window')
      const id=await until(async()=>{try{return await evaluate(pierce,'document.querySelector("webview")?.getWebContentsId()')}catch{return null}},'pierce guest')
      const guest=require('electron').webContents.fromId(id)
      await guest.loadURL('data:text/html,'+encodeURIComponent('<html><body style="margin:0;background:white"><canvas width="40" height="40" style="position:absolute;left:80px;top:80px"></canvas><script>const c=document.querySelector("canvas");c.getContext("2d").fillRect(0,0,40,40)</script></body></html>'))
      await evaluate(pierce,'document.querySelectorAll(".bar button")[1].click(); true')
      await until(async()=>evaluate(pierce,'document.querySelectorAll(".bar button")[1].textContent.includes("还原")'),'transparent CSS')
      const offset=await evaluate(pierce,'Math.round(document.querySelector("webview").getBoundingClientRect().top)')
      await pause(200)
      const empty=(await pierce.webContents.capturePage({x:20,y:offset+20,width:1,height:1})).toBitmap()
      const solid=(await pierce.webContents.capturePage({x:90,y:offset+90,width:1,height:1})).toBitmap()
      assert.ok(empty.length>=4 && empty[3]<10,`transparent pixel alpha=${empty[3]}`)
      assert.equal(solid[3],255)
      await evaluate(pierce,'window.ipcRenderer.invoke("testPierce:setPierceEnabled",true)')
      assert.equal((await evaluate(pierce,'window.windowControl.getState()')).pierceEnabled,true)
      await evaluate(pierce,'window.ipcRenderer.invoke("testPierce:setPierceEnabled",false)')
    })
    console.log(`SMOKE_RESULT ${JSON.stringify({passed,failed:0,isolatedData:true,remoteRequestsBlocked:true,physicalKeyboardVerified:false})}`)
    clearTimeout(watchdog); globalShortcut.unregisterAll(); app.exit(0)
  } catch (error) {
    console.error(error.stack)
    console.log(`SMOKE_RESULT ${JSON.stringify({passed,failed:1})}`)
    clearTimeout(watchdog); globalShortcut.unregisterAll(); app.exit(1)
  }
})
// Cold-start the actual main module before Electron becomes ready.
require('../out/main/index.js')
