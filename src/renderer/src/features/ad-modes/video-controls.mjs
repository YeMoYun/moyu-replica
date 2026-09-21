// Serializable platform data passed into advertisement webview guests.
const selectors=values=>Object.freeze([...values])
const define=(name,{fullscreen=[],next=[],prev=[],like=[],keyboardFallback=false,likeSupported=false})=>Object.freeze({
  name,
  fullscreen:selectors(fullscreen),
  next:selectors(next),
  prev:selectors(prev),
  like:selectors(like),
  keyboardFallback,
  likeSupported
})

export const VIDEO_AD_CONTROLS=Object.freeze({
  douyin:define('抖音',{
    fullscreen:['button[aria-label*="全屏"]','[data-e2e="video-player-fullscreen"]','.xgplayer-fullscreen'],
    next:['button[aria-label*="下一"]','[data-e2e="video-switch-next-arrow"]','[data-e2e="feed-next"]'],
    prev:['button[aria-label*="上一"]','[data-e2e="video-switch-prev-arrow"]','[data-e2e="feed-prev"]'],
    like:['button[aria-label*="点赞"]','[data-e2e="video-player-digg"]','[data-e2e="video-like"]'],
    keyboardFallback:true,
    likeSupported:true
  }),
  bilibili:define('B站',{
    fullscreen:['.bpx-player-ctrl-full','.bilibili-player-video-btn-fullscreen','button[aria-label*="全屏"]'],
    next:['.bpx-player-ctrl-next','.bilibili-player-video-btn-next','button[aria-label*="下一"]'],
    prev:['.bpx-player-ctrl-prev','.bilibili-player-video-btn-prev','button[aria-label*="上一"]'],
    like:['.bpx-player-ctrl-like','.video-like','button[aria-label*="点赞"]'],
    likeSupported:true
  }),
  huya:define('虎牙',{
    fullscreen:['.player-fullscreen-btn','.player-fullscreen','.player-fullpage-btn','.player-fullpage','[data-action="fullscreen"]','button[title*="全屏"]','button[aria-label*="全屏"]'],
    next:['button[aria-label*="下一"]','[data-action="next-video"]'],
    prev:['button[aria-label*="上一"]','[data-action="prev-video"]']
  }),
  douyu:define('斗鱼',{
    fullscreen:['[data-action="fullscreen"]','button[title*="全屏"]','button[aria-label*="全屏"]']
  }),
  kuaishou:define('快手',{
    fullscreen:['.xgplayer-fullscreen','[data-e2e="video-player-fullscreen"]','button[aria-label*="全屏"]'],
    next:['[data-e2e="video-switch-next-arrow"]','.xgplayer-next','button[aria-label*="下一"]'],
    prev:['[data-e2e="video-switch-prev-arrow"]','.xgplayer-prev','button[aria-label*="上一"]'],
    like:['[data-e2e="video-like"]','[data-e2e="video-player-digg"]','button[aria-label*="点赞"]'],
    keyboardFallback:true,
    likeSupported:true
  })
})

export function videoAdControls(kind){
  if(!Object.hasOwn(VIDEO_AD_CONTROLS,kind))throw Error('不支持的视频广告平台')
  return VIDEO_AD_CONTROLS[kind]
}
