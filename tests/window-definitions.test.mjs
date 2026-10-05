import test from 'node:test'
import assert from 'node:assert/strict'
const { SITE_ROUTES } = await import('../src/main/window-definitions.mjs').catch((e) => {
  if (e.code === 'ERR_MODULE_NOT_FOUND') return {}
  throw e
})
test('window entry options match the source geometry and native frame distinctions', () => {
  assert.ok(SITE_ROUTES, 'window definitions must exist')
  assert.deepEqual([SITE_ROUTES.web.width,SITE_ROUTES.web.height,SITE_ROUTES.web.transparent], [1200,800,true])
  assert.deepEqual([SITE_ROUTES.douyin.width,SITE_ROUTES.douyin.height,SITE_ROUTES.douyin.rightBottom],[286,420,true])
  assert.deepEqual([SITE_ROUTES.keyword.width,SITE_ROUTES.keyword.height],[600,920])
  assert.equal(SITE_ROUTES.wechatConfig.frame,true)
  assert.equal(SITE_ROUTES.dingdingConfig.frame,true)
  assert.equal(SITE_ROUTES.testPierce.transparent,true)
  assert.equal(SITE_ROUTES.testPierce.alwaysOnTop,true)
  assert.equal(SITE_ROUTES.wechat.alwaysOnTop,undefined)
})
test('all managed route variants including ad readers have explicit sizes', () => {
  assert.ok(SITE_ROUTES)
  for (const key of ['weReadAd','bookReaderAd','localVideoOpacity','bookReader']) {
    assert.ok(SITE_ROUTES[key].width>0); assert.ok(SITE_ROUTES[key].height>0)
  }
})
test('local reader keeps its default size and has an explicit resize floor', () => {
  assert.deepEqual(
    [SITE_ROUTES.bookReader.width, SITE_ROUTES.bookReader.height],
    [400, 300]
  )
  assert.deepEqual(
    [SITE_ROUTES.bookReader.minWidth, SITE_ROUTES.bookReader.minHeight, SITE_ROUTES.bookReader.resizable],
    [320, 240, true]
  )
})
test('WeRead window is edge-resizable and pinned above the taskbar by default', () => {
  assert.deepEqual(
    [SITE_ROUTES.weRead.width, SITE_ROUTES.weRead.height],
    [400, 800]
  )
  assert.equal(SITE_ROUTES.weRead.resizable, true)
  assert.deepEqual(
    [SITE_ROUTES.weRead.minWidth, SITE_ROUTES.weRead.minHeight],
    [320, 400]
  )
  assert.equal(SITE_ROUTES.weRead.alwaysOnTop, true)
})
test('all video advertisement windows use compact always-on-top bounds',()=>{
  for(const key of ['douyin','bilibili','huya','douyu','kuaishou']){
    assert.equal(SITE_ROUTES[key].width,286)
    assert.equal(SITE_ROUTES[key].height,420)
    assert.equal(SITE_ROUTES[key].alwaysOnTop,true)
    assert.equal(SITE_ROUTES[key].rightBottom,true)
  }
})
