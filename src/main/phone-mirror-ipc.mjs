export function createPhoneMirrorIpcHandlers({ keyFromSender, launcher }) {
  return {
    async open(event) {
      if (keyFromSender(event) !== 'main') {
        throw new Error('仅主窗口可打开手机投屏模式')
      }
      return launcher.openOrFocus()
    }
  }
}
