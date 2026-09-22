import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { compileScript, parse } from '@vue/compiler-sfc'
import { Window } from 'happy-dom'

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8')

test('approved chat views use optional platform routes while legacy URLs still match', async () => {
  const routes = read('src/renderer/src/router/index.js')
  for (const [route, view] of [['wechat', 'WechatView'], ['dingding', 'DingTalkView'], ['feishu', 'FeishuView']]) {
    assert.match(routes, new RegExp(`path: '/${route}/:platform\\?'[^\\n]+${view}\\.vue`))
  }
})

test('main wires generic sender-scoped handlers, lazy registry, and all-platform launcher', () => {
  const main = read('src/main/index.js')
  assert.match(main, /createChatServiceRegistry/)
  assert.match(main, /createVideoChatRuntime/)
  for (const channel of ['video-chat:get-context', 'video-chat:get', 'video-chat:save', 'video-chat:state', 'video-chat:close']) {
    assert.match(main, new RegExp(`handle\\('${channel.replace(':', '\\:')}'`))
  }
  assert.match(main, /openChat:\s*\(platform,skin\)=>openVideoChat\(platform,skin\)/)
  assert.doesNotMatch(main, /CHAT_WINDOW_TO_PROFILE\s*=/)
  assert.doesNotMatch(main, /let\s+(chatService|dingtalkService|feishuService)\s*=/)
})

test('preload exposes the generic chat bridge and retains all legacy bridges', () => {
  const preload = read('src/preload/index.js')
  assert.match(preload, /exposeInMainWorld\('videoChatModeControl'/)
  for (const bridge of ['chatModeControl', 'dingtalkModeControl', 'feishuModeControl']) {
    assert.match(preload, new RegExp(`exposeInMainWorld\\('${bridge}'`))
  }
})

test('shared player requires and uses immutable platform context', async () => {
  const projectRoot=resolve(dirname(fileURLToPath(import.meta.url)),'..')
  const componentPath=resolve(projectRoot,'src/renderer/src/features/chat/ChatPlayer.vue')
  const cacheDirectory=resolve(projectRoot,'node_modules/.cache/moyu-tests')
  const compiledPath=resolve(cacheDirectory,`ChatPlayer-${process.pid}-${Date.now()}.mjs`)
  const window=new Window({url:'http://localhost/'})
  const previous={}
  let wrapper
  class ResizeObserver{observe(){} disconnect(){}}
  for(const [name,value] of Object.entries({window,document:window.document,navigator:window.navigator,Node:window.Node,Element:window.Element,HTMLElement:window.HTMLElement,SVGElement:window.SVGElement,Event:window.Event,CustomEvent:window.CustomEvent,MutationObserver:window.MutationObserver,ResizeObserver,getComputedStyle:window.getComputedStyle.bind(window)})){
    previous[name]=Object.getOwnPropertyDescriptor(globalThis,name)
    Object.defineProperty(globalThis,name,{configurable:true,writable:true,value})
  }
  try{
    const source=readFileSync(componentPath,'utf8')
    const {descriptor,errors}=parse(source,{filename:componentPath})
    assert.deepEqual(errors,[])
    const compiled=compileScript(descriptor,{id:'chat-player-test',inlineTemplate:true,templateOptions:{compilerOptions:{isCustomElement:tag=>tag==='webview'}}})
    mkdirSync(cacheDirectory,{recursive:true})
    const content=compiled.content
      .replace(/from ['"]\.\.\/\.\.\/\.\.\/\.\.\/shared\/chat-state\.mjs['"]/,`from '${pathToFileURL(resolve(projectRoot,'src/shared/chat-state.mjs')).href}'`)
      .replace(/from ['"]\.\/player-scripts\.mjs['"]/,`from '${pathToFileURL(resolve(projectRoot,'src/renderer/src/features/chat/player-scripts.mjs')).href}'`)
      .replace(/from ['"]\.\/navigation\.mjs['"]/,`from '${pathToFileURL(resolve(projectRoot,'src/renderer/src/features/chat/navigation.mjs')).href}'`)
      .replace(/import landscapeGif from ['"][^'"]+['"]/,"const landscapeGif='landscape.gif'")
      .replace(/import portraitGif from ['"][^'"]+['"]/,"const portraitGif='portrait.gif'")
    writeFileSync(compiledPath,content,'utf8')
    const [{mount},{nextTick,defineComponent,h,ref},componentModule]=await Promise.all([
      import('@vue/test-utils'),
      import('vue'),
      import(`${pathToFileURL(compiledPath).href}?test=${Date.now()}`)
    ])
    const Player=componentModule.default
    for(const prop of ['platform','label','partition'])assert.equal(Player.props[prop].required,true,`${prop} must be required`)
    const WebviewStub=defineComponent({inheritAttrs:false,setup(_,context){
      const element=ref(null)
      context.expose({
        addEventListener:(...args)=>element.value.addEventListener(...args),
        removeEventListener:(...args)=>element.value.removeEventListener(...args),
        getURL:()=>element.value.getAttribute('src'),loadURL:async value=>element.value.setAttribute('src',value),
        reload:()=>{},stop:()=>{},setZoomFactor:()=>{},executeJavaScript:()=>Promise.resolve()
      })
      return()=>h('div',{...context.attrs,ref:element,'data-webview':''})
    }})
    wrapper=mount(Player,{attachTo:document.body,global:{components:{webview:WebviewStub}},props:{platform:'bilibili',label:'B站',partition:'persist:moyu-chat-bilibili-wechat',message:{address:'https://www.bilibili.com/video/BV1'},settings:{orientation:'landscape',scale:140,mask:false},covered:false,active:true}})
    const webview=wrapper.element.querySelector('[data-webview]')
    assert.equal(webview.getAttribute('src'),'https://www.bilibili.com/video/BV1')
    assert.equal(webview.getAttribute('partition'),'persist:moyu-chat-bilibili-wechat')
    assert.match(wrapper.text(),/正在加载B站网页/)
    webview.dispatchEvent(new window.Event('render-process-gone'));await nextTick()
    assert.match(wrapper.text(),/B站网页进程已退出，请重试/)
    await wrapper.setProps({message:{address:'https://www.huya.com/1'}});await nextTick()
    assert.match(wrapper.text(),/B站/)
  }finally{
    wrapper?.unmount()
    window.close()
    if(existsSync(compiledPath))rmSync(compiledPath)
    for(const [name,descriptor]of Object.entries(previous))descriptor?Object.defineProperty(globalThis,name,descriptor):delete globalThis[name]
  }
})
