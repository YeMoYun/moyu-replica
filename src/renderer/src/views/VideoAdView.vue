<template>
  <div class="video-ad" :class="`skin-${state.skin||0}`" :data-ready="state.ready&&!pending">
    <header class="ad-header">
      <button data-action="back" title="返回上一页" aria-label="返回上一页" @click="action('back')">← 返回</button>
      <button data-action="skin" title="切换广告内容" @click="update({skin:(state.skin+1)%3})">{{brands[state.skin||0]}}</button>
      <button class="expand" data-action="expand" :title="native.expanded?'缩小窗口':'放大窗口'" @click="perform(()=>api.expand())">{{native.expanded?'⤡':'⤢'}}</button>
      <button class="switch" data-action="transparent" title="切换透明度模式" @click="toTransparent">↻</button>
      <span class="drag-space"></span>
      <button data-action="close" @click="perform(()=>api.close())">关闭广告</button>
    </header>
    <div class="ad-copy" @click="details=true"><span class="brand-icon">{{state.skin===1?'优':'搜'}}</span><div><strong>{{captions[state.skin||0]}}</strong><small>精彩视频，更多详情点击进入</small></div></div>
    <div v-if="error" class="error" role="alert">{{error}}<button data-action="reload" @click="perform(()=>wv?.reload())">重试</button></div>
    <main class="video-area">
      <webview v-if="initialized" ref="wv" :src="initialAddress" class="ad-webview" @dom-ready="domReady" @did-start-navigation="navigation" @did-navigate-in-page="domReady" @did-fail-load="failed"></webview>
      <div v-if="native.covered" class="boss-cover" data-cover="qr"><img :src="qr" alt="二维码遮挡"/><span>扫码了解更多</span></div>
    </main>
    <footer @click="details=true"><strong>精彩生活，随时发现</strong><span>立即体验 ›</span></footer>
    <div v-if="details" class="details-overlay" @click.self="details=false"><section role="dialog" aria-modal="true"><h3>广告详情</h3><p>这是本地广告皮肤，不会跳转商业推广网站。</p><p>{{platform.label}}视频在当前小窗口内即可直接操作。</p><button data-action="close-details" @click="details=false">关闭</button></section></div>
  </div>
</template>
<script setup>
import {ref} from 'vue'
import {useRoute} from 'vue-router'
import {useAdPage} from '../features/ad-modes/use-ad-page.mjs'
import {videoPlatform} from '../../../shared/video-platforms.mjs'
import qr from '../assets/ad-cover-qr.svg'
const route=useRoute()
const kind=String(route.meta.site||'')
const platform=videoPlatform(kind)
const {api,wv,initialized,initialAddress,error,pending,state,native,perform,domReady,navigation,failed,update,action,toTransparent}=useAdPage(kind)
const details=ref(false),brands=['搜狗输入法','今日优选','热门推荐'],captions=['打字更快，表达更精彩','发现好物，享受生活','精彩内容，不容错过']
</script>
<style scoped>
.video-ad{height:100%;display:flex;flex-direction:column;background:#ffe49c;color:#222;font:12px "Microsoft YaHei",sans-serif;overflow:hidden;position:relative;box-sizing:border-box;border:1px solid #d6c28c}
.skin-1{background:#d9efff;border-color:#b4d6ee}.skin-2{background:#fff1e6;border-color:#e6c7ae}
.ad-header{height:28px;flex:none;display:flex;align-items:center;padding:0 6px;gap:5px;background:#f3f3f3;-webkit-app-region:drag}
button{font:inherit;border:0;background:none;color:inherit;cursor:pointer;-webkit-app-region:no-drag;padding:2px}.expand,.switch{font-size:18px}.drag-space{flex:1;height:100%}
.ad-copy{height:68px;flex:none;display:flex;align-items:center;justify-content:center;gap:12px;cursor:pointer}.brand-icon{border-radius:12px;background:#ed5a31;color:#fff;font-size:27px;padding:6px}.ad-copy strong{font-size:15px;display:block}.ad-copy small{display:block;margin-top:7px;font-size:11px;color:#665634}
.video-area{flex:1;min-height:0;position:relative;background:#111;margin:0 7px;overflow:hidden}.ad-webview{width:100%;height:100%;display:flex;border:0}
.boss-cover{position:absolute;inset:0;background:#fff;z-index:5;display:flex;flex-direction:column;justify-content:center;align-items:center;gap:6px}.boss-cover img{width:min(75%,220px);max-height:80%;object-fit:contain}.boss-cover span{color:#666;font-size:11px}
footer{height:43px;flex:none;padding:0 12px;display:flex;align-items:center;justify-content:space-between;cursor:pointer}footer strong{font-size:12px}footer span{font-size:11px;color:#d65d16}.error{font-size:11px;background:#fff0ef;color:#a12c21;padding:4px;flex:none}.error button{text-decoration:underline}
.details-overlay{position:absolute;inset:0;z-index:10;display:grid;place-items:center;background:#0005;padding:12px}.details-overlay section{background:#fff;border-radius:6px;padding:16px;color:#222;max-width:320px}.details-overlay h3{margin:0 0 10px}.details-overlay p{line-height:1.7}.details-overlay button{border:1px solid #ccc;border-radius:4px;padding:5px 16px}
</style>
