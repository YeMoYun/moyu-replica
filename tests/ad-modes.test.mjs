import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { EventEmitter } from 'node:events'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import vm from 'node:vm'
import { compileScript, parse } from '@vue/compiler-sfc'
import { Window } from 'happy-dom'
const modulePath = '../src/shared/ad-modes.mjs'
const shared = () => import(modulePath)

test('ad settings defaults and clamping never inherit transparency settings', async () => {
  const { normalizeAdSettings } = await shared()
  assert.equal(normalizeAdSettings('douyin',{}).zoom,.2)
  assert.equal(normalizeAdSettings('weReadAd',{}).zoom,.7)
  const settings=normalizeAdSettings('weReadAd',{zoom:9,speed:-1,autoScroll:'false',color:'bad',text:'新的广告'})
  assert.equal(settings.zoom,1);assert.equal(settings.speed,1);assert.equal(settings.autoScroll,false)
  assert.equal(settings.color,'#fff4d1');assert.equal(settings.text,'新的广告')
})
test('all approved video ads have compact defaults and existing transparency targets', async () => {
  const {AD_MODES,normalizeAdSettings}=await shared()
  const {VIDEO_PLATFORM_ORDER,videoPlatform}=await import('../src/shared/video-platforms.mjs')
  for(const key of VIDEO_PLATFORM_ORDER){
    assert.equal(AD_MODES[key].home,videoPlatform(key).home)
    assert.equal(AD_MODES[key].transparentKey,videoPlatform(key).opacityKey)
    assert.equal(normalizeAdSettings(key,{}).zoom,.2)
  }
  assert.equal(normalizeAdSettings('weReadAd',{}).zoom,.7)
})
test('video ad URLs accept own official hosts and reject cross-site hosts',async()=>{
  const {validateAdUrl}=await shared()
  const cases={douyin:'https://www.douyin.com/video/1',bilibili:'https://www.bilibili.com/video/BV1',huya:'https://www.huya.com/123',douyu:'https://www.douyu.com/456',kuaishou:'https://www.kuaishou.com/short-video/789'}
  for(const [kind,url] of Object.entries(cases)){
    assert.equal(validateAdUrl(kind,url),url)
    assert.throws(()=>validateAdUrl(kind,'https://example.com/video/1'))
    assert.throws(()=>validateAdUrl(kind,url.replace('https://','https://user:pass@')))
  }
})
test('ad registry rejects prototype keys, deceptive subdomains and non-http protocols',async()=>{
  const {normalizeAdSettings,validateAdUrl}=await shared()
  for(const key of ['__proto__','constructor','toString'])assert.throws(()=>normalizeAdSettings(key,{}),/不支持/)
  for(const url of ['https://douyin.com.evil.test/video/1','https://bilibili.com.evil.test/video/BV1','javascript:alert(1)','file:///C:/Windows/win.ini']){
    assert.throws(()=>validateAdUrl(url.includes('bilibili')?'bilibili':'douyin',url))
  }
})
test('ad URLs accept only their own HTTPS sites and reject credentials and executable schemes', async () => {
  const { validateAdUrl }=await shared()
  assert.equal(validateAdUrl('douyin','https://www.douyin.com/video/123'),'https://www.douyin.com/video/123')
  for(const url of ['javascript:alert(1)','https://douyin.com.evil.test/','https://user:pass@douyin.com/','https://weread.qq.com/'])assert.throws(()=>validateAdUrl('douyin',url))
  assert.equal(validateAdUrl('weReadAd','https://weread.qq.com/web/reader/abc'),'https://weread.qq.com/web/reader/abc')
})
function nativeWindow(){
  const w=new EventEmitter();w.bounds={x:10,y:20,width:286,height:420};w.destroyed=false;w.opacity=1;w.sent=[]
  w.isDestroyed=()=>w.destroyed;w.getBounds=()=>({...w.bounds});w.setBounds=b=>{w.bounds={...b};w.emit('resize')}
  w.setSize=(width,height)=>w.setBounds({...w.bounds,width,height});w.getOpacity=()=>w.opacity;w.setOpacity=v=>w.opacity=v
  w.webContents={isDestroyed:()=>w.destroyed,send:(...args)=>w.sent.push(args)}
  w.close=()=>{w.emit('close');w.destroyed=true;w.emit('closed')};w.hide=()=>{throw Error('广告窗口不得隐藏')}
  return w
}
test('ad boss strategy covers in place, restores, cleans closed windows and ignores transparency',async()=>{
  const {createAdWindowController}=await import('../src/main/ad-window-controls.mjs')
  const values=new Map(),store={get:k=>values.get(k),set:(k,v)=>values.set(k,v)}
  const control=createAdWindowController({store,screen:{getPrimaryDisplay:()=>({workArea:{x:0,y:0,width:1600,height:1000}})}})
  const video=nativeWindow(),reading=nativeWindow();control.attach('douyin',video);control.attach('weReadAd',reading)
  assert.equal(control.toggleBoss(),true);assert.equal(control.state('douyin').covered,true)
  assert.deepEqual(video.sent.at(-1),['ad-mode:state',control.state('douyin')]);assert.equal(control.toggleBoss(),false)
  control.expand('douyin');assert.equal(control.state('douyin').expanded,true)
  control.expand('douyin');assert.equal(video.bounds.width,286)
  control.close('douyin');assert.throws(()=>control.state('douyin'),/不存在/)
  control.toggleBoss();assert.equal(control.state('weReadAd').covered,true)
  assert.ok([...values.keys()].every(k=>k.startsWith('adModes.')))
})
test('ad page controller isolates persistence, pauses covered reading and invalidates stale navigation',async()=>{
  const {createAdPageController}=await import('../src/renderer/src/features/ad-modes/controller.mjs')
  const values=new Map(),scripts=[];let resolveScript,block=false
  const view={setZoomFactor:async()=>{},insertCSS:async()=> 'css',removeInsertedCSS:async()=>{},getURL:()=> 'https://weread.qq.com/web/reader/123',
    executeJavaScript:async code=>{scripts.push(code);if(block)await new Promise(resolve=>{resolveScript=resolve});return true}}
  const api={getSettings:async()=>({}),saveSettings:async patch=>{for(const [key,v]of Object.entries(patch))values.set(key,v);return {...Object.fromEntries(values)}}}
  const page=createAdPageController({kind:'weReadAd',getWebview:()=>view,api});await page.load();await page.domReady()
  await page.update({autoScroll:true,speed:4});assert.ok(scripts.at(-1).includes('startAutoScroll'))
  await page.setCovered(true);assert.ok(scripts.at(-1).includes('stopAutoScroll'))
  await page.setCovered(false);assert.ok(scripts.at(-1).includes('startAutoScroll'))
  block=true;const pending=page.action('controls');await new Promise(resolve=>setImmediate(resolve));page.navigationStarted();resolveScript()
  await assert.rejects(pending,/导航/);assert.equal(page.state.ready,false)
  await page.dispose();await assert.rejects(page.update({speed:2}),/关闭/)
  assert.deepEqual([...values.keys()].sort(),['address','autoScroll','speed'])
})
test('advertisement routes have independent views and existing transparency factories stay intact',()=>{
  const router=readFileSync(new URL('../src/renderer/src/router/index.js',import.meta.url),'utf8')
  assert.match(router,/path: '\/douyin'.*VideoAdView.vue/)
  assert.match(router,/path: '\/weReadAd'.*ReadingAdView.vue/)
  assert.match(router,/path: '\/douyinOpacity'.*DouyinOpacityView.vue/)
  const preload=readFileSync(new URL('../src/preload/index.js',import.meta.url),'utf8');assert.match(preload,/exposeInMainWorld\('adModeControl'/)
  const main=readFileSync(new URL('../src/main/index.js',import.meta.url),'utf8');assert.match(main,/adWindowControls.toggleBoss\(\)/)
  assert.match(main,/windowControls.toggleBoss\(\)/)
})
test('douyin ad keeps the guest video clickable in the compact window',()=>{
  const view=readFileSync(new URL('../src/renderer/src/views/VideoAdView.vue',import.meta.url),'utf8')
  assert.doesNotMatch(view,/click-mask/)
  assert.doesNotMatch(view,/放大窗口后操作视频网页/)
})
test('douyin ad back action returns the guest to its previous history entry',async()=>{
  const {createAdPageController}=await import('../src/renderer/src/features/ad-modes/controller.mjs')
  let wentBack=false
  const view={setZoomFactor:async()=>{},insertCSS:async()=> 'css',removeInsertedCSS:async()=>{},getURL:()=> 'https://www.douyin.com/video/123',canGoBack:()=>true,goBack:()=>{wentBack=true},executeJavaScript:async()=>true}
  const page=createAdPageController({kind:'douyin',getWebview:()=>view,api:{getSettings:async()=>({}),saveSettings:async()=>({})}})
  await page.load();await page.domReady();await page.action('back');assert.equal(wentBack,true)
})
test('douyin advertisement header labels its back control clearly',()=>{
  const view=readFileSync(new URL('../src/renderer/src/views/VideoAdView.vue',import.meta.url),'utf8')
  assert.match(view,/<button data-action="back"[^>]*>← 返回<\/button>/)
})
test('douyin ad back does nothing when the guest has no previous page',async()=>{
  const {createAdPageController}=await import('../src/renderer/src/features/ad-modes/controller.mjs')
  const view={setZoomFactor:async()=>{},insertCSS:async()=> 'css',getURL:()=> 'https://www.douyin.com/',executeJavaScript:async()=>true,canGoBack:()=>false,goBack:()=>assert.fail('must not navigate without history')}
  const page=createAdPageController({kind:'douyin',getWebview:()=>view,api:{getSettings:async()=>({}),saveSettings:async()=>({})}})
  await page.load();await page.domReady();assert.equal(await page.action('back'),false)
})
test('reading ad navigation resets floating-control selection for the replacement document',async()=>{
  const {createAdPageController}=await import('../src/renderer/src/features/ad-modes/controller.mjs')
  const view={setZoomFactor:async()=>{},insertCSS:async()=> 'css',removeInsertedCSS:async()=>{},getURL:()=> 'https://weread.qq.com/web/reader/123',executeJavaScript:async()=>true}
  const page=createAdPageController({kind:'weReadAd',getWebview:()=>view,api:{getSettings:async()=>({}),saveSettings:async()=>({})}})
  await page.load();await page.domReady();await page.action('controls');assert.equal(page.state.controlsShown,true)
  page.navigationStarted();assert.equal(page.state.controlsShown,false)
})
test('failed ad preference save retains live state; restored expanded video applies large zoom',async()=>{
  const {createAdPageController}=await import('../src/renderer/src/features/ad-modes/controller.mjs')
  let zoom;const view={setZoomFactor:async value=>{zoom=value},insertCSS:async()=> 'css',removeInsertedCSS:async()=>{},getURL:()=> 'https://www.douyin.com/',executeJavaScript:async()=>true}
  const api={getSettings:async()=>({}),saveSettings:async()=>({})},page=createAdPageController({kind:'douyin',getWebview:()=>view,api})
  await page.load();await page.setExpanded(true);await page.domReady();assert.equal(zoom,.6)
  api.saveSettings=async()=>{throw Error('磁盘写入失败')};await assert.rejects(page.update({skin:1}),/磁盘/);assert.equal(page.state.skin,0)
})
test('all five advertisement routes use the dedicated compact video view',()=>{
  const router=readFileSync(new URL('../src/renderer/src/router/index.js',import.meta.url),'utf8')
  const routeLines=router.split(/\r?\n/).filter(line=>line.includes("path: '/"))
  const routeFor=path=>routeLines.find(line=>line.includes(`path: '/${path}'`))
  for(const path of ['douyin','bilibili','huya','douyu','kuaishou']){
    const route=routeFor(path)
    assert.ok(route,`${path} advertisement route must exist`)
    assert.match(route,/VideoAdView\.vue/)
    assert.match(route,new RegExp(`meta: \\{ site: '${path}', mode: 'ad' \\}`))
  }
  assert.match(routeFor('douyuOpacity'),/SiteView\.vue/)
})

test('compact video view passes each trusted route site to its matching ad page',async()=>{
  const projectRoot=resolve(dirname(fileURLToPath(import.meta.url)),'..')
  const componentPath=resolve(projectRoot,'src/renderer/src/views/VideoAdView.vue')
  const cacheDirectory=resolve(projectRoot,'node_modules/.cache/moyu-tests')
  const suffix=`${process.pid}-${Date.now()}`
  const compiledPath=resolve(cacheDirectory,`VideoAdView-${suffix}.mjs`)
  const routerStubPath=resolve(cacheDirectory,`VideoAdRouter-${suffix}.mjs`)
  const pageStubPath=resolve(cacheDirectory,`VideoAdPage-${suffix}.mjs`)
  const window=new Window({url:'http://localhost/'})
  const previous={}
  for(const [name,value] of Object.entries({window,document:window.document,navigator:window.navigator,history:window.history,location:window.location,Node:window.Node,Element:window.Element,HTMLElement:window.HTMLElement,SVGElement:window.SVGElement,Event:window.Event,MouseEvent:window.MouseEvent,MutationObserver:window.MutationObserver,getComputedStyle:window.getComputedStyle.bind(window)})){
    previous[name]=Object.getOwnPropertyDescriptor(globalThis,name)
    Object.defineProperty(globalThis,name,{configurable:true,writable:true,value})
  }
  try{
    const source=readFileSync(componentPath,'utf8')
    const {descriptor,errors}=parse(source,{filename:componentPath})
    assert.deepEqual(errors,[])
    const compiled=compileScript(descriptor,{id:'video-ad-view-test',inlineTemplate:true,templateOptions:{compilerOptions:{isCustomElement:tag=>tag==='webview'}}})
    mkdirSync(cacheDirectory,{recursive:true})
    writeFileSync(routerStubPath,"export const useRoute=()=>({meta:globalThis.__VIDEO_AD_ROUTE_META__})\n",'utf8')
    writeFileSync(pageStubPath,`import {reactive,ref} from 'vue'
export function useAdPage(kind){
  globalThis.__VIDEO_AD_PAGE_CALLS__.push(kind)
  return {api:{expand:async()=>{},close:async()=>{}},wv:ref(null),initialized:ref(false),initialAddress:ref(''),error:ref(''),pending:ref(0),state:reactive({skin:0,ready:false}),native:reactive({expanded:false,covered:false}),perform:fn=>fn(),domReady:()=>{},navigation:()=>{},failed:()=>{},update:()=>{},action:()=>{},toTransparent:()=>{}}
}`,'utf8')
    const routerUrl=pathToFileURL(routerStubPath).href
    const pageUrl=pathToFileURL(pageStubPath).href
    const platformUrl=pathToFileURL(resolve(projectRoot,'src/shared/video-platforms.mjs')).href
    const content=compiled.content
      .replace(/from ['"]vue-router['"]/,`from '${routerUrl}'`)
      .replace(/from ['"]\.\.\/features\/ad-modes\/use-ad-page\.mjs['"]/,`from '${pageUrl}'`)
      .replace(/from ['"]\.\.\/\.\.\/\.\.\/shared\/video-platforms\.mjs['"]/,`from '${platformUrl}'`)
      .replace(/import qr from ['"]\.\.\/assets\/ad-cover-qr\.svg['"]/,"const qr='data:image/svg+xml,%3Csvg/%3E'")
    writeFileSync(compiledPath,content,'utf8')
    const [{mount},{VIDEO_PLATFORM_ORDER,videoPlatform},{AD_MODES},{module:componentModule}]=await Promise.all([
      import('@vue/test-utils'),
      import('../src/shared/video-platforms.mjs'),
      import('../src/shared/ad-modes.mjs'),
      import(`${pathToFileURL(compiledPath).href}?test=${Date.now()}`).then(module=>({module}))
    ])
    for(const kind of VIDEO_PLATFORM_ORDER){
      globalThis.__VIDEO_AD_ROUTE_META__={site:kind,mode:'ad'}
      globalThis.__VIDEO_AD_PAGE_CALLS__=[]
      const wrapper=mount(componentModule.default,{attachTo:document.body,global:{stubs:{webview:true}}})
      assert.deepEqual(globalThis.__VIDEO_AD_PAGE_CALLS__,[kind])
      assert.equal(AD_MODES[kind].home,videoPlatform(kind).home)
      assert.equal(AD_MODES[kind].transparentKey,videoPlatform(kind).opacityKey)
      wrapper.unmount()
    }
  }finally{
    delete globalThis.__VIDEO_AD_ROUTE_META__
    delete globalThis.__VIDEO_AD_PAGE_CALLS__
    window.close()
    for(const path of [compiledPath,routerStubPath,pageStubPath])if(existsSync(path))rmSync(path)
    for(const [name,descriptor]of Object.entries(previous))descriptor?Object.defineProperty(globalThis,name,descriptor):delete globalThis[name]
  }
})

test('shared controller prepares, controls and cleans every video ad kind',async()=>{
  const {createAdPageController}=await import('../src/renderer/src/features/ad-modes/controller.mjs')
  const {VIDEO_PLATFORM_ORDER,videoPlatform}=await import('../src/shared/video-platforms.mjs')
  for(const kind of VIDEO_PLATFORM_ORDER){
    const scripts=[];let zoom
    const view={setZoomFactor:async value=>{zoom=value},insertCSS:async()=> 'css',removeInsertedCSS:async()=>{},getURL:()=>videoPlatform(kind).home,canGoBack:()=>false,executeJavaScript:async code=>{scripts.push(code);return true}}
    const page=createAdPageController({kind,getWebview:()=>view,api:{getSettings:async()=>({}),saveSettings:async()=>({})}})
    await page.load();await page.setExpanded(true);await page.domReady()
    assert.equal(zoom,.6,`${kind} expanded video zoom`)
    assert.ok(scripts.some(code=>code.includes('querySelectorAll')),`${kind} prepared video controls`)
    await page.action('play')
    await page.action('next')
    await page.dispose()
    assert.ok(scripts.at(-1).includes('__moyuAdVideoFit'),`${kind} cleaned injected page state`)
  }
})

const adVideoControls=async()=>{
  try{return await import('../src/renderer/src/features/ad-modes/video-controls.mjs')}
  catch(error){if(error.code==='ERR_MODULE_NOT_FOUND')return {};throw error}
}
const runAdScript=(fn,document,window,platform,...args)=>vm.runInNewContext(
  `(${fn.toString()})(${[platform,...args].map(value=>JSON.stringify(value)).join(',')})`,
  {document,window,KeyboardEvent:class{constructor(type,props){Object.assign(this,{type},props)}}}
)

test('video advertisement controls are deeply immutable and platform specific',async()=>{
  const {VIDEO_AD_CONTROLS,videoAdControls}=await adVideoControls()
  assert.equal(typeof videoAdControls,'function')
  assert.ok(Object.isFrozen(VIDEO_AD_CONTROLS))
  for(const kind of ['douyin','bilibili','huya','douyu','kuaishou']){
    const controls=videoAdControls(kind)
    assert.ok(Object.isFrozen(controls));assert.ok(Object.isFrozen(controls.fullscreen));assert.ok(Object.isFrozen(controls.next));assert.ok(Object.isFrozen(controls.prev))
  }
  assert.equal(videoAdControls('douyin').keyboardFallback,true)
  assert.equal(videoAdControls('bilibili').keyboardFallback,false)
  assert.equal(videoAdControls('huya').keyboardFallback,false)
  assert.equal(videoAdControls('douyu').keyboardFallback,false)
  assert.equal(videoAdControls('kuaishou').keyboardFallback,true)
  assert.match(videoAdControls('bilibili').next[0],/bpx/)
  assert.match(videoAdControls('huya').fullscreen[0],/player-fullscreen/)
  assert.equal(videoAdControls('douyu').next.length,0)
  assert.throws(()=>videoAdControls('__proto__'),/不支持/)
})

test('advertisement scripts use each platform controls without unsafe navigation fallbacks',async()=>{
  const {navigateAdVideo,toggleAdVideoFullscreen}=await import('../src/renderer/src/features/ad-modes/page-scripts.mjs')
  const {videoAdControls}=await adVideoControls()
  assert.equal(typeof navigateAdVideo,'function');assert.equal(typeof toggleAdVideoFullscreen,'function')
  for(const [kind,nextSelector,fullscreenSelector] of [
    ['bilibili','.bpx-player-ctrl-next','.bpx-player-ctrl-full'],
    ['huya',null,'.player-fullscreen-btn']
  ]){
    const clicked=[]
    const document={body:{},documentElement:{},querySelector:selector=>selector===nextSelector||selector===fullscreenSelector?{disabled:false,click:()=>clicked.push(selector)}:null}
    if(nextSelector){const result=runAdScript(navigateAdVideo,document,{},videoAdControls(kind),'next');assert.equal(result.method,'button');assert.equal(result.selector,nextSelector)}
    const fullscreen=runAdScript(toggleAdVideoFullscreen,document,{},videoAdControls(kind));assert.equal(fullscreen.clicked,true);assert.equal(fullscreen.selector,fullscreenSelector)
    assert.deepEqual(clicked,nextSelector?[nextSelector,fullscreenSelector]:[fullscreenSelector])
  }
  for(const kind of ['bilibili','huya','douyu']){
    let keys=0
    const document={querySelector:()=>null,dispatchEvent:()=>{keys++},activeElement:null}
    assert.throws(()=>runAdScript(navigateAdVideo,document,{},videoAdControls(kind),'next'),/未找到|直播/)
    assert.equal(keys,0,`${kind} must not dispatch direction keys`)
  }
  const keys=[]
  const kuaishouDocument={querySelector:()=>null,activeElement:{tagName:'INPUT'},dispatchEvent:event=>keys.push(event.key)}
  const fallback=runAdScript(navigateAdVideo,kuaishouDocument,{},videoAdControls('kuaishou'),'next');assert.equal(fallback.method,'keyboard-fallback');assert.equal(fallback.verified,false)
  assert.deepEqual(keys,['ArrowDown','ArrowDown'])
})

test('advertisement likes click configured controls and reject unsupported live platforms',async()=>{
  const {likeAdVideo}=await import('../src/renderer/src/features/ad-modes/page-scripts.mjs')
  const {videoAdControls}=await adVideoControls()
  for(const kind of ['douyin','bilibili','kuaishou']){
    const selector=videoAdControls(kind).like[0];let clicked=0
    const document={querySelector:value=>value===selector?{disabled:false,click:()=>{clicked++}}:null}
    const result=runAdScript(likeAdVideo,document,{},videoAdControls(kind));assert.equal(result.clicked,true);assert.equal(result.selector,selector)
    assert.equal(clicked,1)
  }
  for(const kind of ['huya','douyu']){
    const document={querySelector:()=>assert.fail('unsupported platform must not probe random like controls')}
    assert.throws(()=>runAdScript(likeAdVideo,document,{},videoAdControls(kind)),/该平台当前不支持点赞/)
  }
})

test('controller executes real Bilibili controls and exposes Huya shortcut failures without leaking subscriptions',async()=>{
  const {createAdPageController}=await import('../src/renderer/src/features/ad-modes/controller.mjs')
  const {normalizeAdSettings}=await shared()
  const clicked=[]
  const guestControlDocument={body:{},documentElement:{},querySelector:selector=>['.bpx-player-ctrl-next','.bpx-player-ctrl-full'].includes(selector)?{disabled:false,click:()=>clicked.push(selector)}:null}
  const view={executeJavaScript:async code=>vm.runInNewContext(code,{document:guestControlDocument,window:{},KeyboardEvent:class{constructor(type,props){Object.assign(this,{type},props)}}})}
  const page=createAdPageController({kind:'bilibili',getWebview:()=>view,api:{},state:{...normalizeAdSettings('bilibili'),ready:true,covered:false}})
  await page.action('next');await page.action('fullscreen')
  assert.deepEqual(clicked,['.bpx-player-ctrl-next','.bpx-player-ctrl-full'])

  const browser=new Window({url:'http://localhost/'})
  const previous={}
  for(const [name,value] of Object.entries({window:browser,document:browser.document,navigator:browser.navigator,history:browser.history,location:browser.location,Node:browser.Node,Element:browser.Element,HTMLElement:browser.HTMLElement,SVGElement:browser.SVGElement,Event:browser.Event,MouseEvent:browser.MouseEvent,MutationObserver:browser.MutationObserver,getComputedStyle:browser.getComputedStyle.bind(browser)})){
    previous[name]=Object.getOwnPropertyDescriptor(globalThis,name);Object.defineProperty(globalThis,name,{configurable:true,writable:true,value})
  }
  const ipcHandlers=new Map(),bridgeHandlers=new Set()
  browser.ipcRenderer={on:(channel,callback)=>{ipcHandlers.set(channel,callback);return()=>ipcHandlers.delete(channel)},invoke:async()=>({})}
  browser.adModeControl={onState:callback=>{bridgeHandlers.add(callback);return()=>bridgeHandlers.delete(callback)},onError:callback=>{bridgeHandlers.add(callback);return()=>bridgeHandlers.delete(callback)},getSettings:async()=>({}),getState:async()=>({covered:false,expanded:false,opacity:1}),saveSettings:async()=>({}),openTransparent:async()=>{}}
  let wrapper
  try{
    const [{mount,flushPromises},{h,nextTick},{useAdPage}]=await Promise.all([import('@vue/test-utils'),import('vue'),import('../src/renderer/src/features/ad-modes/use-ad-page.mjs')])
    let model
    const Host={setup(){model=useAdPage('huya');return()=>h('span',{class:'visible-error'},model.error.value)}}
    wrapper=mount(Host,{attachTo:document.body});await flushPromises()
    const guestDocument={querySelector:()=>null,activeElement:null,dispatchEvent:()=>assert.fail('Huya must not use direction keys')}
    model.wv.value={executeJavaScript:async code=>vm.runInNewContext(code,{document:guestDocument,window:{},KeyboardEvent:class{constructor(type,props){Object.assign(this,{type},props)}}})}
    model.state.ready=true
    ipcHandlers.get('all-next')();await new Promise(resolve=>setImmediate(resolve));await nextTick()
    const visibleError=wrapper.get('.visible-error').text()
    wrapper.unmount();wrapper=null;await new Promise(resolve=>setImmediate(resolve))
    assert.match(visibleError,/虎牙.*未找到|直播/)
    assert.equal(ipcHandlers.size,0);assert.equal(bridgeHandlers.size,0)
  }finally{
    wrapper?.unmount();browser.close()
    for(const [name,descriptor]of Object.entries(previous))descriptor?Object.defineProperty(globalThis,name,descriptor):delete globalThis[name]
  }
})
