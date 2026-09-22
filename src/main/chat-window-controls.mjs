import {fitBounds} from './window-controls.mjs'
import {chatContextFromWindowKey} from '../shared/chat-context.mjs'
export function createChatWindowController({store,screen}){
  const records=new Map();let covered=false
  function record(key){const r=records.get(key);if(!r||r.win.isDestroyed())throw Error('聊天窗口不存在');return r}
  function state(key){const r=record(key);return {key,covered,bounds:r.win.getBounds()}}
  function report(r,error){if(!r.win.isDestroyed()&&!r.win.webContents.isDestroyed())r.win.webContents.send('chat-mode:error',error.message)}
  function attach(key,win){
    try{chatContextFromWindowKey(key==='dingtalk'?'dingding':key)}catch{throw Error('聊天窗口类型不支持')}
    const r={win};records.set(key,r)
    const saved=store.get(`chatWindows.${key}`)?.bounds||store.get(`windowState.${key}`)?.bounds
    if(saved&&['x','y','width','height'].every(k=>Number.isFinite(saved[k])))win.setBounds(fitBounds(saved,screen.getAllDisplays()))
    const persist=()=>{if(!win.isDestroyed())try{store.set(`chatWindows.${key}`,{bounds:win.getBounds()})}catch(error){report(r,error)}}
    win.on('move',persist);win.on('resize',persist);win.on('close',persist)
    win.on('closed',()=>{if(records.get(key)===r)records.delete(key)})
    return state(key)
  }
  function toggleBoss(){covered=!covered;for(const r of records.values())if(!r.win.isDestroyed()&&!r.win.webContents.isDestroyed())r.win.webContents.send('chat-mode:boss',covered);return covered}
  function restore(key){record(key).win.show()}
  function close(key){record(key).win.close();return true}
  function setOpacity(key,value){if(!Number.isFinite(value))throw Error('透明度无效');const r=record(key);r.win.setOpacity(Math.max(.1,Math.min(1,value)));return state(key)}
  return {attach,state,toggleBoss,restore,close,setOpacity}
}
