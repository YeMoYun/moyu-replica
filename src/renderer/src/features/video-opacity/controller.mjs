import { normalizeZoomSetting, clampVideoZoom, calculateVideoFitZoom } from './fit.mjs'
import { prepareVideoPage, navigateVideo, toggleVideoFullscreen, toggleVideoPlayback, setVideoHidden, cleanupVideoPage } from './page-scripts.mjs'
import { installHuyaWindowFill, toggleHuyaWindowFill, cleanupHuyaWindowFill } from './huya-window-fill.mjs'
export function createVideoOpacityState() { return { ready: false, zoom: .4, autoFit: true, hidden: false } }
export function createVideoOpacityController({ state, platform, getWebview, settings }) {
  let disposed = false, generation = 0, tail = Promise.resolve()
  const enqueue = operation => {
    const documentGeneration = generation
    const promise = tail.then(async () => {
      if (disposed) throw new Error(`${platform.name}页面已关闭`)
      if (documentGeneration !== generation) return
      return operation(documentGeneration)
    })
    tail = promise.catch(() => {})
    return promise
  }
  function guest(requireReady = true) {
    const view = getWebview()
    if (!view || (requireReady && !state.ready)) throw new Error(`${platform.name}网页尚未准备好`)
    return view
  }
  async function execute(fn, args = [], requireReady = true) {
    // Catch inside the guest, since Electron otherwise replaces messages with a generic IPC error.
    const code = `(async()=>{try{return {ok:true,value:await (${fn.toString()})(${[platform,...args].map(value=>JSON.stringify(value)).join(',')})}}catch(error){return {ok:false,error:error.message||String(error)}}})()`
    const result = await guest(requireReady).executeJavaScript(code, true)
    if (!result?.ok) throw new Error(result?.error || `${platform.name}网页操作失败`)
    return result.value
  }
  async function applyZoom(value, autoFit, epoch) {
    const view = guest(false), oldZoom = state.zoom
    const zoom = clampVideoZoom(value)
    view.setZoomFactor(zoom)
    try { await settings.setSettings({ [`${platform.key}.zoom`]: zoom, [`${platform.key}.autoFit`]: autoFit }) }
    catch (error) { if (!disposed && epoch === generation) view.setZoomFactor(oldZoom); throw error }
    // Preferences belong to the window, not to one document. A navigation must
    // not discard a manual selection whose settings transaction just committed.
    if (!disposed) Object.assign(state, { zoom, autoFit })
  }
  function fittedZoom() { const box = guest(false).getBoundingClientRect(); return calculateVideoFitZoom(box.width, box.height) }
  return {
    load: () => enqueue(async () => {
      const [zoom, autoFit] = await Promise.all([settings.getSetting(`${platform.key}.zoom`), settings.getSetting(`${platform.key}.autoFit`)])
      if (!disposed) Object.assign(state, { zoom: normalizeZoomSetting(zoom), autoFit: typeof autoFit === 'boolean' ? autoFit : zoom === undefined })
    }),
    navigationStarted() { generation++; state.ready = false },
    domReady: () => enqueue(async epoch => {
      await execute(prepareVideoPage, [], false)
      if (platform.key === 'huyaOpacity') await execute(installHuyaWindowFill, [], false)
      if (disposed || epoch !== generation) return
      await applyZoom(state.autoFit ? fittedZoom() : state.zoom, state.autoFit, epoch)
      if (disposed || epoch !== generation) return
      state.ready = true
      if (state.hidden) await execute(setVideoHidden, [true])
    }),
    resize: () => enqueue(async epoch => {
      if (state.ready && (state.autoFit || platform.key === 'huyaOpacity')) {
        await applyZoom(fittedZoom(), true, epoch)
      }
    }),
    setZoom: value => enqueue(epoch => { guest(); return applyZoom(value, false, epoch) }),
    restoreAutoFit: () => enqueue(epoch => { guest(); return applyZoom(fittedZoom(), true, epoch) }),
    navigate: direction => enqueue(() => execute(navigateVideo, [direction])),
    fullscreen: () => enqueue(() => execute(platform.key === 'huyaOpacity' ? toggleHuyaWindowFill : toggleVideoFullscreen)),
    playback: () => enqueue(() => execute(toggleVideoPlayback)),
    setHidden: hidden => enqueue(async () => { state.hidden = !!hidden; if (state.ready) await execute(setVideoHidden, [state.hidden]) }),
    async dispose() {
      disposed = true; generation++; state.ready = false
      await tail
      if (getWebview()) {
        if (platform.key === 'huyaOpacity') await execute(cleanupHuyaWindowFill, [], false)
        await execute(cleanupVideoPage, [], false)
      }
    }
  }
}
