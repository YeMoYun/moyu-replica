// Every function is self-contained because Electron serializes Function#toString.
export function prepareVideoPage(platform) {
  const id = `__moyu_${platform.key}_fit__`
  let style = document.getElementById(id)
  if (!style) { style = document.createElement('style'); style.id = id; document.head.appendChild(style) }
  style.textContent = 'html,body{min-width:0!important;overflow-x:clip!important}html::-webkit-scrollbar,body::-webkit-scrollbar{display:none}'
  return { prepared: true }
}
export function navigateVideo(platform, direction) {
  if (!['prev', 'next'].includes(direction)) throw new Error('视频切换方向无效')
  for (const selector of platform[direction]) {
    const button = document.querySelector(selector)
    if (button && !button.disabled) { button.click(); return { method: 'button' } }
  }
  if (!platform.keyboardFallback) throw new Error(`${platform.name}当前页面未找到上一条/下一条控件；直播或单视频页面可能不支持切换。`)
  const key = direction === 'next' ? 'ArrowDown' : 'ArrowUp'
  const focused = document.activeElement
  const target = focused && !/^(INPUT|TEXTAREA|SELECT)$/.test(focused.tagName) && !focused.isContentEditable ? focused : document
  for (const type of ['keydown', 'keyup']) target.dispatchEvent(new KeyboardEvent(type, { key, code: key, bubbles: true, cancelable: true }))
  return { method: 'keyboard-fallback', verified: false }
}
export function toggleVideoFullscreen(platform) {
  for (const selector of platform.fullscreen) {
    const button = document.querySelector(selector)
    if (button && button !== document.body && button !== document.documentElement && !button.disabled) {
      button.click(); return { clicked: true }
    }
  }
  throw new Error(`${platform.name}当前页面未找到可操作的视频控件（全屏）`)
}
export async function toggleVideoPlayback(platform) {
  const videos = [...document.querySelectorAll('video')]
  if (!videos.length) throw new Error(`${platform.name}当前页面未找到可操作的视频控件（播放/暂停）`)
  const pause = videos.some(video => !video.paused)
  if (pause) videos.forEach(video => video.pause())
  else await Promise.all(videos.map(video => video.play()))
  return { paused: pause, count: videos.length }
}
export async function setVideoHidden(platform, hidden) {
  const key = `__moyu_${platform.key}_pausedVideos`
  if (hidden) {
    if (!window[key]) {
      window[key] = [...document.querySelectorAll('video')].filter(video => !video.paused)
      window[key].forEach(video => video.pause())
    }
  } else {
    const videos = window[key] || []
    delete window[key]
    await Promise.all(videos.filter(video => video.isConnected).map(video => video.play()))
  }
  return { hidden }
}
export function cleanupVideoPage(platform) {
  document.getElementById(`__moyu_${platform.key}_fit__`)?.remove()
  delete window[`__moyu_${platform.key}_pausedVideos`]
  return { prepared: false }
}
