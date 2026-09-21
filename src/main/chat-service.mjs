import {createChatState,validateChatState,migrateLegacy} from '../shared/chat-state.mjs'
export function createChatService({store,notify=()=>{},key='wechat',profile=key,legacyKey=key==='wechat'?'wechatConfig':'dingdingConfig',legacySiteKey,recoverInvalidSaved=false}){
  let warning=''
  const stateKey=`chatModes.${key}`,migrationKey=`chatMigration.${key}`
  function get(){
    const saved=store.get(stateKey)
    if(saved!==undefined){
      try{return validateChatState(saved,profile)}
      catch(error){
        if(!recoverInvalidSaved)throw error
        const state=createChatState(profile);warning=`已保存的聊天配置无效，已恢复默认数据：${error.message}`
        store.setMany({[stateKey]:state,[migrationKey]:{invalidSaved:saved,warning,date:new Date().toISOString()}})
        return structuredClone(state)
      }
    }
    const legacy=legacyKey?store.get(legacyKey):undefined,legacySite=legacySiteKey?store.get(legacySiteKey):undefined;let state=createChatState(profile)
    if(legacy!==undefined||legacySite!==undefined){
      try{
        if(legacy!==undefined&&(!legacy||typeof legacy!=='object'||Array.isArray(legacy)))throw Error('旧配置不能无损迁移，原文件已保留')
        const result=migrateLegacy({...legacy,...(legacySite!==undefined?{siteKey:legacySite}:{})},profile);state=result.state;warning=result.warning
      }catch(error){warning=`旧聊天配置无法迁移：${error.message}。原配置已保留。`}
    }
    const values={[stateKey]:state}
    if(legacy!==undefined||legacySite!==undefined)values[migrationKey]={legacy,legacySiteKey:legacySite,warning,date:new Date().toISOString()}
    store.setMany(values);return structuredClone(state)
  }
  function save(raw,revision){
    const committed=get();if(revision!==committed.revision)throw Error('聊天配置已更新，请重新操作（版本冲突）')
    const next=validateChatState(raw,profile);next.revision=committed.revision+1
    store.set(stateKey,next);notify(structuredClone(next));return structuredClone(next)
  }
  return {get,save,getWarning:()=>warning||store.get(migrationKey)?.warning||''}
}
