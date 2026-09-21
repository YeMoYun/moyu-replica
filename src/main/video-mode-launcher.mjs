import { resolveVideoMode } from '../shared/video-platforms.mjs'

export function createVideoModeLauncher({ openAd, openOpacity, openChat, readRecent, writeRecent }) {
  function isThenable(value) {
    return (
      value !== null &&
      (typeof value === 'object' || typeof value === 'function') &&
      typeof value.then === 'function'
    )
  }

  function recordSuccessfulOpen(opened, skin, platform) {
    const record = (result) => {
      const written = writeRecent(skin, platform)
      if (isThenable(written)) return Promise.resolve(written).then(() => result)
      return result
    }

    if (isThenable(opened)) return Promise.resolve(opened).then(record)
    return record(opened)
  }

  function openChatAndRemember(platform, skin) {
    return recordSuccessfulOpen(openChat(platform, skin), skin, platform)
  }

  function open(platform, mode) {
    const target = resolveVideoMode(platform, mode)

    if (target.kind === 'ad') return openAd(target.key)
    if (target.kind === 'opacity') return openOpacity(target.key)
    return openChatAndRemember(target.platform, target.skin)
  }

  function openRecentChat(skin) {
    const fallback = resolveVideoMode('douyin', skin)
    const target = resolveVideoMode(readRecent(fallback.skin) || fallback.platform, fallback.skin)
    return openChatAndRemember(target.platform, target.skin)
  }

  return { open, openRecentChat }
}
