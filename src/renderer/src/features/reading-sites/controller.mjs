import { showReadingControls, hideReadingControls, startReadingScroll, stopReadingScroll, cleanupReadingPage } from './page-scripts.mjs'
import { isReadingURL, isReadingSiteURL } from './platforms.mjs'

const TRANSPARENT_CSS = 'html, body, * { background: transparent !important; background-image: none !important; }'
const SCROLLBAR_CSS = '::-webkit-scrollbar { display: none !important; }'
const color = (value) => typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value) ? value : null
function number(value, fallback, min, max) {
  const parsed = value === null || value === undefined || value === '' ? NaN : Number(value)
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback
}
export function createReadingState(platform) {
  return { transparent:false, controlsShown:false, zoom:0.75, backgroundColor:null, fontColor:null,
    scrollbarHidden:true, autoScrollEnabled:false, speed:3, hidden:false, ready:false, lastAddress:platform.home }
}

export function createReadingController({ platform, state = createReadingState(platform), getWebview, settings }) {
  const key = platform.key
  let queue = Promise.resolve(), generation = 0, disposed = false
  const cssKeys = new Map()
  function alive() { if (disposed) throw new Error('阅读网站页面已关闭或卸载') }
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
    if (!view) throw new Error('阅读网站网页尚未准备好')
    const script = async (fn, ...args) => {
      check()
      const code = `(${fn.toString()})(${[platform,...args].map(value=>JSON.stringify(value)).join(',')})`
      const envelope = await view.executeJavaScript(`(()=>{try{return {ok:true,value:${code}}}catch(error){return {ok:false,error:error.message||String(error)}}})()`)
      if (!envelope?.ok) throw new Error(envelope?.error || '阅读页面操作失败')
      const result = envelope.value
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
    if (state.backgroundColor) styles.push(`html body, ${platform.background} { background-color: ${state.backgroundColor} !important; }`)
    if (state.fontColor) styles.push(`${platform.content}, ${platform.content} * { color: ${state.fontColor} !important; }`)
    await context.replaceCSS('style',styles.join('\n'))
    await context.replaceCSS('transparent',state.transparent && !state.controlsShown ? TRANSPARENT_CSS : null)
    await context.replaceCSS('scrollbar',state.scrollbarHidden ? SCROLLBAR_CSS : null)
    context.check(); await context.view.setZoomFactor(state.zoom); context.check()
  }
  async function syncScroll(context) {
    if (state.autoScrollEnabled && !state.hidden && isReadingURL(platform,context.view.getURL())) await context.script(startReadingScroll,state.speed)
    else await context.script(stopReadingScroll)
  }
  async function write(key,value) { await settings.setSetting(key,value); alive() }
  function load() {
    return enqueue(async()=>{
      const keys=[`${key}.transparent`,`${key}.backgroundColor`,`${key}.fontColor`,`${key}.lastAddress`,`${key}Zoom`,`${key}AutoScrollEnabled`,`${key}ScrollSpeed`,`${key}.scrollbarHidden`]
      const values=await Promise.all(keys.map(key=>settings.getSetting(key))); alive()
      const saved=Object.fromEntries(keys.map((key,index)=>[key,values[index]]))
      Object.assign(state,{
        transparent:saved[`${key}.transparent`]===true,
        backgroundColor:color(saved[`${key}.backgroundColor`]),fontColor:color(saved[`${key}.fontColor`]),
        zoom:number(saved[`${key}Zoom`],0.75,0.6,1),speed:Math.round(number(saved[`${key}ScrollSpeed`],3,1,10)),
        autoScrollEnabled:saved[`${key}AutoScrollEnabled`]===true,scrollbarHidden:saved[`${key}.scrollbarHidden`]!==false
      })
      const address=saved[`${key}.lastAddress`]
      if (isReadingSiteURL(platform,address)) state.lastAddress=address
      return state
    })
  }
  function navigationStarted() { generation++; state.ready=false; state.controlsShown=false; cssKeys.clear() }
  function domReady({newDocument=true}={}) {
    generation++; state.ready=true; state.controlsShown=false
    if(newDocument)cssKeys.clear()
    return enqueue(async()=>{
      const context=documentContext()
      await context.script(cleanupReadingPage)
      await applyAppearance(context); await syncScroll(context)
      const address=context.view.getURL()
      if (isReadingSiteURL(platform,address)) { await write(`${key}.lastAddress`,address); context.check(); state.lastAddress=address }
      return state
    })
  }
  function setTransparent(enabled) {
    return enqueue(async()=>{
      await write(`${key}.transparent`,!!enabled); state.transparent=!!enabled
      if (state.ready) await documentContext().replaceCSS('transparent',state.transparent && !state.controlsShown ? TRANSPARENT_CSS:null)
      return state
    })
  }
  function toggleReaderControls() {
    return enqueue(async()=>{
      const context=documentContext()
      if (state.controlsShown) {
        await context.script(hideReadingControls); state.controlsShown=false
        await context.replaceCSS('transparent',state.transparent?TRANSPARENT_CSS:null)
      } else {
        let address
        try { address=new URL(context.view.getURL()) } catch { throw new Error('只能在阅读页面调出阅读网站控制栏') }
        if (!isReadingURL(platform,address.href)) throw new Error('只能在阅读页面调出阅读网站控制栏')
        await context.replaceCSS('transparent',null)
        try { await context.script(showReadingControls); state.controlsShown=true }
        catch (error) {
          if (state.ready) await context.replaceCSS('transparent',state.transparent?TRANSPARENT_CSS:null)
          // Electron wraps guest-page exceptions in a generic IPC error and
          // otherwise hides the actionable message from the reader.
          if (/GUEST_VIEW_MANAGER_CALL|Script failed to execute/i.test(error?.message||'')) {
            throw new Error('未找到阅读网站控制栏，请先打开阅读页面并等待加载完成')
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
      await write(`${key}Zoom`,next); state.zoom=next
      if (state.ready) { const context=documentContext(); await context.view.setZoomFactor(next); context.check() }
    })
  }
  function setStyle(field,value) {
    return enqueue(async()=>{
      if (!['backgroundColor','fontColor'].includes(field) || !color(value)) throw new Error('颜色必须是六位十六进制值')
      await write(`${key}.${field}`,value); state[field]=value
      if (state.ready) await applyAppearance(documentContext())
    })
  }
  function resetStyle() {
    return enqueue(async()=>{
      await settings.setSettings({[`${key}.transparent`]:false,[`${key}.backgroundColor`]:undefined,[`${key}.fontColor`]:undefined}); alive()
      if (state.ready) { const context=documentContext(); await context.script(hideReadingControls) }
      Object.assign(state,{transparent:false,controlsShown:false,backgroundColor:null,fontColor:null})
      if (state.ready) { const context=documentContext(); await applyAppearance(context); context.view.reload() }
    })
  }
  function setScrollbarHidden(enabled) {
    return enqueue(async()=>{
      await write(`${key}.scrollbarHidden`,!!enabled); state.scrollbarHidden=!!enabled
      if (state.ready) await documentContext().replaceCSS('scrollbar',enabled?SCROLLBAR_CSS:null)
    })
  }
  function setAutoScroll(enabled) {
    return enqueue(async()=>{
      if (enabled && state.ready && !isReadingURL(platform,documentContext().view.getURL())) throw new Error('请先进入'+platform.name+'正文阅读页面再开启自动滚动')
      if (enabled && state.ready) await documentContext().script(function assertReadingContent(platform) {
        if (!document.querySelector(platform.content)) throw new Error('请先进入'+platform.name+'正文阅读页面并等待加载完成')
        return true
      })
      await write(`${key}AutoScrollEnabled`,!!enabled); state.autoScrollEnabled=!!enabled
      if (state.ready) await syncScroll(documentContext())
    })
  }
  function setSpeed(value) {
    return enqueue(async()=>{
      const next=Math.round(number(value,NaN,1,10))
      if (!Number.isFinite(next)) throw new Error('滚动速度必须是有效数值')
      await write(`${key}ScrollSpeed`,next); state.speed=next
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
      view.executeJavaScript(`(${cleanupReadingPage.toString()})(${JSON.stringify(platform)})`),
      ...keys.map(key=>view.removeInsertedCSS(key))
    ])
    const failed=results.find(result=>result.status==='rejected')
    if (failed && !/destroy|closed|disposed/i.test(failed.reason?.message||'')) throw failed.reason
  }
  return {state,load,navigationStarted,domReady,setTransparent,toggleReaderControls,setZoom,setStyle,resetStyle,
    setScrollbarHidden,setAutoScroll,setSpeed,setHidden,dispose}
}
