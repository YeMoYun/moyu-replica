<template>
  <div class="weread-window">
    <svg class="icon-definitions" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <symbol id="wr-eye" viewBox="0 0 24 24"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></symbol>
        <symbol id="wr-close" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="m8 8 8 8m0-8-8 8"/></symbol>
        <symbol id="wr-pin" viewBox="0 0 24 24"><path d="m14 3 7 7-3 1-4 5-2-2-7 7-2-2 7-7-2-2 5-4Z"/></symbol>
        <symbol id="wr-hide" viewBox="0 0 24 24"><path d="M13 3H4v18h9m1-14 5 5-5 5m-6-5h11"/></symbol>
        <symbol id="wr-transparent" viewBox="0 0 24 24"><path d="M3 3h18v18H3Zm4 14 5-10 5 10m-8-4h6M3 8h4m10 8h4"/></symbol>
        <symbol id="wr-drop" viewBox="0 0 24 24"><path d="M12 3c-3 5-7 8-7 12a7 7 0 0 0 14 0c0-4-4-7-7-12Z"/></symbol>
        <symbol id="wr-home" viewBox="0 0 24 24"><path d="m3 11 9-8 9 8M5 9v12h5v-7h4v7h5V9"/></symbol>
        <symbol id="wr-help" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M9 8a3 3 0 0 1 6 1c0 2-3 2-3 4m0 3h.01"/></symbol>
        <symbol id="wr-scroll" viewBox="0 0 24 24"><path d="M7 3v17m-4-4 4 4 4-4m3-11h7m-7 5h7m-7 5h7"/></symbol>
        <symbol id="wr-scrollbar" viewBox="0 0 24 24"><path d="M4 3h13v18H4m17-17v16m0-12v6"/></symbol>
        <symbol id="wr-style" viewBox="0 0 24 24"><path d="m3 20 6-16h3l6 16M6 14h9m5-9v14"/></symbol>
        <symbol id="wr-reset" viewBox="0 0 24 24"><path d="M4 10a8 8 0 1 1 1 7M4 4v6h6"/></symbol>
      </defs>
    </svg>
    <div class="toolbar" :class="{ 'toolbar-hidden': !showBar }">
      <template v-if="showBar">
        <button class="icon-button" data-action="hide-bar" title="隐藏操作栏" aria-label="隐藏操作栏" @click="showBar=false"><svg><use href="#wr-eye"/></svg></button>
        <button class="icon-button" data-action="close" title="关闭网页" aria-label="关闭网页" @click="perform(()=>control.close())"><svg><use href="#wr-close"/></svg></button>
        <button class="icon-button" :class="{active:nativeState.alwaysOnTop}" data-action="topmost" title="置顶/取消置顶" aria-label="置顶/取消置顶" :aria-pressed="nativeState.alwaysOnTop" @click="perform(()=>control.setAlwaysOnTop(!nativeState.alwaysOnTop))"><svg><use href="#wr-pin"/></svg></button>
        <button class="icon-button" :class="{active:nativeState.autoHideEnabled}" data-action="auto-hide" :title="nativeState.autoHideEnabled?'鼠标移出隐藏：已开启（点击关闭）':'鼠标移出隐藏：已关闭（点击开启）'" aria-label="鼠标移出隐藏" :aria-pressed="nativeState.autoHideEnabled" @click="perform(()=>control.setAutoHide(!nativeState.autoHideEnabled))"><svg><use href="#wr-hide"/></svg></button>
        <button class="icon-button" :class="{active:pageState.transparent}" data-action="web-transparent" :title="pageState.transparent?'网页透明：已开启（点击恢复不透明）':'设置网页透明'" aria-label="设置网页透明" :aria-pressed="pageState.transparent" :disabled="!pageState.ready||busy" @click="perform(()=>page.setTransparent(!pageState.transparent))"><svg><use href="#wr-transparent"/></svg></button>
        <button class="icon-button" data-action="opacity" title="窗口透明度" aria-label="窗口透明度" @click="dialog='opacity'"><svg><use href="#wr-drop"/></svg></button>
        <button class="icon-button reader-control" :class="{active:pageState.controlsShown}" data-action="reader-controls" :title="(pageState.controlsShown?'隐藏':'显示')+platform.name+'控制栏'" :aria-label="'显示/隐藏'+platform.name+'控制栏'" :aria-pressed="pageState.controlsShown" :disabled="!pageState.ready||busy" @click="perform(()=>page.toggleReaderControls())">控</button>
        <div class="drag-space"></div>
        <button class="more-button" data-action="more" :aria-expanded="showMore" @click="showMore=!showMore">{{showMore?'收起':'更多'}}</button>
      </template>
      <template v-else>
        <button class="icon-button recovery-eye" data-action="show-bar" title="显示操作栏" aria-label="显示操作栏" @click="showBar=true"><svg><use href="#wr-eye"/></svg></button>
        <div class="drag-space"></div>
      </template>
    </div>
    <div v-if="showBar&&showMore" class="more-panel" aria-label="更多阅读操作">
      <button class="icon-button" data-action="home" title="返回阅读网站首页" aria-label="返回阅读网站首页" @click="goHome"><svg><use href="#wr-home"/></svg></button>
      <button class="icon-button" data-action="help" title="帮助" aria-label="帮助" @click="dialog='help'"><svg><use href="#wr-help"/></svg></button>
      <button class="icon-button" :class="{active:pageState.autoScrollEnabled}" data-action="auto-scroll" title="自动滚动设置" aria-label="自动滚动设置" @click="dialog='scroll'"><svg><use href="#wr-scroll"/></svg></button>
      <button class="icon-button" :class="{active:pageState.scrollbarHidden}" data-action="scrollbar" title="显示/隐藏滚动条" aria-label="显示/隐藏滚动条" :disabled="busy" @click="perform(()=>page.setScrollbarHidden(!pageState.scrollbarHidden))"><svg><use href="#wr-scrollbar"/></svg></button>
      <button class="icon-button" data-action="style" title="修改文字颜色和背景颜色" aria-label="修改文字颜色和背景颜色" @click="dialog='style'"><svg><use href="#wr-style"/></svg></button>
      <button class="icon-button" data-action="reset-style" title="恢复默认背景颜色以及文本颜色" aria-label="恢复默认样式" :disabled="busy" @click="perform(()=>page.resetStyle())"><svg><use href="#wr-reset"/></svg></button>
    </div>
    <div v-if="error" class="error-message" role="alert">{{error}}<button aria-label="关闭提示" @click="error=''">×</button></div>
    <webview v-if="initialized" ref="wv" class="reading-webview" allowpopups :src="initialAddress" useragent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0" @dom-ready="domReady" @did-start-navigation="navigationStarted" @did-navigate-in-page="inPageNavigation" @did-fail-load="loadFailed"></webview>
    <div v-if="dialog" class="dialog-overlay" @click.self="dialog=''">
      <section ref="dialogElement" class="reading-dialog" role="dialog" aria-modal="true" :aria-labelledby="`wr-dialog-${dialog}`">
        <header><h2 :id="`wr-dialog-${dialog}`">{{dialogTitle}}</h2><button class="dialog-close" autofocus @click="dialog=''">关闭</button></header>
        <div class="dialog-body">
          <label v-if="dialog==='opacity'" class="settings-row"><span>透明度</span><input data-setting="opacity" type="range" min="0.1" max="1" step="0.01" :value="nativeState.opacity" aria-label="窗口透明度" @input="setOpacity($event.target.value)"/><output>{{Number(nativeState.opacity).toFixed(2).replace(/0+$/,'').replace(/\.$/,'')}}</output></label>
          <template v-if="dialog==='style'">
            <label class="settings-row"><span>背景颜色</span><input type="color" data-setting="background" :value="pageState.backgroundColor||'#ffffff'" @input="perform(()=>page.setStyle('backgroundColor',$event.target.value))"/></label>
            <label class="settings-row"><span>字体颜色</span><input type="color" data-setting="font-color" :value="pageState.fontColor||'#000000'" @input="perform(()=>page.setStyle('fontColor',$event.target.value))"/></label>
            <label class="settings-row"><span>字体大小</span><input type="range" data-setting="zoom" min="0.6" max="1" step="0.05" :value="pageState.zoom" @input="perform(()=>page.setZoom($event.target.value))"/><output>{{Math.round(pageState.zoom*100)}}%</output></label>
          </template>
          <template v-if="dialog==='scroll'">
            <label class="settings-row"><input type="checkbox" data-setting="auto-scroll" :checked="pageState.autoScrollEnabled" @change="perform(()=>page.setAutoScroll($event.target.checked))"/><span>开启自动滚动</span></label>
            <label class="settings-row"><span>滚动速度</span><input type="range" data-setting="speed" min="1" max="10" step="1" :value="pageState.speed" @input="perform(()=>page.setSpeed($event.target.value))"/><output>{{pageState.speed}}</output></label>
            <p class="hint">快捷键：{{shortcutLabels.stopOrContinue||'未设置'}}。隐藏窗口时暂停，恢复后继续。</p>
          </template>
          <div v-if="dialog==='help'" class="help-content"><p>眼睛隐藏操作栏；白色眼睛恢复。空白处可以拖动窗口。</p><p>网页透明移除阅读背景；水滴调节整个窗口透明度。</p><p>“控”只在阅读页面可用，调出阅读网站自己的目录、字体等按钮；再次点击收起。</p><p>建议使用网站的浅色阅读模式。鼠标移出或老板键隐藏时暂停自动滚动。</p></div>
        </div>
      </section>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, watch, nextTick, onMounted, onUnmounted } from 'vue'
import { useRoute } from 'vue-router'
import { createReadingState, createReadingController } from '../features/reading-sites/controller.mjs'
import { READING_PLATFORMS, isReadingSiteURL } from '../features/reading-sites/platforms.mjs'
const platform=READING_PLATFORMS[useRoute().meta.site], READING_HOME=platform.home

const wv=ref(null), showBar=ref(true), showMore=ref(false), dialog=ref(''), error=ref('')
const initialized=ref(false), initialAddress=ref(READING_HOME), pending=ref(0)
const busy=computed(()=>pending.value>0)
const nativeState=reactive({opacity:1,alwaysOnTop:false,autoHideEnabled:false,hidden:false})
const pageState=reactive(createReadingState(platform)), shortcutLabels=reactive({})
const control=window.windowControl, subscriptions=[]
const page=createReadingController({platform,state:pageState,getWebview:()=>wv.value,settings:window.settingApi})
let unmounted=false
const dialogElement=ref(null)
let previousFocus=null
watch(dialog,async(value,old)=>{
  if(value&&!old)previousFocus=document.activeElement
  await nextTick()
  if(unmounted)return
  if(value)dialogElement.value?.querySelector('button,input')?.focus()
  else if(previousFocus?.isConnected)previousFocus.focus()
})
const dialogTitle=computed(()=>({
  opacity:`窗口透明度（快捷键：${shortcutLabels.opacityUp||'未设置'} 增加，${shortcutLabels.opacityDown||'未设置'} 减少）`,
  style:'样式设置',scroll:'自动滚动设置',help:platform.name+'使用说明'
}[dialog.value]||''))
async function perform(operation,{silent=false}={}) {
  if(unmounted)return
  if(!silent)error.value=''
  pending.value++
  try { const result=await operation(); if(result?.key)receiveState(result); return result }
  catch(failure){if(!unmounted)error.value=failure.message||String(failure)}
  finally{pending.value--}
}
function receiveState(state) {
  const hiddenChanged=pageState.hidden!==!!state.hidden
  Object.assign(nativeState,state)
  if(hiddenChanged)perform(()=>page.setHidden(!!state.hidden),{silent:true})
}
let opacityQueue=Promise.resolve()
function setOpacity(value){opacityQueue=opacityQueue.then(()=>perform(()=>control.setOpacity(Number(value))));return opacityQueue}
function domReady(){return perform(()=>page.domReady())}
function navigationStarted(event){if(event.isMainFrame!==false&&!event.isInPlace)page.navigationStarted()}
function inPageNavigation(){return perform(()=>page.domReady({newDocument:false}))}
function goHome(){showMore.value=false;return perform(()=>{if(!wv.value)throw new Error('网页尚未准备好');return wv.value.loadURL(READING_HOME)})}
function loadFailed(event){if(event.errorCode!==-3&&event.isMainFrame!==false)error.value=`阅读网站页面加载失败：${event.errorDescription||event.errorCode}。请检查网络后重新打开。`}
function keydown(event){
  if(event.key==='Escape'){dialog.value?dialog.value='':showMore.value=false;return}
  if(dialog.value&&event.key==='Tab'){
    const nodes=Array.from(dialogElement.value?.querySelectorAll('button:not(:disabled),input:not(:disabled),[tabindex="0"]')||[])
    if(!nodes.length)return
    const first=nodes[0],last=nodes[nodes.length-1]
    if(event.shiftKey&&(document.activeElement===first||!dialogElement.value.contains(document.activeElement))){event.preventDefault();last.focus()}
    else if(!event.shiftKey&&(document.activeElement===last||!dialogElement.value.contains(document.activeElement))){event.preventDefault();first.focus()}
  }
}
onMounted(async()=>{
  window.addEventListener('keydown',keydown)
  if(!control||!window.settingApi||!window.ipcRenderer){error.value='阅读网站控制桥不可用，请通过 Electron 启动';return}
  subscriptions.push(control.onState(receiveState),control.onError(message=>{error.value=message}),
    window.ipcRenderer.on('stop-or-continue',()=>perform(()=>page.setAutoScroll(!pageState.autoScrollEnabled))))
  await perform(async()=>{
    await page.load()
    const legacy=localStorage.getItem('moyu:lastUrl:'+platform.key)
    initialAddress.value=pageState.lastAddress===READING_HOME&&isReadingSiteURL(platform,legacy)?legacy:pageState.lastAddress
    const shortcuts=await window.ipcRenderer.invoke('get-shortcuts'); Object.assign(shortcutLabels,shortcuts)
    receiveState(await control.getState())
  })
  if(!unmounted)initialized.value=true
})
onUnmounted(()=>{
  unmounted=true;window.removeEventListener('keydown',keydown)
  for(const unsubscribe of subscriptions)unsubscribe()
  page.dispose().catch(failure=>console.error('阅读网站资源清理失败',failure))
})
</script>

<style scoped>
.weread-window{height:100%;display:flex;flex-direction:column;background:transparent;color:#fff;position:relative;overflow:hidden}
.icon-definitions{position:absolute;width:0;height:0;overflow:hidden}
.toolbar{width:100%;height:30px;flex:none;display:flex;align-items:center;gap:8px;padding:0 10px;background:#1a202c;border-bottom:1px solid #4a5568;box-sizing:border-box;user-select:none}
.toolbar-hidden{background:transparent;border-bottom-color:rgba(255,255,255,.1)}
.icon-button,.more-button{padding:0;border:0;background:transparent;color:#fff;cursor:pointer;-webkit-app-region:no-drag;flex:none}
.icon-button{height:22px;width:20px;display:inline-flex;align-items:center;justify-content:center}
.icon-button svg{width:16px;height:16px;fill:none;stroke:currentColor;stroke-width:1.6;stroke-linecap:round;stroke-linejoin:round}
.icon-button:hover,.more-button:hover{color:#cbd5e0}
.icon-button.active{color:#60a5fa}
.icon-button:disabled{opacity:.45;cursor:default}
.reader-control{font-size:13px;font-weight:600}
.more-button{font-size:13px;white-space:nowrap;padding:4px 0}
.drag-space{height:100%;flex:1;min-width:8px;-webkit-app-region:drag}
.recovery-eye{color:white}
.more-panel{position:absolute;right:0;top:30px;z-index:20;background:#1a202c;display:flex;gap:8px;padding:5px 10px;border:1px solid #4a5568}
.reading-webview{width:100%;flex:1;min-height:0;background:transparent}
.error-message{position:absolute;top:34px;left:8px;right:8px;z-index:30;font-size:12px;line-height:1.5;background:#7f1d1d;color:#fff;padding:8px 25px 8px 8px;border-radius:4px;overflow-wrap:anywhere;-webkit-app-region:no-drag}
.error-message button{position:absolute;right:5px;top:5px;color:white;background:none;border:0;cursor:pointer}
.dialog-overlay{position:fixed;inset:0;background:rgba(0,0,0,.35);z-index:40;display:flex;align-items:flex-start;justify-content:flex-end;padding:44px 12px 12px;overflow:auto}
.reading-dialog{width:360px;max-width:100%;background:#2d3748;border:1px solid #4a5568;border-radius:10px;box-shadow:0 18px 50px rgba(0,0,0,.45);overflow:hidden;-webkit-app-region:no-drag}
.reading-dialog header{display:flex;gap:8px;align-items:center;justify-content:space-between;padding:10px 12px;border-bottom:1px solid #4a5568}
.reading-dialog h2{margin:0;font-size:13px;font-weight:600;line-height:1.3;min-width:0}
.dialog-close{border:1px solid rgba(255,255,255,.18);border-radius:8px;background:rgba(255,255,255,.08);color:#fff;font-size:12px;padding:6px 10px;cursor:pointer;flex:none}
.dialog-body{padding:12px;font-size:13px}
.settings-row{display:flex;align-items:center;gap:10px;margin:0 0 14px;min-width:0}
.settings-row:last-child{margin-bottom:0}
.settings-row span{flex:none}
.settings-row input[type=range]{flex:1;min-width:0;padding:0;accent-color:#fff;cursor:pointer}
.settings-row input[type=color]{width:42px;height:28px;padding:2px;cursor:pointer}
.settings-row input[type=checkbox]{margin:0;padding:0;accent-color:#60a5fa}
.settings-row output{min-width:34px;text-align:right;flex:none}
.hint,.help-content{font-size:12px;line-height:1.6;color:#cbd5e0}
.help-content p{margin:0 0 10px}
button:focus-visible,input:focus-visible{outline:2px solid #60a5fa;outline-offset:2px}
</style>
