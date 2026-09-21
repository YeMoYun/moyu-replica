import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { EventEmitter } from 'node:events'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
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
