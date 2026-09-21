export const SHORTCUTS = Object.freeze({
  boss: 'Ctrl+D', opacityUp: 'Ctrl+P', opacityDown: 'Ctrl+O',
  allPrev: 'Ctrl+J', allNext: 'Ctrl+K', allScreen: 'Ctrl+L',
  allLike: 'Ctrl+M', bindSoft: 'Ctrl+B', stopOrContinue: 'Ctrl+E'
})

const LEGACY = Object.freeze({ scroll: 'stopOrContinue', next: 'allNext', prev: 'allPrev', fullscreen: 'allScreen', like: 'allLike' })
const MODIFIERS = {
  ctrl: 'Ctrl', control: 'Ctrl', cmd: 'Command', command: 'Command',
  cmdorctrl: 'CommandOrControl', commandorcontrol: 'CommandOrControl',
  alt: 'Alt', option: 'Alt', altgr: 'AltGr', shift: 'Shift', super: 'Super', meta: 'Super'
}
const MODIFIER_ORDER = ['CommandOrControl', 'Ctrl', 'Alt', 'AltGr', 'Shift', 'Command', 'Super']
const KEYS = new Map([
  'Plus', 'Space', 'Tab', 'Capslock', 'Numlock', 'Scrolllock', 'Backspace', 'Delete', 'Insert',
  'Return', 'Enter', 'Up', 'Down', 'Left', 'Right', 'Home', 'End', 'PageUp', 'PageDown',
  'Escape', 'VolumeUp', 'VolumeDown', 'VolumeMute', 'MediaNextTrack', 'MediaPreviousTrack',
  'MediaStop', 'MediaPlayPause', 'PrintScreen', 'numdec', 'numadd', 'numsub', 'nummult', 'numdiv'
].map((key) => [key.toLowerCase(), key]))
const KEY_ALIASES = { arrowup: 'Up', arrowdown: 'Down', arrowleft: 'Left', arrowright: 'Right', esc: 'Escape', enter: 'Return' }

function accelerator(value) {
  if (typeof value !== 'string') throw new Error('快捷键必须为字符串，留空可禁用')
  if (!value.trim()) return ''
  const parts = value.trim().split('+').map((part) => part.trim())
  if (parts.some((part) => !part)) throw new Error('快捷键格式无效，请用 + 连接修饰键和按键')
  const rawKey = parts.pop().toLowerCase()
  let key = KEY_ALIASES[rawKey] || KEYS.get(rawKey)
  if (/^[a-z0-9]$/.test(rawKey)) key = rawKey.toUpperCase()
  if (/^f([1-9]|1[0-9]|2[0-4])$/.test(rawKey)) key = rawKey.toUpperCase()
  if (/^num[0-9]$/.test(rawKey)) key = rawKey
  if (/^[~!@#$%^&*()_\-={}\[\]|\\:;"'<>,.?/]$/.test(rawKey)) key = rawKey
  if (!key) throw new Error(`不支持的按键：${rawKey || value}`)
  const modifiers = parts.map((part) => MODIFIERS[part.toLowerCase()])
  if (modifiers.some((part) => !part) || new Set(modifiers.map(equivalent)).size !== modifiers.length) throw new Error('修饰键无效或重复')
  modifiers.sort((a, b) => MODIFIER_ORDER.indexOf(a) - MODIFIER_ORDER.indexOf(b))
  return [...modifiers, key].join('+')
}

function equivalent(value) {
  const mac = typeof process !== 'undefined' ? process.platform === 'darwin' : /Mac/.test(globalThis.navigator?.platform || '')
  // Resolve platform aliases before ordering; CommandOrControl sorts differently
  // from Command, so string replacement alone misses macOS Shift+Command pairs.
  const parts = value.split('+').map((part) => {
    if (part === 'CommandOrControl') return mac ? 'Command' : 'Ctrl'
    if (mac && part === 'Super') return 'Command'
    return part
  })
  if (parts.length > 1) {
    const key = parts.pop()
    parts.sort((a, b) => MODIFIER_ORDER.indexOf(a) - MODIFIER_ORDER.indexOf(b))
    parts.push(key)
  }
  return parts.join('+')
}

export function normalizeShortcuts(map = {}) {
  const errors = []
  if (!map || typeof map !== 'object' || Array.isArray(map)) {
    const error = new Error('快捷键配置必须为对象')
    error.errors = [{ key: '', code: 'invalid-map', message: error.message }]
    throw error
  }
  for (const key of Object.keys(map)) {
    if (!Object.hasOwn(SHORTCUTS, key) && !Object.hasOwn(LEGACY, key)) errors.push({ key, code: 'unknown-action', message: `未知快捷键动作：${key}` })
  }
  const migrated = { ...SHORTCUTS }
  for (const [oldKey, key] of Object.entries(LEGACY)) {
    if (Object.hasOwn(map, oldKey) && !Object.hasOwn(map, key)) migrated[key] = map[oldKey]
  }
  for (const key of Object.keys(SHORTCUTS)) if (Object.hasOwn(map, key)) migrated[key] = map[key]
  const seen = new Map()
  for (const [key, value] of Object.entries(migrated)) {
    try {
      migrated[key] = accelerator(value)
      const identity = equivalent(migrated[key])
      if (identity && seen.has(identity)) errors.push({ key, code: 'duplicate', message: `${key} 与 ${seen.get(identity)} 使用了相同快捷键：${migrated[key]}` })
      else if (identity) seen.set(identity, key)
    } catch (error) { errors.push({ key, code: 'invalid-accelerator', message: `${key}：${error.message}` }) }
  }
  if (errors.length) {
    const error = new Error(errors.map((item) => item.message).join('\n'))
    error.errors = errors
    throw error
  }
  return migrated
}
