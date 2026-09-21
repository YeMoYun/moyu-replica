export function prepareAdVideo(){
  let style=document.getElementById('__moyu-ad-video-fit')
  if(!style){style=document.createElement('style');style.id='__moyu-ad-video-fit';document.head.appendChild(style)}
  style.textContent='html,body{min-width:0!important;overflow:hidden!important}header,aside,[data-e2e="douyin-navigation"]{display:none!important}[data-moyu-ad-video-active]{position:fixed!important;inset:0!important;width:100vw!important;height:100vh!important;max-width:none!important;max-height:none!important}[data-moyu-ad-video-active] video{object-fit:contain!important;max-width:100%!important;max-height:100%!important}'
  const previous=window.__moyuAdVideoFit
  if(previous){previous.refresh();return true}
  let refreshing=false,timer=0
  const refresh=()=>{
    if(refreshing)return
    refreshing=true
    try{
      for(const node of document.querySelectorAll('[data-moyu-ad-video-active]'))node.removeAttribute('data-moyu-ad-video-active')
      const candidates=[...document.querySelectorAll('[data-e2e="feed-active-video"],.xgplayer,video')]
      let best=null,bestScore=-1
      for(const candidate of candidates){
        const root=candidate.matches('video')?candidate.parentElement:candidate
        if(!root||root===document.body||root===document.documentElement)continue
        const style=getComputedStyle(root),rect=root.getBoundingClientRect()
        if(style.display==='none'||style.visibility==='hidden'||Number(style.opacity)===0||rect.width<2||rect.height<2)continue
        const video=root.matches('video')?root:root.querySelector('video'),area=rect.width*rect.height
        const score=area+(candidate.matches('[data-e2e="feed-active-video"]')?1e12:0)+(video&&!video.paused?1e11:0)
        if(score>bestScore){bestScore=score;best=root}
      }
      best?.setAttribute('data-moyu-ad-video-active','true')
    }finally{refreshing=false}
  }
  const observer=new MutationObserver(mutations=>{if(mutations.some(m=>m.attributeName!=='data-moyu-ad-video-active')){clearTimeout(timer);timer=setTimeout(refresh,0)}})
  observer.observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['class','style','data-e2e','data-moyu-ad-video-active']})
  window.__moyuAdVideoFit={observer,refresh};refresh()
  return true
}
export function navigateAdVideo(platform,direction){
  if(!['prev','next'].includes(direction))throw Error('视频切换方向无效')
  for(const selector of platform[direction]){
    const button=document.querySelector(selector)
    if(button&&!button.disabled){button.click();return {method:'button',selector}}
  }
  if(!platform.keyboardFallback)throw Error(`${platform.name}当前页面未找到上一条/下一条控件；直播或单视频页面可能不支持切换。`)
  const key=direction==='next'?'ArrowDown':'ArrowUp',focused=document.activeElement
  const target=focused&&!/^(INPUT|TEXTAREA|SELECT)$/.test(focused.tagName)&&!focused.isContentEditable?focused:document
  for(const type of ['keydown','keyup'])target.dispatchEvent(new KeyboardEvent(type,{key,code:key,bubbles:true,cancelable:true}))
  return {method:'keyboard-fallback',verified:false}
}
export function toggleAdVideoFullscreen(platform){
  for(const selector of platform.fullscreen){
    const button=document.querySelector(selector)
    if(button&&button!==document.body&&button!==document.documentElement&&!button.disabled){button.click();return {clicked:true,selector}}
  }
  throw Error(`${platform.name}当前页面未找到可操作的视频控件（全屏）`)
}
export async function toggleAdVideoPlayback(platform){
  const videos=[...document.querySelectorAll('video')]
  if(!videos.length)throw Error(`${platform.name}当前页面未找到可操作的视频控件（播放/暂停）`)
  const pause=videos.some(video=>!video.paused)
  if(pause)videos.forEach(video=>video.pause())
  else await Promise.all(videos.map(video=>video.play()))
  return {paused:pause,count:videos.length}
}
export function likeAdVideo(platform){
  if(!platform.likeSupported)throw Error(`${platform.name}该平台当前不支持点赞`)
  for(const selector of platform.like){
    const button=document.querySelector(selector)
    if(button&&!button.disabled){button.click();return {clicked:true,selector}}
  }
  throw Error(`${platform.name}当前页面未找到点赞按钮，请确认已登录并进入视频页面`)
}
export function cleanupAdPage(){
  const fit=window.__moyuAdVideoFit
  if(fit){fit.observer.disconnect();for(const node of document.querySelectorAll('[data-moyu-ad-video-active]'))node.removeAttribute('data-moyu-ad-video-active');delete window.__moyuAdVideoFit}
  document.getElementById('__moyu-ad-video-fit')?.remove();return true
}
