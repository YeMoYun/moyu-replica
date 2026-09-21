import test from 'node:test'
import assert from 'node:assert/strict'
import vm from 'node:vm'
import fs from 'node:fs'
let scripts={}
try{scripts=await import('../src/renderer/src/features/video-opacity/huya-window-fill.mjs')}catch(error){if(error.code!=='ERR_MODULE_NOT_FOUND')throw error}
function run(name,context){assert.equal(typeof scripts[name],'function',name);return vm.runInNewContext(`(${scripts[name].toString()})()`,context)}
function page(){
  const nodes=new Map(),listeners=new Map(),window={scrollX:4,scrollY:85,scrollTo(x,y){this.scrollX=x;this.scrollY=y}}
  const node=()=>({attributes:new Map(),isConnected:true,setAttribute(k,v){this.attributes.set(k,v)},getAttribute(k){return this.attributes.get(k)??null},hasAttribute(k){return this.attributes.has(k)},removeAttribute(k){this.attributes.delete(k)},remove(){nodes.delete(this.id)},contains(other){return other===button}})
  const body=node(),html=node(),parent=node(),player=node(),button=node();player.parentElement=parent;parent.parentElement=body;body.parentElement=html
  const document={body,documentElement:html,head:{appendChild(n){nodes.set(n.id,n)}},createElement:()=>node(),getElementById:id=>nodes.get(id),querySelector:()=>player,addEventListener(type,fn){listeners.set(type,fn)},removeEventListener(type,fn){if(listeners.get(type)===fn)listeners.delete(type)}}
  button.closest=()=>button
  return {context:{window,document},window,document,nodes,listeners,player,parent,button}
}
test('Huya prepare installs one window-local toggle and repeated setup is idempotent',()=>{
  const h=page();run('installHuyaWindowFill',h.context);run('installHuyaWindowFill',h.context)
  assert.equal(h.listeners.size,2);assert.ok(h.window.__moyuHuyaWindowFill)
})
test('fullscreen adds genuine viewport geometry CSS and exits without overwriting original attributes',()=>{
  const h=page();h.player.setAttribute('data-moyu-huya-player','original');h.parent.setAttribute('style','transform:translateX(25px)')
  run('installHuyaWindowFill',h.context);const result=run('toggleHuyaWindowFill',h.context)
  assert.equal(result.fullscreen,true);assert.equal(h.player.getAttribute('data-moyu-huya-player'),'true')
  const css=[...h.nodes.values()].map(n=>n.textContent).join('');assert.match(css,/100vw/);assert.match(css,/100vh/);assert.match(css,/object-fit:contain/)
  run('toggleHuyaWindowFill',h.context);assert.equal(h.player.getAttribute('data-moyu-huya-player'),'original')
  assert.equal(h.parent.getAttribute('style'),'transform:translateX(25px)');assert.equal(h.nodes.size,0)
})
test('actual captured button click avoids native fullscreen and Escape restores window-local layout',()=>{
  const h=page();run('installHuyaWindowFill',h.context);let prevented=0,stopped=0
  h.listeners.get('click')({target:h.button,preventDefault(){prevented++},stopImmediatePropagation(){stopped++}})
  assert.equal(prevented,1);assert.equal(stopped,1);assert.equal(h.player.getAttribute('data-moyu-huya-player'),'true')
  h.listeners.get('keydown')({key:'Escape',preventDefault(){},stopImmediatePropagation(){}})
  assert.equal(h.player.hasAttribute('data-moyu-huya-player'),false);assert.equal(h.window.scrollY,85)
})
test('cleanup removes owned resources and missing player never claims fullscreen success',()=>{
  const h=page();run('installHuyaWindowFill',h.context);run('toggleHuyaWindowFill',h.context);run('cleanupHuyaWindowFill',h.context)
  assert.equal(h.listeners.size,0);assert.equal(h.nodes.size,0);assert.equal(h.window.__moyuHuyaWindowFill,undefined)
  run('installHuyaWindowFill',h.context);h.document.querySelector=()=>null
  assert.throws(()=>run('toggleHuyaWindowFill',h.context),/未找到.*播放器/)
})
test('only Huya lifecycle installs and dispatches the window-fill implementation',()=>{
  const source=fs.readFileSync(new URL('../src/renderer/src/features/video-opacity/controller.mjs',import.meta.url),'utf8')
  assert.match(source,/huya-window-fill/);assert.match(source,/platform.key\s*===\s*'huyaOpacity'/)
  assert.match(source,/installHuyaWindowFill/);assert.match(source,/toggleHuyaWindowFill/);assert.match(source,/cleanupHuyaWindowFill/)
})
