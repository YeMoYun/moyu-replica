import test from 'node:test'
import assert from 'node:assert/strict'
const { validateUnmanagedSettings, validateUnmanagedSettingRead, sanitizeUnmanagedSettings } = await import('../src/main/settings-guard.mjs').catch((e)=>{
  if(e.code==='ERR_MODULE_NOT_FOUND') return {}
  throw e
})
test('generic settings cannot bypass managed shortcuts or live window state',()=>{
  assert.equal(typeof validateUnmanagedSettings,'function')
  for(const values of [{shortcuts:{boss:'Ctrl+X'}},{'shortcuts.boss':'Ctrl+X'},{windowState:{web:{opacity:0.2}}},{'web.alwaysOnTop':true},{web:{autoHideEnabled:true}}]) {
    assert.throws(()=>validateUnmanagedSettings(values),/专用/)
  }
})
test('ordinary style settings remain writable',()=>{
  assert.equal(typeof validateUnmanagedSettings,'function')
  assert.doesNotThrow(()=>validateUnmanagedSettings({'web.fontColor':'#000000',cacheCleared:123}))
})
test('generic settings cannot read or overwrite either chat profile',()=>{
  assert.equal(typeof validateUnmanagedSettingRead,'function')
  for(const values of [
    {'chatModes.wechat':{}},{chatModes:{dingtalk:{}}},{'chatMigration.dingtalk':{}},
    {chatWindows:{wechat:{}}},{wechatConfig:{}},{dingdingConfig:{}},{'dingding.currentSiteKey':'douyin'}
  ]) assert.throws(()=>validateUnmanagedSettings(values),/专用/)
  for(const key of ['chatModes.wechat','chatModes.dingtalk','chatMigration.wechat','chatWindows.dingtalk','wechatConfig','dingdingConfig','dingding.currentSiteKey']) {
    assert.throws(()=>validateUnmanagedSettingRead(key),/专用/)
  }
  assert.throws(()=>validateUnmanagedSettings({'chatModes.feishu':{}}),/专用/)
  assert.throws(()=>validateUnmanagedSettingRead('chatMigration.feishu'),/专用/)
  assert.deepEqual(sanitizeUnmanagedSettings({chatModes:{feishu:{secret:true}},chatWindows:{feishu:{x:1}},theme:'light'}),{theme:'light'})
})
test('bulk settings reads remove chat state and legacy migration data',()=>{
  assert.equal(typeof sanitizeUnmanagedSettings,'function')
  const result=sanitizeUnmanagedSettings({
    opacity:0.8,web:{fontColor:'#000'},chatModes:{wechat:{secret:1},dingtalk:{secret:2}},
    chatMigration:{dingtalk:{legacy:'secret'}},chatWindows:{dingtalk:{bounds:{x:1}}},
    wechatConfig:{contacts:['secret']},dingdingConfig:{contacts:['secret']},dingding:{currentSiteKey:'douyin',theme:'blue'}
  })
  assert.deepEqual(result,{opacity:0.8,web:{fontColor:'#000'},dingding:{theme:'blue'}})
})
