import test from 'node:test'
import assert from 'node:assert/strict'
import {existsSync} from 'node:fs'
import {readFileSync} from 'node:fs'
const home='https://www.douyin.com/?recommend=1',a='https://www.douyin.com/video/1',b='https://www.douyin.com/video/2'
async function setup(){
  const path=new URL('../src/renderer/src/features/chat/navigation.mjs',import.meta.url)
  assert.ok(existsSync(path),'缺少排队地址同步模块')
  const {createChatNavigation}=await import(path);let url=home;const loads=[],commits=[],errors=[]
  const c=createChatNavigation({initialAddress:home,readUrl:()=>url,load:address=>{loads.push(address);return Promise.resolve()},commit:address=>commits.push(address),report:e=>errors.push(e.message)})
  return {c,loads,commits,errors,setUrl:v=>{url=v}}
}
test('address requested before first dom-ready is replayed, stale initial navigation is ignored',async()=>{
  const {c,loads,commits,setUrl}=await setup();c.addressChanged(b)
  assert.deepEqual(loads,[]);assert.equal(c.navigate(home),false);assert.deepEqual(commits,[])
  assert.equal(c.domReady(),false);assert.deepEqual(loads,[b]);c.domReady();assert.deepEqual(loads,[b])
  setUrl(b);assert.equal(c.navigate(b),true);assert.equal(c.domReady(),true);assert.deepEqual(commits,[b])
})
test('rapid changes while navigation is loading supersede old commits without duplicate loads',async()=>{
  const {c,loads,commits,setUrl}=await setup();c.navigate(home);c.domReady();commits.length=0
  c.addressChanged(a);c.addressChanged(b);assert.deepEqual(loads,[a,b])
  setUrl(a);assert.equal(c.navigate(a),false);assert.equal(c.domReady(),false);assert.deepEqual(commits,[])
  setUrl(b);assert.equal(c.navigate(b),true);assert.equal(c.domReady(),true);assert.deepEqual(commits,[b])
  c.addressChanged(b);assert.deepEqual(loads,[a,b]);c.dispose();c.addressChanged(a);assert.deepEqual(loads,[a,b])
})
test('ordinary in-page navigation is committed, echoed model URL does not reload guest',async()=>{
  const {c,loads,commits,setUrl}=await setup();c.navigate(home);c.domReady();setUrl(a);c.navigate(a);c.addressChanged(a)
  assert.deepEqual(loads,[]);assert.deepEqual(commits,[home,a]);assert.throws(()=>c.addressChanged('https://example.com'),/抖音/)
})
test('superseded navigation failure cannot replace current feedback and retry uses desired URL',async()=>{
  const {createChatNavigation}=await import('../src/renderer/src/features/chat/navigation.mjs');const errors=[],loads=[],rejects=[]
  const c=createChatNavigation({initialAddress:home,readUrl:()=>home,load:address=>{loads.push(address);return new Promise((resolve,reject)=>rejects.push(reject))},commit:()=>{},report:e=>errors.push(e.message)})
  c.domReady();c.addressChanged(a);c.addressChanged(b);rejects[0](Error('旧请求失败'));await Promise.resolve();assert.deepEqual(errors,[])
  rejects[1](Error('最新请求失败'));await Promise.resolve();assert.deepEqual(errors,['最新请求失败']);assert.equal(c.retry(),true);assert.deepEqual(loads,[a,b,b])
  c.dispose();rejects[2](Error('销毁后失败'));await Promise.resolve();assert.equal(errors.length,1)
})
test('same-site redirect chain belongs to current epoch and final canonical URL becomes ready',async()=>{
  const {c,loads,commits,setUrl}=await setup();c.domReady();c.addressChanged(a)
  const frame={isMainFrame:true,frameProcessId:20,frameRoutingId:1}
  c.started({...frame,url:a});assert.equal(c.redirect({...frame,url:b}),true);setUrl(b)
  assert.equal(c.navigate(b),true);assert.equal(c.domReady(),true);assert.deepEqual(loads,[a]);assert.deepEqual(commits,[b])
  c.addressChanged(b);assert.deepEqual(loads,[a]);assert.equal(c.retry(),false)
})
test('redirect from superseded epoch or unrelated frame cannot commit old target',async()=>{
  const {c,commits}=await setup();c.domReady();const frame={isMainFrame:true,frameProcessId:20,frameRoutingId:1}
  c.addressChanged(a);c.started({...frame,url:a});c.addressChanged(b)
  assert.equal(c.redirect({...frame,url:a+'?old=1'}),false);assert.equal(c.navigate(a+'?old=1'),false)
  c.started({...frame,url:b});assert.equal(c.redirect({...frame,frameRoutingId:2,url:a}),false);assert.deepEqual(commits,[])
  assert.throws(()=>c.redirect({...frame,url:'https://evil.invalid/'}),/抖音/)
})

test('player stops and retries rejected same-site main-frame navigation',()=>{
  const source=readFileSync(new URL('../src/renderer/src/features/chat/ChatPlayer.vue',import.meta.url),'utf8')
  assert.match(source,/event\.isMainFrame===false[^}]*return[\s\S]*!navigation\.started\(event\)[\s\S]*guest\.value\.stop\(\)[\s\S]*navigation\.retry\(\)/)
  assert.match(source,/if\(!navigation\.navigate\(event\.url\)\)\{guest\.value\.stop\(\);navigation\.retry\(\);return\}/)
})
