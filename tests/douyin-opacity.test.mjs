import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
let fit={},scripts={},controller={}
for(const [name,target] of [['fit',fit],['page-scripts',scripts],['controller',controller]]){
  try{Object.assign(target,await import(`../src/renderer/src/features/douyin/${name}.mjs`))}catch(e){if(e.code!=='ERR_MODULE_NOT_FOUND')throw e}
}
test('Douyin fit is bounded and based on guest viewport, preserving exact presets',()=>{
  assert.equal(typeof fit.calculateDouyinFitZoom,'function')
  assert.equal(fit.calculateDouyinFitZoom(500,416),.39)
  assert.equal(fit.calculateDouyinFitZoom(1920,1080),1)
  assert.equal(fit.calculateDouyinFitZoom(100,100),.2)
  assert.equal(fit.calculateDouyinFitZoom(NaN,0),.4)
  for(const n of [.2,.4,.75,1])assert.equal(fit.clampDouyinZoom(n),n)
  assert.equal(fit.normalizeZoomSetting('bad'),.4)
})
function harness(saved={}){
  assert.equal(typeof controller.createDouyinController,'function')
  const settings={...saved},calls=[],state=controller.createDouyinState()
  let fail=false,zoom=1
  const guest={setZoomFactor(n){zoom=n},getBoundingClientRect:()=>({width:500,height:416}),async executeJavaScript(code){calls.push(code);return {ok:true,value:{prepared:true}}}}
  const api=controller.createDouyinController({state,getWebview:()=>guest,settings:{async getSetting(k){return settings[k]},async setSettings(o){if(fail)throw Error('磁盘写入失败');Object.assign(settings,o)}}})
  return {api,state,settings,calls,get zoom(){return zoom},set fail(n){fail=n}}
}
test('new opacity guest automatically fits; manual zoom survives navigation and reopen',async()=>{
  const h=harness();await h.api.load();await h.api.domReady();assert.equal(h.zoom,.39);assert.equal(h.state.ready,true)
  await h.api.setZoom(.75);assert.equal(h.state.autoFit,false);assert.equal(h.settings['douyinOpacity.zoom'],.75)
  h.api.navigationStarted();await h.api.domReady();assert.equal(h.zoom,.75)
  const next=harness(h.settings);await next.api.load();await next.api.domReady();assert.equal(next.zoom,.75)
  await next.api.restoreAutoFit();assert.equal(next.zoom,.39);assert.equal(next.state.autoFit,true)
})
test('zoom persistence failure rolls back live guest and does not change preferences',async()=>{
  const h=harness();await h.api.load();await h.api.domReady();h.fail=true
  await assert.rejects(h.api.setZoom(.75),/磁盘/);assert.equal(h.zoom,.39);assert.equal(h.state.zoom,.39);assert.equal(h.state.autoFit,true)
})
test('navigation during a manual save retains committed preference for the new document',async()=>{
  let release,hold=false,zoom=1
  const state=controller.createDouyinState(),settings={}
  const api=controller.createDouyinController({state,getWebview:()=>({setZoomFactor(n){zoom=n},getBoundingClientRect:()=>({width:500,height:416}),executeJavaScript:async()=>({ok:true,value:{prepared:true}})}),settings:{getSetting:async k=>settings[k],async setSettings(o){if(hold)await new Promise(resolve=>{release=resolve});Object.assign(settings,o)}}})
  await api.load();await api.domReady();hold=true
  const saving=api.setZoom(.75);await new Promise(resolve=>setImmediate(resolve))
  api.navigationStarted();hold=false;release();await saving;await api.domReady()
  assert.equal(zoom,.75);assert.equal(state.zoom,.75);assert.equal(state.autoFit,false)
})
test('controller rejects premature controls and disposal prevents further operations',async()=>{
  const h=harness();await assert.rejects(h.api.navigate('next'),/尚未准备/)
  await h.api.load();await h.api.domReady();await h.api.dispose();assert.equal(h.state.ready,false)
  await assert.rejects(h.api.setZoom(.4),/已关闭/);assert.match(h.calls.at(-1),/cleanupDouyinPage/)
})
test('page control errors retain the actual Chinese guest message',async()=>{
  assert.equal(typeof controller.createDouyinController,'function')
  const state=controller.createDouyinState(),guest={setZoomFactor(){},getBoundingClientRect:()=>({width:500,height:416}),async executeJavaScript(code){return code.includes('prepareDouyinPage')?{ok:true,value:{prepared:true}}:{ok:false,error:'当前页面未找到可操作的视频控件'}}}
  const api=controller.createDouyinController({state,getWebview:()=>guest,settings:{getSetting:async()=>undefined,setSettings:async()=>{}}})
  await api.load();await api.domReady();await assert.rejects(api.fullscreen(),/未找到可操作/)
})
function run(name,document,window={},args=[]){
  assert.equal(typeof scripts[name],'function',`missing ${name}`)
  return vm.runInNewContext(`(${scripts[name].toString()})(${args.map(JSON.stringify).join(',')})`,{document,window,KeyboardEvent:class{constructor(type,options){Object.assign(this,{type},options)}}})
}
test('serialized navigation prioritizes aria controls; fallback targets focused page',()=>{
  let clicked=0,keys=[]
  const button={click(){clicked++}},doc={querySelector(s){return s.includes('aria-label')?button:null}}
  run('navigateDouyinVideo',doc,{},['next']);assert.equal(clicked,1)
  doc.querySelector=()=>null;doc.activeElement={tagName:'INPUT',dispatchEvent(){}}
  doc.dispatchEvent=e=>keys.push(e.key);run('navigateDouyinVideo',doc,{},['prev']);assert.deepEqual(keys,['ArrowUp','ArrowUp'])
  assert.throws(()=>run('navigateDouyinVideo',doc,{},['invalid']),/方向/)
})
test('player fullscreen never calls native window and missing controls report failure',()=>{
  let clicked=0;run('toggleDouyinFullscreen',{querySelector:()=>({click(){clicked++}})});assert.equal(clicked,1)
  assert.throws(()=>run('toggleDouyinFullscreen',{querySelector:()=>null}),/未找到可操作/)
})
test('playback handles every video, awaits failures and does not claim missing videos',async()=>{
  const videos=[{paused:false,pause(){this.paused=true},async play(){this.paused=false}},{paused:true,pause(){this.paused=true},async play(){this.paused=false}}]
  const doc={querySelectorAll:()=>videos};await run('toggleDouyinPlayback',doc);assert.ok(videos.every(v=>v.paused))
  await run('toggleDouyinPlayback',doc);assert.ok(videos.every(v=>!v.paused))
  videos[0].play=async()=>{throw Error('播放被浏览器拒绝')};videos.forEach(v=>v.paused=true)
  await assert.rejects(run('toggleDouyinPlayback',doc),/播放被浏览器拒绝/)
  await assert.rejects(run('toggleDouyinPlayback',{querySelectorAll:()=>[]}),/未找到可操作/)
})
test('fit CSS is owned, idempotent and retains internal vertical scrolling',()=>{
  const nodes=new Map(),doc={getElementById:id=>nodes.get(id),createElement:()=>({remove(){nodes.delete(this.id)}}),head:{appendChild(node){nodes.set(node.id,node)}}}
  run('prepareDouyinPage',doc);run('prepareDouyinPage',doc);assert.equal(nodes.size,1)
  const css=[...nodes.values()][0].textContent;assert.match(css,/overflow-x/);assert.doesNotMatch(css,/overflow\s*:\s*hidden|overflow-y\s*:\s*hidden/)
  nodes.set('unrelated',{id:'unrelated'});run('cleanupDouyinPage',doc);assert.deepEqual([...nodes.keys()],['unrelated'])
})
test('opacity route retains dedicated controls behind the shared home entry independently of the ad view',()=>{
  const router=fs.readFileSync(new URL('../src/renderer/src/router/index.js',import.meta.url),'utf8')
  assert.match(router,/path: '\/douyinOpacity'.*DouyinOpacityView.vue/)
  assert.match(router,/path: '\/douyin'.*VideoAdView.vue/)
  assert.match(router,/path: '\/weRead'.*WeReadView.vue/)
  const viewPath=new URL('../src/renderer/src/views/DouyinOpacityView.vue',import.meta.url);assert.ok(fs.existsSync(viewPath))
  const view=fs.readFileSync(viewPath,'utf8');assert.doesNotMatch(view,/class="addr"|data-action="fullscreen"|type="checkbox"/)
  assert.match(view,/ResizeObserver/);assert.match(view,/onUnmounted/)
  assert.match(view,/data-setting="opacity"[^>]*@input=/)
  assert.match(view,/shortcutLabels/)
  const preload=fs.readFileSync(new URL('../src/preload/index.js',import.meta.url),'utf8');assert.match(preload,/'douyinOpacityControl'/)
  assert.match(preload,/ipcRenderer\.invoke\('video-mode:open', platform, mode\)/)
  const platforms=fs.readFileSync(new URL('../src/shared/video-platforms.mjs',import.meta.url),'utf8')
  assert.match(platforms,/douyin:define\([^\n]*'douyinOpacity'\)/)
  const home=fs.readFileSync(new URL('../src/renderer/src/views/HomeView.vue',import.meta.url),'utf8')
  assert.match(home,/VIDEO_PLATFORM_ORDER/);assert.match(home,/callBridge\(window\.videoModeControl, 'open'/)
  assert.doesNotMatch(home,/抖音透明化/)
})
