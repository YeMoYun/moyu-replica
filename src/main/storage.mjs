import fs from 'node:fs'
import path from 'node:path'

const clone = (value) => value === undefined ? undefined : structuredClone(value)
const parts = (key) => {
  if (typeof key !== 'string' || !key.length) throw new Error('配置键不能为空')
  const result = key.split('.')
  if (result.some((part) => !part || ['__proto__', 'prototype', 'constructor'].includes(part))) {
    throw new Error('配置键包含非法路径')
  }
  return result
}

export function createFileStore(file, defaults = {}) {
  let data = clone(defaults)
  try {
    const saved = JSON.parse(fs.readFileSync(file, 'utf8'))
    if (!saved || Array.isArray(saved) || typeof saved !== 'object') throw new Error('配置文件不是对象')
    data = { ...data, ...saved }
  } catch (error) {
    if (error.code !== 'ENOENT') throw new Error(`读取配置失败，原文件已保留：${error.message}`)
  }
  function persist(next) {
    fs.mkdirSync(path.dirname(file), { recursive: true })
    const temporary = `${file}.${process.pid}.tmp`
    try {
      fs.writeFileSync(temporary, JSON.stringify(next, null, 2), 'utf8')
      fs.renameSync(temporary, file)
      data = next
    } catch (error) {
      try { fs.unlinkSync(temporary) } catch (cleanup) { if (cleanup.code !== 'ENOENT') console.error(cleanup) }
      throw new Error(`保存配置失败：${error.message}`)
    }
  }
  function assign(target, key, value) {
    const pathParts = parts(key)
    // Existing flat dotted keys belong to earlier replica versions; retain their representation.
    if (Object.hasOwn(target, key)) {
      if (value === undefined) delete target[key]
      else target[key] = clone(value)
      return
    }
    let node = target
    for (const part of pathParts.slice(0, -1)) {
      if (!node[part] || typeof node[part] !== 'object' || Array.isArray(node[part])) node[part] = {}
      node = node[part]
    }
    if (value === undefined) delete node[pathParts.at(-1)]
    else node[pathParts.at(-1)] = clone(value)
  }
  return {
    get(key) {
      const pathParts = parts(key)
      if (Object.hasOwn(data, key)) return clone(data[key])
      let result = data
      for (const part of pathParts) result = result && Object.hasOwn(result, part) ? result[part] : undefined
      return clone(result)
    },
    set(key, value) {
      const next = clone(data)
      assign(next, key, value)
      persist(next)
      return clone(value)
    },
    setMany(values) {
      const next = clone(data)
      for (const [key, value] of Object.entries(values)) assign(next, key, value)
      persist(next)
      return clone(data)
    },
    all: () => clone(data),
    clear() { persist(clone(defaults)); return clone(data) }
  }
}
