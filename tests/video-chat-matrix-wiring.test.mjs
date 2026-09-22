import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { compileScript, parse } from '@vue/compiler-sfc'
import { Window } from 'happy-dom'

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8')

async function compileChatView(projectRoot,file) {
  const componentPath=resolve(projectRoot,'src/renderer/src/views',file)
  const cacheDirectory=resolve(projectRoot,'node_modules/.cache/moyu-tests')
  const compiledPath=resolve(cacheDirectory,`${file.replace('.vue','')}-${process.pid}-${Date.now()}.mjs`)
  let source=readFileSync(componentPath,'utf8')
  source=source
    .replace(/import ChatIcon from[^\n;]+;?/,"const ChatIcon={setup(){return()=>null}};")
    .replace(/import FeishuIcon from[^\n;]+;?/,"const FeishuIcon={setup(){return()=>null}};")
    .replace(/import ChatPlayer from[^\n;]+;?/,"const ChatPlayer={props:['platform','label','partition','message','settings','covered','active'],setup(props){globalThis.__moyuChatPlayerProps.push({platform:props.platform,label:props.label,partition:props.partition,message:props.message});return()=>null}};")
    .replace(/import ['"][^'"]+\/(wechat|dingtalk|feishu)\.css['"];?/,'')
    .replace(/const avatarFiles=import\.meta\.glob\([^\r\n]+\)\r?\nconst avatars=[^\r\n]+/,"const avatars=Object.fromEntries(CHAT_AVATARS.map(key=>[key,'avatar:'+key])),avatarKeys=CHAT_AVATARS")
  const {descriptor,errors}=parse(source,{filename:componentPath})
  assert.deepEqual(errors,[])
  const compiled=compileScript(descriptor,{id:`chat-view-${file}`,inlineTemplate:true})
  const content=compiled.content
    .replace(/from ['"]\.\.\/\.\.\/\.\.\/shared\/chat-state\.mjs['"]/,`from '${pathToFileURL(resolve(projectRoot,'src/shared/chat-state.mjs')).href}'`)
    .replace(/from ['"]\.\.\/features\/chat\/controller\.mjs['"]/,`from '${pathToFileURL(resolve(projectRoot,'src/renderer/src/features/chat/controller.mjs')).href}'`)
    .replace(/from ['"]\.\.\/features\/chat\/platform-runtime\.mjs['"]/,`from '${pathToFileURL(resolve(projectRoot,'src/renderer/src/features/chat/platform-runtime.mjs')).href}'`)
  mkdirSync(cacheDirectory,{recursive:true})
  writeFileSync(compiledPath,content,'utf8')
  return compiledPath
}

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

test('approved chat views use the generic bridge and immutable dynamic player context',()=>{
  for(const file of ['WechatView.vue','DingTalkView.vue','FeishuView.vue']){
    const source=read('src/renderer/src/views/'+file)
    assert.match(source,/window\.videoChatModeControl/)
    assert.match(source,/loadChatPlatform/)
    assert.match(source,/:platform="platform\.platform"/)
    assert.match(source,/:partition="platform\.partition"/)
    assert.match(source,/:label="platform\.definition\.label"/)
    assert.match(source,/v-if="state && platform"/)
    assert.doesNotMatch(source,/raw\?\.settings\?\.site/)
    assert.doesNotMatch(source,/window\.(chatModeControl|dingtalkModeControl|feishuModeControl)/)
    assert.doesNotMatch(source,/插入抖音播放器|抖音页面地址|本批已接入抖音|persist:moyu-chat-(wechat|dingtalk|feishu)/)
  }
})

test('all three skins wait for trusted B站 context and never subscribe after failed or abandoned startup',async()=>{
  const projectRoot=resolve(dirname(fileURLToPath(import.meta.url)),'..')
  const window=new Window({url:'http://localhost/'})
  const previous={}
  const compiled=[]
  for(const [name,value] of Object.entries({window,document:window.document,navigator:window.navigator,Node:window.Node,Element:window.Element,HTMLElement:window.HTMLElement,SVGElement:window.SVGElement,Event:window.Event,CustomEvent:window.CustomEvent,MutationObserver:window.MutationObserver,getComputedStyle:window.getComputedStyle.bind(window)})){
    previous[name]=Object.getOwnPropertyDescriptor(globalThis,name)
    Object.defineProperty(globalThis,name,{configurable:true,writable:true,value})
  }
  try{
    const [{mount},{nextTick},chatState]=await Promise.all([import('@vue/test-utils'),import('vue'),import('../src/shared/chat-state.mjs')])
    for(const [file,skin,partition] of [
      ['WechatView.vue','wechat','persist:moyu-chat-bilibili-wechat'],
      ['DingTalkView.vue','dingtalk','persist:moyu-chat-bilibili-dingtalk'],
      ['FeishuView.vue','feishu','persist:moyu-chat-bilibili-feishu']
    ]){
      const state=chatState.createChatState(skin,'bilibili');chatState.insertPlayer(state)
      const early=chatState.createChatState(skin,'huya');early.revision=99;chatState.insertPlayer(early)
      let resolveContext,saves=0
      const context=new Promise(resolve=>{resolveContext=resolve})
      const stateSubscribers=[]
      const api={
        getContext:()=>context,
        getRuntime:async()=>({covered:false}),get:async()=>structuredClone(state),
        save:async candidate=>{saves++;return {...structuredClone(candidate),revision:candidate.revision+1}},
        close:async()=>{},onState:handler=>{stateSubscribers.push(handler);return()=>{}},onBoss:()=>()=>{},onError:()=>()=>{}
      }
      window.videoChatModeControl=api
      globalThis.__moyuChatPlayerProps=[]
      const compiledPath=await compileChatView(projectRoot,file);compiled.push(compiledPath)
      const View=(await import(`${pathToFileURL(compiledPath).href}?test=${Date.now()}`)).default
      const wrapper=mount(View,{attachTo:document.body})
      await new Promise(resolve=>setTimeout(resolve,0));await nextTick()
      assert.equal(stateSubscribers.length,0,`${skin} must not subscribe before trusted context`)
      stateSubscribers.forEach(handler=>handler(structuredClone(early)))
      resolveContext({platform:'bilibili',skin,partition})
      for(let attempt=0;attempt<20&&!wrapper.attributes('data-chat-ready');attempt++){await new Promise(resolve=>setTimeout(resolve,0));await nextTick()}
      assert.equal(wrapper.attributes('data-chat-ready'),'true',`${skin} should load`)
      assert.equal(stateSubscribers.length,1,`${skin} subscribes exactly once after context`)
      assert.deepEqual(globalThis.__moyuChatPlayerProps.at(-1),{platform:'bilibili',label:'B站',partition,message:state.conversations.find(c=>c.id===state.selectedId).messages.at(-1)})
      if(!wrapper.find('[data-action="settings"]').exists()){await wrapper.find('[data-action="more"]').trigger('click');await nextTick()}
      const settings=wrapper.find('[data-action="settings"]');assert.equal(settings.exists(),true,`${skin} settings trigger`);await settings.trigger('click');await nextTick()
      const input=wrapper.find('input[aria-label="B站页面地址"]');assert.equal(input.exists(),true,`${skin} dynamic address label`)
      await input.setValue('https://www.huya.com/123')
      await wrapper.find('[data-action="apply-address"]').trigger('click');await nextTick()
      assert.equal(saves,0,`${skin} must reject cross-site address before save`)
      assert.match(wrapper.text(),/仅支持无凭据的B站官方/)
      wrapper.unmount()

      let failedSubscriptions=0
      const failedApi={...api,getContext:async()=>{throw new Error('上下文读取失败')},onState:()=>{failedSubscriptions++;return()=>{}}}
      window.videoChatModeControl=failedApi
      const failed=mount(View,{attachTo:document.body})
      for(let attempt=0;attempt<20&&!failed.text().includes('上下文读取失败');attempt++){await new Promise(resolve=>setTimeout(resolve,0));await nextTick()}
      assert.match(failed.text(),/上下文读取失败/)
      assert.equal(failedSubscriptions,0,`${skin} rejected context must not subscribe`)
      failed.unmount()

      let lateSubscriptions=0,resolveLate
      window.videoChatModeControl={...api,getContext:()=>new Promise(resolve=>{resolveLate=resolve}),onState:()=>{lateSubscriptions++;return()=>{}}}
      const abandoned=mount(View,{attachTo:document.body})
      await new Promise(resolve=>setTimeout(resolve,0));abandoned.unmount()
      resolveLate({platform:'bilibili',skin,partition})
      await new Promise(resolve=>setTimeout(resolve,0));await nextTick()
      assert.equal(lateSubscriptions,0,`${skin} unmounted startup must not subscribe late`)
    }
  }finally{
    delete globalThis.__moyuChatPlayerProps
    delete window.videoChatModeControl
    window.close()
    for(const path of compiled)if(existsSync(path))rmSync(path)
    for(const [name,descriptor]of Object.entries(previous))descriptor?Object.defineProperty(globalThis,name,descriptor):delete globalThis[name]
  }
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
