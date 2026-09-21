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
  const definition=VIDEO_PLATFORMS[key]
  if(!definition)throw new Error('不支持的视频平台')
  return definition
}

export function resolveVideoMode(platform,mode) {
  const definition=videoPlatform(platform)
  if(mode==='ad')return {kind:'ad',key:definition.key}
  if(mode==='opacity')return {kind:'opacity',key:definition.opacityKey}
  if(['wechat','dingtalk','feishu'].includes(mode))return {kind:'chat',platform:definition.key,skin:mode}
  throw new Error('不支持的视频模式')
}
