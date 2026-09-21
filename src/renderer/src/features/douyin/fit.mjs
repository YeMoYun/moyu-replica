export const DOUYIN_DEFAULT_ZOOM = 0.4
export function clampDouyinZoom(value) {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.round(Math.min(1, Math.max(0.2, value)) * 100) / 100 : DOUYIN_DEFAULT_ZOOM
}
export function normalizeZoomSetting(value) { return clampDouyinZoom(value) }
export function calculateDouyinFitZoom(width, height) {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return DOUYIN_DEFAULT_ZOOM
  return clampDouyinZoom(Math.min(width / 1280, height / 720))
}
