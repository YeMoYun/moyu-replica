import test from 'node:test'
import assert from 'node:assert/strict'
let module = {}
try { module = await import('../src/renderer/src/features/weread/controller.mjs') }
catch (error) { if (error.code !== 'ERR_MODULE_NOT_FOUND') throw error }

function setup(saved = {}) {
  assert.equal(typeof module.createWeReadController, 'function', 'WeRead lifecycle controller must exist')
  const state = module.createWeReadState()
  const calls = [], writes = [], css = new Map()
  let id = 0
  const settings = {
    getSetting: async (key) => saved[key],
    setSetting: async (key, value) => { writes.push([key, value]); saved[key] = value },
    setSettings: async (values) => { for (const [key,value] of Object.entries(values)) { writes.push([key,value]); saved[key] = value } }
  }
  const view = {
    getURL: () => 'https://weread.qq.com/web/reader/demo',
    insertCSS: async (value) => { const key = `css-${++id}`; css.set(key,value); calls.push(['insert',value]); return key },
    removeInsertedCSS: async (key) => { css.delete(key); calls.push(['remove',key]) },
    executeJavaScript: async (script) => { calls.push(['script',script]); return true },
    setZoomFactor: (value) => calls.push(['zoom',value]),
    reload: () => calls.push(['reload'])
  }
  return { state, calls, writes, css, settings, view, saved, controller: module.createWeReadController({state,getWebview:()=>view,settings}) }
}
test('WeRead restores and validates source preference keys', async () => {
  const x = setup({'weRead.transparent':true,weReadZoom:0.85,weReadScrollSpeed:7,weReadAutoScrollEnabled:true,'weRead.lastAddress':'https://weread.qq.com/web/reader/demo'})
  await x.controller.load()
  assert.equal(x.state.transparent,true); assert.equal(x.state.zoom,0.85)
  assert.equal(x.state.speed,7); assert.equal(x.state.autoScrollEnabled,true)
  const y = setup({weReadZoom:'bad',weReadScrollSpeed:500,'weRead.fontColor':'red; opacity:0'})
  await y.controller.load()
  assert.equal(y.state.zoom,0.75); assert.equal(y.state.speed,10); assert.equal(y.state.fontColor,null)
})
test('showing real reader controls temporarily suspends CSS without changing preference', async () => {
  const x = setup()
  await x.controller.load(); await x.controller.domReady(); await x.controller.setTransparent(true)
  assert.ok([...x.css.values()].some(value=>/background.*transparent/.test(value)))
  const writes = x.writes.length
  await x.controller.toggleReaderControls()
  assert.equal(x.state.controlsShown,true); assert.equal(x.state.transparent,true)
  assert.equal([...x.css.values()].some(value=>/background.*transparent/.test(value)),false)
  await x.controller.toggleReaderControls()
  assert.equal(x.state.controlsShown,false)
  assert.ok([...x.css.values()].some(value=>/background.*transparent/.test(value)))
  assert.equal(x.writes.length,writes,'temporary changes must not overwrite saved transparency')
})
test('outside reading pages and missing DOM controls cannot claim success', async () => {
  const x=setup(); await x.controller.domReady()
  x.view.getURL=()=> 'https://weread.qq.com/'
  await assert.rejects(x.controller.toggleReaderControls(),/阅读页面/)
  assert.equal(x.state.controlsShown,false)
  x.view.getURL=()=> 'https://weread.qq.com/web/reader/demo'
  x.view.executeJavaScript=async()=> {throw new Error('未找到微信读书控制栏')}
  await assert.rejects(x.controller.toggleReaderControls(),/未找到/)
  assert.equal(x.state.controlsShown,false)
})
test('hidden windows pause scroll without turning off the user preference', async () => {
  const x=setup(); await x.controller.domReady(); await x.controller.setAutoScroll(true)
  const count=x.writes.length
  await x.controller.setHidden(true); assert.equal(x.state.autoScrollEnabled,true)
  assert.match(x.calls.at(-1)[1],/stopAutoScroll/)
  await x.controller.setHidden(false); assert.match(x.calls.at(-1)[1],/startAutoScroll/)
  assert.equal(x.writes.length,count)
  await x.controller.setAutoScroll(false); await x.controller.setHidden(true); await x.controller.setHidden(false)
  assert.equal(x.state.autoScrollEnabled,false)
  assert.match(x.calls.at(-1)[1],/stopAutoScroll/)
})
test('refresh reapplies owned CSS and zoom and disposal clears resources',async()=>{
  const x=setup({'weRead.transparent':true,weReadZoom:0.9}); await x.controller.load(); await x.controller.domReady()
  await x.controller.setScrollbarHidden(true)
  x.controller.navigationStarted(); x.css.clear()
  await x.controller.domReady()
  assert.ok([...x.css.values()].some(value=>/background.*transparent/.test(value)))
  assert.ok([...x.css.values()].some(value=>/scrollbar/.test(value)))
  assert.ok(x.calls.some(call=>call[0]==='zoom'&&call[1]===0.9))
  await x.controller.dispose(); assert.equal(x.css.size,0)
  await assert.rejects(x.controller.setTransparent(false),/关闭|卸载/)
})
test('disk failure keeps existing style preference and live appearance',async()=>{
  const x=setup(); await x.controller.domReady()
  const originalCSS=[...x.css.entries()]
  x.settings.setSetting=async()=> {throw new Error('磁盘写入失败')}
  await assert.rejects(x.controller.setTransparent(true),/磁盘/)
  assert.equal(x.state.transparent,false); assert.deepEqual([...x.css.entries()],originalCSS)
})
test('stale document operations do not update new document state',async()=>{
  const x=setup(); await x.controller.domReady()
  let resolve
  x.view.insertCSS=()=>new Promise(r=>{resolve=r})
  const pending=x.controller.setTransparent(true)
  for(let i=0;i<10&&!resolve;i++) await Promise.resolve()
  assert.ok(resolve)
  x.controller.navigationStarted(); resolve('old-document-css')
  await assert.rejects(pending,/页面|导航/)
  assert.equal(x.state.ready,false); assert.equal(x.state.controlsShown,false)
})
test('resetting style preserves unrelated and window settings',async()=>{
  const x=setup({'weRead.transparent':true,'weRead.backgroundColor':'#123456','weRead.fontColor':'#abcdef','chat.name':'保留'})
  await x.controller.load(); await x.controller.domReady(); await x.controller.resetStyle()
  assert.equal(x.state.transparent,false); assert.equal(x.state.backgroundColor,null); assert.equal(x.state.fontColor,null)
  assert.equal(x.saved['chat.name'],'保留'); assert.ok(x.calls.some(call=>call[0]==='reload'))
})
test('same-document navigation replaces CSS rather than leaking old styles',async()=>{
  const x=setup({'weRead.transparent':true});await x.controller.load();await x.controller.domReady()
  const count=x.css.size
  await x.controller.domReady({newDocument:false})
  assert.equal(x.css.size,count)
  assert.ok(x.calls.some(call=>call[0]==='remove'))
})
