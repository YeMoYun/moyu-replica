import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import { ref } from 'vue'
test('web transparency inserts and removes CSS rather than dimming the native window', async () => {
  const source=fs.readFileSync(new URL('../src/renderer/src/views/TestPierceView.vue',import.meta.url),'utf8')
  const script=source.match(/<script setup>([\s\S]*?)<\/script>/)[1].replace(/^import .*$/gm,'')
  const nativeCalls=[]; const calls=[]
  const context=vm.createContext({ref,onMounted:()=>{},onUnmounted:()=>{},window:{ipcRenderer:{invoke:async(...args)=>nativeCalls.push(args)}}})
  vm.runInContext(`${script}\nglobalThis.page={toggleTransparent,error,viewRef:typeof wv==='undefined'?null:wv}`,context)
  assert.ok(context.page.viewRef,'webview ref must be defined')
  context.page.viewRef.value={insertCSS:async(css)=>{calls.push(css);return 'css-key'},removeInsertedCSS:async(key)=>calls.push(key)}
  await context.page.toggleTransparent(); await context.page.toggleTransparent()
  assert.equal(nativeCalls.length,0)
  assert.match(calls[0],/background.*transparent/)
  assert.equal(calls[1],'css-key')
  assert.equal(context.page.error.value,'')
})
