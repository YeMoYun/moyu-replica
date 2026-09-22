export function createVideoChatModeControl({ invoke, on }) {
  return Object.freeze({
    getContext: () => invoke('video-chat:get-context'),
    get: () => invoke('video-chat:get'),
    save: (state, revision) => invoke('video-chat:save', state, revision),
    getRuntime: () => invoke('video-chat:state'),
    close: () => invoke('video-chat:close'),
    onState: on('video-chat:updated'),
    onBoss: on('chat-mode:boss'),
    onError: on('chat-mode:error')
  })
}
