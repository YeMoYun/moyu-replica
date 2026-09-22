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

test('renderer runtime returns a frozen canonical platform context', async () => {
  const {loadChatPlatform}=await import('../src/renderer/src/features/chat/platform-runtime.mjs')
  let calls=0
  const received={
    platform:'huya',
    skin:'wechat',
    partition:'persist:moyu-chat-huya-wechat',
    windowKey:'forged-window',
    route:'/forged-route'
  }
  const value=await loadChatPlatform({getContext:async()=>{calls++;return received}},'wechat')

  assert.equal(calls,1)
  assert.equal(value.platform,'huya')
  assert.equal(value.skin,'wechat')
  assert.equal(value.partition,'persist:moyu-chat-huya-wechat')
  assert.equal(value.windowKey,'chat-huya-wechat')
  assert.equal(value.route,'/wechat/huya')
  assert.equal(value.definition.label,'虎牙')
  assert.equal(Object.isFrozen(value),true)
  assert.throws(()=>{value.platform='douyin'},TypeError)
})

test('renderer runtime strictly rejects mismatched skin and partition', async () => {
  const {loadChatPlatform}=await import('../src/renderer/src/features/chat/platform-runtime.mjs')
  await assert.rejects(
    loadChatPlatform({getContext:async()=>({platform:'huya',skin:'feishu',partition:'persist:moyu-chat-huya-feishu'})},'wechat'),
    /界面身份不匹配/
  )
  await assert.rejects(
    loadChatPlatform({getContext:async()=>({platform:'huya',skin:'wechat',partition:'persist:moyu-chat-huya-feishu'})},'wechat'),
    /会话分区无效/
  )
})

test('renderer runtime rejects unknown and inherited platform identities', async () => {
  const {loadChatPlatform}=await import('../src/renderer/src/features/chat/platform-runtime.mjs')
  await assert.rejects(
    loadChatPlatform({getContext:async()=>({platform:'__proto__',skin:'wechat',partition:'persist:moyu-chat-huya-wechat'})},'wechat'),
    /视频平台/
  )
  const inherited=Object.create({platform:'huya',skin:'wechat',partition:'persist:moyu-chat-huya-wechat'})
  await assert.rejects(loadChatPlatform({getContext:async()=>inherited},'wechat'),/视频平台/)
})

test('renderer runtime propagates getContext rejection unchanged', async () => {
  const {loadChatPlatform}=await import('../src/renderer/src/features/chat/platform-runtime.mjs')
  const failure=new Error('bridge unavailable')
  await assert.rejects(loadChatPlatform({getContext:async()=>{throw failure}},'wechat'),error=>error===failure)
})

test('shared player requires and uses immutable platform context', async () => {
  const projectRoot=resolve(dirname(fileURLToPath(import.meta.url)),'..')
  const componentPath=resolve(projectRoot,'src/renderer/src/features/chat/ChatPlayer.vue')
  const cacheDirectory=resolve(projectRoot,'node_modules/.cache/moyu-tests')
  const compiledPath=resolve(cacheDirectory,`ChatPlayer-${process.pid}-${Date.now()}.mjs`)
  const window=new Window({url:'http://localhost/'})
  const previous={}
  const loads=[],errors=[],added=[],removed=[],activeListeners=new Map()
  let wrapper,currentUrl='https://www.bilibili.com/video/BV1',disconnects=0
  class ResizeObserver{observe(){} disconnect(){disconnects++}}
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
        addEventListener:(name,handler)=>{added.push([name,handler]);activeListeners.set(name,handler)},
        removeEventListener:(name,handler)=>{removed.push([name,handler]);if(activeListeners.get(name)===handler)activeListeners.delete(name)},
        getURL:()=>currentUrl,loadURL:async value=>{loads.push(value);currentUrl=value},
        reload:()=>{},stop:()=>{},setZoomFactor:()=>{},executeJavaScript:()=>Promise.resolve()
      })
      return()=>h('div',{...context.attrs,ref:element,'data-webview':''})
    }})
    wrapper=mount(Player,{attachTo:document.body,global:{components:{webview:WebviewStub}},props:{platform:'bilibili',label:'B站',partition:'persist:moyu-chat-bilibili-wechat',message:{address:'https://www.bilibili.com/video/BV1'},settings:{orientation:'landscape',scale:140,mask:false},covered:false,active:true,onError:value=>errors.push(value)}})
    const webview=wrapper.element.querySelector('[data-webview]')
    assert.equal(webview.getAttribute('src'),'https://www.bilibili.com/video/BV1')
    assert.equal(webview.getAttribute('partition'),'persist:moyu-chat-bilibili-wechat')
    assert.match(wrapper.text(),/正在加载B站网页/)
    activeListeners.get('dom-ready')();await nextTick()
    await wrapper.setProps({message:{address:'https://www.bilibili.com/video/BV2'}});await nextTick()
    assert.deepEqual(loads,['https://www.bilibili.com/video/BV2'])
    await wrapper.setProps({message:{address:'https://www.huya.com/1'}});await nextTick()
    assert.deepEqual(loads,['https://www.bilibili.com/video/BV2'])
    assert.match(errors.at(-1),/B站/)
    const stale=added.find(([name])=>name==='render-process-gone')[1]
    const errorCount=errors.length
    wrapper.unmount();wrapper=null
    assert.equal(disconnects,1)
    assert.deepEqual(removed,added)
    assert.equal(activeListeners.size,0)
    assert.doesNotThrow(()=>stale())
    assert.equal(errors.length,errorCount)
  }finally{
    wrapper?.unmount()
    window.close()
    if(existsSync(compiledPath))rmSync(compiledPath)
    for(const [name,descriptor]of Object.entries(previous))descriptor?Object.defineProperty(globalThis,name,descriptor):delete globalThis[name]
  }
})
