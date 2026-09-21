const {app,BrowserWindow,session,globalShortcut,webContents,screen}=require('electron')
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict')
const {pathToFileURL}=require('node:url')
if(!process.env.MOYU_DOUYIN_DATA_DIR)throw Error('Isolated userData is required')
app.setPath('userData',process.env.MOYU_DOUYIN_DATA_DIR);app.disableHardwareAcceleration()
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms)),evaluate=(window,code)=>window.webContents.executeJavaScript(code,true)
let passed=0
async function until(predicate,label){for(let n=0;n<100;n++){const result=await predicate();if(result)return result;await pause(100)}throw Error(`Timed out: ${label}`)}
async function check(name,fn){await fn();passed++;console.log(`PASS ${name}`)}
const find=route=>BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().endsWith(`#${route}`))
const fixture=pathToFileURL(path.join(__dirname,'../tests/fixtures/web/douyin/douyin.html')).href
const watchdog=setTimeout(()=>{console.error('DOUYIN smoke timeout');app.exit(1)},60000)
const artifacts=path.join(__dirname,'../.artifacts/douyin-opacity-demo-20260917')
const click=(window,action)=>evaluate(window,`document.querySelector('[data-action="${action}"]').click()`)
async function ready(window){await until(()=>evaluate(window,"Boolean(document.querySelector('[data-action=zoom]')&&!document.querySelector('[data-action=zoom]').disabled)"),'opacity renderer ready')}
async function loadFixture(window){
  await until(()=>evaluate(window,'Boolean(document.querySelector("webview"))'),'webview')
  await evaluate(window,`document.querySelector('webview').loadURL(${JSON.stringify(fixture)})`)
  await ready(window)
  return webContents.fromId(await evaluate(window,"document.querySelector('webview').getWebContentsId()"))
}
async function screenshot(window,name){fs.mkdirSync(artifacts,{recursive:true});fs.writeFileSync(path.join(artifacts,name),(await window.webContents.capturePage()).toPNG())}
const slide=(window,name,value)=>evaluate(window,`(()=>{const input=document.querySelector('[data-setting=${name}]');input.value='${value}';input.dispatchEvent(new Event('input',{bubbles:true}))})()`)
app.whenReady().then(async()=>{
  session.defaultSession.webRequest.onBeforeRequest({urls:['http://*/*','https://*/*']},(_details,callback)=>callback({cancel:true}))
  try{
    const home=await until(()=>find('/home'),'home');await until(()=>evaluate(home,'Boolean(window.homeElectronAPI&&window.windowControl)'),'preload')
    await evaluate(home,'window.homeElectronAPI.createDouyinOpacity()')
    let window=await until(()=>find('/douyinOpacity'),'opacity window'),guest=await loadFixture(window)
    if(process.argv.includes('--restore-only')){
      assert.ok(Math.abs(window.getOpacity()-.33)<.03);assert.equal(window.isAlwaysOnTop(),true)
      assert.ok(Math.abs(guest.getZoomFactor()-.75)<.01)
      assert.equal(await evaluate(window,"window.settingApi.getSetting('douyinOpacity.autoFit')"),false)
      console.log('DOUYIN_RESTART_RESULT {"passed":3,"failed":0}')
      clearTimeout(watchdog);globalShortcut.unregisterAll();app.exit(0);return
    }
    await check('disposed native WebFrameMain does not crash the Electron navigation forwarder',async()=>{
      await guest.executeJavaScript("(()=>{const frame=document.createElement('iframe');frame.id='disposal-repro';frame.name='moyu-disposal-repro';frame.src='about:blank';document.body.appendChild(frame)})()")
      const disposedFrame=await until(()=>guest.mainFrame.frames.find(frame=>frame.name==='moyu-disposal-repro'),'native child frame')
      await guest.executeJavaScript("document.querySelector('#disposal-repro').remove()")
      await until(()=>{try{void disposedFrame.processId;return false}catch(error){return error.message==='Render frame was disposed before WebFrameMain could be accessed'}},'native frame disposed')
      // Deterministically replay a late navigation with a genuinely disposed
      // native frame against Electron's installed callback; no fake frame getter.
      assert.doesNotThrow(()=>guest.emit('will-frame-navigate',{url:'about:blank',isMainFrame:false,frame:disposedFrame}))
      assert.equal(guest.isDestroyed(),false)
    })
    await check('34px toolbar matches approved ordering with no generic controls',async()=>{
      assert.equal(await evaluate(window,"getComputedStyle(document.querySelector('.toolbar')).height"),'34px')
      assert.deepEqual(await evaluate(window,"Array.from(document.querySelectorAll('.toolbar button')).map(b=>b.dataset.action)"),['hide-bar','topmost','close','reload','help','zoom','opacity','auto-hide'])
      assert.equal(await evaluate(window,"Boolean(document.querySelector('.addr,.bar,[data-action=fullscreen]'))"),false)
      assert.ok(Math.abs(guest.getZoomFactor()-.39)<.01);await screenshot(window,'douyin-compact-autofit.png')
    })
    await check('eye restores toolbar without resetting guest zoom',async()=>{
      await click(window,'hide-bar');await until(()=>evaluate(window,"Boolean(document.querySelector('[data-action=show-bar]'))"),'eye')
      await click(window,'show-bar');await ready(window);assert.ok(Math.abs(guest.getZoomFactor()-.39)<.01)
    })
    await check('help displays configured shortcuts and Escape restores button focus',async()=>{
      await evaluate(window,"document.querySelector('[data-action=help]').focus()")
      await click(window,'help');await until(()=>evaluate(window,"document.querySelector('.shortcut-list')?.textContent.includes('Ctrl+J')"),'configured help')
      assert.equal(await evaluate(window,"document.activeElement.getAttribute('role')"),'dialog')
      await screenshot(window,'douyin-help-dialog.png')
      await evaluate(window,"window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}))")
      await until(()=>evaluate(window,"!document.querySelector('[role=dialog]')"),'Escape dismissal')
      assert.equal(await evaluate(window,"document.activeElement.dataset.action"),'help')
    })
    await check('real guest zoom changes with native resize and preserves internal scroll',async()=>{
      window.setSize(700,600);await until(()=>Math.abs(guest.getZoomFactor()-.55)<.01,'resize fit')
      assert.equal(await guest.executeJavaScript("getComputedStyle(document.querySelector('.feed')).overflowY"),'auto')
      await guest.executeJavaScript("document.querySelector('.feed').scrollTop=100")
      // Chromium quantizes scroll offsets to physical pixels at fractional zoom.
      assert.ok(Math.abs(await guest.executeJavaScript("document.querySelector('.feed').scrollTop")-100)<2)
      await screenshot(window,'douyin-resized-autofit.png')
    })
    await check('manual zoom presets persist and auto fit can be restored',async()=>{
      await click(window,'zoom');await until(()=>evaluate(window,"Boolean(document.querySelector('[data-zoom]'))"),'zoom dialog')
      await evaluate(window,"document.querySelector('[data-zoom=\"0.75\"]').click()");await ready(window)
      assert.ok(Math.abs(guest.getZoomFactor()-.75)<.01)
      window.setSize(500,450);await pause(250);assert.ok(Math.abs(guest.getZoomFactor()-.75)<.01)
      await click(window,'auto-fit');await ready(window);assert.ok(Math.abs(guest.getZoomFactor()-.39)<.01)
      await evaluate(window,"document.querySelector('[data-zoom=\"0.75\"]').click()");await ready(window)
      await screenshot(window,'douyin-zoom-dialog.png');await evaluate(window,"document.querySelector('.dialog-close').click()")
    })
    await check('global event bridge controls previous next and keyboard fallback exactly once',async()=>{
      window.webContents.send('all-next');await until(()=>guest.executeJavaScript("document.body.dataset.next==='1'"),'next')
      window.webContents.send('all-prev');await until(()=>guest.executeJavaScript("document.body.dataset.prev==='1'"),'prev')
      await guest.executeJavaScript("document.querySelector('[aria-label=下一条视频]').remove()")
      window.webContents.send('all-next');await until(()=>guest.executeJavaScript("document.body.dataset.key==='ArrowDown'"),'fallback')
    })
    await check('global player fullscreen is separate from native fullscreen and topmost',async()=>{
      window.webContents.send('all-screen');await until(()=>guest.executeJavaScript("document.body.dataset.fullscreen==='clicked'"),'player fullscreen')
      assert.equal(window.isFullScreen(),false);assert.equal(window.isAlwaysOnTop(),false)
      await guest.executeJavaScript("document.querySelector('[aria-label=播放器全屏]').remove()")
      window.webContents.send('all-screen');await until(()=>evaluate(window,"document.querySelector('[role=alert]')?.textContent.includes('未找到可操作')"),'visible missing-player error')
      await evaluate(window,"document.querySelector('[role=alert] button').click()")
    })
    await check('play pause acts on genuine HTML videos and boss restores only previously playing',async()=>{
      await until(()=>guest.executeJavaScript("Array.from(document.querySelectorAll('video')).every(v=>!v.paused)"),'playing videos')
      window.webContents.send('stop-or-continue');await until(()=>guest.executeJavaScript("Array.from(document.querySelectorAll('video')).every(v=>v.paused)"),'paused videos')
      window.webContents.send('stop-or-continue');await until(()=>guest.executeJavaScript("Array.from(document.querySelectorAll('video')).every(v=>!v.paused)"),'resumed videos')
      await guest.executeJavaScript("document.querySelectorAll('video')[1].pause()")
      await evaluate(home,'window.ipcRenderer.invoke("boss-key")');await until(()=>window.getOpacity()===0,'boss hidden')
      await until(()=>guest.executeJavaScript("Array.from(document.querySelectorAll('video')).every(v=>v.paused)"),'boss paused')
      await evaluate(home,'window.ipcRenderer.invoke("boss-key")');await until(()=>guest.executeJavaScript("!document.querySelectorAll('video')[0].paused&&document.querySelectorAll('video')[1].paused"),'boss selective resume')
    })
    await check('native opacity precision and topmost remain scoped to opacity window',async()=>{
      await click(window,'opacity');await until(()=>evaluate(window,"Boolean(document.querySelector('[data-setting=opacity]'))"),'opacity dialog')
      assert.deepEqual(await evaluate(window,"['min','max','step'].map(k=>document.querySelector('[data-setting=opacity]').getAttribute(k))"),['0.1','1','0.01'])
      // A quick continuous drag must commit the final input rather than drop it while busy.
      await evaluate(window,"(()=>{const input=document.querySelector('[data-setting=opacity]');for(const value of ['0.56','0.42','0.33']){input.value=value;input.dispatchEvent(new Event('input',{bubbles:true}))}})()")
      await until(()=>Math.abs(window.getOpacity()-.33)<.03,'final live opacity input')
      assert.equal(home.getOpacity(),1);await screenshot(window,'douyin-opacity-dialog.png')
      await evaluate(window,"document.querySelector('.dialog-close').click()");await click(window,'topmost');await until(()=>window.isAlwaysOnTop(),'topmost')
      assert.equal(window.isFullScreen(),false)
    })
    await check('native cursor auto hide restores configured opacity',async()=>{
      const area=screen.getPrimaryDisplay().workArea,cursor=screen.getCursorScreenPoint()
      window.setBounds({x:cursor.x<area.x+area.width/2?area.x+area.width-500:area.x,y:area.y,width:500,height:450})
      await click(window,'auto-hide');await until(()=>window.getOpacity()===0,'auto hidden')
      await click(window,'auto-hide');await until(()=>Math.abs(window.getOpacity()-.33)<.03,'auto restored')
    })
    await check('refresh reapplies owned CSS and saved manual zoom',async()=>{
      await click(window,'reload');await pause(150);await ready(window)
      assert.ok(Math.abs(guest.getZoomFactor()-.75)<.01)
      assert.equal(await guest.executeJavaScript("document.querySelectorAll('#__moyu_douyin_opacity_fit__').length"),1)
    })
    await check('close reopen restores settings with no duplicate event subscriptions',async()=>{
      const old=window;await click(window,'close').catch(error=>{if(!/destroy|closed/i.test(error.message))throw error});await until(()=>old.isDestroyed(),'closed')
      await evaluate(home,'window.homeElectronAPI.createDouyinOpacity()');window=await until(()=>find('/douyinOpacity'),'reopen');guest=await loadFixture(window)
      assert.ok(Math.abs(window.getOpacity()-.33)<.03);assert.equal(window.isAlwaysOnTop(),true);assert.ok(Math.abs(guest.getZoomFactor()-.75)<.01)
      window.webContents.send('all-next');await until(()=>guest.executeJavaScript("document.body.dataset.next==='1'"),'single next after reopen')
    })
    console.log(`DOUYIN_RESULT ${JSON.stringify({passed,failed:0,isolatedData:true,remoteRequestsBlocked:true,onlineSiteVerified:false,physicalKeyboardVerified:false})}`)
    clearTimeout(watchdog);globalShortcut.unregisterAll();app.exit(0)
  }catch(error){console.error(error);console.log(`DOUYIN_RESULT ${JSON.stringify({passed,failed:1})}`);clearTimeout(watchdog);globalShortcut.unregisterAll();app.exit(1)}
})
require('../out/main/index.js')
