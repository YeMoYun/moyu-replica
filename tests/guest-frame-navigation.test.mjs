import test from 'node:test'
import assert from 'node:assert/strict'
import {EventEmitter} from 'node:events'
import fs from 'node:fs'
let install
try{({installGuestFrameNavigationGuard:install}=await import('../src/main/guest-frame-navigation.mjs'))}catch(error){if(error.code!=='ERR_MODULE_NOT_FOUND')throw error}
const disposedMessage='Render frame was disposed before WebFrameMain could be accessed'
function guest(){
  const contents=new EventEmitter(),sent=[]
  contents.isDestroyed=()=>false
  const forward=(...args)=>sent.push(args)
  // The exact vulnerable Electron 31 callback boundary, without mocking the guard.
  contents.on('will-frame-navigate',function(event){forward('GUEST_VIEW_INTERNAL_DISPATCH_EVENT','will-frame-navigate',{url:event.url,isMainFrame:event.isMainFrame,frameProcessId:event.frame.processId,frameRoutingId:event.frame.routingId})})
  return {contents,sent}
}
function setup(contents,version='31.7.7',warnings=[]){assert.equal(typeof install,'function');return install(contents,{electronVersion:version,report:message=>warnings.push(message)})}
test('live Electron 31 frame navigation retains the original forwarded event',()=>{
  const {contents,sent}=guest();setup(contents)
  contents.emit('will-frame-navigate',{url:'https://example.invalid',isMainFrame:false,frame:{processId:42,routingId:7}})
  assert.deepEqual(sent,[['GUEST_VIEW_INTERNAL_DISPATCH_EVENT','will-frame-navigate',{url:'https://example.invalid',isMainFrame:false,frameProcessId:42,frameRoutingId:7}]])
})
test('disposed frame only drops the stale internal forwarding event and reports it',()=>{
  const {contents,sent}=guest(),warnings=[];let businessCalls=0
  contents.on('will-frame-navigate',()=>businessCalls++)
  setup(contents,'31.7.7',warnings)
  const frame={get processId(){throw Error(disposedMessage)}}
  assert.doesNotThrow(()=>contents.emit('will-frame-navigate',{url:'about:blank',isMainFrame:false,frame}))
  assert.equal(sent.length,0);assert.equal(businessCalls,1);assert.equal(warnings.length,1)
})
test('other internal failures are never swallowed',()=>{
  const {contents}=guest();setup(contents)
  const frame={get processId(){throw Error('unexpected programming failure')}}
  assert.throws(()=>contents.emit('will-frame-navigate',{frame}),/unexpected programming failure/)
})
test('application listeners with a disposed error remain untouched',()=>{
  const contents=new EventEmitter();contents.on('will-frame-navigate',()=>{throw Error(disposedMessage)})
  setup(contents);assert.throws(()=>contents.emit('will-frame-navigate',{}),/Render frame was disposed/)
})
test('installation is idempotent and destruction cleans owned listeners',()=>{
  const {contents}=guest(),original=contents.listeners('will-frame-navigate')[0]
  const dispose=setup(contents);assert.equal(contents.listenerCount('will-frame-navigate'),1)
  setup(contents);assert.equal(contents.listenerCount('will-frame-navigate'),1)
  dispose();assert.equal(contents.listeners('will-frame-navigate')[0],original)
  setup(contents);contents.isDestroyed=()=>true;contents.emit('destroyed')
  assert.equal(contents.listenerCount('will-frame-navigate'),0)
})
test('new Electron versions do not have their event listeners patched',()=>{
  const {contents}=guest(),original=contents.listeners('will-frame-navigate')[0]
  setup(contents,'40.0.0');assert.equal(contents.listeners('will-frame-navigate')[0],original)
})
test('compatibility guard is limited to the four transparent video guests',()=>{
  const source=fs.readFileSync(new URL('../src/main/index.js',import.meta.url),'utf8')
  assert.match(source,/\['douyinOpacity', 'bilibiliOpacity', 'huyaOpacity', 'kuaishouOpacity'\]\.includes\(key\)[\s\S]*?did-attach-webview[\s\S]*?installGuestFrameNavigationGuard/)
  assert.doesNotMatch(source,/process\.on\(['"]uncaughtException/)
})
