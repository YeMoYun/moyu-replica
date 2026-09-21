import path from 'node:path'
import { app } from 'electron'
import { createFileStore } from './storage.mjs'

// 轻量 JSON 配置存储（复刻 electron-store 的用法，但去掉原生依赖）。
export function createStore(name, defaults = {}) {
  const file = path.join(app.getPath('userData'), `${name}.json`)
  return createFileStore(file, defaults)
}
