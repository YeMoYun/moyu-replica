export function createSenderWindowKeyResolver({ windows, fromWebContents }) {
  return event => {
    const senderWindow = fromWebContents(event?.sender)
    for (const [key, window] of windows) {
      if (window === senderWindow) return key
    }
    throw new Error('未知窗口，不能执行窗口操作')
  }
}
