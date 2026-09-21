// CDP 端到端验证：在主窗口渲染进程里调用 createWeRead()，确认新窗口出现
const CDP = 'http://127.0.0.1:9222'

async function getTargets() {
  const r = await fetch(`${CDP}/json/list`)
  return r.json()
}

function findPage(targets, hash) {
  return targets.find((t) => t.type === 'page' && t.url.includes(hash))
}

async function evaluate(wsUrl, expr) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl)
    const timer = setTimeout(() => { try { ws.close() } catch {}; reject(new Error('CDP timeout')) }, 8000)
    ws.onopen = () => {
      ws.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression: expr, awaitPromise: true, returnByValue: true } }))
    }
    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data)
      if (msg.id === 1) {
        clearTimeout(timer)
        try { ws.close() } catch {}
        resolve(msg.result && msg.result.result ? msg.result.result.value : msg)
      }
    }
    ws.onerror = (e) => { clearTimeout(timer); reject(new Error('ws error')) }
  })
}

const start = await getTargets()
const home = findPage(start, '#/home')
console.log('home target found:', !!home)
if (!home) {
  console.log('targets:', start.filter((t) => t.type === 'page').map((t) => t.url))
  process.exit(1)
}

const ret = await evaluate(home.webSocketDebuggerUrl,
  'window.homeElectronAPI ? window.homeElectronAPI.createWeRead().then(() => "invoked") : "no-api"'
)
console.log('invoke result:', ret)

await new Promise((r) => setTimeout(r, 2500))
const after = await getTargets()
const weRead = findPage(after, '#/weRead')
console.log('weRead window created:', !!weRead, weRead ? weRead.url : '')
process.exit(weRead ? 0 : 1)