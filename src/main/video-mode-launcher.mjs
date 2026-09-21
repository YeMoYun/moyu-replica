import { resolveVideoMode, videoPlatform } from '../shared/video-platforms.mjs'

export function createVideoModeLauncher({ openAd, openOpacity, openChat, readRecent, writeRecent }) {
  function open(platform, mode) {
    const target = resolveVideoMode(platform, mode)

    if (target.kind === 'ad') return openAd(target.key)
    if (target.kind === 'opacity') return openOpacity(target.key)

    const result = openChat(target.platform, target.skin)
    writeRecent(target.skin, target.platform)
    return result
  }

  function openRecentChat(skin) {
    const candidate = readRecent(skin) || 'douyin'
    const platform = videoPlatform(candidate).key
    const result = openChat(platform, skin)
    writeRecent(skin, platform)
    return result
  }

  return { open, openRecentChat }
}
