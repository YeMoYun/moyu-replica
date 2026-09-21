<template>
  <div class="douyin-window">
    <svg class="icon-definitions" aria-hidden="true"><defs>
      <symbol id="dy-eye" viewBox="0 0 24 24"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></symbol>
      <symbol id="dy-pin" viewBox="0 0 24 24"><path d="m14 3 7 7-3 1-4 5-2-2-7 7-2-2 7-7-2-2 5-4Z"/></symbol>
      <symbol id="dy-close" viewBox="0 0 24 24"><path d="m6 6 12 12m0-12L6 18"/></symbol>
      <symbol id="dy-reload" viewBox="0 0 24 24"><path d="M4 10a8 8 0 1 1 1 7M4 4v6h6"/></symbol>
      <symbol id="dy-help" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M9 8a3 3 0 0 1 6 1c0 2-3 2-3 4m0 3h.01"/></symbol>
      <symbol id="dy-zoom" viewBox="0 0 24 24"><path d="M9 3H3v6m12-6h6v6M3 15v6h6m12-6v6h-6"/></symbol>
      <symbol id="dy-drop" viewBox="0 0 24 24"><path d="M12 3c-3 5-7 8-7 12a7 7 0 0 0 14 0c0-4-4-7-7-12Z"/></symbol>
      <symbol id="dy-auto-hide" viewBox="0 0 24 24"><path d="M10 3H3v18h18v-7M13 3l8 6-5 1-2 5Z"/></symbol>
    </defs></svg>
    <div class="toolbar" :class="{'toolbar-hidden':!showBar}">
      <template v-if="showBar">
        <button class="icon-button" data-action="hide-bar" title="隐藏操作栏" aria-label="隐藏操作栏" @click="showBar=false"><svg><use href="#dy-eye"/></svg></button>
        <button class="icon-button" :class="{active:nativeState.alwaysOnTop}" data-action="topmost" title="置顶/取消置顶" aria-label="置顶/取消置顶" :aria-pressed="nativeState.alwaysOnTop" :disabled="nativeBusy" @click="nativeOperation(()=>control.setAlwaysOnTop(!nativeState.alwaysOnTop))"><svg><use href="#dy-pin"/></svg></button>
        <button class="icon-button" data-action="close" title="关闭网页" aria-label="关闭网页" @click="perform(()=>control.close())"><svg><use href="#dy-close"/></svg></button>
        <button class="icon-button" data-action="reload" title="刷新" aria-label="刷新" :disabled="!initialized" @click="reload"><svg><use href="#dy-reload"/></svg></button>
        <button class="icon-button" data-action="help" title="帮助" aria-label="帮助" @click="openDialog('help')"><svg><use href="#dy-help"/></svg></button>
        <div class="drag-space"></div>
        <button class="icon-button zoom-icon" data-action="zoom" title="网页缩放" aria-label="网页缩放" :disabled="!pageState.ready||busy" @click="openDialog('zoom')"><svg><use href="#dy-zoom"/></svg></button>
        <button class="icon-button" data-action="opacity" title="窗口透明度" aria-label="窗口透明度" @click="openDialog('opacity')"><svg><use href="#dy-drop"/></svg></button>
        <button class="icon-button" :class="{active:nativeState.autoHideEnabled}" data-action="auto-hide" :title="nativeState.autoHideEnabled?'鼠标移出隐藏：已开启':'鼠标移出隐藏：已关闭'" aria-label="鼠标移出隐藏" :aria-pressed="nativeState.autoHideEnabled" :disabled="nativeBusy" @click="nativeOperation(()=>control.setAutoHide(!nativeState.autoHideEnabled))"><svg><use href="#dy-auto-hide"/></svg></button>
      </template>
      <template v-else><button class="icon-button recovery-eye" data-action="show-bar" title="显示操作栏" aria-label="显示操作栏" @click="showBar=true"><svg><use href="#dy-eye"/></svg></button><div class="drag-space"></div></template>
    </div>
    <div v-if="error" class="error-message" role="alert">{{error}}<button title="关闭提示" aria-label="关闭提示" @click="error=''">×</button></div>
    <webview v-if="initialized" ref="wv" :src="DOUYIN_HOME" class="douyin-webview" :allowpopups="false" @dom-ready="domReady" @did-start-navigation="navigationStarted" @did-navigate-in-page="inPageNavigation" @did-fail-load="loadFailed"/>
    <div v-if="dialog" class="dialog-overlay" @click.self="closeDialog">
      <section class="douyin-dialog" role="dialog" aria-modal="true" :aria-label="dialogTitle" tabindex="-1" ref="dialogElement">
        <header><h2>{{dialogTitle}}</h2><button class="dialog-close" aria-label="关闭弹窗" @click="closeDialog">关闭</button></header>
        <div class="dialog-body">
          <template v-if="dialog==='zoom'">
            <label class="settings-row"><span>网页缩放</span><input data-setting="zoom" aria-label="网页缩放" type="range" min="0.2" max="1" step="0.01" :value="pageState.zoom" @input="perform(()=>page.setZoom(Number($event.target.value)))"/><output>{{Math.round(pageState.zoom*100)}}%</output></label>
            <div class="zoom-presets"><button v-for="value in [.2,.4,.75,1]" :key="value" :data-zoom="value" :disabled="busy" :aria-pressed="pageState.zoom===value&&!pageState.autoFit" @click="perform(()=>page.setZoom(value))">{{Math.round(value*100)}}%</button></div>
            <button class="auto-fit" data-action="auto-fit" :disabled="busy" @click="perform(()=>page.restoreAutoFit())">恢复自动适配</button>
            <p class="hint">{{pageState.autoFit?'自动适配已开启，随窗口大小调整。':'当前为手动缩放，刷新或重新打开会保留。'}}</p>
          </template>
          <label v-else-if="dialog==='opacity'" class="settings-row"><span>窗口透明度</span><input data-setting="opacity" aria-label="窗口透明度" type="range" min="0.1" max="1" step="0.01" :value="nativeState.opacity" @input="setOpacity(Number($event.target.value))"/><output>{{Math.round(nativeState.opacity*100)}}%</output></label>
          <div v-else class="help-content"><p>眼睛隐藏/恢复操作栏，图钉置顶；中间空白区域可拖动窗口。</p><p>蓝色四角图标调节网页比例，水滴调节整个窗口透明度，最右侧开启鼠标移出隐藏。</p><p>默认自动适配窗口；手动缩放后可点击“恢复自动适配”。网页内部仍可滚轮切换内容。</p><dl class="shortcut-list"><template v-for="[key,label] in [['boss','老板键'],['allPrev','上一条'],['allNext','下一条'],['allScreen','网页全屏'],['stopOrContinue','播放/暂停'],['opacityUp','透明度增加'],['opacityDown','透明度减少']]" :key="key"><dt>{{label}}</dt><dd>{{shortcutLabels[key]||'未启用'}}</dd></template></dl><p>以上为配置值，若系统拒绝注册，首页会显示错误，可在“快捷键设置”中修改。网页全屏不会改变窗口置顶。登录及视频内容由抖音提供。</p></div>
        </div>
      </section>
    </div>
  </div>
</template>
<script setup>
import { ref, reactive, computed, onMounted, onUnmounted, nextTick } from 'vue'
import { createDouyinState, createDouyinController, DOUYIN_HOME } from '../features/douyin/controller.mjs'
const wv=ref(null),showBar=ref(true),dialog=ref(''),dialogElement=ref(null),error=ref(''),initialized=ref(false),pending=ref(0),nativeBusy=ref(false)
const busy=computed(()=>pending.value>0),pageState=reactive(createDouyinState())
const nativeState=reactive({opacity:1,alwaysOnTop:false,autoHideEnabled:false,hidden:false})
const shortcutLabels=reactive({})
const control=window.windowControl,events=window.douyinOpacityControl,subscriptions=[]
const page=createDouyinController({state:pageState,getWebview:()=>wv.value,settings:window.settingApi})
const dialogTitle=computed(()=>({zoom:'网页缩放',opacity:'窗口透明度',help:'抖音透明度模式使用说明'}[dialog.value]||''))
let disposed=false,observer=null,resizeTimer=null,layoutFrame=null,dialogTrigger=null,nativePending=0,nativeTail=Promise.resolve()
async function perform(operation,{silent=false}={}){
  if(disposed)return
  if(!silent)error.value=''
  pending.value++
  try{const result=await operation();if(!disposed&&result?.key)receiveState(result);return result}
  catch(failure){if(!disposed)error.value=failure.message||String(failure)}
  finally{pending.value--}
}
function nativeOperation(operation){
  nativePending++;nativeBusy.value=true
  const result=nativeTail.then(()=>perform(operation)).finally(()=>{nativePending--;nativeBusy.value=nativePending>0})
  nativeTail=result.catch(()=>{})
  return result
}
function setOpacity(value){return nativeOperation(()=>control.setOpacity(value))}
function receiveState(state){const changed=pageState.hidden!==!!state.hidden;Object.assign(nativeState,state);if(changed)perform(()=>page.setHidden(!!state.hidden),{silent:true})}
function scheduleFit(){clearTimeout(resizeTimer);resizeTimer=setTimeout(()=>perform(()=>page.resize(),{silent:true}),100)}
function domReady(){
  cancelAnimationFrame(layoutFrame)
  layoutFrame=requestAnimationFrame(async()=>{
    layoutFrame=null;await perform(()=>page.domReady())
    if(disposed)return
    if(!observer&&wv.value){observer=new ResizeObserver(scheduleFit);observer.observe(wv.value)}
  })
}
function navigationStarted(event){if(event.isMainFrame!==false&&!event.isInPlace)page.navigationStarted()}
function inPageNavigation(){if(pageState.ready)perform(()=>page.domReady(),{silent:true})}
function loadFailed(event){if(event.errorCode!==-3&&event.isMainFrame!==false)error.value=`抖音页面加载失败：${event.errorDescription||event.errorCode}。请检查网络后刷新。`}
function reload(){perform(()=>{if(!wv.value)throw Error('抖音网页尚未准备好');wv.value.reload()})}
async function openDialog(name){dialogTrigger=document.activeElement;dialog.value=name;await nextTick();dialogElement.value?.focus();if(name==='help')await perform(async()=>Object.assign(shortcutLabels,await window.settingApi.getSetting('shortcuts')||{}),{silent:true})}
function closeDialog(){dialog.value='';dialogTrigger?.focus()}
function keydown(event){if(!dialog.value)return;if(event.key==='Escape'){event.preventDefault();closeDialog()}else if(event.key==='Tab'){const nodes=[...dialogElement.value.querySelectorAll('button:not(:disabled),input:not(:disabled)')];if(!nodes.length)return;const first=nodes[0],last=nodes.at(-1);if(event.shiftKey&&(document.activeElement===first||document.activeElement===dialogElement.value)){event.preventDefault();last.focus()}else if(!event.shiftKey&&(document.activeElement===last||document.activeElement===dialogElement.value)){event.preventDefault();first.focus()}}}
onMounted(async()=>{
  window.addEventListener('keydown',keydown)
  if(!control||!events||!window.settingApi){error.value='抖音控制桥不可用，请通过 Electron 启动';return}
  subscriptions.push(control.onState(receiveState),control.onError(message=>{error.value=message}),events.onPrev(()=>perform(()=>page.navigate('prev'))),events.onNext(()=>perform(()=>page.navigate('next'))),events.onAllScreen(()=>perform(()=>page.fullscreen())),events.onStopOrContinue(()=>perform(()=>page.playback())),events.onOpacityUp(()=>nativeOperation(()=>control.setOpacity(Math.min(1,nativeState.opacity+.1)))),events.onOpacityDown(()=>nativeOperation(()=>control.setOpacity(Math.max(.1,nativeState.opacity-.1)))),events.onBoss(()=>perform(async()=>receiveState(await control.getState()),{silent:true})))
  await perform(async()=>{await page.load();receiveState(await control.getState())})
  if(!disposed)initialized.value=true
})
onUnmounted(()=>{disposed=true;clearTimeout(resizeTimer);cancelAnimationFrame(layoutFrame);observer?.disconnect();window.removeEventListener('keydown',keydown);subscriptions.forEach(unsubscribe=>unsubscribe());page.dispose().catch(failure=>console.error('抖音页面清理失败',failure))})
</script>
<style scoped>
.douyin-window{height:100%;display:flex;flex-direction:column;background:transparent;color:#fff;position:relative;overflow:hidden}
.icon-definitions{position:absolute;width:0;height:0;overflow:hidden}
.toolbar{height:34px;flex:none;display:flex;align-items:center;gap:8px;padding:0 10px;background:#1a202c;border-bottom:1px solid #4a5568;box-sizing:border-box;user-select:none}
.toolbar-hidden{background:transparent;border-bottom-color:transparent}
.icon-button{width:20px;height:24px;border:0;padding:0;background:none;color:#fff;display:inline-flex;align-items:center;justify-content:center;flex:none;cursor:pointer;-webkit-app-region:no-drag}
.icon-button svg{width:16px;height:16px;fill:none;stroke:currentColor;stroke-width:1.6;stroke-linecap:round;stroke-linejoin:round}
.icon-button:hover,.recovery-eye:hover{color:#ef4444}.icon-button.active,.zoom-icon{color:#60a5fa}.icon-button:disabled{opacity:.4;cursor:default}
.drag-space{height:100%;flex:1;min-width:0;-webkit-app-region:drag}.recovery-eye{color:white}
.douyin-webview{width:100%;flex:1;min-height:0;min-width:0;background:transparent}
.error-message{position:absolute;top:38px;left:8px;right:8px;z-index:30;background:#7f1d1d;color:#fff;padding:8px 26px 8px 8px;border-radius:4px;font-size:12px;line-height:1.5;overflow-wrap:anywhere}
.error-message button{position:absolute;right:5px;top:5px;border:0;background:none;color:white;cursor:pointer}
.dialog-overlay{position:fixed;inset:0;z-index:40;display:flex;align-items:flex-start;justify-content:flex-end;background:rgba(0,0,0,.3);padding:44px 12px 12px;overflow:auto;box-sizing:border-box}
.douyin-dialog{width:360px;max-width:100%;background:#2d3748;border:1px solid #4a5568;border-radius:10px;box-shadow:0 18px 50px rgba(0,0,0,.45);overflow:hidden;-webkit-app-region:no-drag}
.douyin-dialog:focus{outline:none}
.douyin-dialog header{display:flex;align-items:center;justify-content:space-between;padding:10px 12px;border-bottom:1px solid #4a5568}.douyin-dialog h2{margin:0;font-size:13px;font-weight:600}
.dialog-body{padding:12px;font-size:13px}.dialog-close,.zoom-presets button,.auto-fit{color:#fff;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.18);border-radius:6px;padding:6px 10px;font-size:12px;cursor:pointer}
.settings-row{display:flex;align-items:center;gap:10px}.settings-row span{flex:none}.settings-row input{flex:1;min-width:0;padding:0;accent-color:#fff;cursor:pointer}.settings-row output{min-width:36px;text-align:right}
.zoom-presets{display:flex;gap:8px;margin:16px 0 12px}.zoom-presets button{flex:1}.zoom-presets button[aria-pressed=true]{border-color:#60a5fa;color:#60a5fa}
.hint,.help-content{font-size:12px;line-height:1.6;color:#cbd5e0}.help-content p{margin:0 0 10px}.hint{margin:12px 0 0}
.shortcut-list{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin:14px 0}.shortcut-list dd{margin:0;text-align:right;color:#fff}
button:disabled{opacity:.45;cursor:default}button:focus-visible,input:focus-visible{outline:2px solid #60a5fa;outline-offset:2px}
</style>
