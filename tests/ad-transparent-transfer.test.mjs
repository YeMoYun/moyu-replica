import test from 'node:test'
import assert from 'node:assert/strict'

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
