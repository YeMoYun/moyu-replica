const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, Number(value) || 0))

const chapter = (value, index) => ({
  index,
  title: String(value?.title || `第 ${index + 1} 章`),
  text: value?.text == null ? '' : String(value.text),
  html: value?.html == null ? '' : String(value.html)
})

export function normalizeLocalBook(data) {
  if (!data || data.error) throw new Error(data?.error || '书籍读取失败')
  if (data.type === 'pdf') {
    if (!data.filePath) throw new Error('PDF 文件不存在')
    return { kind: 'pdf', filePath: data.filePath, chapters: [] }
  }
  if (data.type === 'txt') {
    const content = String(data.content || '')
    const ranges = Array.isArray(data.chapters) ? data.chapters : []
    const chapters = ranges.length
      ? ranges.map((item, index) => chapter({
          title: item.title,
          text: content.slice(clamp(item.start, 0, content.length), clamp(item.end, 0, content.length))
        }, index))
      : [chapter({ title: '正文', text: content }, 0)]
    if (!chapters.some(item => item.text.trim())) throw new Error('未读取到可显示内容')
    return { kind: 'chapters', chapters }
  }
  if (data.type === 'epub') {
    const chapters = (Array.isArray(data.chapters) ? data.chapters : []).map((item, index) => chapter({
      title: item.title,
      html: item.content ?? item.text ?? ''
    }, index))
    if (!chapters.some(item => item.html.trim())) throw new Error('未读取到可显示内容')
    return { kind: 'chapters', chapters }
  }
  throw new Error('不支持的书籍格式')
}

export function normalizeLocalProgress(value, chapterCount) {
  const last = Math.max(0, Number(chapterCount) - 1)
  if (typeof value === 'number') {
    return { version: 2, kind: 'continuous', chapterIndex: clamp(Math.floor(value), 0, last), chapterOffset: 0 }
  }
  return {
    version: 2,
    kind: 'continuous',
    chapterIndex: clamp(Math.floor(value?.chapterIndex), 0, last),
    chapterOffset: clamp(value?.chapterOffset, 0, 1)
  }
}

export function progressFromSections(scrollTop, sections) {
  if (!sections.length) return normalizeLocalProgress(null, 1)
  const top = Math.max(0, Number(scrollTop) || 0)
  let index = 0
  for (let cursor = 1; cursor < sections.length; cursor++) {
    if (Number(sections[cursor].offsetTop) > top) break
    index = cursor
  }
  const section = sections[index]
  const offset = (top - Number(section.offsetTop || 0)) / Math.max(1, Number(section.offsetHeight || 1))
  return normalizeLocalProgress({ chapterIndex: index, chapterOffset: offset }, sections.length)
}

export function targetFromProgress(value, sections) {
  if (!sections.length) return 0
  const progress = normalizeLocalProgress(value, sections.length)
  const section = sections[progress.chapterIndex]
  return Number(section.offsetTop || 0) + Number(section.offsetHeight || 0) * progress.chapterOffset
}
