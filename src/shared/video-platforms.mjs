const define = (key,label,home,host,opacityKey) => Object.freeze({
  key,label,home,hosts:Object.freeze([host]),opacityKey
})

export const VIDEO_PLATFORM_ORDER = Object.freeze([
  'douyin','bilibili','huya','douyu','kuaishou'
])

export const VIDEO_MODE_ORDER = Object.freeze([
  'ad','opacity','wechat','dingtalk','feishu'
])

export const VIDEO_PLATFORMS = Object.freeze({
  douyin:define('douyin','抖音','https://www.douyin.com/?recommend=1','douyin.com','douyinOpacity'),
  bilibili:define('bilibili','B站','https://www.bilibili.com/','bilibili.com','bilibiliOpacity'),
  huya:define('huya','虎牙','https://www.huya.com/','huya.com','huyaOpacity'),
  douyu:define('douyu','斗鱼','https://www.douyu.com/','douyu.com','douyuOpacity'),
  kuaishou:define('kuaishou','快手','https://www.kuaishou.com/','kuaishou.com','kuaishouOpacity')
})

export function videoPlatform(key) {
  if(typeof key!=='string'||!Object.hasOwn(VIDEO_PLATFORMS,key))throw new Error('不支持的视频平台')
  const definition=VIDEO_PLATFORMS[key]
  return definition
}

export function validateVideoPlatformUrl(platform,value) {
  const definition=videoPlatform(platform)
  if(typeof value!=='string')throw new Error(`${definition.label}网页地址须为文字`)
  let url
  try{url=new URL(value)}catch{throw new Error(`${definition.label}网页地址无效`)}
  const allowed=definition.hosts.some(host=>url.hostname===host||url.hostname.endsWith('.'+host))
  if(!['https:','http:'].includes(url.protocol)||url.username||url.password||!allowed){
    throw new Error(`仅支持无凭据的${definition.label}官方 HTTP(S) 页面`)
  }
  return url.href
}

export function resolveVideoMode(platform,mode) {
  const definition=videoPlatform(platform)
  if(mode==='ad')return {kind:'ad',key:definition.key}
  if(mode==='opacity')return {kind:'opacity',key:definition.opacityKey}
  if(['wechat','dingtalk','feishu'].includes(mode))return {kind:'chat',platform:definition.key,skin:mode}
  throw new Error('不支持的视频模式')
}
