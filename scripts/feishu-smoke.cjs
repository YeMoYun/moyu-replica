const {app,BrowserWindow,session,webContents,globalShortcut}=require('electron')
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict')
if(!process.env.MOYU_FEISHU_DATA_DIR)throw Error('isolated data required')
app.setPath('userData',process.env.MOYU_FEISHU_DATA_DIR);app.disableHardwareAcceleration()
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms))
const evaluate=(window,code)=>window.webContents.executeJavaScript(`(()=>eval(${JSON.stringify(code)}))()`,true)
const find=route=>BrowserWindow.getAllWindows().find(window=>window.webContents.getURL().endsWith('#'+route))
async function until(fn,label){for(let attempt=0;attempt<120;attempt++){if(await fn())return;await pause(80)}throw Error('Timeout '+label)}
let passed=0,feishuRequests=0
const errors=[]
app.on('web-contents-created',(_event,contents)=>contents.on('console-message',(_event,level,message)=>{if(level>=3&&!message.includes('favicon'))errors.push(message)}))
async function check(name,fn){await fn();passed++;console.log('PASS '+name)}
const watchdog=setTimeout(()=>app.exit(1),60000)

app.whenReady().then(async()=>{
  const fixture=fs.readFileSync(path.join(__dirname,'../tests/fixtures/web/ad-modes/video.html'),'utf8')+'<script>addEventListener("wheel",()=>document.body.dataset.wheel="yes")</script>'
  const response=partition=>new Response(fixture+`<script>document.body.dataset.fixturePartition=${JSON.stringify(partition)}</script>`,{headers:{'content-type':'text/html'}})
  await session.fromPartition('persist:moyu-chat-feishu').protocol.handle('https',async request=>{
    feishuRequests++
    const pathname=new URL(request.url).pathname
    if(pathname==='/slow')await pause(600)
    if(pathname==='/blocked')return new Response(null,{status:302,headers:{Location:'https://blocked.invalid/'}})
    return response('feishu')
  })
  await session.fromPartition('persist:moyu-chat-dingtalk').protocol.handle('https',()=>response('dingtalk'))
  await session.fromPartition('persist:moyu-chat-wechat').protocol.handle('https',()=>response('wechat'))
  await session.defaultSession.protocol.handle('https',()=>response('default'))
  try{
    await until(()=>find('/home'),'home')
    const home=find('/home')
    await evaluate(home,'window.feishuModeControl.open()')
    await until(()=>find('/feishu'),'feishu')
    let feishu=find('/feishu')
    await until(()=>evaluate(feishu,'document.querySelector("[data-chat-ready]")?.dataset.chatReady==="true"'),'feishu ready')
    if(process.argv.includes('--restore-only')){
      await check('restart restores message draft announcement settings and guest',async()=>{
        const state=await evaluate(feishu,'window.feishuModeControl.get()')
        assert.ok(state.conversations.find(c=>c.id==='group').messages.some(message=>message.text==='飞书验收消息'))
        assert.equal(state.drafts.lin,'保留飞书草稿')
        assert.ok(state.ui.hiddenAnnouncements.includes('group'))
        assert.equal(state.settings.scale,100)
        assert.equal(state.settings.address,'https://www.douyin.com/fast')
        await until(()=>evaluate(feishu,'document.querySelector("webview")?.dataset.playerReady==="true"'),'restored guest')
      })
    }else{
      await check('local first layout makes no request',async()=>{
        assert.equal(await evaluate(feishu,'document.querySelectorAll(".chat-item").length'),10)
        assert.equal(await evaluate(feishu,'document.querySelectorAll("webview").length'),0)
        assert.equal(await evaluate(feishu,'document.querySelectorAll(".fs-media-card").length'),1)
        assert.equal(feishuRequests,0)
        assert.equal(await evaluate(feishu,'getComputedStyle(document.querySelector(".navigation")).width'),'176px')
        assert.equal(await evaluate(feishu,'getComputedStyle(document.querySelector(".composer")).height'),'52px')
      })
      await check('IME and newline-safe sending persists locally',async()=>{
        const before=(await evaluate(feishu,'window.feishuModeControl.get()')).conversations[0].messages.length
        await evaluate(feishu,`(()=>{const input=document.querySelector('.message-input');input.value='飞书验收消息';input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',isComposing:true,bubbles:true}))})()`)
        await pause(100)
        assert.equal((await evaluate(feishu,'window.feishuModeControl.get()')).conversations[0].messages.length,before)
        await evaluate(feishu,`document.querySelector('.message-input').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}))`)
        await until(async()=>(await evaluate(feishu,'window.feishuModeControl.get()')).conversations[0].messages.length===before+1,'message saved')
        const prevented=await evaluate(feishu,`(()=>{const event=new KeyboardEvent('keydown',{key:'Enter',shiftKey:true,bubbles:true,cancelable:true});document.querySelector('.message-input').dispatchEvent(event);return event.defaultPrevented})()`)
        assert.equal(prevented,false)
      })
      await check('quick conversations search tabs and announcement work',async()=>{
        await evaluate(feishu,'document.querySelector(".quick-conversations [data-chat=lin]").click()')
        await until(()=>evaluate(feishu,'document.querySelector("[data-chat=lin]").classList.contains("selected")'),'quick switch')
        await evaluate(feishu,`(()=>{const input=document.querySelector('[data-search]');input.value='质检';input.dispatchEvent(new Event('input',{bubbles:true}))})()`)
        assert.equal(await evaluate(feishu,'document.querySelectorAll(".chat-items .chat-item").length'),1)
        await evaluate(feishu,'document.querySelector("[data-tab=云文档]").click()')
        await until(()=>evaluate(feishu,'Boolean(document.querySelector(".chat-notice"))'),'tab notice')
        await evaluate(feishu,'document.querySelector("[data-action=hide-announcement]").click()')
        await until(()=>evaluate(feishu,'!document.querySelector(".group-announcement")'),'announcement hidden')
        await evaluate(feishu,'document.querySelector("[data-tab=群公告]").click()')
        await until(()=>evaluate(feishu,'Boolean(document.querySelector(".group-announcement"))'),'announcement restored')
        await evaluate(feishu,'document.querySelector("[data-chat=group]").click()')
      })
      await evaluate(feishu,'document.querySelector("[data-action=insert]").click()')
      await until(()=>evaluate(feishu,'document.querySelector("webview")?.dataset.playerReady==="true"'),'feishu guest ready')
      const guest=webContents.fromId(await evaluate(feishu,'document.querySelector("webview").getWebContentsId()')),guestId=guest.id
      await check('plus inserts one real feishu guest',async()=>{
        assert.equal(guest.session,session.fromPartition('persist:moyu-chat-feishu'))
        assert.equal(await guest.executeJavaScript('document.body.dataset.fixturePartition'),'feishu')
        assert.equal(feishuRequests,1)
        await evaluate(feishu,'document.querySelector("[data-action=insert]").click()');await pause(100)
        assert.equal(await evaluate(feishu,'document.querySelectorAll("webview").length'),1)
      })
      await check('real guest receives click and wheel',async()=>{
        const point=await guest.executeJavaScript(`(()=>{const box=document.querySelector('[aria-label="下一条视频"]').getBoundingClientRect();return{x:box.x+box.width/2,y:box.y+box.height/2}})()`),zoom=guest.getZoomFactor(),x=Math.round(point.x*zoom),y=Math.round(point.y*zoom)
        guest.sendInputEvent({type:'mouseDown',x,y,button:'left',clickCount:1});guest.sendInputEvent({type:'mouseUp',x,y,button:'left',clickCount:1})
        await until(()=>guest.executeJavaScript('document.body.dataset.next==="yes"'),'guest click')
        guest.sendInputEvent({type:'mouseWheel',x:20,y:20,deltaY:80,deltaX:0});await until(()=>guest.executeJavaScript('document.body.dataset.wheel==="yes"'),'guest wheel')
      })
      await check('settings resize without rebuilding guest',async()=>{
        await evaluate(feishu,'document.querySelector("[data-action=settings]").click()')
        await evaluate(feishu,`(()=>{const input=document.querySelector('[data-setting=scale]');input.value='100';input.dispatchEvent(new Event('change',{bubbles:true}))})()`)
        await until(()=>evaluate(feishu,'document.querySelector(".chat-player").offsetWidth===220'),'scale applied')
        assert.equal(await evaluate(feishu,'document.querySelector("webview").getWebContentsId()'),guestId)
        await evaluate(feishu,'document.querySelector("[data-action=close-dialog]").click()')
      })
      await check('conversation switch pauses hidden media and retains draft',async()=>{
        await until(()=>guest.executeJavaScript('!document.querySelector("video").paused'),'media playing')
        await evaluate(feishu,'document.querySelector("[data-chat=lin]").click()');await until(()=>guest.executeJavaScript('document.querySelector("video").paused'),'hidden media paused')
        await evaluate(feishu,`(()=>{const input=document.querySelector('.message-input');input.value='保留飞书草稿';input.dispatchEvent(new Event('input',{bubbles:true}))})()`)
        await until(async()=>(await evaluate(feishu,'window.feishuModeControl.get()')).drafts.lin==='保留飞书草稿','draft saved')
        await evaluate(feishu,'document.querySelector("[data-chat=group]").click()');await until(()=>guest.executeJavaScript('!document.querySelector("video").paused'),'media resumed')
      })
      await check('invalid JSON is rejected atomically',async()=>{
        await evaluate(feishu,'document.querySelector("[data-action=config]").click()');const before=await evaluate(feishu,'window.feishuModeControl.get()')
        await evaluate(feishu,`(()=>{const input=document.querySelector('.json-input');input.value='{bad';input.dispatchEvent(new Event('input',{bubbles:true}))})()`)
        await evaluate(feishu,'document.querySelector("[data-action=apply-json]").click()');await until(()=>evaluate(feishu,'Boolean(document.querySelector(".config-error").textContent)'),'JSON error')
        assert.deepEqual(await evaluate(feishu,'window.feishuModeControl.get()'),before);await evaluate(feishu,'document.querySelector("[data-action=close-dialog]").click()')
      })
      await check('slow navigation is superseded and foreign redirect blocked',async()=>{
        await evaluate(home,`window.feishuModeControl.open('https://www.douyin.com/slow')`);await until(()=>evaluate(feishu,'document.querySelector("webview").dataset.playerReady==="false"'),'slow loading')
        await evaluate(home,`window.feishuModeControl.open('https://www.douyin.com/fast')`);await until(()=>guest.getURL()==='https://www.douyin.com/fast','fast wins');await pause(700)
        assert.equal((await evaluate(feishu,'window.feishuModeControl.get()')).settings.address,'https://www.douyin.com/fast')
        await guest.executeJavaScript(`location.href='https://www.douyin.com/blocked'`);await pause(300);assert.equal(guest.getURL(),'https://www.douyin.com/fast')
      })
      await check('three chats use distinct state and sessions',async()=>{
        await evaluate(home,'window.chatModeControl.open()');await evaluate(home,'window.dingtalkModeControl.open()');await until(()=>find('/wechat')&&find('/dingding'),'other chats')
        const wechat=find('/wechat'),dingtalk=find('/dingding');await until(()=>evaluate(wechat,'Boolean(document.querySelector("[data-chat-ready]"))'),'wechat ready');await until(()=>evaluate(dingtalk,'Boolean(document.querySelector("[data-chat-ready]"))'),'dingtalk ready')
        await evaluate(wechat,'document.querySelector("[data-action=insert]").click()');await evaluate(dingtalk,'document.querySelector("[data-action=insert]").click()')
        await until(()=>evaluate(wechat,'document.querySelector("webview")?.dataset.playerReady==="true"'),'wechat guest');await until(()=>evaluate(dingtalk,'document.querySelector("webview")?.dataset.playerReady==="true"'),'dingtalk guest')
        const wxGuest=webContents.fromId(await evaluate(wechat,'document.querySelector("webview").getWebContentsId()')),dingGuest=webContents.fromId(await evaluate(dingtalk,'document.querySelector("webview").getWebContentsId()'))
        assert.notEqual(guest.session,wxGuest.session);assert.notEqual(guest.session,dingGuest.session);assert.notEqual(wxGuest.session,dingGuest.session)
        await assert.rejects(evaluate(wechat,'window.feishuModeControl.get()'),/飞书窗口/);await assert.rejects(evaluate(feishu,'window.chatModeControl.get()'),/微信窗口/)
      })
      await check('boss covers all three chats and restores original guests',async()=>{
        const wechat=find('/wechat'),dingtalk=find('/dingding');await evaluate(home,`window.ipcRenderer.invoke('boss-key')`)
        for(const window of [feishu,wechat,dingtalk])await until(()=>evaluate(window,'Boolean(document.querySelector("[data-cover=chat-video]"))'),'chat cover')
        for(const window of [feishu,wechat,dingtalk]){assert.ok(window.isVisible());assert.equal(window.getOpacity(),1)}
        await evaluate(home,`window.ipcRenderer.invoke('boss-key')`);for(const window of [feishu,wechat,dingtalk])await until(()=>evaluate(window,'!document.querySelector("[data-cover=chat-video]")'),'chat restore')
        assert.equal(await evaluate(feishu,'document.querySelector("webview").getWebContentsId()'),guestId)
      })
      await check('close reopen restores state and destroys old guest',async()=>{
        await evaluate(feishu,'document.querySelector("[data-action=hide-announcement]").click()')
        await until(async()=>(await evaluate(feishu,'window.feishuModeControl.get()')).ui.hiddenAnnouncements.includes('group'),'announcement saved')
        await evaluate(feishu,'window.feishuModeControl.close()');await until(()=>!find('/feishu'),'feishu closed');assert.ok(guest.isDestroyed())
        await evaluate(home,'window.feishuModeControl.open()');await until(()=>find('/feishu'),'feishu reopened');feishu=find('/feishu')
        await until(()=>evaluate(feishu,'Boolean(document.querySelector("[data-chat-ready]"))'),'reopened ready');assert.equal((await evaluate(feishu,'window.feishuModeControl.get()')).settings.scale,100)
      })
      await check('no renderer console errors',async()=>assert.deepEqual(errors,[]))
    }
    console.log('FEISHU_RESULT '+JSON.stringify({passed,failed:0,onlineDouyinVerified:false}))
    clearTimeout(watchdog);globalShortcut.unregisterAll();app.exit(0)
  }catch(error){console.error(error);clearTimeout(watchdog);app.exit(1)}
})
require('../out/main/index.js')
