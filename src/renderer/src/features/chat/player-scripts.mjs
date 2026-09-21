// Serialized into the remote guest: no application bridge or Node access.
export function prepareChatPlayer(){
  const key='__moyuChatPlayerStyle'
  let style=document.getElementById(key)
  if(!style){style=document.createElement('style');style.id=key;document.head.appendChild(style)}
  style.textContent=`html,body{min-width:0!important;margin:0!important;}[data-moyu-chat-active]{position:fixed!important;inset:0!important;width:100vw!important;height:100vh!important;min-width:0!important;min-height:0!important;max-width:none!important;max-height:none!important;z-index:2147483000!important;}[data-moyu-chat-active] video{width:100%!important;height:100%!important;object-fit:contain!important;}`
  function pause(video){if(!video.paused){const previous=window.__moyuChatPausedMedia||(window.__moyuChatPausedMedia=[]);if(!previous.includes(video))previous.push(video);video.pause()}}
  function fit(){
    const videos=Array.from(document.querySelectorAll('video'))
    const active=videos.find(v=>{const r=v.getBoundingClientRect();return r.width>0&&r.height>0})
    const player=active?.closest('.xgplayer,[data-e2e="video-player"],.video-player')
    document.querySelectorAll('[data-moyu-chat-active]').forEach(e=>{if(e!==player)e.removeAttribute('data-moyu-chat-active')})
    if(player&&!player.hasAttribute('data-moyu-chat-active'))player.setAttribute('data-moyu-chat-active','true')
    if(window.__moyuChatPauseRequested)videos.forEach(pause)
    return !!player
  }
  if(!window.__moyuChatObserver&&document.body){
    let pending=false
    window.__moyuChatObserver=new MutationObserver(()=>{if(!pending){pending=true;requestAnimationFrame(()=>{pending=false;fit()})}})
    window.__moyuChatObserver.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['class','style']})
    document.addEventListener('play',event=>{if(window.__moyuChatPauseRequested&&event.target instanceof HTMLVideoElement)pause(event.target)},true)
  }
  return {playerFound:fit()}
}
export async function setChatMediaPaused(paused){
  const key='__moyuChatPausedMedia'
  window.__moyuChatPauseRequested=paused
  if(paused){
    if(!window[key])window[key]=[]
    for(const video of document.querySelectorAll('video'))if(!video.paused){if(!window[key].includes(video))window[key].push(video);video.pause()}
    return true
  }
  const previous=window[key]||[];delete window[key]
  const results=await Promise.all(previous.filter(v=>v.isConnected).map(async v=>{try{await v.play();return true}catch{return false}}))
  if(results.includes(false))throw Error('网页拒绝自动恢复播放，请在气泡内手动播放')
  return true
}
export const playerScript=()=>`(${prepareChatPlayer.toString()})()`
export const pauseScript=paused=>`(${setChatMediaPaused.toString()})(${JSON.stringify(!!paused)})`
