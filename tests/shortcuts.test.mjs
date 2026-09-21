import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import vm from 'node:vm'
import { ref, reactive } from 'vue'

async function moduleApi(path, exportName) {
  let module
  try { module = await import(path) } catch (error) {
    if (error.code !== 'ERR_MODULE_NOT_FOUND') throw error
  }
  assert.equal(typeof module?.[exportName], 'function', `${exportName} API must exist`)
  return module
}

const expectedDefaults = {
  boss: 'Ctrl+D', opacityUp: 'Ctrl+P', opacityDown: 'Ctrl+O',
  allPrev: 'Ctrl+J', allNext: 'Ctrl+K', allScreen: 'Ctrl+L',
  allLike: 'Ctrl+M', bindSoft: 'Ctrl+B', stopOrContinue: 'Ctrl+E'
}

test('shared defaults and migration preserve custom keys and explicit blank', async () => {
  const { SHORTCUTS, normalizeShortcuts } = await moduleApi('../src/shared/shortcuts.mjs', 'normalizeShortcuts')
  assert.deepEqual(SHORTCUTS, expectedDefaults)
  const result = normalizeShortcuts({ scroll: 'Control+X', next: 'Alt+ArrowRight', prev: 'Alt+ArrowLeft', fullscreen: 'Control+F', like: '', boss: '' })
  assert.deepEqual(result, { ...expectedDefaults, boss: '', stopOrContinue: 'Ctrl+X', allNext: 'Alt+Right', allPrev: 'Alt+Left', allScreen: 'Ctrl+F', allLike: '' })
  assert.equal(normalizeShortcuts({ next: 'Alt+N', allNext: 'Ctrl+Q' }).allNext, 'Ctrl+Q')
})

test('accelerators normalize aliases, whitespace and modifier ordering', async () => {
  const { normalizeShortcuts } = await moduleApi('../src/shared/shortcuts.mjs', 'normalizeShortcuts')
  assert.equal(normalizeShortcuts({ boss: ' shift + control + a ' }).boss, 'Ctrl+Shift+A')
  assert.equal(normalizeShortcuts({ boss: 'cmd + arrowup' }).boss, 'Command+Up')
  assert.equal(normalizeShortcuts({ boss: '   ' }).boss, '')
})

test('malformed, duplicate equivalent and unknown accelerators are rejected', async () => {
  const { normalizeShortcuts } = await moduleApi('../src/shared/shortcuts.mjs', 'normalizeShortcuts')
  for (const map of [{ boss: 'Ctrl++Q' }, { boss: 'Ctrl+NotAKey' }, { boss: 'Ctrl' }, { boss: null }, { boss: 'Ctrl+Ctrl+Q' }, { unknown: 'Ctrl+Q' }, { boss: 'Ctrl+Q', allNext: 'Control+q' }, { boss: 'Cmd+Q', allNext: 'Command+Q' }]) {
    assert.throws(() => normalizeShortcuts(map), (error) => Array.isArray(error.errors) && error.errors.length > 0)
  }
})

function electronBoundary() {
  const registered = new Map()
  const conflicts = new Set()
  const exceptions = new Set()
  return {
    registered, conflicts, exceptions,
    register(key, action) {
      if (exceptions.has(key)) throw new Error('native failure')
      if (conflicts.has(key) || registered.has(key)) return false
      registered.set(key, action)
      return true
    },
    unregister(key) { registered.delete(key) }
  }
}

test('manager initializes canonical defaults and dispatches actual action', async () => {
  const { createShortcutManager } = await moduleApi('../src/main/shortcuts.mjs', 'createShortcutManager')
  const electron = electronBoundary()
  const calls = []
  const actions = Object.fromEntries(Object.keys(expectedDefaults).map((name) => [name, () => calls.push(name)]))
  const manager = createShortcutManager(electron, actions)
  assert.equal(manager.initialResult.success, true)
  assert.deepEqual(manager.getCurrent(), expectedDefaults)
  electron.registered.get('Ctrl+E')()
  assert.deepEqual(calls, ['stopOrContinue'])
  assert.equal(manager.apply({ ...expectedDefaults, boss: '' }).success, true)
  assert.equal(electron.registered.has('Ctrl+D'), false)
})

test('failed registration returns conflict and restores prior keys and callbacks', async () => {
  const { createShortcutManager } = await moduleApi('../src/main/shortcuts.mjs', 'createShortcutManager')
  const electron = electronBoundary()
  const actions = Object.fromEntries(Object.keys(expectedDefaults).map((name) => [name, () => name]))
  const manager = createShortcutManager(electron, actions, { boss: 'Alt+D' })
  const before = manager.getCurrent()
  const beforeKeys = [...electron.registered.keys()].sort()
  electron.conflicts.add('Alt+X')
  const result = manager.apply({ boss: 'Alt+Q', allNext: 'Alt+X' })
  assert.equal(result.success, false)
  assert.equal(result.errors[0].code, 'registration-failed')
  assert.deepEqual(result.shortcuts, before)
  assert.deepEqual(manager.getCurrent(), before)
  assert.deepEqual([...electron.registered.keys()].sort(), beforeKeys)
  assert.equal(electron.registered.get('Alt+D')(), 'boss')
  assert.equal(electron.registered.has('Alt+Q'), false)
})

test('native throws and rollback failures are visible, validation leaves bindings intact', async () => {
  const { createShortcutManager } = await moduleApi('../src/main/shortcuts.mjs', 'createShortcutManager')
  const electron = electronBoundary()
  const actions = Object.fromEntries(Object.keys(expectedDefaults).map((name) => [name, () => name]))
  const manager = createShortcutManager(electron, actions)
  assert.equal(manager.apply({ boss: 'Ctrl+Q', allNext: 'Control+Q' }).success, false)
  assert.equal(electron.registered.size, 9)
  electron.exceptions.add('Alt+X')
  let result = manager.apply({ boss: 'Alt+X' })
  assert.match(result.errors[0].message, /native failure/)
  assert.equal(electron.registered.size, 9)
  electron.conflicts.add('Ctrl+D')
  result = manager.apply({ boss: 'Alt+X' })
  assert.equal(result.success, false)
  assert.ok(result.errors.some((error) => error.code === 'rollback-failed'))
  assert.deepEqual(manager.getCurrent(), expectedDefaults)
})

test('settings page saves once and displays failure without a restart-success claim', async () => {
  const source = await readFile(new URL('../src/renderer/src/views/KeywordView.vue', import.meta.url), 'utf8')
  assert.match(source, /from ['"]\.\.\/\.\.\/\.\.\/shared\/shortcuts\.mjs['"]/) 
  assert.doesNotMatch(source, /settingApi\.setSettings/)
  assert.match(source, /result\.success/)
  assert.doesNotMatch(source, /重启后完全生效/)
})

test('shortcut inputs cannot be edited while save is pending', async () => {
  const source = await readFile(new URL('../src/renderer/src/views/KeywordView.vue', import.meta.url), 'utf8')
  assert.match(source, /<input\b[^>]*:disabled="saving"[^>]*\/>/)
})

async function settingsPage(invoke) {
  const { SHORTCUTS, normalizeShortcuts } = await import('../src/shared/shortcuts.mjs')
  const source = await readFile(new URL('../src/renderer/src/views/KeywordView.vue', import.meta.url), 'utf8')
  const script = source.match(/<script setup>([\s\S]*?)<\/script>/)[1].replace(/^import .*$/gm, '')
  const context = vm.createContext({ ref, reactive, SHORTCUTS, normalizeShortcuts, onMounted: (callback) => { context.mount = callback }, window: { ipcRenderer: { invoke } } })
  vm.runInContext(`${script}\nglobalThis.page = { save, reset, items, message, saving }`, context)
  return context
}

test('real settings save uses one IPC transaction and shows conflict messages', async () => {
  const calls = []
  const context = await settingsPage(async (...args) => {
    calls.push(args)
    return { success: false, shortcuts: expectedDefaults, errors: [{ message: '系统快捷键冲突' }] }
  })
  context.page.items.boss = 'Ctrl+Q'
  await context.page.save()
  assert.equal(calls.length, 1)
  assert.equal(calls[0][0], 'set-shortcuts')
  assert.equal(calls[0][1].boss, 'Ctrl+Q')
  assert.match(context.page.message.value, /保存失败.*系统快捷键冲突/)
  assert.equal(context.page.saving.value, false)
})

test('settings reload preserves blank, reset saves defaults and successful save adopts normalized keys', async () => {
  const calls = []
  const context = await settingsPage(async (channel, map) => {
    calls.push(channel)
    if (channel === 'get-shortcuts') return { ...expectedDefaults, boss: '' }
    return { success: true, shortcuts: { ...expectedDefaults, ...map }, errors: [] }
  })
  await context.mount()
  assert.equal(context.page.items.boss, '')
  await context.page.reset()
  assert.equal(context.page.items.boss, 'Ctrl+D')
  assert.deepEqual(calls, ['get-shortcuts', 'set-shortcuts'])
  assert.match(context.page.message.value, /已保存并立即生效/)
})

test('manager owns only its bindings and current configuration is not mutable by callers', async () => {
  const { createShortcutManager } = await moduleApi('../src/main/shortcuts.mjs', 'createShortcutManager')
  const electron = electronBoundary()
  const unrelated = () => 'unrelated'
  electron.register('Alt+F12', unrelated)
  const actions = Object.fromEntries(Object.keys(expectedDefaults).map((name) => [name, () => name]))
  const manager = createShortcutManager(electron, actions)
  const snapshot = manager.getCurrent()
  snapshot.boss = 'Ctrl+X'
  assert.equal(manager.getCurrent().boss, 'Ctrl+D')
  assert.equal(manager.apply({ boss: 'Alt+Q' }).success, true)
  assert.equal(electron.registered.get('Alt+F12'), unrelated)
})

test('equivalent platform modifier aliases cannot appear twice in one accelerator', async () => {
  const { normalizeShortcuts } = await moduleApi('../src/shared/shortcuts.mjs', 'normalizeShortcuts')
  const modifier = process.platform === 'darwin' ? 'Cmd' : 'Ctrl'
  assert.throws(() => normalizeShortcuts({ boss: `CommandOrControl+${modifier}+Q` }), /重复/)
})

test('Electron Enter alias normalizes to Return and rejects equivalent duplicates', async () => {
  const { normalizeShortcuts } = await moduleApi('../src/shared/shortcuts.mjs', 'normalizeShortcuts')
  assert.equal(normalizeShortcuts({ boss: 'Ctrl+Enter' }).boss, 'Ctrl+Return')
  assert.throws(() => normalizeShortcuts({ boss: 'Ctrl+Enter', allNext: 'Control+Return' }), /相同快捷键/)
})

test('macOS platform aliases are compared after substitution and modifier reordering', async () => {
  const source = await readFile(new URL('../src/shared/shortcuts.mjs', import.meta.url), 'utf8')
  const context = vm.createContext({ process: { platform: 'darwin' } })
  vm.runInContext(source.replace(/export /g, '') + '\nglobalThis.normalize = normalizeShortcuts', context)
  assert.throws(() => context.normalize({ boss: 'CommandOrControl+Shift+Q', allNext: 'Cmd+Shift+Q' }), /相同快捷键/)
  assert.throws(() => context.normalize({ boss: 'Super+Shift+Q', allNext: 'Cmd+Shift+Q' }), /相同快捷键/)
})
