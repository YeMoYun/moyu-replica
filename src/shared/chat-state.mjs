import {chatProfile,createDingTalkConversations,createFeishuConversations} from './chat-profiles.mjs'
import {videoPlatform,validateVideoPlatformUrl} from './video-platforms.mjs'
export const DOUYIN_HOME=videoPlatform('douyin').home
const forbidden=['__proto__','constructor','prototype']
function object(v){if(!v||typeof v!=='object'||Array.isArray(v)||forbidden.some(k=>Object.hasOwn(v,k)))throw Error('聊天配置对象无效');return v}
function text(v,label,max=80,empty=false){if(typeof v!=='string'||v.length>max||(!empty&&!v.trim()))throw Error(`${label}文字长度须为 ${empty?0:1}–${max}`);return empty?v:v.trim()}
function id(v){const s=text(v,'ID',80);if(!/^[a-zA-Z0-9_-]+$/.test(s)||forbidden.includes(s))throw Error('ID 无效');return s}
function integer(v,min,max,label){if(!Number.isInteger(v)||v<min||v>max)throw Error(`${label}须为 ${min}–${max} 的整数`);return v}
function validatedChatProfile(skin){if(typeof skin!=='string'||!['wechat','dingtalk','feishu'].includes(skin))throw Error('聊天平台不支持');return chatProfile(skin)}
export const validateChatUrl=(value,platform='douyin')=>validateVideoPlatformUrl(platform,value)
export function playerSize(settings){const portrait=settings.orientation==='portrait',scale=Math.max(80,Math.min(200,Number(settings.scale)||140))/100;return {width:(portrait?160:220)*scale,height:(portrait?260:140)*scale}}
export function currentChat(s){const c=s.conversations.find(c=>c.id===s.selectedId);if(!c)throw Error('当前会话不存在');return c}
const now=()=>new Date().toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit',hour12:false})
function nextId(s){const ids=new Set(s.conversations.flatMap(c=>c.messages.map(m=>m.id)));let n=1;while(ids.has('m'+n))n++;return 'm'+n}
export function sendText(s,value){if(typeof value!=='string')throw Error('消息须为文字');if(!value.trim())return false;const content=text(value,'消息',2000);const c=currentChat(s);if(c.messages.length>=200)throw Error('每个会话最多 200 条消息');c.messages.push({id:nextId(s),type:'text',sender:'self',text:content,time:now()});return true}
export function insertPlayer(s){const c=currentChat(s),old=c.messages.find(m=>m.type==='player');if(old)return old;if(c.messages.length>=200)throw Error('每个会话最多 200 条消息');const m={id:nextId(s),type:'player',sender:s.settings.sender,time:now(),address:s.settings.address};c.messages.push(m);return m}
export function createChatState(skin='wechat',platform='douyin'){
  validatedChatProfile(skin)
  const home=videoPlatform(platform).home,settings={site:platform,orientation:'landscape',scale:140,sender:'self',mask:false,address:home}
  const msg=(n,sender,content,time,name)=>({id:'m'+n,type:'text',sender,text:content,time,...(name?{name}:{})})
  if(skin==='feishu')return {version:1,revision:0,selfName:'小叶',selectedId:'group',drafts:{},settings:{...settings},ui:{hiddenAnnouncements:[]},conversations:createFeishuConversations(msg)}
  if(skin==='dingtalk')return {version:1,revision:0,selfName:'小叶',selectedId:'group',drafts:{},settings:{...settings},conversations:createDingTalkConversations(msg)}
  return {version:1,revision:0,selfName:'我',selectedId:'group',drafts:{},settings:{...settings},conversations:[
    {id:'manager',name:'产品经理-老王',contact:'产品经理-老王',avatar:'manager',memberCount:0,unread:1,messages:[msg(5,'other','预计下午4点部署测试环境，请安排测试跟进。','10:08')]},
    {id:'file',name:'文件传输助手',contact:'助手',avatar:'file',memberCount:0,unread:0,messages:[msg(6,'other','你好，在吗？','11:00')]},
    {id:'group',name:'项目小组',contact:'产品经理-老王',avatar:'group',memberCount:5,unread:0,messages:[msg(1,'other','大家有没有看最新的项目进度文档？','14:20','产品经理-老王'),msg(2,'other','我正在看，前端模块的接口设计已经完成了。','14:23','技术支持-小李'),msg(3,'self','我负责的模块有点延迟，正在努力赶进度。','14:25')]},
    {id:'design',name:'UI-Susan',contact:'Susan',avatar:'design',memberCount:0,unread:3,messages:[msg(7,'other','这个颜色能不能再亮一点？','13:30')]},
    {id:'boss',name:'老板',contact:'老板',avatar:'boss',memberCount:0,unread:0,messages:[msg(8,'other','这个月工作报告的初稿发我看看。','15:10')]},
    {id:'lin',name:'技术支持-小李',contact:'技术支持-小李',avatar:'support',memberCount:0,unread:1,messages:[msg(9,'other','你好，在吗？','11:00')]},
    {id:'chen',name:'物业管家',contact:'管家',avatar:'property',memberCount:0,unread:0,messages:[msg(10,'other','家里水管漏了，能过来看看吗？','11:00')]}
  ]}
}
export const CHAT_AVATARS=['manager','file','group','design','boss','support','property','self']
export function validateChatState(raw,skin='wechat',platform='douyin'){
  const profile=validatedChatProfile(skin)
  videoPlatform(platform)
  object(raw);if(raw.version!==1)throw Error('聊天配置版本不支持');const revision=integer(raw.revision,0,Number.MAX_SAFE_INTEGER-1,'版本')
  const selfName=text(raw.selfName,'自己的昵称'),settings=object(raw.settings)
  if(settings.site!==platform||!['landscape','portrait'].includes(settings.orientation)||!['self','other'].includes(settings.sender)||typeof settings.mask!=='boolean')throw Error('播放器设置与当前视频平台不一致')
  const normalizedSettings={site:platform,orientation:settings.orientation,scale:integer(settings.scale,80,200,'大小'),sender:settings.sender,mask:settings.mask,address:validateChatUrl(settings.address,platform)}
  if(!Array.isArray(raw.conversations)||!raw.conversations.length||raw.conversations.length>50)throw Error('会话数量须为 1–50')
  const chatIds=new Set(),messageIds=new Set()
  const conversations=raw.conversations.map(rawChat=>{
    const c=object(rawChat),chatId=id(c.id);if(chatIds.has(chatId))throw Error('会话 ID 重复');chatIds.add(chatId)
    if(!Array.isArray(c.messages)||c.messages.length>200)throw Error('每会话最多 200 条消息')
    let players=0
    const messages=c.messages.map(rawMessage=>{
      const m=object(rawMessage),messageId=id(m.id);if(messageIds.has(messageId))throw Error('消息 ID 重复');messageIds.add(messageId)
      const allowedTypes=skin==='feishu'?['text','media-card','player']:['text','player']
      if(!allowedTypes.includes(m.type)||!['self','other'].includes(m.sender))throw Error('消息类型或发送方无效')
      const result={id:messageId,type:m.type,sender:m.sender,time:text(m.time,'时间',40)}
      if(m.type==='text')result.text=text(m.text,'消息',2000)
      else if(m.type==='media-card'){result.title=text(m.title,'媒体卡片标题',80);result.description=text(m.description,'媒体卡片说明',300)}
      else{if(++players>1)throw Error('每个会话最多一个播放器');result.address=validateChatUrl(m.address,platform)}
      if(m.name!==undefined)result.name=text(m.name,'发送者')
      return result
    })
    if(!profile.avatars.includes(c.avatar))throw Error('头像无效')
    return {id:chatId,name:text(c.name,'会话名称'),contact:text(c.contact,'联系人'),avatar:c.avatar,memberCount:integer(c.memberCount,0,999,'成员数'),unread:integer(c.unread,0,99,'未读'),messages}
  })
  const selectedId=id(raw.selectedId);if(!chatIds.has(selectedId))throw Error('当前会话不存在')
  object(raw.drafts);const drafts={};for(const [k,v]of Object.entries(raw.drafts)){if(!chatIds.has(k))throw Error('草稿会话不存在');drafts[k]=text(v,'草稿',2000,true)}
  const result={version:1,revision,selfName,selectedId,drafts,settings:normalizedSettings,conversations}
  if(skin==='feishu'){
    const ui=object(raw.ui);if(!Array.isArray(ui.hiddenAnnouncements))throw Error('公告状态无效')
    const hidden=[...new Set(ui.hiddenAnnouncements.map(id))];if(hidden.some(value=>!chatIds.has(value)))throw Error('公告会话不存在')
    result.ui={hiddenAnnouncements:hidden}
  }
  return result
}
export function migrateLegacy(raw,skin='wechat',platform='douyin'){
  object(raw);validatedChatProfile(skin);const state=createChatState(skin,platform);let warning=''
  if(raw.siteKey&&raw.siteKey!==platform)warning=`旧站点已保留备份，本窗口仅支持${videoPlatform(platform).label}。`
  if(raw.contacts!==undefined&&!Array.isArray(raw.contacts)||raw.messages!==undefined&&!Array.isArray(raw.messages))throw Error('旧配置不能无损迁移，原文件已保留')
  if(!(raw.contacts?.length||raw.messages?.length))return {state,warning}
  state.conversations=[];const byName=new Map()
  const ensure=value=>{const name=text(value,'旧联系人');if(!byName.has(name)){const c={id:'legacy'+(state.conversations.length+1),name,contact:name,avatar:skin==='dingtalk'?'blue':'group',memberCount:0,unread:0,messages:[]};byName.set(name,c);state.conversations.push(c)}return byName.get(name)}
  for(const name of raw.contacts||[])ensure(name)
  let n=1
  for(const line of raw.messages||[]){if(typeof line!=='string'||!line.includes('|'))throw Error('旧消息缺少归属分隔符，原配置已保留');const index=line.indexOf('|'),c=ensure(line.slice(0,index));c.messages.push({id:'m'+n++,type:'text',sender:'other',text:text(line.slice(index+1),'旧消息',2000),time:'10:00'})}
  state.selectedId=state.conversations[0].id;return {state:validateChatState(state,skin,platform),warning}
}
