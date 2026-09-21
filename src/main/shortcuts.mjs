import { SHORTCUTS, normalizeShortcuts } from '../shared/shortcuts.mjs'

// Own only these bindings: do not unregister shortcuts owned by other features.
export function createShortcutManager(globalShortcut, actions, initialMap = SHORTCUTS) {
  let current = {}
  const bindings = new Map()

  function clear(errors, code) {
    for (const [key, accelerator] of bindings) {
      try { globalShortcut.unregister(accelerator); bindings.delete(key) }
      catch (error) { errors.push({ key, code, message: `无法注销 ${accelerator}：${error.message}` }) }
    }
  }

  function register(map, errors, code) {
    for (const [key, accelerator] of Object.entries(map)) {
      if (!accelerator) continue
      try {
        if (globalShortcut.register(accelerator, actions[key]) !== true) throw new Error('快捷键已被占用或系统拒绝注册')
        bindings.set(key, accelerator)
      } catch (error) {
        errors.push({ key, code, message: `${key} (${accelerator})：${error.message}` })
        if (code === 'registration-failed') break
      }
    }
  }

  function apply(map) {
    const errors = []
    let next
    try { next = normalizeShortcuts(map) }
    catch (error) { return { success: false, shortcuts: { ...current }, errors: error.errors } }
    for (const [key, accelerator] of Object.entries(next)) {
      if (accelerator && typeof actions[key] !== 'function') errors.push({ key, code: 'missing-action', message: `快捷键动作不可用：${key}` })
    }
    if (errors.length) return { success: false, shortcuts: { ...current }, errors }
    clear(errors, 'unregister-failed')
    if (!errors.length) register(next, errors, 'registration-failed')
    if (errors.length) {
      clear(errors, 'rollback-failed')
      register(current, errors, 'rollback-failed')
      return { success: false, shortcuts: { ...current }, errors }
    }
    current = next
    return { success: true, shortcuts: { ...current }, errors: [] }
  }

  const initialResult = apply(initialMap)
  return { apply, getCurrent: () => ({ ...current }), initialResult }
}
