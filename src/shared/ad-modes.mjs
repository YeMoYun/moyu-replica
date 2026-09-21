export const AD_MODES = {
  douyin: {home:'https://www.douyin.com/?recommend=1',transparentKey:'douyinOpacity',width:286,height:420},
  weReadAd: {home:'https://weread.qq.com/',transparentKey:'weRead',width:351,height:430}
}
function mode(kind){if(!Object.hasOwn(AD_MODES,kind))throw Error('不支持的广告模式');return AD_MODES[kind]}
const number=(value,fallback,min,max)=>value!==null&&value!==''&&Number.isFinite(Number(value))?Math.max(min,Math.min(max,Number(value))):fallback
export function validateAdUrl(kind,value){
  mode(kind);let url
  try{url=new URL(value)}catch{throw Error('网页地址无效')}
  const domain=kind==='douyin'?'douyin.com':'weread.qq.com'
  if(!['https:','http:'].includes(url.protocol)||url.username||url.password||!(url.hostname===domain||(kind==='douyin'&&url.hostname.endsWith('.'+domain))))throw Error('只能打开此应用的 HTTP(S) 网页')
  return url.href
}
export function normalizeAdSettings(kind,value={}){
  const definition=mode(kind),reading=kind==='weReadAd'
  let address=definition.home
  try{if(value.address)address=validateAdUrl(kind,value.address)}catch{}
  return {zoom:number(value.zoom,reading?.7:.2,reading?.6:.1,1),speed:Math.round(number(value.speed,3,1,10)),
    autoScroll:value.autoScroll===true,scrollbarHidden:value.scrollbarHidden!==false,
    color:typeof value.color==='string'&&/^#[\da-f]{6}$/i.test(value.color)?value.color:'#fff4d1',
    text:typeof value.text==='string'?value.text.slice(0,120):'专升本 提升学历',
    skin:Math.round(number(value.skin,0,0,2)),address}
}
export function normalizeAdPatch(kind,patch){
  if(!patch||typeof patch!=='object'||Array.isArray(patch))throw Error('广告设置必须是对象')
  const allowed=new Set(['zoom','speed','autoScroll','scrollbarHidden','color','text','skin','address'])
  for(const key of Object.keys(patch))if(!allowed.has(key))throw Error('不支持的广告设置：'+key)
  if(Object.hasOwn(patch,'address'))validateAdUrl(kind,patch.address)
  const normalized=normalizeAdSettings(kind,patch)
  return Object.fromEntries(Object.keys(patch).map(key=>[key,normalized[key]]))
}
