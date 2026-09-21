// Only serializable data: these selectors are passed into the remote guest.
export const VIDEO_PLATFORMS = {
  bilibili: {
    key: 'bilibiliOpacity', name: 'B站', url: 'https://www.bilibili.com/', keyboardFallback: false,
    fullscreen: ['.bpx-player-ctrl-full', '.bilibili-player-video-btn-fullscreen', 'button[aria-label*="全屏"]'],
    next: ['.bpx-player-ctrl-next', '.bilibili-player-video-btn-next', 'button[aria-label*="下一"]'],
    prev: ['.bpx-player-ctrl-prev', '.bilibili-player-video-btn-prev', 'button[aria-label*="上一"]'],
    navigationHint: '上一条/下一条仅在播放器提供切换按钮时可用；不会用方向键改变音量。'
  },
  huya: {
    key: 'huyaOpacity', name: '虎牙', url: 'https://www.huya.com/', keyboardFallback: false,
    fullscreen: ['.player-fullscreen-btn', '.player-fullscreen', 'button[aria-label*="全屏"]'],
    next: ['button[aria-label*="下一"]', '[data-action="next-video"]'],
    prev: ['button[aria-label*="上一"]', '[data-action="prev-video"]'],
    navigationHint: '直播房间通常没有上一条/下一条；未提供按钮时会提示，不会随机换房间。'
  },
  kuaishou: {
    key: 'kuaishouOpacity', name: '快手', url: 'https://www.kuaishou.com/', keyboardFallback: true,
    fullscreen: ['.xgplayer-fullscreen', '[data-e2e="video-player-fullscreen"]', 'button[aria-label*="全屏"]'],
    next: ['[data-e2e="video-switch-next-arrow"]', '.xgplayer-next', 'button[aria-label*="下一"]'],
    prev: ['[data-e2e="video-switch-prev-arrow"]', '.xgplayer-prev', 'button[aria-label*="上一"]'],
    navigationHint: '优先使用切换按钮；找不到时尝试上下方向键，网页是否响应取决于当前页面。'
  }
}
