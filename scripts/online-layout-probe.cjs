// Optional read-only public-site probe; never uses the user's cookies or data.
const {app,BrowserWindow}=require('electron')
const {pathToFileURL}=require('node:url'),path=require('node:path')
if(!process.env.MOYU_HUYA_FILL_DATA_DIR)throw Error('Isolated userData required')
app.setPath('userData',process.env.MOYU_HUYA_FILL_DATA_DIR);app.disableHardwareAcceleration()
app.on('window-all-closed',()=>{})
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms))
const timeout=()=>new Promise(resolve=>setTimeout(()=>resolve(false),12000))
app.whenReady().then(async()=>{
  const huya=await import(pathToFileURL(path.join(__dirname,'../src/renderer/src/features/video-opacity/huya-window-fill.mjs')))
  const reading=await import(pathToFileURL(path.join(__dirname,'../src/renderer/src/features/reading-sites/page-scripts.mjs')))
  const {READING_PLATFORMS}=await import(pathToFileURL(path.join(__dirname,'../src/renderer/src/features/reading-sites/platforms.mjs')))
  for(const [key,url]of [['huya','https://www.huya.com/rememberlol'],['fanQue','https://fanqienovel.com/reader/7535344092251685400'],['jinJiang','https://www.jjwxc.net/onebook.php?novelid=4737103&chapterid=2']]){
    const w=new BrowserWindow({show:false,width:800,height:650,webPreferences:{nodeIntegration:false,contextIsolation:true}})
    w.webContents.setWindowOpenHandler(()=>({action:'deny'}));w.webContents.session.setPermissionRequestHandler((_wc,_permission,callback)=>callback(false))
    try{
      const loaded=await Promise.race([w.loadURL(url).then(()=>true).catch(()=>false),timeout()])
      if(!loaded){
        w.webContents.stop()
        const available=await Promise.race([w.webContents.executeJavaScript(`Boolean(document.querySelector(${JSON.stringify(key==='huya'?'#player-wrap,#J_playerMain,#player-container':READING_PLATFORMS[key].content)}))`).catch(()=>false),timeout()])
        if(!available){console.log('ONLINE_PROBE '+JSON.stringify({key,verified:false,reason:'public page load timeout/failure; no usable committed DOM'}));continue}
        console.log('ONLINE_PARTIAL_LOAD '+JSON.stringify({key,reason:'load event timed out; only available DOM will be inspected, not playback'}))
      }
      await pause(1200)
      const execute=(fn,...args)=>w.webContents.executeJavaScript(`(()=>{try{return {ok:true,value:(${fn.toString()})(${args.map(x=>JSON.stringify(x)).join(',')})}}catch(e){return {ok:false,error:e.message}}})()`)
      if(key==='huya'){
        await execute(huya.installHuyaWindowFill)
        const info=await w.webContents.executeJavaScript(`(()=>{const p=document.querySelector('#player-wrap,#J_playerMain,#player-container');const b=p?.querySelector('.player-fullscreen-btn,.player-fullscreen,.player-fullpage-btn,.player-fullpage,[data-action="fullscreen"],[title*="全屏"],[aria-label*="全屏"]');if(!b)return {verified:false,reason:'actual fullscreen button not loaded',player:p?.id};const label=b.outerHTML.slice(0,500);b.click();const r=p.getBoundingClientRect();return {verified:window.__moyuHuyaWindowFill.active&&Math.abs(r.width-innerWidth)<2&&Math.abs(r.height-innerHeight)<2,player:p.id,button:label,playerRect:{width:r.width,height:r.height},viewport:{width:innerWidth,height:innerHeight},nativeFullscreen:!!document.fullscreenElement}}})()`)
        console.log('ONLINE_PROBE '+JSON.stringify({key,...info}));await execute(huya.cleanupHuyaWindowFill)
      }else{
        const result=await execute(reading.showReadingControls,READING_PLATFORMS[key]);console.log('ONLINE_PROBE '+JSON.stringify({key,verified:result.ok,result}));await execute(reading.cleanupReadingPage,READING_PLATFORMS[key])
      }
    }catch(error){console.log('ONLINE_PROBE '+JSON.stringify({key,verified:false,reason:error.message}))}
    finally{if(!w.isDestroyed()){w.webContents.stop();w.destroy()}}
  }
  app.exit(0)
})
setTimeout(()=>app.exit(1),55000)
