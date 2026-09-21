export function clampVideoZoom(value) {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.round(Math.min(1, Math.max(.2, value)) * 100) / 100 : .4
}
export function normalizeZoomSetting(value) { return clampVideoZoom(value) }
export function calculateVideoFitZoom(width, height) {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return .4
  return clampVideoZoom(Math.min(width / 1280, height / 720))
}
