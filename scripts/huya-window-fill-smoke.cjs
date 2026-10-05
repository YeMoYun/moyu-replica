const {app,BrowserWindow,session,globalShortcut,webContents}=require('electron')
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{pathToFileURL}=require('node:url')
if(!process.env.MOYU_HUYA_FILL_DATA_DIR)throw Error('Isolated userData required')
app.setPath('userData',process.env.MOYU_HUYA_FILL_DATA_DIR);app.disableHardwareAcceleration()
const pause=ms=>new Promise(r=>setTimeout(r,ms)),evalHost=(w,code)=>w.webContents.executeJavaScript(code,true)
let passed=0;const watchdog=setTimeout(()=>app.exit(1),60000)
async function until(fn,label){for(let n=0;n<100;n++){if(await fn())return;await pause(100)}throw Error('Timeout: '+label)}
async function check(name,fn){await fn();passed++;console.log('PASS '+name)}
const find=r=>BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().endsWith('#'+r))
app.whenReady().then(async()=>{
  session.defaultSession.webRequest.onBeforeRequest({urls:['http://*/*','https://*/*']},(_,cb)=>cb({cancel:true}))
  try{
    await until(()=>find('/home'),'home');const home=find('/home')
    await until(()=>evalHost(home,'Boolean(window.homeElectronAPI)'),'bridge')
    await evalHost(home,'window.homeElectronAPI.createHuyaOpacity()');await until(()=>find('/huyaOpacity'),'window');const w=find('/huyaOpacity')
    await until(()=>evalHost(w,'Boolean(document.querySelector("webview"))'),'guest')
    const url=pathToFileURL(path.join(__dirname,'../tests/fixtures/web/video-opacity/huya-room.html')).href
    await evalHost(w,`document.querySelector('webview').loadURL(${JSON.stringify(url)})`)
    const ready=()=>until(()=>evalHost(w,"Boolean(document.querySelector('[data-action=zoom]')&&!document.querySelector('[data-action=zoom]').disabled)"),'ready')
    await ready();const g=webContents.fromId(await evalHost(w,"document.querySelector('webview').getWebContentsId()"))
    const original=await g.executeJavaScript("({style:document.querySelector('#J_playerMain').getAttribute('style'),marker:document.querySelector('#J_playerMain').getAttribute('data-moyu-huya-player'),html:document.querySelector('.room').innerHTML})")
    const bounds=w.getBounds(),opacity=w.getOpacity(),topmost=w.isAlwaysOnTop()
    const geometry=()=>g.executeJavaScript("(()=>{const r=document.querySelector('#J_playerMain').getBoundingClientRect(),v=document.querySelector('video').getBoundingClientRect();return {left:r.left,top:r.top,width:r.width,height:r.height,videoWidth:v.width,videoHeight:v.height,viewportWidth:innerWidth,viewportHeight:innerHeight}})()")
    const fits=async()=>{const b=await geometry();return Math.abs(b.left)<2&&Math.abs(b.top)<2&&Math.abs(b.width-b.viewportWidth)<2&&Math.abs(b.height-b.viewportHeight)<2&&Math.abs(b.videoWidth-b.viewportWidth)<2&&Math.abs(b.videoHeight-b.viewportHeight)<2}
    await check('actual right-bottom button fills existing guest and prevents HTML/native fullscreen',async()=>{
      await g.executeJavaScript("document.querySelector('.player-fullscreen-btn').click()")
      await until(fits,'player geometry');assert.equal(w.isFullScreen(),false);assert.deepEqual(w.getBounds(),bounds);assert.equal(w.getOpacity(),opacity);assert.equal(w.isAlwaysOnTop(),topmost)
      assert.equal(await g.executeJavaScript('document.body.dataset.nativeRequests||null'),null)
      assert.equal(await g.executeJavaScript('document.fullscreenElement===null'),true)
    })
    await check('second actual button click restores exact DOM attributes and original player',async()=>{
      await g.executeJavaScript("document.querySelector('.player-fullscreen-btn').click()")
      assert.deepEqual(await g.executeJavaScript("({style:document.querySelector('#J_playerMain').getAttribute('style'),marker:document.querySelector('#J_playerMain').getAttribute('data-moyu-huya-player'),html:document.querySelector('.room').innerHTML})"),original)
      assert.equal(await g.executeJavaScript("Boolean(document.querySelector('#__moyu_huya_window_fill_style__'))"),false)
    })
    await check('shortcut and Escape share the same window-local state',async()=>{
      w.webContents.send('all-screen');await until(fits,'shortcut fill')
      await g.executeJavaScript("document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))")
      await until(()=>g.executeJavaScript("!document.querySelector('[data-moyu-huya-player=true]')"),'Escape restore')
    })
    await check('manual zoom and native resize cannot leave player smaller than guest',async()=>{
      await evalHost(w,"document.querySelector('[data-action=zoom]').click()")
      await until(()=>evalHost(w,"Boolean(document.querySelector('[data-zoom]'))"),'dialog')
      await evalHost(w,"document.querySelector('[data-zoom=\"0.4\"]').click()");await ready()
      await evalHost(w,"document.querySelector('.dialog-close').click()")
      await g.executeJavaScript("document.querySelector('.player-fullscreen-btn').click()");await until(fits,'manual zoom fit')
      w.setBounds({...w.getBounds(),width:540,height:420});await until(fits,'resize fit');assert.ok(Math.abs(g.getZoomFactor()-.4)<.01)
    })
    await check('video continues and refresh resets layout without duplicated captured handlers',async()=>{
      assert.equal(await g.executeJavaScript('document.querySelector("video").paused'),false)
      await evalHost(w,"document.querySelector('[data-action=reload]').click()");await pause(150);await ready()
      assert.equal(await g.executeJavaScript("Boolean(document.querySelector('[data-moyu-huya-player=true]'))"),false)
      await g.executeJavaScript("document.querySelector('.player-fullscreen-btn').click()");await until(fits,'single enter after refresh')
      const artifacts=path.join(__dirname,'../.artifacts/huya-reading-demo-20260918');fs.mkdirSync(artifacts,{recursive:true});if(!w.isVisible())w.showInactive();await pause(150);fs.writeFileSync(path.join(artifacts,'huya-window-fill.png'),(await w.webContents.capturePage()).toPNG())
    })
    console.log('HUYA_FILL_RESULT '+JSON.stringify({passed,failed:0,isolatedData:true,onlineSiteVerified:false}));clearTimeout(watchdog);globalShortcut.unregisterAll();app.exit(0)
  }catch(e){console.error(e);console.log('HUYA_FILL_RESULT '+JSON.stringify({passed,failed:1}));clearTimeout(watchdog);app.exit(1)}
})
require('../out/main/index.js')
