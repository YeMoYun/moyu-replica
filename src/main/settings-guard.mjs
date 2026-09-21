import { SITE_ROUTES } from './window-definitions.mjs'
const windows = new Set([...Object.keys(SITE_ROUTES), 'main', 'excelWindow', 'excelViewWindow', 'bilibiliWindow', 'huyaWindow', 'douyuWindow'])
const fields = new Set(['opacity','windowTransparent','windowOpacity','alwaysOnTop','autoHideEnabled','autoHide','windowBounds','bounds','baseWidth','baseHeight','xPosition','yPosition'])
const protectedChatRoots = new Set(['chatModes','chatMigration','chatWindows','wechatConfig','dingdingConfig'])
const protectedLegacyFields = new Set(['currentSiteKey','readerFilePath'])
function isProtectedChatPath(key) {
  const [namespace, field] = String(key).split('.')
  return protectedChatRoots.has(namespace) || (['wechat','dingding'].includes(namespace) && protectedLegacyFields.has(field))
}
function dedicatedError(key) {
  return new Error(`设置 ${key} 受聊天专用接口控制，请使用对应聊天窗口的专用操作接口。`)
}
export function validateUnmanagedSettingRead(key) {
  if (typeof key !== 'string' || !key) throw new Error('配置键不能为空')
  if (isProtectedChatPath(key)) throw dedicatedError(key)
  return key
}
export function validateUnmanagedSettings(values) {
  if (!values || typeof values !== 'object' || Array.isArray(values)) throw new Error('设置必须是对象')
  function inspect(key, value) {
    const [namespace, field] = key.split('.')
    if (isProtectedChatPath(key)) throw dedicatedError(key)
    if (namespace === 'shortcuts' || namespace === 'windowState' || (windows.has(namespace) && fields.has(field))) {
      throw new Error(`设置 ${key} 受窗口/快捷键管理器控制，请使用专用操作接口。`)
    }
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      for (const [child, entry] of Object.entries(value)) inspect(`${key}.${child}`, entry)
    }
  }
  for (const [key, value] of Object.entries(values)) inspect(key, value)
}
export function sanitizeUnmanagedSettings(values) {
  if (!values || typeof values !== 'object' || Array.isArray(values)) throw new Error('设置必须是对象')
  function copy(value, prefix = '') {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return structuredClone(value)
    const result = {}
    for (const [key, entry] of Object.entries(value)) {
      const path = prefix ? `${prefix}.${key}` : key
      if (isProtectedChatPath(path)) continue
      result[key] = copy(entry, path)
    }
    return result
  }
  return copy(values)
}
