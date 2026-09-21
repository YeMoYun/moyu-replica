// 诊断：setting 往返 + close 类通道为何失败
const CDP = 'http://127.0.0.1:9333'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function getTargets() {
  return (await fetch(`${CDP}/json/list`)).json()
}

function evaluate(wsUrl, expr) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl)
    const timer = setTimeout(() => { try { ws.close() } catch {}; reject(new Error('timeout')) }, 10000)
    ws.onopen = () => ws.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression: expr, awaitPromise: true, returnByValue: true } }))
    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data)
      if (msg.id === 1) {
        clearTimeout(timer)
        try { ws.close() } catch {}
        if (msg.result && msg.result.exceptionDetails) resolve({ exc: msg.result.exceptionDetails.text })
        else resolve(msg.result ? msg.result.result.value : msg)
      }
    }
    ws.onerror = () => { clearTimeout(timer); reject(new Error('ws error')) }
  })
}

const targets = await getTargets()
const home = targets.find((t) => t.type === 'page' && t.url.includes('#/home'))
if (!home) { console.log('no home'); process.exit(1) }
const ev = (e) => evaluate(home.webSocketDebuggerUrl, e)

console.log('1) set/get 往返:')
console.log('  set =', JSON.stringify(await ev('window.settingApi.setSetting("t.probe", 42)')))
console.log('  get =', JSON.stringify(await ev('window.settingApi.getSetting("t.probe")')))
console.log('  all 含 t.probe =', JSON.stringify(await ev('(() => { const a = window.settingApi.getAllSettings(); return { keys: Object.keys(a).filter(k=>k.includes("probe")||k.includes("t.")), has: a["t.probe"] } })()')))

console.log('2) 与 clear-all-info 的先后关系:')
console.log('  clear 后 all keys 前 10 =', JSON.stringify(await ev('(async () => { await window.authApi.clearAllInfo(); const a = window.settingApi.getAllSettings(); return Object.keys(a).slice(0,10) })()')))
console.log('  clear 后 get t.probe =', JSON.stringify(await ev('window.settingApi.getSetting("t.probe")')))

console.log('3) close-excel-window:')
console.log('  send 前 excel 存在 =', !!(await getTargets()).find((t) => t.type === 'page' && t.url.includes('#/excel')))
await ev('window.ipcRenderer.send("close-excel-window")')
await sleep(1500)
console.log('  send 后 excel 存在 =', !!(await getTargets()).find((t) => t.type === 'page' && t.url.includes('#/excel')))
console.log('  send 后 pages =', (await getTargets()).filter((t) => t.type === 'page').map((t) => t.url.split('#')[1]))

console.log('4) 残缺通道探测:')
for (const ch of ['create-bilibili-opacity-window', 'create-huya', 'create-douyu']) {
  try {
    const r = await ev(`window.ipcRenderer.invoke(${JSON.stringify(ch)}).then(() => "ok").catch(e => "ERR:" + e.message)`)
    console.log(`  ${ch} -> ${JSON.stringify(r)}`)
  } catch (e) { console.log(`  ${ch} -> call failed ${e.message}`) }
}