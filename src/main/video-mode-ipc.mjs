export function createVideoModeIpcHandlers({ keyFromSender, launcher }) {
  function requireMain(event, message) {
    if (keyFromSender(event) !== 'main') throw new Error(message)
  }

  return {
    async open(event, platform, mode) {
      requireMain(event, '仅主窗口可打开视频模式')
      await launcher.open(platform, mode)
      return true
    },
    async openRecentChat(event, skin) {
      requireMain(event, '仅主窗口可打开伪装模式')
      await launcher.openRecentChat(skin)
      return true
    }
  }
}
