<template>
  <section v-if="state && platform" class="wechat formal-wechat" :class="{'show-list':showList}" :data-chat-ready="true" @click="outside">
    <aside class="navigation">
      <img class="avatar account-avatar" :src="avatars.self" alt="自己的本地头像" />
      <button v-for="(tool,i) in navs" :key="tool.icon" class="nav-button" :class="{active:i===0}" :title="tool.label" :aria-label="tool.label" @click="i===0?showList=!showList:notice(tool.label)"><ChatIcon :name="tool.icon" /></button>
      <div class="nav-spacer" />
      <button class="nav-button" title="手机" aria-label="手机" @click="notice('手机')"><ChatIcon name="device" /></button>
      <button class="nav-button" title="更多" aria-label="导航更多" @click.stop="more=!more"><ChatIcon name="menu" /></button>
    </aside>
    <section class="conversation-list">
      <div class="list-search"><label class="search-field"><ChatIcon name="search" /><input v-model="search" aria-label="搜索会话" placeholder="搜索" /></label><button class="icon-button" title="添加会话" aria-label="添加会话" @click="openConfig"><ChatIcon name="plus" /></button></div>
      <div class="chat-list"><button v-for="c in filtered" :key="c.id" class="chat-item" :class="{selected:c.id===state.selectedId}" :data-chat="c.id" :aria-pressed="c.id===state.selectedId" @click="select(c.id)">
        <span class="avatar-wrap"><img class="avatar" :src="avatars[c.avatar]" :alt="c.name+'的本地头像'" /><span v-if="c.unread" class="unread">{{ c.unread }}</span></span>
        <span class="chat-meta"><span class="chat-meta-top"><span class="chat-name">{{ c.name }}</span><span class="chat-time">{{ c.messages.at(-1)?.time }}</span></span><span class="chat-last">{{ summary(c) }}</span></span>
      </button><p v-if="!filtered.length" class="empty-list">没有匹配会话</p></div>
    </section>
    <main class="chat-panel">
      <header class="chat-header"><div class="chat-title"><button class="icon-button mobile-list" title="会话列表" aria-label="会话列表" @click="showList=!showList"><ChatIcon name="menu" /></button><h2>{{ chat.name }} <span v-if="chat.memberCount" class="member-count">({{ chat.memberCount }})</span></h2></div><div class="header-actions"><button class="icon-button" data-action="more" title="更多设置" aria-label="更多设置" :aria-expanded="more" @click.stop="more=!more"><ChatIcon name="more" /></button><button class="icon-button" data-action="close" title="关闭窗口" aria-label="关闭窗口" @click="close"><ChatIcon name="close" /></button></div></header>
      <div v-if="more" class="wechat-more-menu" role="menu" aria-label="微信更多菜单" @click.stop><button data-action="settings" @click="openSettings">播放器设置</button><button data-action="config" @click="openConfig">聊天配置</button><button data-action="menu-insert" @click="insert">插入{{platformLabel}}播放器</button></div>
      <div class="all-messages">
        <section v-for="c in state.conversations" v-show="c.id === state.selectedId" :key="c.id" class="messages" :data-conversation="c.id">
          <div v-if="c.messages.length" class="date-line">{{ c.messages[0].time }}</div>
          <div v-for="m in c.messages" :key="m.id" class="message-row" :class="[m.sender,m.type+'-message']" :data-message="m.id">
            <img class="avatar" :src="messageAvatar(c,m)" :alt="m.sender==='self'?state.selfName:(m.name||c.contact)" />
            <div class="content-wrap"><span v-if="m.sender==='other' && c.memberCount" class="sender-name">{{ m.name||c.contact }}</span>
              <ChatPlayer v-if="m.type==='player'" :platform="platform.platform" :label="platform.definition.label" :partition="platform.partition" :message="m" :settings="state.settings" :covered="covered" :active="c.id===state.selectedId" @navigate="address=>saveNavigation(c.id,m.id,address)" @error="message=>error=message" />
              <div v-else class="bubble">{{ m.text }}</div>
            </div>
          </div>
        </section>
      </div>
      <footer class="composer"><div class="composer-tools"><button v-for="tool in inputTools" :key="tool.icon" class="icon-button" :data-action="tool.icon==='folder'?'insert':tool.icon" :title="tool.label" :aria-label="tool.label" @click="tool.icon==='folder'?insert():notice(tool.label)"><ChatIcon :name="tool.icon" /></button><span class="tool-spacer"/><button class="icon-button" title="语音视频通话" aria-label="语音视频通话" @click="notice('通话')"><ChatIcon name="phone-video" /></button></div><textarea ref="messageInput" class="message-input" :value="draft" maxlength="2000" aria-label="输入本地消息" @input="draftInput" @keydown="keydown"/><div class="composer-bottom"><span class="input-tip">按下Ctrl+Enter换行</span><button class="send-button" data-action="send" :disabled="!draft.trim()" @click="send">发送(S)</button></div></footer>
    </main>
    <div v-if="error" class="chat-notice" role="alert"><span>{{ error }}</span><button aria-label="关闭提示" @click="error=''">×</button></div>
    <div v-if="dialog" class="dialog-scrim" @click.self="dialog=''">
      <section class="chat-dialog" :class="{'config-dialog':dialog==='config'}" role="dialog" aria-modal="true" :aria-label="dialog==='settings'?'播放器设置':'聊天配置'">
        <header><h3>{{ dialog==='settings'?'播放器设置':'聊天配置' }}</h3><button class="icon-button" data-action="close-dialog" aria-label="关闭面板" @click="dialog=''"><ChatIcon name="close" /></button></header>
        <div v-if="dialog==='settings'" class="dialog-body">
          <p class="dialog-note">本窗口已接入{{platformLabel}}真实网页；微信消息仅保存在本机。</p>
          <label>应用 / 站点<select disabled><option>{{platformLabel}}</option></select></label>
          <label>{{platformLabel}}页面地址<input v-model="addressInput" :aria-label="platformLabel+'页面地址'" @keydown.enter="applyAddress" /><button class="plain-button" data-action="apply-address" @click="applyAddress">应用到当前播放器</button></label>
          <label>播放器方向<select data-setting="orientation" :value="state.settings.orientation" @change="setting('orientation',$event.target.value)"><option value="landscape">横屏</option><option value="portrait">竖屏</option></select></label>
          <label>播放器大小 {{ state.settings.scale }}%<input data-setting="scale" type="range" min="80" max="200" step="10" :value="state.settings.scale" @change="setting('scale',Number($event.target.value))" /></label>
          <label>插入时发送方<select data-setting="sender" :value="state.settings.sender" @change="setting('sender',$event.target.value)"><option value="self">自己发送</option><option value="other">对方发送</option></select></label>
          <label class="check-label"><input data-setting="mask" type="checkbox" :checked="state.settings.mask" @change="setting('mask',$event.target.checked)" />启用交互遮罩</label>
          <p class="dialog-note">老板键沿用系统设置的快捷键，仅遮挡播放器。</p>
          <div class="dialog-footer"><button class="plain-button" @click="dialog=''">完成</button><button class="primary-button" @click="insert">插入到当前会话</button></div>
        </div>
        <div v-else class="dialog-body config-body">
          <p class="dialog-note">本地伪装聊天，不会向真实微信联系人发送。保存前校验，非法配置不覆盖当前数据。</p>
          <label>自己的昵称<input v-model="editConfig.selfName" maxlength="80" /></label>
          <div class="contact-editor"><label>会话<select v-model="editId"><option v-for="c in editConfig.conversations" :key="c.id" :value="c.id">{{ c.name }}</option></select></label><template v-if="editChat"><label>会话名称<input v-model="editChat.name" maxlength="80" /></label><label>联系人昵称<input v-model="editChat.contact" maxlength="80" /></label><label>成员数<input v-model.number="editChat.memberCount" type="number" min="0" max="999" /></label><label>本地头像<select v-model="editChat.avatar"><option v-for="a in avatarKeys" :key="a" :value="a">{{ a }}</option></select></label></template></div>
          <div class="dialog-footer"><button class="plain-button" @click="addContact">新增会话</button><button class="plain-button" @click="removeContact">删除所选</button><button class="primary-button" data-action="save-config" @click="applyStructured">保存编辑</button></div>
          <label>JSON 导入 / 导出<textarea v-model="jsonInput" class="json-input" spellcheck="false" aria-label="聊天 JSON 配置" /></label>
          <p class="config-error" role="alert">{{ configError }}</p>
          <div class="dialog-footer"><button class="plain-button" @click="exportJson">导出当前配置</button><button class="plain-button" data-action="reset" @click="reset">恢复本套默认数据</button><button class="primary-button" data-action="apply-json" @click="applyJson">应用 JSON</button></div>
        </div>
      </section>
    </div>
  </section>
  <div v-else class="chat-startup" role="alert">{{ error||'正在加载微信伪装界面…' }}<button v-if="error" @click="load">重试</button><button v-if="error" @click="close">关闭</button></div>
</template>
<script setup>
import {ref,computed,onMounted,onBeforeUnmount,watch,nextTick} from 'vue'
import ChatIcon from '../features/chat/ChatIcon.vue'
import ChatPlayer from '../features/chat/ChatPlayer.vue'
import {createChatController,loadChatRuntime} from '../features/chat/controller.mjs'
import {loadChatPlatform} from '../features/chat/platform-runtime.mjs'
import {createChatState,currentChat,sendText,insertPlayer,validateChatState,validateChatUrl,CHAT_AVATARS} from '../../../shared/chat-state.mjs'
import '../features/chat/wechat.css'
const avatarFiles=import.meta.glob('../assets/chat/wx-*.jpg',{eager:true,query:'?url',import:'default'})
const avatars=Object.fromEntries(CHAT_AVATARS.map(key=>[key,avatarFiles[`../assets/chat/wx-${key}.jpg`]])),avatarKeys=CHAT_AVATARS
const navs=[{icon:'wx-chat',label:'消息'},{icon:'wx-contacts',label:'通讯录'},{icon:'wx-moments',label:'朋友圈'},{icon:'wx-mini',label:'小程序'}]
const inputTools=computed(()=>[{icon:'smile',label:'表情'},{icon:'cube',label:'收藏'},{icon:'folder',label:`插入${platformLabel.value}播放器`},{icon:'cut',label:'截屏'}])
const state=ref(null),platform=ref(null),covered=ref(false),search=ref(''),draft=ref(''),error=ref(''),more=ref(false),dialog=ref(''),showList=ref(false),messageInput=ref(null),addressInput=ref(''),editConfig=ref(null),editId=ref(''),jsonInput=ref(''),configError=ref('')
const platformLabel=computed(()=>platform.value?.definition.label||'视频')
const api=window.videoChatModeControl,unsubscribes=[];let bossRevision=0,disposed=false,subscribed=false
function trustedPlatform(){const key=platform.value?.platform;if(!key)throw Error('视频平台上下文尚未就绪');return key}
const controller=createChatController({api,validate:raw=>validateChatState(raw,'wechat',trustedPlatform()),onState:s=>{state.value=s},onError:e=>{error.value=e.message}})
const chat=computed(()=>state.value?currentChat(state.value):null),filtered=computed(()=>state.value?.conversations.filter(c=>c.name.toLowerCase().includes(search.value.trim().toLowerCase()))||[])
const editChat=computed(()=>editConfig.value?.conversations.find(c=>c.id===editId.value))
function summary(c){const m=c.messages.at(-1);return !m?'':m.type==='player'?`[${platformLabel.value}视频]`:m.text}
function messageAvatar(c,m){if(m.sender==='self')return avatars.self;const names={'产品经理-老王':'manager','技术支持-小李':'support'};return avatars[names[m.name]||c.avatar]}
function notice(label){error.value=`${label}仅保留界面外观，未连接真实微信功能。`}
function outside(event){if(!event.target.closest('[data-action=more],.wechat-more-menu,.navigation'))more.value=false}
function update(fn){return controller.update(fn).catch(()=>null)}
function draftInput(event){draft.value=event.target.value;const id=state.value.selectedId,value=draft.value;update(s=>{s.drafts[id]=value})}
function select(id){more.value=false;showList.value=false;const origin=state.value.selectedId,value=draft.value;update(s=>{s.drafts[origin]=value;s.selectedId=id;s.conversations.find(c=>c.id===id).unread=0})}
async function scroll(id){await nextTick();if(disposed)return;const node=document.querySelector(`[data-conversation="${id}"]`);if(node)node.scrollTop=node.scrollHeight}
async function send(){const content=draft.value,id=state.value.selectedId;if(!content.trim())return;const result=await update(s=>{const selected=s.selectedId;s.selectedId=id;sendText(s,content);s.selectedId=selected;s.drafts[id]=''});if(result&&state.value.selectedId===id&&draft.value===content)draft.value='';if(result)scroll(id)}
function keydown(event){if(event.key!=='Enter'||event.isComposing||event.keyCode===229)return;if(event.ctrlKey||event.shiftKey){if(event.ctrlKey){event.preventDefault();const i=event.target;i.setRangeText('\n',i.selectionStart,i.selectionEnd,'end');draftInput({target:i})}return}event.preventDefault();send()}
async function insert(){more.value=false;dialog.value='';const id=state.value.selectedId,exists=chat.value.messages.some(m=>m.type==='player');const result=await update(s=>{insertPlayer(s)});if(result){if(exists)error.value=`此会话已有${platformLabel.value}播放器，已定位现有气泡。`;scroll(id)}}
function setting(key,value){update(s=>{s.settings[key]=value})}
function saveNavigation(chatId,messageId,address){const c=state.value.conversations.find(c=>c.id===chatId),m=c?.messages.find(m=>m.id===messageId);if(!m||m.address===address)return;update(s=>{const target=s.conversations.find(c=>c.id===chatId)?.messages.find(m=>m.id===messageId);if(target)target.address=address;s.settings.address=address})}
async function applyAddress(){try{const address=validateChatUrl(addressInput.value,platform.value.platform),id=state.value.selectedId;await update(s=>{s.settings.address=address;const m=s.conversations.find(c=>c.id===id).messages.find(m=>m.type==='player');if(m)m.address=address})}catch(e){error.value=e.message}}
function openSettings(){more.value=false;addressInput.value=state.value.settings.address;dialog.value='settings'}
function openConfig(){more.value=false;configError.value='';editConfig.value=validateChatState(state.value,'wechat',platform.value.platform);editId.value=state.value.selectedId;jsonInput.value=JSON.stringify(state.value,null,2);dialog.value='config'}
function addContact(){let n=1;while(editConfig.value.conversations.some(c=>c.id==='custom'+n))n++;editConfig.value.conversations.push({id:'custom'+n,name:'新会话',contact:'联系人',avatar:'group',memberCount:0,unread:0,messages:[]});editId.value='custom'+n}
function removeContact(){const s=editConfig.value;if(s.conversations.length===1){configError.value='至少保留一个会话';return}s.conversations=s.conversations.filter(c=>c.id!==editId.value);delete s.drafts[editId.value];if(s.selectedId===editId.value)s.selectedId=s.conversations[0].id;editId.value=s.conversations[0].id}
async function replace(raw){try{const candidate=validateChatState(raw,'wechat',platform.value.platform);const saved=await controller.update(s=>{const revision=s.revision;Object.assign(s,candidate,{revision})});editConfig.value=structuredClone(saved);editId.value=saved.selectedId;draft.value=saved.drafts[saved.selectedId]||'';jsonInput.value=JSON.stringify(saved,null,2);configError.value='';error.value='本地聊天配置已保存。'}catch(e){configError.value=e.message}}
function applyJson(){try{return replace(JSON.parse(jsonInput.value))}catch(e){configError.value='JSON 格式错误：'+e.message}}
function applyStructured(){return replace(editConfig.value)}
function exportJson(){jsonInput.value=JSON.stringify(state.value,null,2)}
function reset(){return replace(createChatState('wechat',platform.value.platform))}
async function close(){try{await api.close()}catch(e){error.value=e.message}}
function escape(event){if(event.key==='Escape'){if(dialog.value)dialog.value='';else{more.value=false;showList.value=false}}}
function subscribeOnce(){if(subscribed||disposed)return;unsubscribes.push(api.onState(s=>controller.accept(s)),api.onBoss(value=>{bossRevision++;covered.value=value}),api.onError(message=>{error.value=message}));subscribed=true}
async function load(){error.value='';try{const context=await loadChatPlatform(api,'wechat');if(disposed)return;platform.value=context;subscribeOnce();const revision=bossRevision;await loadChatRuntime(controller,api,runtime=>{if(disposed)return;if(revision===bossRevision)covered.value=runtime.covered;if(runtime.warning)error.value=runtime.warning});if(disposed)return;draft.value=state.value.drafts[state.value.selectedId]||'';scroll(state.value.selectedId)}catch(e){if(!disposed)error.value=e.message}}
watch(()=>state.value?.selectedId,id=>{if(id){draft.value=state.value.drafts[id]||'';scroll(id)}})
onMounted(()=>{document.addEventListener('keydown',escape);load()})
onBeforeUnmount(()=>{disposed=true;controller.dispose();for(const unsubscribe of unsubscribes)unsubscribe();document.removeEventListener('keydown',escape)})
</script>
