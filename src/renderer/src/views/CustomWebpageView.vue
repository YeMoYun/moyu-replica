<template>
  <div class="custom-window">
    <svg class="icon-definitions" aria-hidden="true"><defs>
      <symbol id="cp-eye" viewBox="0 0 24 24"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></symbol>
      <symbol id="cp-pin" viewBox="0 0 24 24"><path d="m14 3 7 7-3 1-4 5-2-2-7 7-2-2 7-7-2-2 5-4Z"/></symbol>
      <symbol id="cp-close" viewBox="0 0 24 24"><path d="m6 6 12 12m0-12L6 18"/></symbol>
      <symbol id="cp-reload" viewBox="0 0 24 24"><path d="M4 10a8 8 0 1 1 1 7M4 4v6h6"/></symbol>
      <symbol id="cp-help" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M9 8a3 3 0 0 1 6 1c0 2-3 2-3 4m0 3h.01"/></symbol>
      <symbol id="cp-zoom" viewBox="0 0 24 24"><path d="M9 3H3v6m12-6h6v6M3 15v6h6m12-6v6h-6"/></symbol>
      <symbol id="cp-style" viewBox="0 0 24 24"><path d="m3 20 6-16h3l6 16M6 14h9m5-9v14"/></symbol>
      <symbol id="cp-scrollbar" viewBox="0 0 24 24"><path d="M4 4h16v16H4z"/><path d="M15 7v10"/></symbol>
      <symbol id="cp-transparent" viewBox="0 0 24 24"><path d="M3 3h18v18H3Zm4 14 5-10 5 10m-8-4h6M3 8h4m10 8h4"/></symbol>
      <symbol id="cp-drop" viewBox="0 0 24 24"><path d="M12 3c-3 5-7 8-7 12a7 7 0 0 0 14 0c0-4-4-7-7-12Z"/></symbol>
      <symbol id="cp-auto-hide" viewBox="0 0 24 24"><path d="M10 3H3v18h18v-7M13 3l8 6-5 1-2 5Z"/></symbol>
    </defs></svg>
    <div class="toolbar" :class="{'toolbar-hidden':!showBar}">
      <template v-if="showBar">
        <button class="icon-button" data-action="hide-bar" title="隐藏操作栏" aria-label="隐藏操作栏" @click="showBar=false"><svg><use href="#cp-eye"/></svg></button>
        <button class="icon-button" :class="{active:nativeState.alwaysOnTop}" data-action="topmost" title="置顶/取消置顶" aria-label="置顶/取消置顶" :aria-pressed="nativeState.alwaysOnTop" :disabled="nativeBusy" @click="nativeOperation(()=>control.setAlwaysOnTop(!nativeState.alwaysOnTop))"><svg><use href="#cp-pin"/></svg></button>
        <button class="icon-button" data-action="close" title="关闭网页" aria-label="关闭网页" @click="perform(()=>control.close())"><svg><use href="#cp-close"/></svg></button>
        <button class="icon-button" data-action="reload" title="刷新" aria-label="刷新" @click="reload"><svg><use href="#cp-reload"/></svg></button>
        <button class="icon-button" data-action="help" title="帮助" aria-label="帮助" @click="openDialog('help')"><svg><use href="#cp-help"/></svg></button>
        <input v-model="address" class="addr" placeholder="输入网址，回车前往" aria-label="网址" @keydown.enter="nav" />
        <div class="drag-space"></div>
        <button class="icon-button zoom-icon" data-action="zoom" title="网页缩放" aria-label="网页缩放" @click="openDialog('zoom')"><svg><use href="#cp-zoom"/></svg></button>
        <button class="icon-button" :class="{active:scrollbarHidden}" data-action="scrollbar" :title="scrollbarHidden?'滚动条：已隐藏（点击显示）':'滚动条：已显示（点击隐藏）'" aria-label="显示或隐藏滚动条" :aria-pressed="scrollbarHidden" @click="setScrollbar(!scrollbarHidden)"><svg><use href="#cp-scrollbar"/></svg></button>
        <button class="icon-button" data-action="style" title="文字与背景颜色" aria-label="文字与背景颜色" @click="openDialog('style')"><svg><use href="#cp-style"/></svg></button>
        <button class="icon-button" :class="{active:pageTransparent}" data-action="web-transparent" :title="pageTransparent?'网页透明：已开启（点击恢复不透明）':'网页透明：去掉网页背景'" aria-label="设置网页透明" :aria-pressed="pageTransparent" @click="toggleTransparent()"><svg><use href="#cp-transparent"/></svg></button>
        <button class="icon-button" data-action="opacity" title="窗口透明度" aria-label="窗口透明度" @click="openDialog('opacity')"><svg><use href="#cp-drop"/></svg></button>
        <button class="icon-button" :class="{active:nativeState.autoHideEnabled}" data-action="auto-hide" :title="nativeState.autoHideEnabled?'鼠标移出隐藏：已开启':'鼠标移出隐藏：已关闭'" aria-label="鼠标移出隐藏" :aria-pressed="nativeState.autoHideEnabled" :disabled="nativeBusy" @click="nativeOperation(()=>control.setAutoHide(!nativeState.autoHideEnabled))"><svg><use href="#cp-auto-hide"/></svg></button>
      </template>
      <template v-else><button class="icon-button recovery-eye" data-action="show-bar" title="显示操作栏" aria-label="显示操作栏" @click="showBar=true"><svg><use href="#cp-eye"/></svg></button><div class="drag-grip" title="拖动窗口"></div><div class="drag-space"></div></template>
    </div>
    <div v-if="error" class="error-message" role="alert">{{error}}<button title="关闭提示" aria-label="关闭提示" @click="error=''">×</button></div>
    <webview ref="wv" :src="initialAddress" class="page-webview" @dom-ready="domReady" @did-navigate="didNavigate" @did-fail-load="loadFailed"></webview>
    <div v-if="dialog" class="dialog-overlay" @click.self="closeDialog">
      <section class="custom-dialog" role="dialog" aria-modal="true" :aria-label="dialogTitle" tabindex="-1" ref="dialogElement">
        <header><h2>{{dialogTitle}}</h2><button class="dialog-close" aria-label="关闭弹窗" @click="closeDialog">关闭</button></header>
        <div class="dialog-body">
          <template v-if="dialog==='zoom'">
            <label class="settings-row"><span>网页缩放</span><input data-setting="zoom" aria-label="网页缩放" type="range" min="0.2" max="1" step="0.01" :value="zoom" @input="setZoom(Number($event.target.value))"/><output>{{Math.round(zoom*100)}}%</output></label>
            <div class="zoom-presets"><button v-for="value in [.2,.4,.75,1]" :key="value" :data-zoom="value" @click="setZoom(value)">{{Math.round(value*100)}}%</button></div>
            <p class="hint">缩放立即生效并记忆，重新打开后保持。</p>
          </template>
          <template v-else-if="dialog==='style'">
            <label class="settings-row"><span>文字颜色</span><input data-setting="font-color" aria-label="文字颜色" type="color" :value="fontColor" @input="setFontColor($event.target.value)"/></label>
            <label class="settings-row"><span>背景颜色</span><input data-setting="background" aria-label="背景颜色" type="color" :value="bg" @input="setBgColor($event.target.value)"/></label>
            <button class="auto-fit" data-action="reset-style" :disabled="busy" @click="resetStyle">恢复默认外观</button>
            <p class="hint">颜色立即应用到当前网页并记忆；换页后自动重新应用。开启网页透明时背景强制透明，仅保留文字颜色。</p>
          </template>
          <label v-else-if="dialog==='opacity'" class="settings-row"><span>窗口透明度</span><input data-setting="opacity" aria-label="窗口透明度" type="range" min="0.1" max="1" step="0.01" :value="nativeState.opacity" @input="setOpacity(Number($event.target.value))"/><output>{{Math.round(nativeState.opacity*100)}}%</output></label>
          <div v-else class="help-content">
            <p>地址栏输入网址回车前往；眼睛隐藏/恢复操作栏，图钉置顶，中间空白区域可拖动窗口。</p>
            <p>蓝色四角图标调节网页比例，画板图标改写网页文字与背景颜色，竖条图标显示或隐藏滚动条，方框图标开启网页透明（去掉网页背景，桌面从文字后透出），水滴调节窗口透明度，最右侧开启鼠标移出隐藏。</p>
            <dl class="shortcut-list"><template v-for="[key,label] in [['boss','老板键'],['opacityUp','透明度增加'],['opacityDown','透明度减少']]" :key="key"><dt>{{label}}</dt><dd>{{shortcutLabels[key]||'未启用'}}</dd></template></dl>
            <p>以上为配置值，若系统拒绝注册，首页会显示错误，可在“快捷键设置”中修改。</p>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>
<script setup>
import { ref, reactive, computed, onMounted, onUnmounted, nextTick } from 'vue'

// 与视频透明覆盖窗共用同一套窗口控件（图标工具栏 + 弹窗），区别仅在地址栏与样式改写。
const wv=ref(null),showBar=ref(true),dialog=ref(''),dialogElement=ref(null),error=ref(''),address=ref('')
const initialized=ref(false),pending=ref(0),nativeBusy=ref(false)
const busy=computed(()=>pending.value>0)
const zoom=ref(1),fontColor=ref('#ffffff'),bg=ref('#000000'),pageTransparent=ref(false),styleSaved=ref(false),scrollbarHidden=ref(true)
const nativeState=reactive({opacity:1,alwaysOnTop:false,autoHideEnabled:false,hidden:false})
const shortcutLabels=reactive({})
const control=window.windowControl,subscriptions=[]
const dialogTitle=computed(()=>({zoom:'网页缩放',style:'网页样式',opacity:'窗口透明度',help:'自定义网站使用说明'}[dialog.value]||''))
let disposed=false,dialogTrigger=null,nativePending=0
const initialAddress=(()=>{try{return localStorage.getItem('moyu:lastUrl:customWebpage')||'https://www.baidu.com/'}catch{return 'https://www.baidu.com/'}})()
address.value=initialAddress
async function perform(operation,{silent=false}={}){
  if(disposed)return
  if(!silent)error.value=''
  pending.value++
  try{const result=await operation();if(!disposed&&result?.key)Object.assign(nativeState,result);return result}
  catch(failure){if(!disposed)error.value=failure.message||String(failure)}
  finally{pending.value--}
}
function nativeOperation(operation){
  nativePending++;nativeBusy.value=true
  const result=perform(operation,{silent:true}).finally(()=>{nativePending--;nativeBusy.value=nativePending>0})
  return result
}
function setOpacity(value){return nativeOperation(()=>control.setOpacity(value))}
function receiveState(state){Object.assign(nativeState,state)}
function nav(){
  let u=address.value.trim()
  if(!u)return
  if(!/^https?:\/\//i.test(u))u='https://'+u
  address.value=u
  try{localStorage.setItem('moyu:lastUrl:customWebpage',u)}catch{}
  try{wv.value?.loadURL(u)}catch{}
}
function didNavigate(event){
  if(event.isMainFrame===false)return
  address.value=event.url
  try{localStorage.setItem('moyu:lastUrl:customWebpage',event.url)}catch{}
}
function loadFailed(event){if(event.errorCode!==-3&&event.isMainFrame!==false)error.value=`网页加载失败：${event.errorDescription||event.errorCode}。请检查网址与网络后重试。`}
function reload(){if(wv.value?.reload)wv.value.reload()}
function setZoom(value){
  zoom.value=Math.min(1,Math.max(.2,Number(value)||1))
  try{wv.value?.setZoomFactor(zoom.value)}catch{}
  try{window.settingApi?.setSetting('customWebpage.zoom',zoom.value)}catch{}
}
// 网页透明：去掉网页自身背景让桌面透出（与窗口透明度相互独立）；
// 用户改过样式后，透明时仅保留文字颜色，不透明时应用文字与背景。
// 隐藏滚动条默认开启。所有图层串行应用，避免取色器高频事件下的插入/移除竞态。
function pageCss(){
  const parts=[]
  if(scrollbarHidden.value)parts.push('::-webkit-scrollbar{display:none !important}')
  const color=styleSaved.value?`color:${fontColor.value} !important;`:''
  if(pageTransparent.value)parts.push(`html, body, *{background:transparent !important;background-image:none !important;${color}}`)
  else if(styleSaved.value)parts.push(`*, *::before, *::after{${color}background-color:${bg.value} !important;background-image:none !important}`)
  return parts.length?parts.join('\n'):null
}
// 幂等更新 guest 内固定 id 的 style 元素：无键值、无移除/重插竞态，
// 高频取色事件下最后一次写入即最终结果。
async function applyPageCss(){
  try{window.__cssLog=(window.__cssLog||[]).concat(['call wv='+!!wv.value])}catch{}
  if(!wv.value)return
  const css=pageCss()||''
  try{
    await wv.value.executeJavaScript(`(()=>{
      let el=document.getElementById('__moyu_custom_page_css__')
      if(!el){el=document.createElement('style');el.id='__moyu_custom_page_css__';document.documentElement.appendChild(el)}
      el.textContent=${JSON.stringify(css)}
    })()`,true)
    try{window.__cssLog=(window.__cssLog||[]).concat(['injected len='+css.length])}catch{}
  }catch(error){try{window.__cssLog=(window.__cssLog||[]).concat(['FAILED:'+((error&&error.message)||error)])}catch{}}
}
function schedulePageCss(){applyPageCss().catch(()=>{})}
function saveStyle(){try{localStorage.setItem('moyu:customPageStyle',JSON.stringify({fontColor:fontColor.value,bg:bg.value,transparent:pageTransparent.value,scrollbarHidden:scrollbarHidden.value}))}catch{}}
function setFontColor(value){if(!/^#[0-9a-fA-F]{6}$/.test(value||''))return;fontColor.value=value;styleSaved.value=true;saveStyle();schedulePageCss()}
function setBgColor(value){if(!/^#[0-9a-fA-F]{6}$/.test(value||''))return;bg.value=value;styleSaved.value=true;saveStyle();schedulePageCss()}
function setScrollbar(value){try{window.__cssLog=(window.__cssLog||[]).concat(['setScrollbar '+value])}catch{};scrollbarHidden.value=!!value;saveStyle();schedulePageCss()}
function toggleTransparent(){pageTransparent.value=!pageTransparent.value;saveStyle();schedulePageCss()}
async function resetStyle(){
  fontColor.value='#ffffff';bg.value='#000000';styleSaved.value=false
  saveStyle();schedulePageCss()
}
async function openDialog(name){
  dialogTrigger=document.activeElement;dialog.value=name
  await nextTick();dialogElement.value?.focus()
  if(name==='help')await perform(async()=>Object.assign(shortcutLabels,await window.settingApi?.getSetting('shortcuts')||{}),{silent:true})
}
function closeDialog(){dialog.value='';dialogTrigger?.focus()}
function keydown(event){
  if(!dialog.value)return
  if(event.key==='Escape'){event.preventDefault();closeDialog()}
  else if(event.key==='Tab'){
    const nodes=[...dialogElement.value?.querySelectorAll('button:not(:disabled),input:not(:disabled)')||[]]
    if(!nodes.length)return
    const first=nodes[0],last=nodes.at(-1)
    if(event.shiftKey&&(document.activeElement===first||document.activeElement===dialogElement.value)){event.preventDefault();last.focus()}
    else if(!event.shiftKey&&(document.activeElement===last||document.activeElement===dialogElement.value)){event.preventDefault();first.focus()}
  }
}
onMounted(async()=>{
  window.addEventListener('keydown',keydown)
  if(!control||!window.settingApi){error.value='控制桥不可用，请通过 Electron 启动';return}
  subscriptions.push(control.onState(receiveState),control.onError(message=>{error.value=message}))
  try{
    const saved=JSON.parse(localStorage.getItem('moyu:customPageStyle')||'null')
    if(saved){fontColor.value=saved.fontColor||fontColor.value;bg.value=saved.bg||bg.value;pageTransparent.value=!!saved.transparent;styleSaved.value=!!(saved.fontColor||saved.bg)}
    const savedZoom=await window.settingApi.getSetting('customWebpage.zoom')
    if(Number.isFinite(Number(savedZoom)))zoom.value=Math.min(1,Math.max(.2,Number(savedZoom)))
    Object.assign(nativeState,await control.getState())
  }catch{}
  if(!disposed)initialized.value=true
})
onUnmounted(()=>{disposed=true;window.removeEventListener('keydown',keydown);subscriptions.forEach(unsubscribe=>unsubscribe())})
function domReady(){
  try{wv.value?.setZoomFactor(zoom.value)}catch{}
  schedulePageCss()
}
</script>
<style scoped>
.custom-window{height:100%;display:flex;flex-direction:column;background:transparent;color:#fff;position:relative;overflow:hidden}
.icon-definitions{position:absolute;width:0;height:0;overflow:hidden}
.toolbar{height:34px;flex:none;display:flex;align-items:center;gap:8px;padding:0 10px;background:#1a202c;border-bottom:1px solid #4a5568;box-sizing:border-box;user-select:none;-webkit-app-region:drag}
.toolbar-hidden{background:transparent;border-bottom-color:transparent}
.icon-button{width:20px;height:24px;border:0;padding:0;background:none;color:#fff;display:inline-flex;align-items:center;justify-content:center;flex:none;cursor:pointer;-webkit-app-region:no-drag}
.icon-button svg{width:16px;height:16px;fill:none;stroke:currentColor;stroke-width:1.6;stroke-linecap:round;stroke-linejoin:round}
.icon-button:hover,.recovery-eye:hover{color:#ef4444}.icon-button.active,.zoom-icon{color:#60a5fa}.icon-button:disabled{opacity:.4;cursor:default}
.addr{flex:0 1 380px;min-width:120px;height:24px;border:1px solid #4a5568;border-radius:6px;background:rgba(255,255,255,.06);color:#fff;font-size:12px;padding:0 8px;box-sizing:border-box;-webkit-app-region:no-drag}
.addr:focus{outline:none;border-color:#60a5fa}
.drag-space{height:100%;flex:1;min-width:0;-webkit-app-region:drag}.drag-grip{width:14px;height:16px;flex:none;align-self:center;-webkit-app-region:drag;cursor:move;border-radius:3px;background-image:radial-gradient(circle,rgba(255,255,255,.45) 1px,transparent 1.3px);background-size:5px 5px;background-position:center;opacity:.7}.recovery-eye{color:white}
.page-webview{width:100%;flex:1;min-height:0;min-width:0;background:transparent}
.error-message{position:absolute;top:38px;left:8px;right:8px;z-index:30;background:#7f1d1d;color:#fff;padding:8px 26px 8px 8px;border-radius:4px;font-size:12px;line-height:1.5;overflow-wrap:anywhere}
.error-message button{position:absolute;right:5px;top:5px;border:0;background:none;color:white;cursor:pointer}
.dialog-overlay{position:fixed;inset:0;z-index:40;display:flex;align-items:flex-start;justify-content:flex-end;background:rgba(0,0,0,.3);padding:44px 12px 12px;overflow:auto;box-sizing:border-box}
.custom-dialog{width:360px;max-width:100%;background:#2d3748;border:1px solid #4a5568;border-radius:10px;box-shadow:0 18px 50px rgba(0,0,0,.45);overflow:hidden;-webkit-app-region:no-drag}
.custom-dialog:focus{outline:none}
.custom-dialog header{display:flex;align-items:center;justify-content:space-between;padding:10px 12px;border-bottom:1px solid #4a5568}.custom-dialog h2{margin:0;font-size:13px;font-weight:600}
.dialog-body{padding:12px;font-size:13px}.dialog-close,.zoom-presets button,.auto-fit{color:#fff;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.18);border-radius:6px;padding:6px 10px;font-size:12px;cursor:pointer}
.settings-row{display:flex;align-items:center;gap:10px;margin:0 0 12px}.settings-row span{flex:none}.settings-row input{flex:1;min-width:0;padding:0;accent-color:#fff;cursor:pointer}
.settings-row input[type=color]{width:42px;height:28px;padding:2px;flex:none}
.zoom-presets{display:flex;gap:8px;margin:16px 0 12px}.zoom-presets button{flex:1}
.hint,.help-content{font-size:12px;line-height:1.6;color:#cbd5e0}.help-content p{margin:0 0 10px}.hint{margin:12px 0 0}
.shortcut-list{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin:14px 0}.shortcut-list dd{margin:0;text-align:right;color:#fff}
button:disabled{opacity:.45;cursor:default}button:focus-visible,input:focus-visible{outline:2px solid #60a5fa;outline-offset:2px}
</style>
