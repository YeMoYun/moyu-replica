import test from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
const { createWindowController, fitBounds } = await import('../src/main/window-controls.mjs').catch((e) => {
  if (e.code === 'ERR_MODULE_NOT_FOUND') return {}
  throw e
})
class WindowBoundary extends EventEmitter {
  opacity = 1; top = false; fullscreen = false; visible = true; ignored = false
  bounds = { x: 10, y: 10, width: 400, height: 300 }
  alpha = 255
  webContents = { send: () => {}, capturePage: async () => ({ toBitmap: () => Buffer.from([0,0,0,this.alpha]) }) }
  isDestroyed() { return false }
  getBounds() { return { ...this.bounds } }
  setBounds(v) { this.bounds = { ...v } }
  setOpacity(v) { this.opacity = v }
  getOpacity() { return this.opacity }
  setAlwaysOnTop(v, level) { this.top = v; this.topLevel = level }
  isAlwaysOnTop() { return this.top }
  setFullScreen(v) { this.fullscreen = v }
  isFullScreen() { return this.fullscreen }
  setIgnoreMouseEvents(v) { this.ignored = v }
  isVisible() { return this.visible }
  hide() { this.visible = false }
  show() { this.visible = true }
  close() { this.emit('close'); this.emit('closed') }
}
function fixture() {
  assert.equal(typeof createWindowController, 'function', 'window controller API must exist')
  const windows = new Map([['main', new WindowBoundary()], ['web', new WindowBoundary()]])
  const values = new Map()
  const store = { get: (k) => values.get(k), set: (k,v) => values.set(k, structuredClone(v)) }
  let cursor = { x: 20, y: 20 }; let tick
  let displays = [{workArea:{x:0,y:0,width:1920,height:1080}}]
  const screen = Object.assign(new EventEmitter(), { getCursorScreenPoint: () => cursor, getAllDisplays: () => displays })
  const control = createWindowController({ windows, store, screen, setInterval: (cb) => { tick = cb; return 1 }, clearInterval: () => {} })
  control.attach('web', windows.get('web'))
  return { control, windows, store, screen, displays: (value) => { displays=value }, tick: () => tick?.(), cursor: (v) => { cursor=v } }
}
test('opacity is targeted, bounded and retained independently from main', () => {
  const {control,windows} = fixture()
  control.setOpacity('web', 0.4)
  assert.equal(windows.get('web').opacity, 0.4)
  assert.equal(windows.get('main').opacity, 1)
  control.setOpacity('web', -2)
  assert.equal(control.state('web').opacity, 0.1)
  assert.throws(() => control.setOpacity('web', NaN))
})
test('fullscreen never toggles topmost and close targets the requested window', () => {
  const {control,windows} = fixture()
  control.setFullscreen('web', true)
  assert.equal(windows.get('web').fullscreen, true)
  assert.equal(windows.get('web').top, false)
  control.close('web')
  assert.equal(windows.has('web'), false)
  assert.equal(windows.has('main'), true)
})
test('auto-hide uses cursor and input forwarding, and restores configured opacity', () => {
  const {control,windows,cursor,tick} = fixture()
  control.setOpacity('web', 0.4)
  control.setAutoHide('web', true)
  cursor({x:1800,y:900}); tick()
  assert.equal(windows.get('web').opacity, 0)
  assert.equal(windows.get('web').ignored, true)
  cursor({x:20,y:20}); tick()
  assert.equal(windows.get('web').opacity, 0.4)
  assert.equal(windows.get('web').ignored, false)
  cursor({x:1800,y:900}); tick()
  control.setAutoHide('web', false)
  assert.equal(windows.get('web').opacity, 0.4)
})
test('boss key excludes main and does not reveal manually hidden windows', () => {
  const {control,windows} = fixture()
  const hidden = new WindowBoundary(); hidden.hide(); windows.set('hidden', hidden); control.attach('hidden',hidden)
  control.setOpacity('web', 0.6)
  control.toggleBoss()
  assert.equal(windows.get('web').opacity, 0)
  assert.equal(windows.get('main').opacity, 1)
  control.toggleBoss()
  assert.equal(windows.get('web').opacity, 0.6)
  assert.equal(hidden.visible, false)
})
test('reopened window restores opacity, topmost and bounds', () => {
  const {control,windows} = fixture()
  control.setOpacity('web', 0.5); control.setTopmost('web',true)
  windows.get('web').bounds.x=100; windows.get('web').emit('moved')
  control.close('web')
  const reopened = new WindowBoundary(); windows.set('web',reopened); control.attach('web',reopened)
  assert.equal(reopened.opacity,0.5); assert.equal(reopened.top,true); assert.equal(reopened.bounds.x,100)
})
test('topmost always uses the screen-saver level so windows float above the taskbar', () => {
  const {control,windows} = fixture()
  control.setTopmost('web',true)
  assert.deepEqual([windows.get('web').top,windows.get('web').topLevel],[true,'screen-saver'])
  control.close('web')
  const reopened = new WindowBoundary(); windows.set('web',reopened); control.attach('web',reopened)
  assert.deepEqual([reopened.top,reopened.topLevel],[true,'screen-saver'])
  control.setTopmost('web',false)
  assert.deepEqual([windows.get('web').top,windows.get('web').topLevel],[false,'screen-saver'])
})
test('off-screen bounds are brought back to an available display', () => {
  assert.equal(typeof fitBounds,'function')
  const result=fitBounds({x:9999,y:9999,width:400,height:300},[{workArea:{x:0,y:0,width:1000,height:700}}])
  assert.ok(result.x>=0 && result.x+result.width<=1000)
  assert.ok(result.y>=0 && result.y+result.height<=700)
})
test('click-through follows pixel alpha and opaque controls remain clickable', async () => {
  const {control,windows,tick} = fixture()
  const window=windows.get('web')
  control.setPierce('web',true)
  window.alpha=0; await tick()
  assert.equal(window.ignored,true)
  window.alpha=255; await tick()
  assert.equal(window.ignored,false)
  control.setPierce('web',false)
  assert.equal(window.ignored,false)
})
test('changing settings in fullscreen preserves last normal geometry', () => {
  const {control,windows} = fixture()
  const original=windows.get('web').getBounds()
  control.setFullscreen('web',true)
  windows.get('web').bounds={x:0,y:0,width:1920,height:1080}
  control.setOpacity('web',0.4)
  control.close('web')
  const reopened=new WindowBoundary(); windows.set('web',reopened); control.attach('web',reopened)
  assert.deepEqual(reopened.bounds,original)
})
test('source-style legacy geometry migrates and keeps valid zero coordinates', () => {
  const {control,windows,store}=fixture()
  control.close('web')
  store.set('windowState.web',undefined)
  store.set('web.baseWidth',500);store.set('web.baseHeight',350);store.set('web.xPosition',0);store.set('web.yPosition',0)
  const reopened=new WindowBoundary();windows.set('web',reopened);control.attach('web',reopened)
  assert.deepEqual(reopened.bounds,{x:0,y:0,width:500,height:350})
})
test('explicit bounds API persists through closing and reopening', () => {
  const {control,windows}=fixture()
  assert.equal(typeof control.saveBounds,'function')
  control.saveBounds('web',{x:150,y:100,width:500,height:350})
  control.close('web')
  const reopened=new WindowBoundary();windows.set('web',reopened);control.attach('web',reopened)
  assert.deepEqual(reopened.bounds,{x:150,y:100,width:500,height:350})
})
test('transparent-window borderless fullscreen fills display without toggling topmost', () => {
  const {control,windows}=fixture()
  control.close('web')
  const window=new WindowBoundary();windows.set('web',window);control.attach('web',window,{transparent:true,platform:'win32'})
  control.setFullscreen('web',true)
  assert.equal(control.state('web').fullscreen,true)
  assert.deepEqual(window.bounds,{x:0,y:0,width:1920,height:1080})
  assert.equal(window.top,false)
  control.setFullscreen('web',false)
  assert.deepEqual(window.bounds,{x:10,y:10,width:400,height:300})
})
test('source position-only namespaces retain coordinates and constructor dimensions', () => {
  const {control,windows,store}=fixture()
  for (const [key,namespace] of [['douyin','douyin'],['book','book'],['huya','huyaWindow'],['douyu','douyuWindow'],['bilibili','bilibiliWindow']]) {
    store.set(`${namespace}.xPosition`,0);store.set(`${namespace}.yPosition`,100)
    const window=new WindowBoundary(); window.bounds.width=300;window.bounds.height=450;windows.set(key,window);control.attach(key,window)
    assert.deepEqual(window.bounds,{x:0,y:100,width:300,height:450},`${key} geometry migration`)
  }
})
test('borderless fullscreen and normal restoration follow a removed display',()=>{
  const {control,windows,screen,displays}=fixture()
  control.close('web');const window=new WindowBoundary();windows.set('web',window);control.attach('web',window,{transparent:true,platform:'win32'})
  control.setFullscreen('web',true)
  const area={x:-1280,y:0,width:1280,height:720};displays([{workArea:area,bounds:area}])
  screen.emit('display-removed')
  assert.deepEqual(window.bounds,area)
  control.setFullscreen('web',false)
  assert.ok(window.bounds.x>=-1280 && window.bounds.x+window.bounds.width<=0)
})
