export const CHAT_PROFILES=Object.freeze({
  wechat:Object.freeze({key:'wechat',avatars:Object.freeze(['manager','file','group','design','boss','support','property','self'])}),
  dingtalk:Object.freeze({key:'dingtalk',avatars:Object.freeze(['blue','green','purple','orange','file','self'])}),
  feishu:Object.freeze({key:'feishu',avatars:Object.freeze(['blue','green','purple','orange','bot','self'])})
})
export function chatProfile(key='wechat'){const p=CHAT_PROFILES[key];if(!p)throw Error('聊天平台不支持');return p}
export function createDingTalkConversations(msg){return [
  {id:'group',name:'研发项目组',contact:'林晓',avatar:'blue',memberCount:8,unread:0,messages:[msg(1,'other','上午的更新已经整理到共享文档，大家有空看一下。','10:08','林晓'),msg(2,'self','收到，我先看一下，下午一起对齐。','10:09')]},
  {id:'lin',name:'林晓',contact:'林晓',avatar:'green',memberCount:0,unread:2,messages:[msg(5,'other','今天下午三点方便沟通吗？','09:56')]},
  {id:'design',name:'设计讨论组',contact:'陈晨',avatar:'purple',memberCount:5,unread:1,messages:[msg(6,'other','新版界面我已经发到文档了。','09:42','陈晨')]},
  {id:'chen',name:'陈晨',contact:'陈晨',avatar:'orange',memberCount:0,unread:0,messages:[msg(7,'other','这版的间距看起来舒服一些。','昨天')]},
  {id:'file',name:'文件传输助手',contact:'助手',avatar:'file',memberCount:0,unread:0,messages:[msg(8,'self','本周待办与测试记录','昨天')]}
]}
export function createFeishuConversations(msg){return [
  {id:'group',name:'质检组',contact:'林晓',avatar:'green',memberCount:16,unread:0,messages:[
    msg(1,'other','确认现在使用新版检查清单，采集完成后记得更新共享文档。','15:38','林晓'),
    msg(2,'other','界面检查已完成，操作演示放在下面，大家可以对照查看。','15:42','陈晨'),
    {id:'m4',type:'media-card',sender:'other',time:'15:48',title:'本地操作演示',description:'这是本地占位卡片；点击输入栏“＋”后才加载真实抖音网页。'}
  ]},
  {id:'lin',name:'林晓',contact:'林晓',avatar:'orange',memberCount:0,unread:1,messages:[msg(5,'other','下午一起核对一下验收记录。','11:59')]},
  {id:'design',name:'设计讨论组',contact:'陈晨',avatar:'purple',memberCount:5,unread:0,messages:[msg(6,'other','新版界面已发到文档，麻烦大家看一下。','08:18','陈晨')]},
  {id:'chen',name:'陈晨',contact:'陈晨',avatar:'blue',memberCount:0,unread:0,messages:[msg(7,'other','这版的间距看起来舒服一些。','昨天')]},
  {id:'file',name:'云文档助手',contact:'助手',avatar:'bot',memberCount:0,unread:0,messages:[msg(8,'other','文档权限已更新。','9月16日')]},
  {id:'reminder',name:'打卡提醒群',contact:'小李',avatar:'purple',memberCount:12,unread:0,messages:[msg(9,'other','今天的记录已整理。','9月16日')]},
  {id:'assistant',name:'小叶的飞书助手',contact:'助手',avatar:'bot',memberCount:0,unread:1,messages:[msg(10,'other','这里展示本地提醒消息。','9月15日')]},
  {id:'task',name:'标注临时任务群',contact:'小周',avatar:'blue',memberCount:9,unread:0,messages:[msg(11,'other','本周待办已更新。','9月15日')]},
  {id:'attendance',name:'考勤通知',contact:'小李',avatar:'purple',memberCount:6,unread:0,messages:[msg(12,'other','请核对本周的演示记录。','9月11日')]},
  {id:'bot',name:'协作机器人',contact:'机器人',avatar:'bot',memberCount:0,unread:0,messages:[msg(13,'other','今日任务汇总 · 演示数据。','9月10日')]}
]}
