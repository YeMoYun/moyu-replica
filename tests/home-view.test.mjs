import test, { after, afterEach, before, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { compileScript, parse } from '@vue/compiler-sfc'
import { Window } from 'happy-dom'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const componentPath = resolve(projectRoot, 'src/renderer/src/views/HomeView.vue')
const platformPath = resolve(projectRoot, 'src/shared/video-platforms.mjs')
const cacheDirectory = resolve(projectRoot, 'node_modules/.cache/moyu-tests')
const compiledPath = resolve(cacheDirectory, `HomeView-${process.pid}.mjs`)
const dialogStubPath = resolve(cacheDirectory, `HomeVideoModeDialog-${process.pid}.mjs`)

let HomeView
let WindowCtor
let createMemoryHistory
let createRouter
let flushPromises
let h
let mount
let nextTick
let window
let alerts
const activeWrappers = new Set()

const installDom = () => {
  window = new Window({ url: 'http://localhost/' })
  const globals = {
    window,
    document: window.document,
    navigator: window.navigator,
    history: window.history,
    location: window.location,
    Node: window.Node,
    Element: window.Element,
    HTMLElement: window.HTMLElement,
    SVGElement: window.SVGElement,
    Event: window.Event,
    MouseEvent: window.MouseEvent,
    MutationObserver: window.MutationObserver,
    getComputedStyle: window.getComputedStyle.bind(window)
  }
  for (const [name, value] of Object.entries(globals)) {
    Object.defineProperty(globalThis, name, { configurable: true, writable: true, value })
  }
}

const compileComponent = async () => {
  const source = readFileSync(componentPath, 'utf8')
  const { descriptor, errors } = parse(source, { filename: componentPath })
  assert.deepEqual(errors, [])
  const compiled = compileScript(descriptor, { id: 'home-view-test', inlineTemplate: true })
  const dialogUrl = pathToFileURL(dialogStubPath).href
  const platformUrl = pathToFileURL(platformPath).href
  const content = compiled.content
    .replace("import VideoModeDialog from '../components/VideoModeDialog.vue'", `import VideoModeDialog from '${dialogUrl}'`)
    .replace("from '../../../shared/video-platforms.mjs'", `from '${platformUrl}'`)
  mkdirSync(cacheDirectory, { recursive: true })
  writeFileSync(
    dialogStubPath,
    `import {h} from 'vue'
const modes=[['ad','广告模式'],['opacity','透明度模式'],['wechat','微信模式'],['dingtalk','钉钉模式'],['feishu','飞书模式']]
export default {props:{platform:Object},emits:['close','select'],setup(props,{emit}){return()=>h('section',{role:'dialog'},[
h('span',{},'选择'+props.platform.label+'模式'),
h('button',{'aria-label':'关闭模式选择',onClick:()=>emit('close')},'×'),
...modes.map(([key,label])=>h('button',{class:'mode-button',onClick:()=>emit('select',key)},label))
])}}`,
    'utf8'
  )
  writeFileSync(compiledPath, content, 'utf8')
  return (await import(`${pathToFileURL(compiledPath).href}?test=${Date.now()}`)).default
}

const buttonWithText = (wrapper, text) => {
  const button = wrapper.findAll('button').find((item) => item.text().trim() === text)
  assert.ok(button, `missing button: ${text}`)
  return button
}

const mountHome = async ({
  homeElectronAPI = {},
  localVideoAPI,
  videoModeControl = { open: async () => {}, openRecentChat: async () => {} },
  windowControl = { onError: () => () => {} },
  invoke = async () => ({ success: true, errors: [] })
} = {}) => {
  window.homeElectronAPI = homeElectronAPI
  window.localVideoAPI = localVideoAPI
  window.videoModeControl = videoModeControl
  window.windowControl = windowControl
  window.ipcRenderer = { invoke }
  window.authApi = { clearAllInfo: async () => {} }
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: { render: () => h('div') } }]
  })
  await router.push('/')
  await router.isReady()
  const wrapper = mount(HomeView, { global: { plugins: [router] }, attachTo: document.body })
  activeWrappers.add(wrapper)
  await flushPromises()
  return wrapper
}

before(async () => {
  installDom()
  HomeView = await compileComponent()
  ;({ flushPromises, mount } = await import('@vue/test-utils'))
  ;({ h, nextTick } = await import('vue'))
  ;({ createMemoryHistory, createRouter } = await import('vue-router'))
  WindowCtor = Window
})

beforeEach(() => {
  document.body.innerHTML = ''
  alerts = []
  globalThis.alert = (message) => alerts.push(message)
})

afterEach(() => {
  for (const wrapper of activeWrappers) wrapper.unmount()
  activeWrappers.clear()
})

after(() => {
  window?.close()
  for (const path of [compiledPath, dialogStubPath]) if (existsSync(path)) rmSync(path)
})

test('all five platform buttons dispatch opacity with the platform key in order', async () => {
  const calls = []
  const wrapper = await mountHome({
    videoModeControl: {
      open: async (...args) => calls.push(args),
      openRecentChat: async () => {}
    }
  })
  const platforms = [
    ['抖音', 'douyin'],
    ['B站', 'bilibili'],
    ['虎牙', 'huya'],
    ['斗鱼', 'douyu'],
    ['快手', 'kuaishou']
  ]
  for (const [label, key] of platforms) {
    await buttonWithText(wrapper, `${label}模式`).trigger('click')
    await nextTick()
    assert.match(wrapper.get('[role="dialog"]').text(), new RegExp(`选择${label}模式`))
    await buttonWithText(wrapper, '透明度模式').trigger('click')
    await flushPromises()
    assert.deepEqual(calls.at(-1), [key, 'opacity'])
  }
  assert.equal(calls.length, 5)
})

test('closing the chooser does not dispatch and rejected mode opens show a readable error', async () => {
  const calls = []
  const wrapper = await mountHome({
    videoModeControl: {
      open: async (...args) => {
        calls.push(args)
        throw new Error('主进程拒绝')
      },
      openRecentChat: async () => {}
    }
  })
  await buttonWithText(wrapper, '抖音模式').trigger('click')
  await wrapper.get('[aria-label="关闭模式选择"]').trigger('click')
  assert.equal(calls.length, 0)
  assert.equal(wrapper.find('[role="dialog"]').exists(), false)

  await buttonWithText(wrapper, '虎牙模式').trigger('click')
  await buttonWithText(wrapper, '透明度模式').trigger('click')
  await flushPromises()
  assert.deepEqual(calls, [['huya', 'opacity']])
  assert.match(wrapper.get('[role="alert"]').text(), /打开虎牙透明度模式失败：主进程拒绝/)
})

test('ordinary, local-video and cache actions expose missing or rejected bridges', async () => {
  const wrapper = await mountHome({
    homeElectronAPI: {
      createWeRead: async () => {
        throw new Error('阅读窗口拒绝')
      }
    },
    invoke: async (channel) => {
      if (channel === 'get-shortcut-status') return { success: true, errors: [] }
      throw new Error('设置存储失败')
    }
  })
  await buttonWithText(wrapper, '微信读书').trigger('click')
  await flushPromises()
  assert.match(wrapper.get('[role="alert"]').text(), /打开微信读书失败：阅读窗口拒绝/)

  await buttonWithText(wrapper, '本地视频播放').trigger('click')
  await flushPromises()
  assert.match(wrapper.get('[role="alert"]').text(), /打开本地视频失败：.*接口不可用/)

  await buttonWithText(wrapper, '清除缓存').trigger('click')
  await flushPromises()
  assert.match(wrapper.get('[role="alert"]').text(), /清除缓存失败：设置存储失败/)
  assert.deepEqual(alerts, [])
})

test('shortcut failures survive chooser actions even when windowControl is incomplete', async () => {
  let shortcutChecks = 0
  const wrapper = await mountHome({
    windowControl: {},
    invoke: async (channel) => {
      if (channel === 'get-shortcut-status') {
        shortcutChecks += 1
        return { success: false, errors: [{ message: 'Ctrl+D 已被占用' }] }
      }
      return true
    }
  })
  assert.equal(shortcutChecks, 1)
  assert.match(wrapper.get('[role="alert"]').text(), /Ctrl\+D 已被占用/)
  await buttonWithText(wrapper, '抖音模式').trigger('click')
  await nextTick()
  assert.match(wrapper.get('[role="alert"]').text(), /Ctrl\+D 已被占用/)
  await wrapper.get('[aria-label="关闭模式选择"]').trigger('click')
  await buttonWithText(wrapper, '本地视频播放').trigger('click')
  await flushPromises()
  const combined = wrapper.get('[role="alert"]').text()
  assert.match(combined, /Ctrl\+D 已被占用/)
  assert.match(combined, /打开本地视频失败/)
})

test('recent chat uses the guarded bridge and reports its action context', async () => {
  const wrapper = await mountHome({ videoModeControl: { open: async () => {} } })
  await buttonWithText(wrapper, '微信模式').trigger('click')
  await flushPromises()
  assert.match(wrapper.get('[role="alert"]').text(), /打开微信模式失败：伪装模式接口不可用/)
})

test('a stale rejection cannot replace the state from a newer action', async () => {
  let rejectOld
  const oldRequest = new Promise((_resolve, reject) => {
    rejectOld = reject
  })
  const wrapper = await mountHome({
    videoModeControl: { open: () => oldRequest, openRecentChat: async () => {} }
  })
  await buttonWithText(wrapper, '抖音模式').trigger('click')
  await buttonWithText(wrapper, '透明度模式').trigger('click')
  await buttonWithText(wrapper, '操作指南').trigger('click')
  assert.match(wrapper.get('[role="alert"]').text(), /操作指南入口已保留/)
  rejectOld(new Error('旧请求失败'))
  await flushPromises()
  assert.match(wrapper.get('[role="alert"]').text(), /操作指南入口已保留/)
  assert.doesNotMatch(wrapper.get('[role="alert"]').text(), /旧请求失败/)
})

test('phone mirroring entry uses the restricted home bridge', async () => {
  const calls = []
  const wrapper = await mountHome({
    homeElectronAPI: {
      openPhoneMirror: async () => {
        calls.push('open')
        return { status: 'started' }
      }
    }
  })

  assert.match(wrapper.text(), /游戏与投屏/)
  await buttonWithText(wrapper, '手机投屏模式').trigger('click')
  await flushPromises()
  assert.deepEqual(calls, ['open'])
})

test('phone mirroring startup errors appear in the existing alert', async () => {
  const wrapper = await mountHome({
    homeElectronAPI: {
      openPhoneMirror: async () => {
        throw new Error('手机投屏组件不存在')
      }
    }
  })

  await buttonWithText(wrapper, '手机投屏模式').trigger('click')
  await flushPromises()
  assert.match(wrapper.get('[role="alert"]').text(), /手机投屏组件不存在/)
})

test('narrow layout places logout outside the centered title flow', () => {
  assert.equal(WindowCtor, Window)
  const source = readFileSync(componentPath, 'utf8')
  assert.match(source, /@media\s*\(max-width:\s*620px\)[\s\S]*?\.top\s*\{[^}]*flex-direction:\s*column/s)
  assert.match(source, /@media\s*\(max-width:\s*620px\)[\s\S]*?\.logout\s*\{[^}]*position:\s*static/s)
})
