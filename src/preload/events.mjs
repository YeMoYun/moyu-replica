export function createEventSubscriptions(ipc) {
  const subscriptions = new Set()
  function on(channel, callback) {
    if (typeof callback !== 'function') throw new TypeError('事件回调必须是函数')
    const wrapped = (_event, ...args) => callback(...args)
    const item = { channel, callback, wrapped }
    subscriptions.add(item)
    ipc.on(channel, wrapped)
    return () => {
      if (!subscriptions.delete(item)) return
      ipc.removeListener(channel, wrapped)
    }
  }
  function off(channel, callback) {
    for (const item of subscriptions) {
      if (item.channel === channel && item.callback === callback) {
        ipc.removeListener(channel, item.wrapped)
        subscriptions.delete(item)
      }
    }
  }
  function removeAllListeners(channel) {
    for (const item of subscriptions) {
      if (item.channel === channel) {
        ipc.removeListener(channel, item.wrapped)
        subscriptions.delete(item)
      }
    }
  }
  return { on, off, removeAllListeners }
}
