import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
let platforms={},fit={},scripts={},controller={}
for(const [name,target] of [['platforms',platforms],['fit',fit],['page-scripts',scripts],['controller',controller]]){
  try{Object.assign(target,await import(`../src/renderer/src/features/video-opacity/${name}.mjs`))}catch(error){if(error.code!=='ERR_MODULE_NOT_FOUND')throw error}
}
const get=site=>{assert.ok(platforms.VIDEO_PLATFORMS,'missing VIDEO_PLATFORMS');return platforms.VIDEO_PLATFORMS[site]}
test('three platforms have independent settings and real HTTPS production addresses',()=>{
  for(const site of ['bilibili','huya','kuaishou']){
    const p=get(site);assert.equal(p.key,`${site}Opacity`);assert.equal(new URL(p.url).hostname,`www.${site}.com`)
    assert.ok(p.fullscreen.length);assert.equal(p.keyboardFallback,site==='kuaishou')
  }
})
test('shared viewport fit exactly matches the accepted Douyin calculation',()=>{
  assert.equal(typeof fit.calculateVideoFitZoom,'function')
  assert.equal(fit.calculateVideoFitZoom(500,416),.39);assert.equal(fit.calculateVideoFitZoom(1920,1080),1)
  assert.equal(fit.calculateVideoFitZoom(100,100),.2);assert.equal(fit.normalizeZoomSetting('wrong'),.4)
  assert.equal(fit.clampVideoZoom(.75),.75)
})
function harness(site,settings={}){
  assert.equal(typeof controller.createVideoOpacityController,'function')
  const state=controller.createVideoOpacityState(),calls=[];let zoom=1,fail=false,box={width:500,height:416}
  const guest={getBoundingClientRect:()=>box,setZoomFactor:value=>{zoom=value},async executeJavaScript(code){calls.push(code);return {ok:true,value:{prepared:true}}}}
  const page=controller.createVideoOpacityController({state,platform:get(site),getWebview:()=>guest,settings:{getSetting:async key=>settings[key],async setSettings(o){if(fail)throw Error('磁盘写入失败');Object.assign(settings,o)}}})
  return {state,page,settings,calls,get zoom(){return zoom},set fail(value){fail=value},set box(value){box=value}}
}
for(const site of ['bilibili','huya','kuaishou']){
  test(`${site} manual zoom persists across navigation; restore fits resized viewport`,async()=>{
    const h=harness(site);await h.page.load();await h.page.domReady();assert.equal(h.zoom,.39)
    await h.page.setZoom(.75);assert.equal(h.settings[`${site}Opacity.zoom`],.75)
    h.page.navigationStarted();await h.page.domReady();assert.equal(h.zoom,.75)
    h.box={width:700,height:600};await h.page.resize();assert.equal(h.zoom,.75)
    await h.page.restoreAutoFit();assert.equal(h.zoom,.55);assert.equal(h.state.autoFit,true)
  })
  test(`${site} save failure restores live appearance without touching preference`,async()=>{
    const h=harness(site);await h.page.load();await h.page.domReady();h.fail=true
    await assert.rejects(h.page.setZoom(.75),/磁盘/);assert.equal(h.zoom,.39);assert.equal(h.state.autoFit,true)
  })
}
test('platform preferences never overwrite another platform or Douyin',async()=>{
  const settings={'douyinOpacity.zoom':.66,'windowState.weRead':{opacity:.3}}
  const b=harness('bilibili',settings),h=harness('huya',settings)
  await b.page.load();await b.page.domReady();await b.page.setZoom(.75)
  await h.page.load();await h.page.domReady();await h.page.setZoom(.4)
  assert.equal(settings['bilibiliOpacity.zoom'],.75);assert.equal(settings['huyaOpacity.zoom'],.4);assert.equal(settings['douyinOpacity.zoom'],.66)
  assert.deepEqual(settings['windowState.weRead'],{opacity:.3})
})
test('disposed controllers reject controls and clean only their own guest state',async()=>{
  const h=harness('bilibili');await assert.rejects(h.page.fullscreen(),/尚未准备/)
  await h.page.load();await h.page.domReady();await h.page.dispose();assert.equal(h.state.ready,false)
  await assert.rejects(h.page.setZoom(.4),/已关闭/);assert.match(h.calls.at(-1),/cleanupVideoPage/)
})
function run(name,document,window={},...args){assert.equal(typeof scripts[name],'function');return vm.runInNewContext(`(${scripts[name].toString()})(${args.map(arg=>JSON.stringify(arg)).join(',')})`,{document,window,KeyboardEvent:class{constructor(type,props){Object.assign(this,{type},props)}}})}
test('each platform selector takes precedence over unrelated generic controls',()=>{
  for(const site of ['bilibili','huya','kuaishou']){
    const p=get(site);let selected='';const document={querySelector:selector=>({click(){selected=selector}})}
    run('toggleVideoFullscreen',document,{},p);assert.equal(selected,p.fullscreen[0])
    run('navigateVideo',document,{},p,'next');assert.equal(selected,p.next[0])
  }
})
test('Bilibili and Huya missing next buttons cannot silently change volume or rooms',()=>{
  for(const site of ['bilibili','huya']){
    let keys=0;const doc={querySelector:()=>null,dispatchEvent(){keys++}}
    assert.throws(()=>run('navigateVideo',doc,{},get(site),'next'),/未找到|直播/);assert.equal(keys,0)
  }
})
test('Kuaishou alone can use explicit unverified feed keyboard fallback',()=>{
  const keys=[],doc={querySelector:()=>null,activeElement:{tagName:'INPUT'},dispatchEvent:event=>keys.push(event.key)}
  const result=run('navigateVideo',doc,{},get('kuaishou'),'next');assert.equal(result.verified,false);assert.deepEqual(keys,['ArrowDown','ArrowDown'])
})
test('missing fullscreen and videos report actual Chinese failures',async()=>{
  const p=get('bilibili');assert.throws(()=>run('toggleVideoFullscreen',{querySelector:()=>null},{},p),/未找到/)
  await assert.rejects(run('toggleVideoPlayback',{querySelectorAll:()=>[]},{},p),/未找到/)
})
test('fullscreen selectors cannot mistake a fullscreen page root for a control',()=>{
  let clicked=0;const body={click(){clicked++}},doc={body,querySelector:()=>body}
  assert.throws(()=>run('toggleVideoFullscreen',doc,{},get('huya')),/未找到/)
  assert.equal(clicked,0)
})
test('serialized play/pause acts on every video and hidden restore is selective',async()=>{
  const videos=[{paused:false,isConnected:true,pause(){this.paused=true},async play(){this.paused=false}},{paused:true,isConnected:true,pause(){this.paused=true},async play(){this.paused=false}}]
  const doc={querySelectorAll:()=>videos},window={},p=get('huya')
  await run('setVideoHidden',doc,window,p,true);assert.ok(videos.every(v=>v.paused))
  await run('setVideoHidden',doc,window,p,false);assert.equal(videos[0].paused,false);assert.equal(videos[1].paused,true)
  await run('toggleVideoPlayback',doc,window,p);assert.ok(videos.every(v=>v.paused))
  await run('toggleVideoPlayback',doc,window,p);assert.ok(videos.every(v=>!v.paused))
})
test('owned fit CSS is idempotent, scoped and preserves internal vertical scroll',()=>{
  const nodes=new Map(),doc={getElementById:id=>nodes.get(id),createElement:()=>({remove(){nodes.delete(this.id)}}),head:{appendChild(node){nodes.set(node.id,node)}}}
  run('prepareVideoPage',doc,{},get('huya'));run('prepareVideoPage',doc,{},get('huya'));run('prepareVideoPage',doc,{},get('bilibili'))
  assert.equal(nodes.size,2);assert.doesNotMatch([...nodes.values()][0].textContent,/overflow\s*:\s*hidden|overflow-y\s*:\s*hidden/)
  run('cleanupVideoPage',doc,{},get('huya'));assert.equal(nodes.size,1)
})
test('shared homepage entry preserves every dedicated transparent route and controller',()=>{
  const home=fs.readFileSync(new URL('../src/renderer/src/views/HomeView.vue',import.meta.url),'utf8')
  assert.match(home,/VIDEO_PLATFORM_ORDER/);assert.match(home,/videoModeControl\.open/)
  assert.doesNotMatch(home,/抖音透明化|B站透明化|虎牙透明化|快手透明化/)
  const router=fs.readFileSync(new URL('../src/renderer/src/router/index.js',import.meta.url),'utf8')
  for(const route of ['bilibiliOpacity','huyaOpacity','kuaishouOpacity'])assert.match(router,new RegExp(`path: '/${route}'.*VideoOpacityView.vue`))
  assert.match(router,/path: '\/douyinOpacity'.*DouyinOpacityView.vue/);assert.match(router,/path: '\/weRead'.*WeReadView.vue/)
  const path=new URL('../src/renderer/src/views/VideoOpacityView.vue',import.meta.url);assert.ok(fs.existsSync(path))
  const view=fs.readFileSync(path,'utf8');assert.doesNotMatch(view,/class="addr"|data-action="fullscreen"|type="checkbox"/);assert.match(view,/videoOpacityControl/)
  const preload=fs.readFileSync(new URL('../src/preload/index.js',import.meta.url),'utf8')
  assert.match(preload,/exposeInMainWorld\('videoOpacityControl'/)
  const platforms=fs.readFileSync(new URL('../src/shared/video-platforms.mjs',import.meta.url),'utf8')
  for(const target of ['bilibiliOpacity','huyaOpacity','kuaishouOpacity'])assert.match(platforms,new RegExp(`'${target}'`))
})
