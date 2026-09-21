import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
const base='../src/renderer/src/features/reading-sites/'
test('both platforms restrict remembered URLs to their own secure site',async()=>{
  const {READING_PLATFORMS,isReadingURL,isReadingSiteURL}=await import(base+'platforms.mjs')
  const fan=READING_PLATFORMS.fanQue,jj=READING_PLATFORMS.jinJiang
  assert.ok(isReadingURL(fan,'https://fanqienovel.com/reader/123'))
  assert.ok(isReadingURL(jj,'https://www.jjwxc.net/onebook.php?novelid=1&chapterid=2'))
  for(const url of ['https://evil.com/reader/1','https://fanqienovel.com.evil.com/reader/1','http://fanqienovel.com/reader/1','https://a:b@fanqienovel.com/reader/1','https://fanqienovel.com:8443/reader/1'])assert.equal(isReadingSiteURL(fan,url),false)
  for(const url of ['https://jjwxc.net.evil.com/onebook.php?novelid=1&chapterid=1','http://jjwxc.net/','https://user@jjwxc.net/','https://jjwxc.net:8443/'])assert.equal(isReadingSiteURL(jj,url),false)
  assert.equal(isReadingURL(jj,'https://www.jjwxc.net/onebook.php?novelid=1'),false)
})
test('settings are isolated, legacy values clamped, foreign URL rejected',async()=>{
  const {READING_PLATFORMS}=await import(base+'platforms.mjs')
  const {createReadingState,createReadingController}=await import(base+'controller.mjs')
  for(const key of ['fanQue','jinJiang']){
    const platform=READING_PLATFORMS[key],state=createReadingState(platform),writes=[]
    const settings={getSetting:async k=>({[key+'Zoom']:9,[key+'ScrollSpeed']:0,[key+'.lastAddress']:'https://evil.com'}[k]),setSetting:async(k,v)=>writes.push([k,v]),setSettings:async()=>{}}
    const page=createReadingController({state,platform,getWebview:()=>null,settings})
    await page.load();assert.equal(state.zoom,1);assert.equal(state.speed,1);assert.equal(state.lastAddress,platform.home)
    await page.setTransparent(true);await page.setZoom(.7);assert.ok(writes.every(([k])=>k.startsWith(key)))
    await page.dispose()
  }
})
test('failed persistence leaves displayed setting unchanged',async()=>{
  const {READING_PLATFORMS}=await import(base+'platforms.mjs')
  const {createReadingState,createReadingController}=await import(base+'controller.mjs')
  const platform=READING_PLATFORMS.fanQue,state=createReadingState(platform)
  const page=createReadingController({state,platform,getWebview:()=>null,settings:{setSetting:async()=>{throw Error('磁盘写入失败')}}})
  await assert.rejects(page.setZoom(.9),/磁盘/);assert.equal(state.zoom,.75)
})
test('dedicated reading routes and all accepted toolbar actions',async()=>{
  const router=await readFile(new URL('../src/renderer/src/router/index.js',import.meta.url),'utf8')
  for(const key of ['fanQue','jinJiang'])assert.match(router,new RegExp("path: '/"+key+"'.*ReadingSiteView"))
  const view=await readFile(new URL('../src/renderer/src/views/ReadingSiteView.vue',import.meta.url),'utf8')
  for(const action of ['hide-bar','show-bar','close','topmost','auto-hide','web-transparent','opacity','reader-controls','more','home','help','auto-scroll','scrollbar','style','reset-style'])assert.ok(view.includes('data-action="'+action+'"'))
  assert.match(view,/height:30px/);assert.match(view,/allowpopups/)
  assert.match(view,/dialogElement/);assert.match(view,/event.key==='Tab'/)
})
test('guest error message survives envelope and transparency is restored',async()=>{
  const {READING_PLATFORMS}=await import(base+'platforms.mjs')
  const {createReadingState,createReadingController}=await import(base+'controller.mjs')
  const platform=READING_PLATFORMS.fanQue,state=createReadingState(platform),styles=new Map();let n=0
  const view={executeJavaScript:async code=>code.includes('function showReadingControls')?{ok:false,error:'未找到真实目录'}:{ok:true,value:{}},insertCSS:async css=>{const id=String(++n);styles.set(id,css);return id},removeInsertedCSS:async id=>styles.delete(id),setZoomFactor:async()=>{},getURL:()=>platform.home+'reader/123'}
  const settings={setSetting:async()=>{}}
  const page=createReadingController({state,platform,getWebview:()=>view,settings});await page.domReady();await page.setTransparent(true)
  await assert.rejects(page.toggleReaderControls(),/未找到真实目录/);assert.equal(state.controlsShown,false);assert.equal(state.transparent,true)
  assert.ok([...styles.values()].some(css=>css.includes('background: transparent')));await page.dispose();assert.equal(styles.size,0)
})
test('navigation rejects old operations; in-place readiness does not leak CSS',async()=>{
  const {READING_PLATFORMS}=await import(base+'platforms.mjs')
  const {createReadingState,createReadingController}=await import(base+'controller.mjs')
  const platform=READING_PLATFORMS.jinJiang,state=createReadingState(platform),styles=new Set();let n=0
  const view={executeJavaScript:async()=>({ok:true,value:{}}),insertCSS:async()=>{const id=++n;styles.add(id);return id},removeInsertedCSS:async id=>styles.delete(id),setZoomFactor:async()=>{},getURL:()=>platform.home}
  const page=createReadingController({state,platform,getWebview:()=>view,settings:{setSetting:async()=>{}}})
  await page.domReady();const count=styles.size;await page.domReady({newDocument:false});assert.equal(styles.size,count)
  page.navigationStarted();await assert.rejects(page.toggleReaderControls(),/导航/);assert.equal(state.ready,false);await page.dispose()
})
test('auto-scroll refuses missing actual chapter without persisting enabled',async()=>{
  const {READING_PLATFORMS}=await import(base+'platforms.mjs')
  const {createReadingState,createReadingController}=await import(base+'controller.mjs')
  const platform=READING_PLATFORMS.fanQue,state=createReadingState(platform),writes=[]
  const view={executeJavaScript:async code=>code.includes('function assertReadingContent')?{ok:false,error:'请先进入正文'}:{ok:true,value:{}},insertCSS:async()=>1,removeInsertedCSS:async()=>{},setZoomFactor:async()=>{},getURL:()=>platform.home+'reader/123'}
  const page=createReadingController({state,platform,getWebview:()=>view,settings:{setSetting:async(k,v)=>writes.push([k,v])}})
  await page.domReady();await assert.rejects(page.setAutoScroll(true),/正文/);assert.equal(state.autoScrollEnabled,false);assert.ok(!writes.some(([k,v])=>k.endsWith('AutoScrollEnabled')&&v===true))
})
