import test from 'node:test'
import assert from 'node:assert/strict'
import {EventEmitter} from 'node:events'
let links={}
try{links=await import('../src/main/video-guest-links.mjs')}catch(e){if(e.code!=='ERR_MODULE_NOT_FOUND')throw e}
test('platform link allowlist validates scheme, exact suffix and port',()=>{
  assert.equal(typeof links.isPlatformURL,'function')
  for(const site of ['bilibili','huya','kuaishou']){
    assert.equal(links.isPlatformURL(site,`https://www.${site}.com/video/123`),true)
    assert.equal(links.isPlatformURL(site,`https://${site}.com/`),true)
    for(const url of [`https://${site}.com.evil.invalid/`,`https://evil${site}.com/`,`http://www.${site}.com/`,`https://www.${site}.com:9999/`,'file:///D:/private','javascript:alert(1)'])assert.equal(links.isPlatformURL(site,url),false,url)
  }
})
test('new-window platform playback loads the same guest and returns a cloneable deny',async()=>{
  assert.equal(typeof links.installVideoGuestLinks,'function')
  const guest=new EventEmitter(),loaded=[];let handler,external=[]
  guest.setWindowOpenHandler=fn=>{handler=fn};guest.isDestroyed=()=>false;guest.loadURL=async url=>loaded.push(url)
  const dispose=links.installVideoGuestLinks(guest,{site:'bilibili',openExternal:url=>external.push(url),report:()=>{}})
  const result=handler({url:'https://www.bilibili.com/video/BVtest'});assert.deepEqual(result,{action:'deny'});await new Promise(resolve=>setImmediate(resolve))
  assert.deepEqual(loaded,['https://www.bilibili.com/video/BVtest']);assert.equal(external.length,0)
  handler({url:'https://example.invalid/'});assert.deepEqual(external,['https://example.invalid/'])
  dispose();handler({url:'https://www.bilibili.com/video/BVother'});await new Promise(resolve=>setImmediate(resolve));assert.equal(loaded.length,1)
})
test('guest navigation failure reports, while a destroyed guest cannot load',async()=>{
  assert.equal(typeof links.installVideoGuestLinks,'function')
  const guest=new EventEmitter(),errors=[];let handler,destroyed=false
  guest.setWindowOpenHandler=fn=>{handler=fn};guest.isDestroyed=()=>destroyed;guest.loadURL=async()=>{throw Error('网络不可用')}
  links.installVideoGuestLinks(guest,{site:'huya',openExternal:()=>{},report:message=>errors.push(message)})
  handler({url:'https://www.huya.com/123'});await new Promise(resolve=>setImmediate(resolve));assert.match(errors[0],/网络不可用/)
  destroyed=true;guest.emit('destroyed');handler({url:'https://www.huya.com/456'});await new Promise(resolve=>setImmediate(resolve));assert.equal(errors.length,1)
})
