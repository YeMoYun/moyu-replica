import { showReaderControls, hideReaderControls, startAutoScroll, stopAutoScroll, cleanupWeReadPage } from './page-scripts.mjs'

export const WEREAD_HOME = 'https://weread.qq.com/'
const TRANSPARENT_CSS = 'html, body, * { background: transparent !important; background-image: none !important; }'
const SCROLLBAR_CSS = '::-webkit-scrollbar { display: none !important; }'
const color = (value) => typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value) ? value : null
function number(value, fallback, min, max) {
  const parsed = value === null || value === undefined || value === '' ? NaN : Number(value)
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback
}
export function createWeReadState() {
  return { transparent:false, controlsShown:false, zoom:0.75, backgroundColor:null, fontColor:null,
    scrollbarHidden:true, autoScrollEnabled:false, speed:3, hidden:false, ready:false, lastAddress:WEREAD_HOME }
}

export function createWeReadController({ state = createWeReadState(), getWebview, settings }) {
  let queue = Promise.resolve(), generation = 0, disposed = false
  const cssKeys = new Map()
  function alive() { if (disposed) throw new Error('微信读书页面已关闭或卸载') }
  function enqueue(operation) {
    const result = queue.then(() => { alive(); return operation() })
    queue = result.catch(() => {})
    return result
  }
  function documentContext() {
    const version = generation, view = getWebview()
    const check = () => {
      alive()
      if (!state.ready || version !== generation || getWebview() !== view) throw new Error('页面已发生导航，请等待加载完成后重试')
    }
    check()
    if (!view) throw new Error('微信读书网页尚未准备好')
    const script = async (fn, ...args) => {
      check()
      const result = await view.executeJavaScript(`(${fn.toString()})(${args.map(value=>JSON.stringify(value)).join(',')})`)
      check(); return result
    }
    const replaceCSS = async (name, css) => {
      check()
      const previous = cssKeys.get(name)
      if (previous) { await view.removeInsertedCSS(previous); check(); cssKeys.delete(name) }
      if (css) { const key = await view.insertCSS(css); check(); cssKeys.set(name,key) }
    }
    return {view,check,script,replaceCSS}
  }
  async function applyAppearance(context) {
    const styles = []
    if (state.backgroundColor) styles.push(`html body, .readerChapterContent, .readerContentHeader, .readerFooter, .readerTopBar, .readerBottomBar_content { background-color: ${state.backgroundColor} !important; }`)
    if (state.fontColor) styles.push(`* { color: ${state.fontColor} !important; }`)
    await context.replaceCSS('style',styles.join('\n'))
    await context.replaceCSS('transparent',state.transparent && !state.controlsShown ? TRANSPARENT_CSS : null)
    await context.replaceCSS('scrollbar',state.scrollbarHidden ? SCROLLBAR_CSS : null)
    context.check(); await context.view.setZoomFactor(state.zoom); context.check()
  }
  async function syncScroll(context) {
    if (state.autoScrollEnabled && !state.hidden) await context.script(startAutoScroll,state.speed)
    else await context.script(stopAutoScroll)
  }
  async function write(key,value) { await settings.setSetting(key,value); alive() }
  function load() {
    return enqueue(async()=>{
      const keys=['weRead.transparent','weRead.backgroundColor','weRead.fontColor','weRead.lastAddress','weReadZoom','weReadAutoScrollEnabled','weReadScrollSpeed','weRead.scrollbarHidden']
      const values=await Promise.all(keys.map(key=>settings.getSetting(key))); alive()
      const saved=Object.fromEntries(keys.map((key,index)=>[key,values[index]]))
      Object.assign(state,{
        transparent:saved['weRead.transparent']===true,
        backgroundColor:color(saved['weRead.backgroundColor']),fontColor:color(saved['weRead.fontColor']),
        zoom:number(saved.weReadZoom,0.75,0.6,1),speed:Math.round(number(saved.weReadScrollSpeed,3,1,10)),
        autoScrollEnabled:saved.weReadAutoScrollEnabled===true,scrollbarHidden:saved['weRead.scrollbarHidden']!==false
      })
      const address=saved['weRead.lastAddress']
      if (typeof address==='string' && /^https?:\/\//i.test(address)) state.lastAddress=address
      return state
    })
  }
  function navigationStarted() { generation++; state.ready=false; state.controlsShown=false; cssKeys.clear() }
  function domReady({newDocument=true}={}) {
    generation++; state.ready=true; state.controlsShown=false
    if(newDocument)cssKeys.clear()
    return enqueue(async()=>{
      const context=documentContext()
      await context.script(cleanupWeReadPage)
      await applyAppearance(context); await syncScroll(context)
      const address=context.view.getURL()
      if (/^https?:\/\//i.test(address)) { await write('weRead.lastAddress',address); context.check(); state.lastAddress=address }
      return state
    })
  }
  function setTransparent(enabled) {
    return enqueue(async()=>{
      await write('weRead.transparent',!!enabled); state.transparent=!!enabled
      if (state.ready) await documentContext().replaceCSS('transparent',state.transparent && !state.controlsShown ? TRANSPARENT_CSS:null)
      return state
    })
  }
  function toggleReaderControls() {
    return enqueue(async()=>{
      const context=documentContext()
      if (state.controlsShown) {
        await context.script(hideReaderControls); state.controlsShown=false
        await context.replaceCSS('transparent',state.transparent?TRANSPARENT_CSS:null)
      } else {
        let address
        try { address=new URL(context.view.getURL()) } catch { throw new Error('只能在阅读页面调出微信读书控制栏') }
        if (!address.pathname.includes('/web/reader/')) throw new Error('只能在阅读页面调出微信读书控制栏')
        await context.replaceCSS('transparent',null)
        try { await context.script(showReaderControls); state.controlsShown=true }
        catch (error) {
          if (state.ready) await context.replaceCSS('transparent',state.transparent?TRANSPARENT_CSS:null)
          // Electron wraps guest-page exceptions in a generic IPC error and
          // otherwise hides the actionable message from the reader.
          if (/GUEST_VIEW_MANAGER_CALL|Script failed to execute/i.test(error?.message||'')) {
            throw new Error('未找到微信读书控制栏，请先打开阅读页面并等待加载完成')
          }
          throw error
        }
      }
      return state
    })
  }
  function setZoom(value) {
    return enqueue(async()=>{
      const next=number(value,NaN,0.6,1)
      if (!Number.isFinite(next)) throw new Error('缩放必须是有效数值')
      await write('weReadZoom',next); state.zoom=next
      if (state.ready) { const context=documentContext(); await context.view.setZoomFactor(next); context.check() }
    })
  }
  function setStyle(field,value) {
    return enqueue(async()=>{
      if (!['backgroundColor','fontColor'].includes(field) || !color(value)) throw new Error('颜色必须是六位十六进制值')
      await write(`weRead.${field}`,value); state[field]=value
      if (state.ready) await applyAppearance(documentContext())
    })
  }
  function resetStyle() {
    return enqueue(async()=>{
      await settings.setSettings({'weRead.transparent':false,'weRead.backgroundColor':undefined,'weRead.fontColor':undefined}); alive()
      if (state.ready) { const context=documentContext(); await context.script(hideReaderControls) }
      Object.assign(state,{transparent:false,controlsShown:false,backgroundColor:null,fontColor:null})
      if (state.ready) { const context=documentContext(); await applyAppearance(context); context.view.reload() }
    })
  }
  function setScrollbarHidden(enabled) {
    return enqueue(async()=>{
      await write('weRead.scrollbarHidden',!!enabled); state.scrollbarHidden=!!enabled
      if (state.ready) await documentContext().replaceCSS('scrollbar',enabled?SCROLLBAR_CSS:null)
    })
  }
  function setAutoScroll(enabled) {
    return enqueue(async()=>{
      await write('weReadAutoScrollEnabled',!!enabled); state.autoScrollEnabled=!!enabled
      if (state.ready) await syncScroll(documentContext())
    })
  }
  function setSpeed(value) {
    return enqueue(async()=>{
      const next=Math.round(number(value,NaN,1,10))
      if (!Number.isFinite(next)) throw new Error('滚动速度必须是有效数值')
      await write('weReadScrollSpeed',next); state.speed=next
      if (state.ready) await syncScroll(documentContext())
    })
  }
  function setHidden(hidden) {
    return enqueue(async()=>{
      state.hidden=!!hidden
      if (state.ready) await syncScroll(documentContext())
    })
  }
  async function dispose() {
    if (disposed) return
    disposed=true; generation++
    const view=getWebview(), keys=[...cssKeys.values()]; cssKeys.clear(); state.ready=false
    if (!view) return
    const results=await Promise.allSettled([
      view.executeJavaScript(`(${cleanupWeReadPage.toString()})()`),
      ...keys.map(key=>view.removeInsertedCSS(key))
    ])
    const failed=results.find(result=>result.status==='rejected')
    if (failed && !/destroy|closed|disposed/i.test(failed.reason?.message||'')) throw failed.reason
  }
  return {state,load,navigationStarted,domReady,setTransparent,toggleReaderControls,setZoom,setStyle,resetStyle,
    setScrollbarHidden,setAutoScroll,setSpeed,setHidden,dispose}
}
