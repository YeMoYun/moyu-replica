import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const read = name => readFile(new URL(`../scripts/${name}`, import.meta.url), 'utf8')

test('advertisement smoke blocks plain HTTP and reports blocked request isolation',async()=>{
  const source=await read('ad-modes-smoke.cjs')
  assert.match(source,/onBeforeRequest\(\{\s*urls:\s*\['http:\/\/\*\/\*'\]\s*\}/)
  assert.match(source,/blockedHttpRequests/)
  assert.match(source,/remoteRequestsBlocked:\s*true/)
})

test('advertisement restart smoke proves four platform preference namespaces independently',async()=>{
  const source=await read('ad-modes-smoke.cjs')
  assert.match(source,/videoPreferences/)
  for(const key of ['bilibili','huya','douyu','kuaishou']){
    assert.match(source,new RegExp(`${key}:\\s*\\{[^}]*skin:[^}]*zoom:`))
  }
  assert.match(source,/cfg\.skin/)
  assert.match(source,/cfg\.zoom/)
})

test('video opacity smoke still exercises the three legacy direct bridge methods',async()=>{
  const source=await read('video-opacity-smoke.cjs')
  for(const method of ['createBilibiliOpacity','createHuyaOpacity','createKuaishou']){
    assert.match(source,new RegExp(`['\"]${method}['\"]`))
  }
  assert.match(source,/homeElectronAPI\.\$\{method\}\(\)/)
  assert.match(source,/legacy.*direct.*entr/i)
})
