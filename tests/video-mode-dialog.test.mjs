import test, { after, afterEach, before, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { compileScript, parse } from '@vue/compiler-sfc'
import { Window } from 'happy-dom'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const componentPath = resolve(
  projectRoot,
  'src/renderer/src/components/VideoModeDialog.vue'
)
const cacheDirectory = resolve(projectRoot, 'node_modules/.cache/moyu-tests')
const compiledPath = resolve(cacheDirectory, `VideoModeDialog-${process.pid}.mjs`)
const require = createRequire(import.meta.url)

let Dialog
let mount
let nextTick
let window
const activeWrappers = new Set()

const installDom = () => {
  window = new Window({ url: 'http://localhost/' })
  const globals = {
    window,
    document: window.document,
    navigator: window.navigator,
    Node: window.Node,
    Element: window.Element,
    HTMLElement: window.HTMLElement,
    SVGElement: window.SVGElement,
    Event: window.Event,
    MouseEvent: window.MouseEvent,
    KeyboardEvent: window.KeyboardEvent,
    MutationObserver: window.MutationObserver,
    getComputedStyle: window.getComputedStyle.bind(window)
  }
  for (const [name, value] of Object.entries(globals)) {
    Object.defineProperty(globalThis, name, {
      configurable: true,
      writable: true,
      value
    })
  }
}

const compileComponent = async () => {
  const source = readFileSync(componentPath, 'utf8')
  const { descriptor, errors } = parse(source, { filename: componentPath })
  assert.deepEqual(errors, [])
  const compiled = compileScript(descriptor, {
    id: 'video-mode-dialog-test',
    inlineTemplate: true
  })
  mkdirSync(cacheDirectory, { recursive: true })
  writeFileSync(compiledPath, compiled.content, 'utf8')
  return (await import(`${pathToFileURL(compiledPath).href}?test=${Date.now()}`)).default
}

const press = (element, key, shiftKey = false) => {
  element.dispatchEvent(
    new window.KeyboardEvent('keydown', {
      key,
      shiftKey,
      bubbles: true,
      cancelable: true
    })
  )
}

const mountDialog = async () => {
  let closeCount = 0
  const opener = document.createElement('button')
  opener.textContent = '打开模式选择'
  document.body.append(opener)
  opener.focus()

  const wrapper = mount(Dialog, {
    props: {
      platform: { key: 'douyin', label: '抖音' },
      onClose: () => {
        closeCount += 1
      }
    },
    attachTo: document.body
  })
  activeWrappers.add(wrapper)
  await nextTick()
  await nextTick()
  return { opener, wrapper, closeCount: () => closeCount }
}

before(async () => {
  installDom()
  Dialog = await compileComponent()
  ;({ mount } = await import('@vue/test-utils'))
  ;({ nextTick } = await import('vue'))
})

beforeEach(() => {
  document.body.innerHTML = ''
})

afterEach(() => {
  for (const wrapper of activeWrappers) wrapper.unmount()
  activeWrappers.clear()
})

after(() => {
  window?.close()
  if (existsSync(compiledPath)) rmSync(compiledPath)
})

test('platform prop accepts only a non-empty label', () => {
  const validator = Dialog.props.platform.validator
  assert.equal(validator({ key: 'douyin', label: '抖音' }), true)
  assert.equal(validator({ key: 'douyin', label: '   ' }), false)
  assert.equal(validator({ key: 'douyin' }), false)
})

test('mount focuses an interactive dialog control', async () => {
  const { wrapper } = await mountDialog()
  const allowed = [
    wrapper.get('[aria-label="关闭模式选择"]').element,
    wrapper.get('.mode-button').element
  ]
  assert.ok(allowed.includes(document.activeElement))
  wrapper.unmount()
})

test('Tab and Shift+Tab keep focus inside the dialog', async () => {
  const { wrapper } = await mountDialog()
  const buttons = wrapper.findAll('button').map((item) => item.element)

  buttons.at(-1).focus()
  press(buttons.at(-1), 'Tab')
  assert.ok(document.activeElement === buttons[0])

  buttons[0].focus()
  press(buttons[0], 'Tab', true)
  assert.ok(document.activeElement === buttons.at(-1))
  wrapper.unmount()
})

test('Escape emits close once and stops emitting after unmount', async () => {
  const { closeCount, wrapper } = await mountDialog()
  press(wrapper.get('.mode-button').element, 'Escape')
  assert.equal(closeCount(), 1)

  wrapper.unmount()
  press(document.body, 'Escape')
  assert.equal(closeCount(), 1)
})

test('backdrop click closes while dialog content click does not', async () => {
  const { wrapper } = await mountDialog()
  await wrapper.get('.mode-dialog').trigger('click')
  assert.equal(wrapper.emitted('close'), undefined)

  await wrapper.get('.mode-scrim').trigger('click')
  assert.equal(wrapper.emitted('close')?.length, 1)
  wrapper.unmount()
})

test('unmount restores focus to the opener', async () => {
  const { opener, wrapper } = await mountDialog()
  assert.notEqual(document.activeElement, opener)
  wrapper.unmount()
  assert.equal(document.activeElement, opener)
})

test('dialog styles keep the five modes usable in narrow and short windows', () => {
  const source = readFileSync(componentPath, 'utf8')
  assert.match(source, /\.mode-scrim\s*\{[^}]*overflow-y:\s*auto/s)
  assert.match(source, /\.mode-dialog\s*\{[^}]*max-height:/s)
  assert.match(source, /\.mode-dialog\s*\{[^}]*overflow-y:\s*auto/s)
  assert.match(source, /@media\s*\(max-width:/)
  assert.match(source, /@media\s*\(max-height:/)
  assert.match(source, /grid-template-columns:\s*1fr/)
  assert.match(source, /\.feishu\s*\{[^}]*grid-column:\s*1\s*\/\s*-1/s)
})
