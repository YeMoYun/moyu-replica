// Each function is self-contained: Electron serializes it into the remote guest.
export function prepareDouyinPage() {
  const id = '__moyu_douyin_opacity_fit__'
  let style = document.getElementById(id)
  if (!style) { style = document.createElement('style'); style.id = id; document.head.appendChild(style) }
  style.textContent = 'html,body{min-width:0!important;overflow-x:clip!important}html::-webkit-scrollbar,body::-webkit-scrollbar{display:none}'
  return { prepared: true }
}
export function navigateDouyinVideo(direction) {
  if (!['prev', 'next'].includes(direction)) throw new Error('视频切换方向无效')
  const selectors = direction === 'next'
    ? ['button[aria-label*="下一"]', '[data-e2e="video-switch-next-arrow"]', '[data-e2e="feed-next"]']
    : ['button[aria-label*="上一"]', '[data-e2e="video-switch-prev-arrow"]', '[data-e2e="feed-prev"]']
  for (const selector of selectors) {
    const button = document.querySelector(selector)
    if (button && !button.disabled) { button.click(); return { method: 'button' } }
  }
  const key = direction === 'next' ? 'ArrowDown' : 'ArrowUp'
  const target = document.activeElement && !/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName) && !document.activeElement.isContentEditable
    ? document.activeElement : document
  for (const type of ['keydown', 'keyup']) target.dispatchEvent(new KeyboardEvent(type, { key, code: key, bubbles: true, cancelable: true }))
  return { method: 'keyboard-fallback', verified: false }
}
export function toggleDouyinFullscreen() {
  for (const selector of ['button[aria-label*="全屏"]', '[data-e2e="video-player-fullscreen"]', '.xgplayer-fullscreen']) {
    const button = document.querySelector(selector)
    if (button && !button.disabled) { button.click(); return { clicked: true } }
  }
  throw new Error('当前页面未找到可操作的视频控件（全屏）')
}
export async function toggleDouyinPlayback() {
  const videos = [...document.querySelectorAll('video')]
  if (!videos.length) throw new Error('当前页面未找到可操作的视频控件（播放/暂停）')
  const pause = videos.some(video => !video.paused)
  if (pause) videos.forEach(video => video.pause())
  else await Promise.all(videos.map(video => video.play()))
  return { paused: pause, count: videos.length }
}
export async function setDouyinHidden(hidden) {
  if (hidden) {
    if (!window.__moyuDouyinPausedVideos) {
      window.__moyuDouyinPausedVideos = [...document.querySelectorAll('video')].filter(video => !video.paused)
      window.__moyuDouyinPausedVideos.forEach(video => video.pause())
    }
  } else {
    const videos = window.__moyuDouyinPausedVideos || []
    delete window.__moyuDouyinPausedVideos
    await Promise.all(videos.filter(video => video.isConnected).map(video => video.play()))
  }
  return { hidden }
}
export function cleanupDouyinPage() {
  document.getElementById('__moyu_douyin_opacity_fit__')?.remove()
  delete window.__moyuDouyinPausedVideos
  return { prepared: false }
}
