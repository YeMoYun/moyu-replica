import fs from 'node:fs'
import iconv from 'iconv-lite'
import jschardet from 'jschardet'

// 读取文本文件：自动检测 GBK/Big5/UTF-8 等编码并转成 UTF-8。
export function readTextFile(filePath) {
  const buf = fs.readFileSync(filePath)
  const det = jschardet.detect(buf)
  const hint = det && det.encoding ? det.encoding : 'utf-8'
  const encoding = /^(gb|big5|gb2312|gb18030|gbk|windows-1252)/i.test(hint) ? hint : 'utf-8'
  let text
  try {
    text = iconv.decode(buf, encoding)
  } catch {
    text = iconv.decode(buf, 'utf-8')
  }
  return { text, encoding, size: buf.length }
}

// 按常见章节标题切分 TXT。
export function splitChapters(text) {
  const lines = text.split(/\r?\n/)
  const chapters = []
  let current = { title: '正文', content: [] }
  const re = /^(第[零一二三四五六七八九十百千万0-9]+[章节卷集回部篇].{0,30}|序章|序言|楔子|番外|后记|尾声|Chapter\s+\d+)/i
  for (const line of lines) {
    const t = line.trim()
    if (re.test(t) && t.length < 40) {
      if (current.content.length) chapters.push(current)
      current = { title: t, content: [] }
    } else {
      current.content.push(line)
    }
  }
  if (current.content.length) chapters.push(current)
  if (chapters.length === 0) chapters.push({ title: '全文', content: lines })
  return chapters
}

// MOBI / EPUB / PDF 的解析由主进程按格式分发；PDF 实际在渲染层用 pdfjs-dist 渲染。
export function detectBookType(filePath) {
  const ext = filePath.split('.').pop().toLowerCase()
  if (ext === 'txt') return 'txt'
  if (ext === 'mobi' || ext === 'azw' || ext === 'azw3') return 'mobi'
  if (ext === 'epub') return 'epub'
  if (ext === 'pdf') return 'pdf'
  return 'txt'
}
