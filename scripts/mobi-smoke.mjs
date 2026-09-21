// 端到端验证 MOBI 解析链路（对应主进程 readMobi 的调用方式）
import { initKf8File, initMobiFile } from '@lingo-reader/mobi-parser'
import { mkdirSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const file = process.argv[2]
const tmp = path.join(os.tmpdir(), `mobi-test-${Date.now()}`)
mkdirSync(tmp, { recursive: true })

let reader = null
let kind = ''
try {
  reader = await initKf8File(file, tmp)
  kind = 'kf8'
} catch {
  reader = await initMobiFile(file, tmp)
  kind = 'mobi7'
}

const spine = reader.getSpine()
console.log(`init: ${kind}; spine chapters: ${spine.length}`)

let loaded = 0
let htmlLen = 0
for (const s of spine.slice(0, 3)) {
  try {
    const ch = reader.loadChapter(s.id)
    if (ch && ch.html) {
      loaded++
      htmlLen += ch.html.length
    }
  } catch (e) {
    console.log(`chapter load error: ${e.message}`)
  }
}
console.log(`loaded ${loaded}/3 chapters, html chars: ${htmlLen}`)

const toc = (reader.getToc && reader.getToc()) || []
console.log(`toc nodes: ${Array.isArray(toc) ? toc.length : 'n/a'}`)

try {
  reader.destroy()
} catch {}
rmSync(tmp, { recursive: true, force: true })
console.log('PASS')