import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

let transfer={}
try{transfer=await import('../src/main/ad-transparent-transfer.mjs')}catch{}

test('transparent guest readiness rejects an element that is loading or not attached',()=>{
  assert.equal(typeof transfer.isTransparentGuestReady,'function')
  assert.equal(transfer.isTransparentGuestReady(null),false)
  assert.equal(transfer.isTransparentGuestReady({getWebContentsId:()=>0,isLoading:()=>false}),false)
  assert.equal(transfer.isTransparentGuestReady({getWebContentsId:()=>7,isLoading:()=>true}),false)
  assert.equal(transfer.isTransparentGuestReady({getWebContentsId:()=>7,isLoading:()=>false}),true)
})

test('transparent transfer waits for idle attachment and closes the ad only after navigation succeeds',async()=>{
  assert.equal(typeof transfer.transferToTransparentGuest,'function')
  const calls=[],closed=[]
  let resolveLoad
  const load=new Promise(resolve=>{resolveLoad=resolve})
  const target={
    isDestroyed:()=>false,
    webContents:{
      isDestroyed:()=>false,
      executeJavaScript:code=>{
        calls.push(code)
        if(code.includes('isTransparentGuestReady'))return calls.length>2
        return load
      }
    }
  }
  const pending=transfer.transferToTransparentGuest({target,address:'https://www.douyu.com/456',closeAd:()=>closed.push(true),pause:async()=>{},attempts:4})
  await new Promise(resolve=>setImmediate(resolve))
  assert.equal(closed.length,0)
  resolveLoad(true)
  assert.equal(await pending,true)
  assert.equal(closed.length,1)
  assert.equal(calls.filter(code=>code.includes('isTransparentGuestReady')).length,3)
})

test('failed or timed-out transparent navigation preserves the ad window',async()=>{
  assert.equal(typeof transfer.transferToTransparentGuest,'function')
  let closed=0
  const loading={isDestroyed:()=>false,webContents:{isDestroyed:()=>false,executeJavaScript:async()=>false}}
  await assert.rejects(transfer.transferToTransparentGuest({target:loading,address:'https://www.douyu.com/456',closeAd:()=>closed++,pause:async()=>{},attempts:2}),/透明窗口尚未准备好/)
  assert.equal(closed,0)

  const failure=new Error('ERR_FAILED')
  const rejected={isDestroyed:()=>false,webContents:{isDestroyed:()=>false,executeJavaScript:async code=>code.includes('isTransparentGuestReady')?true:Promise.reject(failure)}}
  await assert.rejects(transfer.transferToTransparentGuest({target:rejected,address:'https://www.douyu.com/456',closeAd:()=>closed++,pause:async()=>{},attempts:2}),failure)
  assert.equal(closed,0)
})

test('one total deadline bounds a hanging readiness call without starting another attempt',async()=>{
  let closed=0,calls=0
  const never=new Promise(()=>{})
  const target={isDestroyed:()=>false,webContents:{isDestroyed:()=>false,executeJavaScript:()=>{calls++;return never}}}
  const started=Date.now()
  const transferPromise=transfer.transferToTransparentGuest({
    target,address:'https://www.douyu.com/456',closeAd:()=>closed++,attempts:50,timeoutMs:20
  })
  await Promise.race([
    assert.rejects(transferPromise,/超时|尚未准备好/),
    new Promise((_,reject)=>setTimeout(()=>reject(new Error('readiness exceeded the total deadline')),100))
  ])
  assert.ok(Date.now()-started<80)
  assert.equal(calls,1)
  assert.equal(closed,0)
})

test('one total deadline bounds hanging navigation and handles its late rejection',async()=>{
  let closed=0,rejectNavigation,calls=0
  const readiness=new Promise(resolve=>setTimeout(()=>resolve(true),35))
  const lateNavigation=new Promise((_,reject)=>{rejectNavigation=reject})
  const target={
    isDestroyed:()=>false,
    webContents:{
      isDestroyed:()=>false,
      executeJavaScript:code=>{calls++;return code.includes('isTransparentGuestReady')?readiness:lateNavigation}
    }
  }
  const transferPromise=transfer.transferToTransparentGuest({
    target,address:'https://www.douyu.com/456',closeAd:()=>closed++,attempts:50,timeoutMs:60
  })
  await Promise.race([
    assert.rejects(transferPromise,/导航超时|超时/),
    new Promise((_,reject)=>setTimeout(()=>reject(new Error('navigation exceeded the total deadline')),85))
  ])
  rejectNavigation(new Error('late navigation rejection'))
  await new Promise(resolve=>setImmediate(resolve))
  assert.equal(calls,2)
  assert.equal(closed,0)
})

test('readiness execution errors propagate unchanged and are never retried',async()=>{
  const failure=new Error('Render frame was disposed before WebFrameMain could be accessed')
  let calls=0,closed=0
  const target={
    isDestroyed:()=>false,
    webContents:{isDestroyed:()=>false,executeJavaScript:()=>{calls++;return Promise.reject(failure)}}
  }
  await assert.rejects(
    transfer.transferToTransparentGuest({target,address:'https://www.douyu.com/456',closeAd:()=>closed++,attempts:50,timeoutMs:100}),
    error=>error===failure
  )
  assert.equal(calls,1)
  assert.equal(closed,0)
})

test('scoped ad closer cannot close a replacement window with the same key',()=>{
  assert.equal(typeof transfer.createScopedAdCloser,'function')
  let current,closed=0,destroyed=false
  const source={isDestroyed:()=>destroyed}
  current=source
  const close=transfer.createScopedAdCloser({source,getCurrent:()=>current,close:()=>{closed++;return true}})
  assert.equal(close(),true)
  assert.equal(closed,1)

  const replacement={isDestroyed:()=>false}
  destroyed=true
  current=replacement
  assert.equal(close(),false)
  assert.equal(closed,1)
})

test('open-transparent captures its sender window before opening the target and uses a scoped closer',async()=>{
  const source=await readFile(new URL('../src/main/index.js',import.meta.url),'utf8')
  const start=source.indexOf("handle('ad-mode:open-transparent'")
  const end=source.indexOf("handle('window-control:get-state'",start)
  const handler=source.slice(start,end)
  assert.match(handler,/BrowserWindow\.fromWebContents\(event\.sender\)/)
  assert.match(handler,/createScopedAdCloser/)
  assert.ok(handler.indexOf('BrowserWindow.fromWebContents(event.sender)')<handler.indexOf('openSite(targetKey)'))
})
