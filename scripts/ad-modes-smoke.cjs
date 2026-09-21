const {app,BrowserWindow,session,webContents,globalShortcut}=require('electron')
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict')
if(!process.env.MOYU_AD_DATA_DIR)throw Error('Isolated data required')
app.setPath('userData',process.env.MOYU_AD_DATA_DIR);app.disableHardwareAcceleration()
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms)),evaluate=(w,c)=>w.webContents.executeJavaScript(c,true)
const find=route=>BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().endsWith('#'+route))
let passed=0,blockedHttpRequests=0
async function until(fn,label){for(let i=0;i<120;i++){if(await fn())return;await pause(100)}throw Error('Timeout: '+label)}
async function check(name,fn){await fn();passed++;console.log('PASS '+name)}
const click=(w,a)=>evaluate(w,`document.querySelector('[data-action="${a}"]').click()`)
const ready=w=>until(()=>evaluate(w,"document.querySelector('[data-ready]')?.dataset.ready==='true'"),'ad ready')
const input=(w,setting,value,event='input')=>evaluate(w,`(()=>{const i=document.querySelector('[data-setting=${setting}]');i.value=${JSON.stringify(value)};i.dispatchEvent(new Event('${event}',{bubbles:true}))})()`)
const watchdog=setTimeout(()=>{console.error('Advertisement smoke watchdog');app.exit(1)},180000)
app.whenReady().then(async()=>{
  const reading=fs.readFileSync(path.join(__dirname,'../tests/fixtures/web/reader/weread.html'),'utf8')
  const video=fs.readFileSync(path.join(__dirname,'../tests/fixtures/web/ad-modes/video.html'),'utf8')
  const videoHosts=new Set(['www.douyin.com','www.bilibili.com','www.huya.com','www.douyu.com','www.kuaishou.com'])
  await session.defaultSession.protocol.handle('https',request=>{
    const host=new URL(request.url).hostname
    if(host!=='weread.qq.com'&&!videoHosts.has(host))return new Response('Blocked by isolated advertisement smoke',{status:404})
    return new Response(host==='weread.qq.com'?reading:video,{headers:{'Content-Type':'text/html; charset=utf-8'}})
  })
  session.defaultSession.webRequest.onBeforeRequest({urls:['http://*/*']},(_details,callback)=>{
    blockedHttpRequests++;callback({cancel:true})
  })
  try{
    await until(()=>find('/home'),'home');const home=find('/home');await until(()=>evaluate(home,'Boolean(window.adModeControl)'),'bridge')
    const captures=path.join(__dirname,'../.artifacts/ad-modes-20260918');fs.mkdirSync(captures,{recursive:true})
    const urls={
      douyin:'https://www.douyin.com/video/123',
      bilibili:'https://www.bilibili.com/video/BV1',
      huya:'https://www.huya.com/123',
      douyu:'https://www.douyu.com/456',
      kuaishou:'https://www.kuaishou.com/short-video/789',
      weReadAd:'https://weread.qq.com/web/reader/123'
    }
    const videoPreferences={
      bilibili:{skin:2,zoom:.31},
      huya:{skin:1,zoom:.42},
      douyu:{skin:2,zoom:.53},
      kuaishou:{skin:1,zoom:.64}
    }
    const transparentRoutes={douyin:'/douyinOpacity',bilibili:'/bilibiliOpacity',huya:'/huyaOpacity',douyu:'/douyuOpacity',kuaishou:'/kuaishouOpacity',weReadAd:'/weRead'}
    for(const kind of ['douyin','bilibili','huya','douyu','kuaishou','weReadAd']){
      const isVideo=kind!=='weReadAd',url=urls[kind]
      await evaluate(home,`window.adModeControl.open('${kind}')`);await until(()=>find('/'+kind),kind)
      let w=find('/'+kind);await ready(w)
      let guest=webContents.fromId(await evaluate(w,'document.querySelector("webview").getWebContentsId()'))
      if(process.argv.includes('--restore-only')){
        await check(kind+' restores own preferences and address after process restart',async()=>{
          const cfg=await evaluate(w,'window.adModeControl.getSettings()')
          assert.equal(guest.getURL(),url)
          if(kind==='douyin')assert.equal(cfg.skin,1)
          if(videoPreferences[kind]){
            assert.equal(cfg.skin,videoPreferences[kind].skin)
            assert.equal(cfg.zoom,videoPreferences[kind].zoom)
          }
          if(kind==='weReadAd'){assert.equal(cfg.text,'学历提升测试');assert.equal(cfg.zoom,.85);assert.equal(cfg.speed,4);assert.equal(cfg.autoScroll,true);assert.equal(cfg.color,'#e2f3e8')}
        });w.close();continue
      }
      await check(kind+' dedicated compact controls have no old address/opacity toolbar',async()=>{
        assert.equal(await evaluate(w,'Boolean(document.querySelector(".addr,.bar,.ad-skin,[data-action=opacity-up]"))'),false)
        assert.equal(await evaluate(w,'getComputedStyle(document.querySelector(".ad-header")).height'),'28px')
        assert.ok(w.isAlwaysOnTop())
        await assert.rejects(evaluate(home,'window.adModeControl.getState()'),/广告窗口/)
        await assert.rejects(evaluate(w,"window.adModeControl.saveSettings({address:'javascript:alert(1)'})"))
      })
      let navigations=0
      guest.on('did-start-navigation',(_e,address,_inPlace,isMainFrame)=>{if(isMainFrame&&address===url)navigations++})
      await evaluate(w,`document.querySelector('webview').loadURL(${JSON.stringify(url)})`);await ready(w)
      await check(kind+' navigation keeps a single live guest and persists its valid own URL',async()=>{
        await pause(100);assert.equal(navigations,1,'one explicit navigation must not reload through saved address binding')
        assert.equal((await evaluate(w,'window.adModeControl.getSettings()')).address,url)
        assert.equal(BrowserWindow.getAllWindows().filter(x=>x.webContents.getURL().endsWith('#/'+kind)).length,1)
      })
      if(videoPreferences[kind])await check(kind+' persists its own visible advertisement preferences',async()=>{
        const expected=videoPreferences[kind]
        for(let skin=0;skin<expected.skin;skin++){await click(w,'skin');await ready(w)}
        const cfg=await evaluate(w,`window.adModeControl.saveSettings({zoom:${expected.zoom}})`);await ready(w)
        assert.equal(cfg.skin,expected.skin);assert.equal(cfg.zoom,expected.zoom)
        assert.equal(await evaluate(w,`document.querySelector('.video-ad').classList.contains('skin-${expected.skin}')`),true)
      })
      if(isVideo){
        await check(kind+' back control returns to the previous guest page',async()=>{
          const nextUrl=new URL('/moyu-next',url).href
          await evaluate(w,`document.querySelector('webview').loadURL(${JSON.stringify(nextUrl)})`);await ready(w)
          assert.equal(guest.getURL(),nextUrl)
          await click(w,'back');await until(()=>guest.getURL()===url,kind+' history back');await ready(w)
        })
        await check(kind+' compact guest remains directly clickable without falling back to Douyin',async()=>{
          assert.equal(await evaluate(w,'Boolean(document.querySelector(".click-mask"))'),false)
          assert.equal(guest.getURL(),url)
          assert.equal(new URL(guest.getURL()).hostname,new URL(url).hostname)
          assert.ok(Math.abs(await guest.executeJavaScript('document.querySelector(".xgplayer").getBoundingClientRect().width-innerWidth'))<=1)
        })
        if(kind==='huya')await check('huya live-room fullscreen fills only the guest and never enters native fullscreen',async()=>{
          await guest.executeJavaScript("document.querySelector('.player-fullscreen-btn').click()")
          await until(()=>guest.executeJavaScript("Boolean(document.querySelector('[data-moyu-huya-player=true]'))"),'huya guest fill')
          const fit=await guest.executeJavaScript(`(()=>{const r=document.querySelector('#J_playerMain').getBoundingClientRect();return {width:r.width,height:r.height,innerWidth,innerHeight,native:document.fullscreenElement!==null}})()`)
          assert.ok(Math.abs(fit.width-fit.innerWidth)<=1);assert.ok(Math.abs(fit.height-fit.innerHeight)<=1)
          assert.equal(fit.native,false);assert.equal(w.isFullScreen(),false)
          await guest.executeJavaScript("document.querySelector('.player-fullscreen-btn').click()")
          await until(()=>guest.executeJavaScript("!document.querySelector('[data-moyu-huya-player=true]')"),'huya guest restore')
        })
        if(kind==='douyin'){
          await check('douyin compact fit hides site chrome and leaves inactive players untouched',async()=>{
            assert.equal(await guest.executeJavaScript('getComputedStyle(document.querySelector("header")).display'),'none')
            await guest.executeJavaScript(`const inactive=document.createElement('div');inactive.id='inactive-player';inactive.className='xgplayer';inactive.style.cssText='display:none;position:relative';document.body.appendChild(inactive)`)
            assert.equal(await guest.executeJavaScript('getComputedStyle(document.getElementById("inactive-player")).position'),'relative','inactive player must not be forced over the active player')
          })
          await check('douyin ad content and skin preserve the live guest',async()=>{
            await evaluate(w,"document.querySelector('.ad-copy').click()");await until(()=>evaluate(w,'Boolean(document.querySelector("[role=dialog]"))'),'details')
            await click(w,'close-details');await click(w,'skin');await ready(w)
            assert.equal((await evaluate(w,'window.adModeControl.getSettings()')).skin,1)
            assert.equal(await evaluate(w,'document.querySelector("webview").getWebContentsId()'),guest.id)
          })
          await check('douyin expanded window and global shortcuts reach the guest',async()=>{
            const smallBounds=w.getBounds()
            await click(w,'expand');await until(()=>evaluate(w,'!document.querySelector(".click-mask")'),'unmasked');await ready(w)
            assert.ok(w.getBounds().width>500);assert.ok(Math.abs(guest.getZoomFactor()-.6)<.01)
            for(const [channel,data]of [['all-prev','prev'],['all-next','next'],['all-screen','fullscreen'],['all-like','liked']]){
              w.webContents.send(channel);await until(()=>guest.executeJavaScript(`document.body.dataset.${data}==='yes'`),channel)
            }
            w.webContents.send('stop-or-continue');await until(()=>guest.executeJavaScript('document.querySelector("video").paused'),'paused')
            w.webContents.send('stop-or-continue');await until(()=>guest.executeJavaScript('!document.querySelector("video").paused'),'playing')
            await click(w,'expand');await until(()=>Math.abs(w.getBounds().width-smallBounds.width)<=4,'small bounds with native DPI rounding');await ready(w)
          })
        }
      }else{
        await check('reading settings update real page zoom/speed/text/color/scrollbar with no transparency writes',async()=>{
          await click(w,'settings');await until(()=>evaluate(w,'Boolean(document.querySelector("[data-setting=zoom]"))'),'settings')
          await input(w,'zoom',.85);await input(w,'speed',4);await input(w,'text','学历提升测试','change');await ready(w)
          assert.ok(Math.abs(guest.getZoomFactor()-.85)<.01)
          await click(w,'scrollbar');await ready(w)
          assert.equal(await guest.executeJavaScript('getComputedStyle(document.documentElement,"::-webkit-scrollbar").display'),'inline')
          await click(w,'scrollbar');await ready(w)
          await evaluate(w,"const i=document.querySelector('[data-setting=auto-scroll]');i.checked=true;i.dispatchEvent(new Event('change',{bubbles:true}))");await ready(w)
          await until(()=>guest.executeJavaScript('scrollY>1'),'reading scrolling')
          await click(w,'close-settings');await click(w,'color');await ready(w)
          const cfg=await evaluate(w,'window.adModeControl.getSettings()');assert.equal(cfg.text,'学历提升测试');assert.equal(cfg.color,'#e2f3e8')
          assert.equal(await evaluate(w,"window.settingApi.getSetting('weRead.zoom')"),undefined)
        })
        await check('reading controls are genuine floating site controls and remain clickable',async()=>{
          await click(w,'reader-controls');await until(()=>guest.executeJavaScript('Boolean(document.getElementById("__wr-ctrl-float__"))'),'genuine controls')
          await guest.executeJavaScript('document.querySelector(".readerControls button").click()');assert.equal(await guest.executeJavaScript('document.body.dataset.controlClicked'),'目录')
          await click(w,'reader-controls');await ready(w)
        })
      }
      await check(kind+' boss covers in place and restores the same guest instead of hiding the window',async()=>{
        const id=guest.id;await evaluate(home,"window.ipcRenderer.invoke('boss-key')")
        await until(()=>evaluate(w,'Boolean(document.querySelector("[data-cover]"))'),'covered');await ready(w);assert.ok(w.isVisible())
        fs.writeFileSync(path.join(captures,kind+'-covered.png'),(await w.webContents.capturePage()).toPNG())
        if(kind==='weReadAd'){await pause(100);const y=await guest.executeJavaScript('scrollY');await pause(250);assert.equal(await guest.executeJavaScript('scrollY'),y)}
        await evaluate(home,"window.ipcRenderer.invoke('boss-key')");await until(()=>evaluate(w,'!document.querySelector("[data-cover]")'),'restored');await ready(w)
        assert.equal(await evaluate(w,'document.querySelector("webview").getWebContentsId()'),id)
      })
      w.showInactive();await pause(120);fs.writeFileSync(path.join(captures,kind+'.png'),(await w.webContents.capturePage()).toPNG())
      await check(kind+' close-ad really closes the native window and reopen restores own configuration',async()=>{
        await click(w,'close');await until(()=>!find('/'+kind),'closed');await evaluate(home,`window.adModeControl.open('${kind}')`)
        await until(()=>find('/'+kind),'reopen');w=find('/'+kind);await ready(w);assert.equal((await evaluate(w,'window.adModeControl.getSettings()')).address,url)
      })
      await check(kind+' explicit switch transfers URL to unchanged transparent view and closes ad only after success',async()=>{
        if(kind==='weReadAd')await click(w,'settings')
        await click(w,'transparent');const route=transparentRoutes[kind]
        await until(()=>find(route),'transparent window');const target=find(route)
        await until(()=>evaluate(target,"document.querySelector('webview')?.getURL()=== "+JSON.stringify(url)).catch(()=>false),'transferred address')
        await until(()=>!find('/'+kind),'ad closed after switch');target.close()
      })
    }
    if(!process.argv.includes('--restore-only'))await check('mixed mode boss hides transparency but covers advertising and restores both',async()=>{
      await evaluate(home,"window.adModeControl.open('douyin');window.homeElectronAPI.createDouyinOpacity()")
      await until(()=>find('/douyin')&&find('/douyinOpacity'),'mixed windows');const ad=find('/douyin'),transparent=find('/douyinOpacity');await ready(ad)
      await until(()=>evaluate(transparent,'Boolean(document.querySelector("[data-action=zoom]"))'),'transparent renderer ready');await evaluate(home,"window.ipcRenderer.invoke('boss-key')")
      await until(()=>transparent.getOpacity()===0&&evaluate(ad,'Boolean(document.querySelector("[data-cover]"))'),'mixed hidden');assert.ok(ad.isVisible())
      await evaluate(home,"window.ipcRenderer.invoke('boss-key')");await until(()=>transparent.getOpacity()>0,'transparent restored');await ready(ad);assert.equal(await evaluate(ad,'Boolean(document.querySelector("[data-cover]"))'),false)
      ad.close();transparent.close()
    })
    assert.equal(blockedHttpRequests,0,'advertisement smoke must not attempt plain HTTP networking')
    console.log('AD_RESULT '+JSON.stringify({passed,failed:0,blockedHttpRequests,remoteRequestsBlocked:true,onlineSiteVerified:false}));clearTimeout(watchdog);globalShortcut.unregisterAll();app.exit(0)
  }catch(error){console.error(error);const wins=BrowserWindow.getAllWindows().filter(w=>!w.isDestroyed());for(const w of wins)console.error('WINDOW',w.webContents.getURL(),await evaluate(w,'document.body.innerText').catch(()=>''));clearTimeout(watchdog);app.exit(1)}
})
require('../out/main/index.js')
