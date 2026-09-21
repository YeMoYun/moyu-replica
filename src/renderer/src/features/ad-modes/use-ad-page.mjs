import {ref,reactive,onMounted,onUnmounted} from 'vue'
import {createAdPageController} from './controller.mjs'
import {normalizeAdSettings} from '../../../../shared/ad-modes.mjs'

export function useAdPage(kind){
  const api=window.adModeControl,wv=ref(null),initialized=ref(false),initialAddress=ref(''),error=ref(''),pending=ref(0),shortcuts=reactive({})
  const native=reactive({covered:false,expanded:false,opacity:1}),state=reactive({...normalizeAdSettings(kind),ready:false,covered:false})
  const controller=createAdPageController({kind,getWebview:()=>wv.value,api,state})
  const subscriptions=[];let closed=false
  async function perform(fn){
    if(closed)return
    pending.value++;error.value=''
    try{return await fn()}catch(failure){if(!closed)error.value=failure.message||String(failure)}finally{pending.value--}
  }
  function receive(next){
    const coveredChanged=native.covered!==next.covered,expandedChanged=native.expanded!==next.expanded
    Object.assign(native,next)
    if(coveredChanged)perform(()=>controller.setCovered(next.covered))
    if(expandedChanged)perform(()=>controller.setExpanded(next.expanded))
  }
  const domReady=()=>perform(()=>controller.domReady())
  function navigation(event){if(event.isMainFrame!==false&&!event.isInPlace)controller.navigationStarted()}
  function failed(event){if(event.isMainFrame!==false&&event.errorCode!==-3)error.value=`页面加载失败：${event.errorDescription||event.errorCode}，请检查网络后重试。`}
  const update=patch=>perform(()=>controller.update(patch))
  const action=name=>perform(()=>controller.action(name))
  const toTransparent=()=>perform(()=>api.openTransparent(wv.value?.getURL()||state.address))
  onMounted(async()=>{
    if(!api){error.value='广告窗口接口不可用，请通过 Electron 启动';return}
    subscriptions.push(api.onState(receive),api.onError(message=>{error.value=message}))
    subscriptions.push(window.ipcRenderer.on('stop-or-continue',()=>kind==='weReadAd'?update({autoScroll:!state.autoScroll}):action('play')))
    if(kind!=='weReadAd')for(const [channel,name]of [['all-prev','prev'],['all-next','next'],['all-screen','fullscreen'],['all-like','like']])subscriptions.push(window.ipcRenderer.on(channel,()=>action(name)))
    await perform(async()=>{await controller.load();initialAddress.value=state.address;receive(await api.getState());Object.assign(shortcuts,await window.ipcRenderer.invoke('get-shortcuts'))})
    if(!closed)initialized.value=true
  })
  onUnmounted(()=>{closed=true;for(const unsubscribe of subscriptions)unsubscribe();controller.dispose().catch(()=>{})})
  return {api,wv,initialized,initialAddress,error,pending,state,native,shortcuts,perform,domReady,navigation,failed,update,action,toTransparent}
}
