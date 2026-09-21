<template>
  <div class="reading-ad" :style="{background:state.color}" :data-ready="state.ready&&!pending">
    <header class="ad-header">
      <button data-action="settings" title="打开设置与快捷键" @click="settingsShown=true">搜狗输入法</button>
      <span class="drag-space"></span>
      <button data-action="reader-controls" :class="{active:state.controlsShown}" :disabled="!state.ready||!!pending" title="显示/隐藏微信读书控制栏" @click="action('controls')">控</button>
      <button data-action="color" title="切换广告背景颜色" @click="cycleColor">↻</button>
      <button data-action="close" title="关闭广告窗口" @click="perform(()=>api.close())">关闭广告</button>
    </header>
    <button class="advertisement" data-action="ad-text" @click="settingsShown=true">{{state.text}}</button>
    <div v-if="error" class="error" role="alert">{{error}}<button data-action="reload" @click="perform(()=>wv?.reload())">重试</button></div>
    <main class="reading-area">
      <webview v-if="initialized" ref="wv" class="ad-webview" :src="initialAddress" @dom-ready="domReady" @did-start-navigation="navigation" @did-navigate-in-page="domReady" @did-fail-load="failed"></webview>
      <div v-if="native.covered" class="boss-cover" data-cover="reading"><strong>{{state.text}}</strong><span>学习提升，让未来更精彩</span></div>
    </main>
    <div v-if="settingsShown" class="settings-overlay" @click.self="settingsShown=false">
      <section class="settings-dialog" role="dialog" aria-modal="true" aria-labelledby="ad-settings-title">
        <header><h2 id="ad-settings-title">设置&amp;快捷键</h2><button data-action="close-settings" @click="settingsShown=false">关闭</button></header>
        <p class="shortcut"><kbd>{{shortcuts.boss||'Control+D'}}</kbd> 老板键（添加遮挡）</p>
        <label>字体大小 <input data-setting="zoom" type="range" min="0.6" max="1" step="0.05" :value="state.zoom" @input="update({zoom:Number($event.target.value)})"/><output>{{Math.round(state.zoom*100)}}%</output></label>
        <label class="check"><input data-setting="auto-scroll" type="checkbox" :checked="state.autoScroll" @change="update({autoScroll:$event.target.checked})"/>开启自动滚动（{{shortcuts.stopOrContinue||'Control+E'}}）</label>
        <label>滚动速度 <input data-setting="speed" type="range" min="1" max="10" step="1" :value="state.speed" @input="update({speed:Number($event.target.value)})"/><output>{{state.speed}}</output></label>
        <button class="setting-button" data-action="scrollbar" @click="update({scrollbarHidden:!state.scrollbarHidden})">{{state.scrollbarHidden?'显示滚动条':'隐藏滚动条'}}</button>
        <label>广告内容 <input class="text-input" data-setting="text" maxlength="120" :value="state.text" @change="update({text:$event.target.value})"/></label>
        <label>背景颜色 <input type="color" data-setting="color" :value="state.color" @input="update({color:$event.target.value})"/></label>
        <button class="setting-button" data-action="transparent" @click="toTransparent">切换透明度模式</button>
        <p class="hint">在微信读书中选择浅色、上下滚动阅读模式。遮挡时自动滚动暂停，恢复后继续。</p>
      </section>
    </div>
  </div>
</template>
<script setup>
import {ref} from 'vue'
import {useAdPage} from '../features/ad-modes/use-ad-page.mjs'
const {api,wv,initialized,initialAddress,error,pending,state,native,shortcuts,perform,domReady,navigation,failed,update,action,toTransparent}=useAdPage('weReadAd')
const settingsShown=ref(false),colors=['#fff4d1','#e2f3e8','#e6efff']
function cycleColor(){return update({color:colors[(colors.indexOf(state.color)+1)%colors.length]})}
</script>
<style scoped>
.reading-ad{height:100%;display:flex;flex-direction:column;overflow:hidden;position:relative;font:12px "Microsoft YaHei",sans-serif;color:#333;box-sizing:border-box;border:1px solid #c7c7c7}
.ad-header{height:28px;flex:none;display:flex;align-items:center;padding:0 6px;gap:8px;background:#f4f4f4;-webkit-app-region:drag}.drag-space{flex:1;height:100%}button{font:inherit;color:inherit;background:none;border:0;cursor:pointer;-webkit-app-region:no-drag}button:disabled{opacity:.5;cursor:wait}.active{color:#138942}
.advertisement{height:34px;flex:none;color:#bd6419;font-size:17px;font-weight:600}.reading-area{flex:1;min-height:0;position:relative;margin:0 5px 5px;overflow:hidden;background:white}.ad-webview{display:flex;height:100%;width:100%;border:0}
.boss-cover{position:absolute;inset:0;background:#fff4d1;z-index:5;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px;color:#a65319}.boss-cover strong{font-size:24px}.boss-cover span{font-size:13px}
.error{font-size:11px;color:#a12c21;background:#fff0ef;padding:4px;flex:none}.error button{text-decoration:underline}.settings-overlay{position:absolute;inset:0;z-index:10;background:#0004;display:flex;align-items:center;justify-content:center;padding:8px}
.settings-dialog{background:white;border:1px solid #ddd;border-radius:6px;box-shadow:0 8px 25px #0002;padding:12px;width:300px;max-width:100%;max-height:calc(100% - 20px);overflow:auto;box-sizing:border-box}.settings-dialog header{display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid #eee;padding-bottom:8px}.settings-dialog h2{font-size:15px;margin:0}.shortcut{font-size:11px;color:#666}.shortcut kbd{font:inherit;background:#f1f1f1;padding:3px}
.settings-dialog label{display:flex;align-items:center;gap:8px;margin:13px 0}.settings-dialog input[type=range]{min-width:0;flex:1;accent-color:#47b478}.settings-dialog output{width:32px;text-align:right}.check{font-size:11px}.setting-button{display:block;margin:9px 0;border:1px solid #ddd;background:#f8f8f8;padding:6px 12px;border-radius:4px}.text-input{flex:1;min-width:0;padding:5px;border:1px solid #ddd;border-radius:3px}.hint{color:#999;font-size:10px;line-height:1.6}
</style>
