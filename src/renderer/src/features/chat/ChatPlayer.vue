<template>
  <div ref="container" class="chat-player" :style="{width:size.width+'px',aspectRatio:size.width+'/'+size.height}">
    <webview ref="guest" :src="initialAddress" :partition="partition" class="player-webview" :data-player-ready="ready" />
    <div v-if="failure && !covered" class="player-feedback" role="alert"><span>{{ failure }}</span><button @click="retry">重试</button></div>
    <div v-else-if="!ready && !covered" class="player-loading">正在加载抖音网页…</div>
    <button v-if="settings.mask && !unmasked && !covered" class="player-mask" @click="unmasked=true">交互遮罩已开启<br>点击解除本播放器遮罩</button>
    <div v-if="covered" class="boss-cover" data-cover="chat-video"><img :src="settings.orientation==='portrait'?portraitGif:landscapeGif" alt="聊天视频遮挡动态图" /></div>
  </div>
</template>
<script setup>
import {computed,ref,onMounted,onBeforeUnmount,watch} from 'vue'
import {playerSize,validateChatUrl} from '../../../../shared/chat-state.mjs'
import {playerScript,pauseScript} from './player-scripts.mjs'
import {createChatNavigation} from './navigation.mjs'
import landscapeGif from '../../assets/chat/horizontal.gif'
import portraitGif from '../../assets/chat/portrait.gif'
const props=defineProps({message:Object,settings:Object,covered:Boolean,active:Boolean,partition:{type:String,default:'persist:moyu-chat-wechat'}})
const emit=defineEmits(['navigate','error'])
const initialAddress=validateChatUrl(props.message.address),guest=ref(null),container=ref(null),ready=ref(false),failure=ref(''),unmasked=ref(false)
const size=computed(()=>playerSize(props.settings));let disposed=false,observer,queue=Promise.resolve();const listeners=[]
function report(error){if(disposed||error.code==='ERR_ABORTED'||error.message?.includes('ERR_ABORTED (-3)'))return;failure.value=error.message||String(error);emit('error',failure.value)}
const navigation=createChatNavigation({initialAddress,readUrl:()=>guest.value.getURL(),load:address=>guest.value.loadURL(address),commit:address=>emit('navigate',address),report})
function schedule(){queue=queue.catch(()=>{}).then(async()=>{if(disposed||!ready.value)return;try{
  guest.value.setZoomFactor(Math.max(.1,Math.min(.6,.2*props.settings.scale/100)))
  await guest.value.executeJavaScript(playerScript())
  if(disposed)return
  await guest.value.executeJavaScript(pauseScript(props.covered||!props.active))
}catch(error){report(error)}});return queue}
function retry(){failure.value='';try{if(!navigation.retry())guest.value.reload()}catch(error){report(error)}}
function listen(name,handler){guest.value.addEventListener(name,handler);listeners.push([name,handler])}
onMounted(()=>{
  listen('did-start-loading',()=>{ready.value=false;failure.value=''})
  listen('did-start-navigation',event=>{if(event.isMainFrame===false)return;try{if(!navigation.started(event)){guest.value.stop();navigation.retry()}}catch(error){guest.value.stop();report(error)}})
  listen('did-redirect-navigation',event=>{if(event.isMainFrame===false)return;try{if(!navigation.redirect(event)){guest.value.stop();navigation.retry()}}catch(error){guest.value.stop();report(error)}})
  listen('dom-ready',()=>{ready.value=navigation.domReady();schedule()})
  listen('did-stop-loading',()=>{if(!failure.value){ready.value=navigation.domReady();schedule()}})
  listen('did-fail-load',event=>{if(event.isMainFrame===false||event.errorCode===-3)return;ready.value=false;report(Error('网页加载失败：'+event.errorDescription))})
  listen('render-process-gone',()=>{ready.value=false;report(Error('抖音网页进程已退出，请重试'))})
  const navigate=event=>{if(event.isMainFrame===false)return;try{if(!navigation.navigate(event.url)){guest.value.stop();navigation.retry();return}schedule()}catch(error){guest.value.stop();report(error)}}
  listen('did-navigate',navigate);listen('did-navigate-in-page',navigate)
  observer=new ResizeObserver(()=>schedule());observer.observe(container.value)
})
watch(()=>[props.settings.scale,props.settings.orientation,props.covered,props.active],()=>schedule())
watch(()=>props.settings.mask,()=>{unmasked.value=false})
watch(()=>props.message.address,address=>{try{navigation.addressChanged(address)}catch(error){report(error)}})
onBeforeUnmount(()=>{disposed=true;navigation.dispose();observer?.disconnect();for(const [name,handler]of listeners)guest.value?.removeEventListener(name,handler)})
</script>
