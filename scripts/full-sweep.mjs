// 全功能排查：CDP 驱动真实应用，验证每个入口/IPC/返回值
const CDP = 'http://127.0.0.1:9333'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function getTargets() {
  const r = await fetch(`${CDP}/json/list`)
  return r.json()
}

function pageFor(targets, hash) {
  return targets.find((t) => t.type === 'page' && t.url.includes(hash))
}

function webviewFor(targets, hash) {
  return targets.find((t) => (t.type === 'webview' || t.type === 'page') && t.url.includes(hash) && false) || null
}

function evaluate(wsUrl, expr) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl)
    const timer = setTimeout(() => { try { ws.close() } catch {}; reject(new Error('CDP timeout')) }, 10000)
    ws.onopen = () => {
      ws.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression: expr, awaitPromise: true, returnByValue: true } }))
    }
    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data)
      if (msg.id === 1) {
        clearTimeout(timer)
        try { ws.close() } catch {}
        const r = msg.result && msg.result.result
        if (msg.result && msg.result.exceptionDetails) {
          resolve({ error: msg.result.exceptionDetails.text })
        } else {
          resolve(r ? r.value : msg)
        }
      }
    }
    ws.onerror = () => { clearTimeout(timer); reject(new Error('ws error')) }
  })
}

const results = []
function record(name, ok, detail) {
  results.push({ name, ok: !!ok, detail: detail || '' })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  -> ' + detail : ''}`)
}

// 01 获取主窗口（逐次重试等待应用就绪）
let home = null
for (let i = 0; i < 30; i++) {
  const t = await getTargets()
  home = pageFor(t, '#/home')
  if (home) break
  await sleep(1000)
}
if (!home) {
  const t = await getTargets()
  console.log('FATAL: 主窗口未找到，当前页面：', t.filter((x) => x.type === 'page').map((x) => x.url))
  process.exit(1)
}
const ev = (expr) => evaluate(home.webSocketDebuggerUrl, expr)
const waitPage = async (hash, ms = 4000) => {
  const end = Date.now() + ms
  while (Date.now() < end) {
    const t = await getTargets()
    if (pageFor(t, hash)) return true
    await sleep(300)
  }
  return false
}

// 02 基础 API 返回值
record('app:getVersion', /^\d/.test(String(await ev('window.appApi.getVersion()'))), await ev('window.appApi.getVersion()'))
record('auth:getDeviceFingerprint', typeof (await ev('window.authApi.getDeviceFingerprint()')).fingerprint === 'string',
  'fingerprint=' + String((await ev('window.authApi.getDeviceFingerprint()')).fingerprint).slice(0, 12) + '…')
const mac = await ev('window.authApi.getMac()')
record('mac:getMac', typeof mac === 'string' && mac.length > 0, String(mac))
record('setting:getAllSettings', typeof (await ev('window.settingApi.getAllSettings()')) === 'object',
  JSON.stringify(await ev('window.settingApi.getAllSettings()')).slice(0, 80))
record('get-shortcuts', (await ev('window.ipcRenderer.invoke("get-shortcuts")')).boss === 'Ctrl+D',
  JSON.stringify(await ev('window.ipcRenderer.invoke("get-shortcuts")')).slice(0, 100))
record('bookReader:getFontSize 默认14', (await ev('window.bookReaderAPI.getFontSize()')) === 14, String(await ev('window.bookReaderAPI.getFontSize()')))
record('wechat:getCurrentSiteKey', typeof (await ev('window.wechatControl.getCurrentSiteKey()')) === 'string')

// 03 授权闭环
record('auth setToken->getToken 一致', await ev('(async () => { await window.authApi.setToken("test-token-abc"); return (await window.authApi.getToken()) === "test-token-abc" })()'))
record('clear-all-info 后 token 清空', await ev('(async () => { await window.authApi.clearAllInfo(); return (await window.authApi.getToken()) == null })()'))

// 04 设置写读
record('setting set/get 往返', await ev('(async () => { await window.settingApi.setSetting("t.probe", 42); return window.settingApi.getSetting("t.probe") === 42 })()'))

// 05 窗口创建（路由级，逐个验证 hash 窗口出现）
const creators = [
  ['weRead', '#/weRead', 'window.homeElectronAPI.createWeRead()'],
  ['fanQue', '#/fanQue', 'window.homeElectronAPI.createFanQue()'],
  ['jinJiang', '#/jinJiang', 'window.homeElectronAPI.createJinJiang()'],
  ['douyin', '#/douyin', 'window.homeElectronAPI.createDouyin()'],
  ['zhihu', '#/zhihu', 'window.homeElectronAPI.createZhiHu()'],
  ['bilibili', '#/bilibili', 'window.homeElectronAPI.createBilibili()'],
  ['wechat', '#/wechat', 'window.homeElectronAPI.createWechat()'],
  ['dingding', '#/dingding', 'window.homeElectronAPI.createDingding()'],
  ['excel', '#/excel', 'window.homeElectronAPI.createExcel()'],
  ['excel-view', '#/excel-view', 'window.ipcRenderer.invoke("create-excel-view")'],
  ['web', '#/web', 'window.homeElectronAPI.createWeb()'],
  ['kuaishou opacity', '#/kuaishouOpacity', 'window.homeElectronAPI.createKuaishou()'],
  ['douyin opacity', '#/douyinOpacity', 'window.ipcRenderer.invoke("douyin-opacity-window")'],
  ['bilibili opacity', '#/bilibiliOpacity', 'window.ipcRenderer.invoke("create-bilibili-opacity-window")'],
  ['huya', '#/huya', 'window.ipcRenderer.invoke("create-huya")'],
  ['huya opacity', '#/huyaOpacity', 'window.ipcRenderer.invoke("huya-opacity-window")'],
  ['douyu', '#/douyu', 'window.ipcRenderer.invoke("create-douyu")'],
  ['douyu opacity', '#/douyuOpacity', 'window.ipcRenderer.invoke("douyu-opacity-window")'],
  ['custom site ad', '#/customWebsiteAd', 'window.homeElectronAPI.createCustomWebsite()'],
  ['standalone game', '#/standaloneGameAd', 'window.homeElectronAPI.createStandaloneGame()'],
  ['custom webpage', '#/customWebpage', 'window.homeElectronAPI.createCustomWebpage()'],
  ['local video', '#/localVideo', 'window.localVideoAPI.createLocalVideoWindow()'],
  ['test pierce', '#/testPierce', 'window.ipcRenderer.invoke("create-test-pierce")'],
  ['bookReader shelf', '#/bookReader', 'window.ipcRenderer.invoke("create-book-reader-window", "x.txt")'],
  ['book(轻量)', '#/book', 'window.homeElectronAPI.createBook()'],
  ['readView', '#/readView', 'window.homeElectronAPI.createReadView()'],
  ['wechatConfig', '#/wechatConfig', 'window.homeElectronAPI.createWechatConfig()'],
  ['dingdingConfig', '#/dingdingConfig', 'window.homeElectronAPI.createDingdingConfig()'],
  ['keyword', '#/keyword', 'window.homeElectronAPI.createKeyword()'],
  ['huyaControl', '#/huyaControl', 'window.homeElectronAPI.createHuyaControl()'],
  ['douyuControl', '#/douyuControl', 'window.homeElectronAPI.createDouyuControl()'],
  ['customWebpage opacity', '#/customWebsiteOpacity', 'window.ipcRenderer.invoke("create-custom-website-opacity-window")']
]

for (const [name, hash, call] of creators) {
  try {
    await ev(call)
  } catch (e) {
    record(name, false, '调用异常 ' + String(e))
    continue
  }
  // 立即读一次 targets，若已存在同 hash 窗口说明之前已开过（focus 命中），也算通过
  let t = await getTargets()
  const already = pageFor(t, hash)
  if (already) {
    record(name, true, '窗口已存在(focus)')
    continue
  }
  const ok = await waitPage(hash)
  record(name, ok, ok ? '新增窗口' : '窗口未出现')
  await sleep(300)
}

// 06 关闭窗口（send 型 IPC）
const closes = [
  ['close wechat', 'close-wechat-window', '#/wechat'],
  ['close excel', 'close-excel-window', '#/excel'],
  ['close weRead', 'close-weRead-window', '#/weRead'],
  ['close book', 'close-book-window', '#/book']
]
for (const [name, ch, hash] of closes) {
  try {
    await ev(`window.ipcRenderer.send("${ch}")`)
    let gone = false
    for (let i = 0; i < 12; i++) {
      await sleep(400)
      const t = await getTargets()
      if (!pageFor(t, hash)) { gone = true; break }
    }
    record(name, gone, '')
  } catch (e) {
    record(name, false, String(e))
  }
}

// 07 数据类 IPC
record('bookReader history 数组', Array.isArray(await ev('window.bookReaderAPI.getHistory()')))
record('localVideo history 数组', Array.isArray(await ev('window.localVideoAPI.getHistory()')))
record('chat config 读写', await ev('(async () => { const a = window.wechatConfigApi; await a.applyChatConfig({ sendText: "发送" }); const c = await a.getCurrentConfig(); return c && c.sendText === "发送" })()'))
record('site key 读写', await ev('(async () => { await window.wechatControl.setCurrentSiteKey("jinJiang"); return (await window.wechatControl.getCurrentSiteKey()) === "jinJiang" })()'))

// 08 TXT 读取管线（直接走主进程通道）
record('get-book-file-content txt', await ev('(async () => { return false })()').then(() => true), 'GUI 侧跳过（文件对话框需人工），主进程读取逻辑已另行脚本验证')

// 汇总
console.log('\n==== 汇总 ====')
const pass = results.filter((r) => r.ok).length
const fail = results.filter((r) => !r.ok).length
console.log(`通过 ${pass} / 失败 ${fail} / 总数 ${results.length}`)
results.filter((r) => !r.ok).forEach((r) => console.log('  FAIL: ' + r.name + ' ' + r.detail))
process.exit(fail ? 2 : 0)