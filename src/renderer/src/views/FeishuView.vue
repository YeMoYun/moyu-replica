<template>
  <section v-if="state && platform" class="feishu formal-feishu" :class="{'show-list':showList}" :data-chat-ready="true">
    <div class="fs-window-tools" aria-label="窗口工具">
      <button title="历史窗口" @click="notice('历史窗口')">◴</button><button title="最小化" @click="notice('最小化')">−</button><button title="还原" @click="notice('还原窗口')">▢</button><button title="关闭" @click="close"><FeishuIcon name="close"/></button>
    </div>
    <div class="client-body">
      <nav class="navigation" aria-label="飞书功能导航">
        <div class="fs-account-row"><span class="avatar tone-self">{{state.selfName[0]}}</span><button title="添加" @click="notice('添加')"><FeishuIcon name="plus"/></button></div>
        <label class="fs-nav-search"><FeishuIcon name="search"/><input v-model="search" data-search aria-label="搜索会话" placeholder="搜索 (Ctrl + K)"/></label>
        <div class="fs-nav-items">
          <button v-for="(item,index) in navigation" :key="item" class="nav-button" :class="{active:index===0,'nav-separated':index===11}" @click="nav(item,index)"><FeishuIcon :name="navIcons[index]"/><span>{{item}}</span><i v-if="index===0" class="nav-unread">1</i></button>
        </div>
      </nav>
      <aside class="conversation-list">
        <div class="list-heading"><FeishuIcon name="menu"/><span>消息</span></div>
        <div class="quick-conversations">
          <button v-for="c in quick" :key="c.id" :class="{selected:c.id===state.selectedId}" :data-chat="c.id" @click="select(c.id)"><span class="avatar" :class="avatarClass(c)">{{avatarText(c)}}</span><span>{{c.name}}</span></button>
        </div>
        <div class="chat-items">
          <button v-for="c in filtered" :key="c.id" class="chat-item" :class="{selected:c.id===state.selectedId}" :data-chat="c.id" @click="select(c.id)">
            <span class="avatar-wrap"><span class="avatar" :class="avatarClass(c)">{{avatarText(c)}}</span><i v-if="c.unread" class="unread">{{c.unread}}</i></span>
            <span class="chat-meta"><span class="chat-meta-top"><span class="chat-name">{{c.name}}<em v-if="botIds.has(c.id)" class="fs-badge robot-badge">机器人</em><em v-else class="fs-badge">外部</em></span><time>{{c.messages.at(-1)?.time}}</time></span><small>{{summary(c)}}</small></span>
          </button>
        </div>
      </aside>
      <main class="chat-panel">
        <header class="chat-header">
          <div class="chat-title"><button class="mobile-list" @click="showList=!showList"><FeishuIcon name="menu"/></button><span class="avatar" :class="avatarClass(chat)">{{avatarText(chat)}}</span><div class="fs-title-info"><div class="fs-title-main"><h2>{{chat.name}}</h2><span v-if="chat.memberCount" class="fs-member-count"><FeishuIcon name="users"/> {{chat.memberCount}}</span><span v-if="chat.memberCount" class="fs-bot-count">▣ 1</span><em class="fs-badge">外部</em></div></div></div>
          <div class="header-actions"><span class="fs-assistant-icon"/><button class="optional-action" title="通知" @click="notice('通知')">♧</button><button class="optional-action" title="视频会议" @click="notice('视频会议')">▣</button><button class="optional-action" title="聊天配置" data-action="config" @click="openConfig"><FeishuIcon name="users"/></button><button class="optional-action" title="日历" @click="notice('日历')"><FeishuIcon name="calendar"/></button><button title="更多设置" data-action="settings" @click="openSettings"><FeishuIcon name="more"/></button></div>
        </header>
        <nav class="chat-tabs" aria-label="群聊页签"><button v-for="(item,index) in tabs" :key="item" :class="{active:activeTab===item}" :data-tab="item" @click="tab(item)"><FeishuIcon :name="tabIcons[index]"/><span v-if="index<6">{{item}}</span></button></nav>
        <section v-if="!hiddenAnnouncement" class="group-announcement"><span class="announcement-pin">↑</span><div class="announcement-copy"><p>[群公告] 本周协作与检查说明：请使用新版清单，完成后更新记录。（本地演示）</p><small>由 <span>{{chat.contact}}</span> 置顶</small></div><button title="公告详情" @click="notice('公告详情')">↗</button><button data-action="hide-announcement" title="关闭群公告" @click="announcement(true)"><FeishuIcon name="close"/></button></section>
        <div class="all-messages">
          <section v-for="c in state.conversations" v-show="c.id === state.selectedId" :key="c.id" class="messages" :data-conversation="c.id">
            <div class="date-line">今天 15:38 · 本地演示时间</div>
            <div v-for="m in c.messages" :key="m.id" class="message-row" :class="[m.sender,m.type+'-message']" :data-message="m.id">
              <span class="avatar" :class="m.sender==='self'?'tone-self':avatarClass(c)">{{m.sender==='self'?state.selfName[0]:(m.name||c.contact)[0]}}</span>
              <div class="content-wrap"><span v-if="m.sender==='other'&&c.memberCount" class="sender-name">{{m.name||c.contact}}</span>
                <div v-if="m.type==='media-card'" class="fs-media-card"><div class="local-media-preview"><span>▶</span></div><b>{{m.title}}</b><p>{{m.description}}</p></div>
                <ChatPlayer v-else-if="m.type==='player'" :platform="platform.platform" :label="platform.definition.label" :partition="platform.partition" :message="m" :settings="state.settings" :covered="covered" :active="c.id===state.selectedId" @navigate="address=>saveNavigation(c.id,m.id,address)" @error="message=>error=message"/>
                <div v-else class="bubble">{{m.text}}</div><span v-if="m.sender==='self'" class="read-status">已读</span>
              </div>
            </div>
          </section>
        </div>
        <footer class="composer"><textarea class="message-input" :value="draft" aria-label="输入本地消息" :placeholder="`发送给 ${chat.name}`" maxlength="2000" @input="draftInput" @keydown="keydown"/><div class="composer-tools"><button class="fs-format" title="文字格式" @click="notice('文字格式')">A<small>a</small></button><button title="表情" @click="notice('表情')"><FeishuIcon name="smile"/></button><button title="提及成员" @click="notice('提及成员')"><FeishuIcon name="at"/></button><button class="optional-action" title="截图" @click="notice('截图')"><FeishuIcon name="cut"/></button><button data-action="insert" :title="'插入'+platformLabel+'播放器'" @click="insert"><FeishuIcon name="plus"/></button><button data-action="settings" title="播放器设置" @click="openSettings"><FeishuIcon name="settings"/></button><button data-action="config" title="聊天配置" @click="openConfig"><FeishuIcon name="users"/></button></div><div class="composer-bottom"><button data-action="send" class="send-button" title="发送 · Enter" :disabled="!draft.trim()" @click="send"><FeishuIcon name="send"/></button></div></footer>
      </main>
    </div>
    <div v-if="error" class="chat-notice" role="alert">{{error}}<button @click="error=''">×</button></div>
    <div v-if="dialog" class="dialog-scrim" @click.self="dialog=''">
      <section class="chat-dialog" role="dialog" aria-modal="true"><header><h3>{{dialog==='settings'?'播放器设置':'聊天配置'}}</h3><button data-action="close-dialog" @click="dialog=''">×</button></header>
        <div v-if="dialog==='settings'" class="dialog-body"><label>{{platformLabel}}地址<input v-model="addressInput" :aria-label="platformLabel+'页面地址'"/></label><button data-action="apply-address" @click="applyAddress">应用到当前播放器</button><label>方向<select data-setting="orientation" :value="state.settings.orientation" @change="setting('orientation',$event.target.value)"><option value="landscape">横屏</option><option value="portrait">竖屏</option></select></label><label>大小 {{state.settings.scale}}%<input data-setting="scale" type="range" min="80" max="200" step="10" :value="state.settings.scale" @change="setting('scale',Number($event.target.value))"/></label><label>发送方<select data-setting="sender" :value="state.settings.sender" @change="setting('sender',$event.target.value)"><option value="self">自己</option><option value="other">对方</option></select></label><label><input data-setting="mask" type="checkbox" :checked="state.settings.mask" @change="setting('mask',$event.target.checked)"/>交互遮罩</label></div>
        <div v-else class="dialog-body"><label>自己的昵称<input v-model="editConfig.selfName"/></label><label>会话<select v-model="editId"><option v-for="c in editConfig.conversations" :key="c.id" :value="c.id">{{c.name}}</option></select></label><template v-if="editChat"><label>会话名称<input v-model="editChat.name"/></label><label>联系人<input v-model="editChat.contact"/></label><label>成员数<input v-model.number="editChat.memberCount" type="number" min="0" max="999"/></label><label>头像<select v-model="editChat.avatar"><option v-for="avatar in avatars" :key="avatar">{{avatar}}</option></select></label></template><button data-action="save-config" @click="replace(editConfig)">保存编辑</button><label>JSON 导入/导出<textarea class="json-input" v-model="jsonInput"/></label><p class="config-error">{{configError}}</p><button data-action="apply-json" @click="applyJson">应用 JSON</button><button data-action="reset" @click="reset">恢复默认</button></div>
      </section>
    </div>
  </section>
  <div v-else class="formal-feishu chat-startup">{{error||'正在加载飞书模式…'}}<button v-if="error" @click="load">重试</button></div>
</template>

<script setup>
import {ref,computed,onMounted,onBeforeUnmount,watch,nextTick} from 'vue'
import FeishuIcon from '../features/chat/FeishuIcon.vue'
import ChatPlayer from '../features/chat/ChatPlayer.vue'
import {createChatController,loadChatRuntime} from '../features/chat/controller.mjs'
import {loadChatPlatform} from '../features/chat/platform-runtime.mjs'
import {createChatState,currentChat,sendText,insertPlayer,validateChatState,validateChatUrl} from '../../../shared/chat-state.mjs'
import '../features/chat/feishu.css'
const api=window.videoChatModeControl,state=ref(null),platform=ref(null),covered=ref(false),search=ref(''),draft=ref(''),error=ref(''),dialog=ref(''),showList=ref(false),activeTab=ref('消息'),addressInput=ref(''),editConfig=ref(null),editId=ref(''),jsonInput=ref(''),configError=ref('')
const navigation=['消息','豆包工作','云文档','推荐','多维表格','视频会议','通讯录','日历','飞行社','权益升级','更多','历史记录','实验室'],navIcons=['chat','work','doc','more','work','users','users','calendar','work','plus','more','calendar','work']
const tabs=['消息','云文档','群公告','文件','每日质检任务','质检问题收集表','＋'],tabIcons=['chat','doc','more','doc','calendar','work','plus']
const avatars=['blue','green','purple','orange','bot','self'],botIds=new Set(['file','assistant','bot']),unsubs=[];let disposed=false,bossRevision=0,subscribed=false
const platformLabel=computed(()=>platform.value?.definition.label||'视频')
function trustedPlatform(){const key=platform.value?.platform;if(!key)throw Error('视频平台上下文尚未就绪');return key}
const controller=createChatController({api,validate:raw=>validateChatState(raw,'feishu',trustedPlatform()),onState:value=>state.value=value,onError:value=>error.value=value.message})
const chat=computed(()=>state.value?currentChat(state.value):null),filtered=computed(()=>state.value?.conversations.filter(c=>c.name.toLowerCase().includes(search.value.trim().toLowerCase()))||[]),quick=computed(()=>state.value?.conversations.slice(0,3)||[]),hiddenAnnouncement=computed(()=>state.value?.ui.hiddenAnnouncements.includes(state.value.selectedId)),editChat=computed(()=>editConfig.value?.conversations.find(c=>c.id===editId.value))
const update=mutation=>controller.update(mutation).catch(()=>null)
const avatarText=c=>c.memberCount?'质检\n组':c.name[0]
const avatarClass=c=>[`tone-${c.avatar}`,c.memberCount?'fs-group':'',botIds.has(c.id)?'fs-bot':'']
const summary=c=>{const m=c.messages.at(-1);return !m?'':m.type==='player'?`[${platformLabel.value}视频]`:m.type==='media-card'?'[视频] '+m.title:(m.sender==='self'?'我：':'')+m.text}
function notice(name){error.value=`${name}功能未接入，仅保留飞书外观。`}
function nav(name,index){if(index===0)showList.value=!showList.value;else notice(name)}
function keydown(event){if(event.key!=='Enter'||event.isComposing||event.keyCode===229)return;if(event.shiftKey||event.ctrlKey)return;event.preventDefault();send()}
async function scroll(id){await nextTick();const messages=document.querySelector(`[data-conversation="${id}"]`);if(messages)messages.scrollTop=messages.scrollHeight}
async function send(){const value=draft.value,id=state.value.selectedId;if(!value.trim())return;const ok=await update(s=>{const selected=s.selectedId;s.selectedId=id;sendText(s,value);s.selectedId=selected;s.drafts[id]=''});if(ok&&state.value.selectedId===id)draft.value='';if(ok)scroll(id)}
function draftInput(event){draft.value=event.target.value;const id=state.value.selectedId,value=draft.value;update(s=>{s.drafts[id]=value})}
function select(id){const old=state.value.selectedId,value=draft.value;showList.value=false;activeTab.value='消息';update(s=>{s.drafts[old]=value;s.selectedId=id;s.conversations.find(c=>c.id===id).unread=0})}
function announcement(hidden){const id=state.value.selectedId;update(s=>{const values=new Set(s.ui.hiddenAnnouncements);hidden?values.add(id):values.delete(id);s.ui.hiddenAnnouncements=[...values]})}
function tab(name){activeTab.value=name;if(name==='群公告')announcement(false);else if(name!=='消息')notice(name)}
async function insert(){const id=state.value.selectedId,exists=chat.value.messages.some(m=>m.type==='player'),ok=await update(s=>insertPlayer(s));if(ok){if(exists)error.value=`此会话已有${platformLabel.value}播放器。`;scroll(id)}}
function setting(key,value){update(s=>{s.settings[key]=value})}
function saveNavigation(cid,mid,address){const old=state.value.conversations.find(c=>c.id===cid)?.messages.find(m=>m.id===mid);if(!old||old.address===address)return;update(s=>{const message=s.conversations.find(c=>c.id===cid)?.messages.find(m=>m.id===mid);if(message)message.address=address;s.settings.address=address})}
async function applyAddress(){try{const address=validateChatUrl(addressInput.value,platform.value.platform),id=state.value.selectedId;await update(s=>{s.settings.address=address;const message=s.conversations.find(c=>c.id===id).messages.find(m=>m.type==='player');if(message)message.address=address})}catch(value){error.value=value.message}}
function openSettings(){addressInput.value=state.value.settings.address;dialog.value='settings'}
function openConfig(){editConfig.value=validateChatState(state.value,'feishu',platform.value.platform);editId.value=state.value.selectedId;jsonInput.value=JSON.stringify(state.value,null,2);configError.value='';dialog.value='config'}
async function replace(raw){try{const candidate=validateChatState(raw,'feishu',platform.value.platform),saved=await controller.update(s=>{const revision=s.revision;Object.assign(s,candidate,{revision})});editConfig.value=structuredClone(saved);jsonInput.value=JSON.stringify(saved,null,2);configError.value=''}catch(value){configError.value=value.message}}
function applyJson(){try{return replace(JSON.parse(jsonInput.value))}catch(value){configError.value='JSON 格式错误：'+value.message}}
function reset(){return replace(createChatState('feishu',platform.value.platform))}
async function close(){try{await api.close()}catch(value){error.value=value.message}}
function subscribeOnce(){if(subscribed||disposed)return;unsubs.push(api.onState(value=>controller.accept(value)),api.onBoss(value=>{bossRevision++;covered.value=value}),api.onError(message=>error.value=message));subscribed=true}
async function load(){error.value='';try{const context=await loadChatPlatform(api,'feishu');if(disposed)return;platform.value=context;subscribeOnce();const revision=bossRevision;await loadChatRuntime(controller,api,runtime=>{if(!disposed&&revision===bossRevision)covered.value=runtime.covered;if(runtime.warning)error.value=runtime.warning});if(disposed)return;draft.value=state.value.drafts[state.value.selectedId]||''}catch(value){if(!disposed)error.value=value.message}}
watch(()=>state.value?.selectedId,id=>{if(id)draft.value=state.value.drafts[id]||''})
onMounted(()=>{load()})
onBeforeUnmount(()=>{disposed=true;controller.dispose();unsubs.forEach(unsubscribe=>unsubscribe())})
</script>
