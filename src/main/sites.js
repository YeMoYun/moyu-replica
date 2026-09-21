// 站点目录 + 窗口路由映射 + 聊天皮肤 + 全局快捷键。
export const SITES = {
  douyin: { name: '抖音', url: 'https://www.douyin.com/', mobile: true },
  kuaishou: { name: '快手', url: 'https://www.kuaishou.com/', mobile: true },
  weRead: { name: '微信读书', url: 'https://weread.qq.com/', mobile: false },
  bilibili: { name: '哔哩哔哩', url: 'https://www.bilibili.com/', mobile: false },
  zhihu: { name: '知乎', url: 'https://www.zhihu.com/', mobile: false },
  huya: { name: '虎牙直播', url: 'https://www.huya.com/', mobile: false },
  douyu: { name: '斗鱼直播', url: 'https://www.douyu.com/', mobile: false },
  fanQue: { name: '番茄小说', url: 'https://fanqienovel.com/', mobile: true },
  jinJiang: { name: '晋江文学城', url: 'https://www.jjwxc.net/', mobile: false },
  game: { name: '单机游戏', url: 'about:blank', mobile: false },
  custom: { name: '自定义网页', url: 'about:blank', mobile: false }
}

// 主进程窗口路由：每个功能对应一个渲染层 hash 路由 + 窗口选项。
export { SITE_ROUTES } from './window-definitions.mjs'

export const CHAT_SKINS = {
  wechat: { title: '微信', width: 960, height: 700 },
  dingding: { title: '钉钉', width: 960, height: 700 }
}

export { SHORTCUTS } from '../shared/shortcuts.mjs'

// 后端授权接口（与原版一致，登录请求由渲染层发起）。
export const API_BASE = 'https://www.zxjy1234.com/admin-api'
export const IP_API = 'https://api.ip.sb/jsonip'
