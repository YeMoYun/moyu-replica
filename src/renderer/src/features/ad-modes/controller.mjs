import { normalizeAdSettings,normalizeAdPatch,validateAdUrl } from '../../../../shared/ad-modes.mjs'
import { startAutoScroll,stopAutoScroll,showReaderControls,hideReaderControls } from '../weread/page-scripts.mjs'
import { installHuyaWindowFill,toggleHuyaWindowFill,cleanupHuyaWindowFill } from '../video-opacity/huya-window-fill.mjs'
import { videoAdControls } from './video-controls.mjs'
import { prepareAdVideo,navigateAdVideo,toggleAdVideoFullscreen,toggleAdVideoPlayback,likeAdVideo,cleanupAdPage } from './page-scripts.mjs'

export function createAdPageController({kind,getWebview,api,state={...normalizeAdSettings(kind),ready:false,covered:false}}){
  const isVideo=kind!=='weReadAd'
  const controls=isVideo?videoAdControls(kind):null
  let generation=0,disposed=false,queue=Promise.resolve(),cssKey=null
  function alive(){if(disposed)throw Error('广告页面已关闭')}
  function enqueue(fn){const result=queue.then(()=>{alive();return fn()});queue=result.catch(()=>{});return result}
  function context(){
    const view=getWebview(),version=generation
    const check=()=>{alive();if(!state.ready||version!==generation||getWebview()!==view)throw Error('页面已发生导航，请等待加载完成');if(!view)throw Error('网页未准备好')}
    check()
    const script=async(fn,...args)=>{check();const result=await view.executeJavaScript(`(${fn.toString()})(${args.map(v=>JSON.stringify(v)).join(',')})`);check();return result}
    return {view,check,script}
  }
  async function scroll(c){if(kind==='weReadAd')await c.script(state.autoScroll&&!state.covered?startAutoScroll:stopAutoScroll,...(state.autoScroll&&!state.covered?[state.speed]:[]))}
  async function appearance(c){
    await c.view.setZoomFactor(state.expanded&&isVideo?.6:state.zoom);c.check()
    if(cssKey){await c.view.removeInsertedCSS(cssKey);c.check();cssKey=null}
    if(state.scrollbarHidden){cssKey=await c.view.insertCSS('::-webkit-scrollbar{display:none!important}');c.check()}
    if(isVideo)await c.script(prepareAdVideo)
    if(kind==='huya')await c.script(installHuyaWindowFill)
    await scroll(c)
  }
  const load=()=>enqueue(async()=>{Object.assign(state,normalizeAdSettings(kind,await api.getSettings()));return state})
  const domReady=()=>{state.ready=true;return enqueue(async()=>{const c=context();await appearance(c);const address=c.view.getURL();try{validateAdUrl(kind,address)}catch{return state}await api.saveSettings({address});c.check();state.address=address;return state})}
  function navigationStarted(){generation++;state.ready=false;cssKey=null;if(kind==='weReadAd')state.controlsShown=false}
  const update=patch=>enqueue(async()=>{const normalized=normalizeAdPatch(kind,patch);await api.saveSettings(normalized);Object.assign(state,normalized);if(state.ready)await appearance(context());return state})
  const setCovered=covered=>enqueue(async()=>{state.covered=!!covered;if(state.ready)await scroll(context());return state})
  const setExpanded=expanded=>enqueue(async()=>{state.expanded=!!expanded;if(state.ready)await appearance(context());return state})
  const action=name=>enqueue(async()=>{
    const c=context()
    if(kind==='weReadAd'&&name==='controls'){const shown=!state.controlsShown;await c.script(shown?showReaderControls:hideReaderControls);state.controlsShown=shown;return state}
    const fn={
      back:()=>{
        const canGoBack=typeof c.view.canGoBack==='function'?c.view.canGoBack():c.view.canGoBack
        if(!canGoBack)return false
        if(typeof c.view.goBack!=='function')throw Error('网页返回不可用')
        c.view.goBack()
        return true
      },
      prev:()=>c.script(navigateAdVideo,controls,'prev'),next:()=>c.script(navigateAdVideo,controls,'next'),fullscreen:()=>kind==='huya'?c.script(toggleHuyaWindowFill):c.script(toggleAdVideoFullscreen,controls),play:()=>c.script(toggleAdVideoPlayback,controls),like:()=>c.script(likeAdVideo,controls)
    }[name]
    if(!isVideo||!fn)throw Error('不支持的广告操作');return fn()
  })
  async function dispose(){
    const view=getWebview(),ready=state.ready;disposed=true;generation++;state.ready=false
    if(ready&&view){
      if(kind==='huya')try{await view.executeJavaScript(`(${cleanupHuyaWindowFill.toString()})()`)}catch{}
      try{await view.executeJavaScript(`(${(isVideo?cleanupAdPage:stopAutoScroll).toString()})()`)}catch{}
    }
  }
  return {state,load,domReady,navigationStarted,update,setCovered,setExpanded,action,dispose}
}
