// Production Electron/Vue integration, isolated settings and local guest content only.
const {app,BrowserWindow,session,globalShortcut,webContents,screen}=require('electron')
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict')
const {pathToFileURL}=require('node:url')
if(!process.env.MOYU_WEREAD_DATA_DIR)throw new Error('Isolated userData is required')
app.setPath('userData',process.env.MOYU_WEREAD_DATA_DIR);app.disableHardwareAcceleration()
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms))
const evaluate=(window,code)=>window.webContents.executeJavaScript(code,true)
let passed=0
async function until(predicate,label){for(let n=0;n<100;n++){const result=await predicate();if(result)return result;await pause(100)}throw new Error(`Timed out: ${label}`)}
async function check(name,fn){await fn();passed++;console.log(`PASS ${name}`)}
const find=route=>BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().endsWith(`#${route}`))
const fixture=pathToFileURL(path.join(__dirname,'../tests/fixtures/web/reader/weread.html')).href
const watchdog=setTimeout(()=>{console.error('WEREAD smoke timeout');app.exit(1)},60000)
const artifacts=path.join(__dirname,'../.artifacts/weread-demo-20260917')
async function click(window,action){return evaluate(window,`document.querySelector('[data-action="${action}"]').click()`)}
async function ready(window){return until(()=>evaluate(window,"Boolean(document.querySelector('[data-action=reader-controls]') && !document.querySelector('[data-action=reader-controls]').disabled)"),'reading renderer ready')}
async function loadFixture(window){
  await until(()=>evaluate(window,'Boolean(document.querySelector("webview"))'),'webview')
  await evaluate(window,`document.querySelector('webview').loadURL(${JSON.stringify(fixture)})`)
  await ready(window)
  const id=await evaluate(window,"document.querySelector('webview').getWebContentsId()")
  return webContents.fromId(id)
}
async function screenshot(window,name){fs.mkdirSync(artifacts,{recursive:true});fs.writeFileSync(path.join(artifacts,name),(await window.webContents.capturePage()).toPNG())}
app.whenReady().then(async()=>{
  session.defaultSession.webRequest.onBeforeRequest({urls:['http://*/*','https://*/*']},(_details,callback)=>callback({cancel:true}))
  try{
    const home=await until(()=>find('/home'),'home')
    await until(()=>evaluate(home,'Boolean(window.homeElectronAPI && window.windowControl)'),'preload')
    await evaluate(home,'window.homeElectronAPI.createWeRead()')
    let window=await until(()=>find('/weRead'),'WeRead window'), guest=await loadFixture(window)
    if(process.argv.includes('--restore-only')){
      assert.ok(Math.abs(window.getOpacity()-0.33)<0.03);assert.equal(window.isAlwaysOnTop(),true)
      assert.equal(await evaluate(window,"document.querySelector('[data-action=web-transparent]').getAttribute('aria-pressed')"),'true')
      assert.equal(await guest.executeJavaScript('getComputedStyle(document.body).backgroundColor'),'rgba(0, 0, 0, 0)')
      assert.ok(Math.abs(guest.getZoomFactor()-0.85)<0.01)
      console.log('WEREAD_RESTART_RESULT {"passed":3,"failed":0}')
      clearTimeout(watchdog);globalShortcut.unregisterAll();app.exit(0);return
    }
    await check('ordinary WeRead has only recording-style compact controls',async()=>{
      assert.equal(await evaluate(window,"Boolean(document.querySelector('.addr,.bar,[data-action=fullscreen]'))"),false)
      assert.equal(await evaluate(window,"getComputedStyle(document.querySelector('.toolbar')).height"),'30px')
      const labels=await evaluate(window,"Array.from(document.querySelectorAll('.toolbar button')).map(button=>button.textContent.trim()).filter(Boolean)")
      assert.deepEqual(labels,['控','更多']);await screenshot(window,'weread-compact.png')
    })
    await check('white eye restores the hidden compact toolbar',async()=>{
      await click(window,'hide-bar');await until(()=>evaluate(window,"Boolean(document.querySelector('[data-action=show-bar]'))"),'recovery eye')
      assert.equal(await evaluate(window,"Boolean(document.querySelector('[data-action=topmost]'))"),false)
      await click(window,'show-bar');await until(()=>evaluate(window,"Boolean(document.querySelector('[data-action=topmost]'))"),'restored toolbar')
    })
    await check('web transparency is independent from native window opacity',async()=>{
      await click(window,'web-transparent');await ready(window)
      assert.equal(await guest.executeJavaScript('getComputedStyle(document.body).backgroundColor'),'rgba(0, 0, 0, 0)')
      assert.equal(window.getOpacity(),1);assert.equal(home.getOpacity(),1)
      await screenshot(window,'weread-transparent.png')
    })
    await check('reader Controls moves genuine buttons and restores exact DOM and transparency',async()=>{
      await click(window,'reader-controls');await ready(window)
      assert.equal(await guest.executeJavaScript("Boolean(document.querySelector('#__wr-ctrl-float__ > .readerControls'))"),true)
      assert.equal(await evaluate(window,"document.querySelector('[data-action=web-transparent]').getAttribute('aria-pressed')"),'true')
      assert.equal(await guest.executeJavaScript('getComputedStyle(document.body).backgroundColor'),'rgb(255, 255, 255)')
      await guest.executeJavaScript("document.querySelector('.readerControls button').click()")
      assert.equal(await guest.executeJavaScript('document.body.dataset.controlClicked'),'目录')
      await screenshot(window,'weread-reader-controls.png')
      await click(window,'reader-controls');await ready(window)
      const restoredHTML=await guest.executeJavaScript("[document.querySelector('.readerControls').outerHTML,window.originalControls]")
      assert.equal(restoredHTML[0],restoredHTML[1])
      assert.equal(await guest.executeJavaScript("document.querySelector('.readerControls').nextSibling.id"),'after-controls')
      assert.equal(await guest.executeJavaScript('getComputedStyle(document.body).backgroundColor'),'rgba(0, 0, 0, 0)')
    })
    await check('missing genuine controls reports failure and restores transparent appearance',async()=>{
      await guest.executeJavaScript("document.querySelector('.readerControls').remove()")
      await click(window,'reader-controls');await ready(window)
      await until(()=>evaluate(window,"document.querySelector('[role=alert]')?.textContent.includes('未找到')"),'missing-controls message')
      assert.equal(await evaluate(window,"document.querySelector('[data-action=reader-controls]').getAttribute('aria-pressed')"),'false')
      assert.equal(await guest.executeJavaScript('getComputedStyle(document.body).backgroundColor'),'rgba(0, 0, 0, 0)')
      guest=await loadFixture(window)
    })
    await check('opacity dialog slider keeps 0.01 precision and only targets WeRead',async()=>{
      await click(window,'opacity')
      await until(()=>evaluate(window,"Boolean(document.querySelector('[data-setting=opacity]'))"),'opacity dialog')
      const attributes=await evaluate(window,"['min','max','step'].map(name=>document.querySelector('[data-setting=opacity]').getAttribute(name))")
      assert.deepEqual(attributes,['0.1','1','0.01'])
      await evaluate(window,"const input=document.querySelector('[data-setting=opacity]');input.value='0.33';input.dispatchEvent(new Event('input',{bubbles:true}));")
      await until(()=>Math.abs(window.getOpacity()-0.33)<0.03,'native opacity')
      assert.equal(home.getOpacity(),1);await screenshot(window,'weread-opacity.png')
      await evaluate(window,"document.querySelector('.dialog-close').click()")
    })
    await check('topmost is a separate native setting',async()=>{
      await click(window,'topmost');await until(()=>window.isAlwaysOnTop(),'topmost')
      assert.equal(window.isFullScreen(),false);assert.ok(Math.abs(window.getOpacity()-0.33)<0.03)
    })
    await check('More panel operates style zoom and real page scrollbars',async()=>{
      await click(window,'more');await until(()=>evaluate(window,"Boolean(document.querySelector('[data-action=style]'))"),'more')
      await click(window,'scrollbar');await ready(window)
      assert.equal(await guest.executeJavaScript("getComputedStyle(document.documentElement,'::-webkit-scrollbar').display"),'inline')
      await click(window,'style');await until(()=>evaluate(window,"Boolean(document.querySelector('[data-setting=zoom]'))"),'style dialog')
      await evaluate(window,"document.querySelector('[data-setting=zoom]').value='0.85'")
      await evaluate(window,"setTimeout(()=>document.querySelector('[data-setting=zoom]').dispatchEvent(new Event('input',{bubbles:true})),0)")
      await until(()=>Math.abs(guest.getZoomFactor()-0.85)<0.01,'zoom')
      await evaluate(window,"document.querySelector('.dialog-close').click()")
    })
    await check('real auto-scroll pauses and resumes with boss-key hiding',async()=>{
      await click(window,'auto-scroll');await until(()=>evaluate(window,"Boolean(document.querySelector('[data-setting=auto-scroll]'))"),'scroll dialog')
      await evaluate(window,"document.querySelector('[data-setting=auto-scroll]').click()")
      await ready(window)
      await until(()=>guest.executeJavaScript('window.scrollY>2'),'actual scroll')
      await evaluate(home,'window.ipcRenderer.invoke("boss-key")')
      await until(()=>window.getOpacity()===0,'boss hidden')
      await until(()=>guest.executeJavaScript('!window.__wrReplicaScrollState'),'scroll paused')
      const before=await guest.executeJavaScript('window.scrollY');await pause(200)
      assert.equal(await guest.executeJavaScript('window.scrollY'),before)
      await evaluate(home,'window.ipcRenderer.invoke("boss-key")')
      await until(()=>guest.executeJavaScript('Boolean(window.__wrReplicaScrollState?.running)'),'scroll resumed')
      await evaluate(window,"document.querySelector('[data-setting=auto-scroll]').click()")
      await ready(window);await evaluate(window,"document.querySelector('.dialog-close').click()")
    })
    await check('auto-hide icon uses native cursor hiding and restores configured opacity',async()=>{
      const area=screen.getPrimaryDisplay().workArea,cursor=screen.getCursorScreenPoint()
      window.setBounds({x:cursor.x<area.x+area.width/2?area.x+area.width-400:area.x,y:area.y,width:400,height:600})
      await click(window,'auto-hide');await until(()=>window.getOpacity()===0,'cursor hidden')
      await click(window,'auto-hide');await until(()=>Math.abs(window.getOpacity()-0.33)<0.03,'cursor restored')
    })
    await check('refresh reapplies saved transparent webpage and zoom',async()=>{
      await guest.reload();await pause(150);await ready(window)
      assert.equal(await guest.executeJavaScript('getComputedStyle(document.body).backgroundColor'),'rgba(0, 0, 0, 0)')
      assert.ok(Math.abs(guest.getZoomFactor()-0.85)<0.01)
    })
    await check('closing and reopening restores style and native window settings',async()=>{
      const old=window;await click(window,'close').catch(error=>{if(!/destroy|closed/i.test(error.message))throw error})
      await until(()=>old.isDestroyed(),'closed')
      await evaluate(home,'window.homeElectronAPI.createWeRead()');window=await until(()=>find('/weRead'),'reopen');guest=await loadFixture(window)
      assert.ok(Math.abs(window.getOpacity()-0.33)<0.03);assert.equal(window.isAlwaysOnTop(),true)
      assert.equal(await guest.executeJavaScript('getComputedStyle(document.body).backgroundColor'),'rgba(0, 0, 0, 0)')
      assert.ok(Math.abs(guest.getZoomFactor()-0.85)<0.01)
    })
    console.log(`WEREAD_RESULT ${JSON.stringify({passed,failed:0,isolatedData:true,remoteRequestsBlocked:true,onlineSiteVerified:false,physicalKeyboardVerified:false})}`)
    clearTimeout(watchdog);globalShortcut.unregisterAll();app.exit(0)
  }catch(error){console.error(error);console.log(`WEREAD_RESULT ${JSON.stringify({passed,failed:1})}`);clearTimeout(watchdog);globalShortcut.unregisterAll();app.exit(1)}
})
require('../out/main/index.js')
