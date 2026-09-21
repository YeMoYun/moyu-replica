// 渲染层站点目录：与主进程 sites.js 的 key 对应。
export const SITES = {
  web: { name: '网页端', url: '' },
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
  custom: { name: '自定义网站', url: 'about:blank', mobile: false }
}

export const MODES = ['ad', 'opacity', 'normal', 'control']