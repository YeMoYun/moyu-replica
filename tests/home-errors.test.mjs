import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import { ref } from 'vue'
test('startup shortcut failures are visible on home and listener cleanup is available',async()=>{
  const source=fs.readFileSync(new URL('../src/renderer/src/views/HomeView.vue',import.meta.url),'utf8')
  const script=source.match(/<script setup>([\s\S]*?)<\/script>/)[1].replace(/^import .*$/gm,'')
  let disposed=false
  const context=vm.createContext({ref,useRouter:()=>({push:()=>{}}),onMounted:(cb)=>{context.mount=cb},onUnmounted:(cb)=>{context.unmount=cb},window:{homeElectronAPI:{},ipcRenderer:{invoke:async()=>({success:false,errors:[{message:'Ctrl+D 已被占用'}]})},windowControl:{onError:()=>()=>{disposed=true}}}})
  vm.runInContext(`${script}\nglobalThis.errorRef=typeof appError==='undefined'?null:appError`,context)
  assert.ok(context.errorRef,'home error state must exist')
  await context.mount()
  assert.match(context.errorRef.value,/Ctrl\+D.*占用/)
  context.unmount();assert.equal(disposed,true)
  assert.match(source,/role="alert"/)
})
