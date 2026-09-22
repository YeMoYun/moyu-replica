import {validateChatUrl} from '../../../../shared/chat-state.mjs'

// Availability survives loading transitions; ready belongs to the current document only.
export function createChatNavigation({platform='douyin',initialAddress,readUrl,load,commit,report}){
  let desired=validateChatUrl(initialAddress,platform),available=false,pending=false,issued=null,epoch=0,disposed=false,chain=null
  let redirects=new Set()
  function issue(){
    if(disposed||!available||!pending||issued===desired)return
    const target=desired,generation=epoch;issued=target
    const failed=error=>{
      if(disposed||generation!==epoch)return
      issued=null;report(error)
    }
    try{Promise.resolve(load(target)).catch(failed)}catch(error){failed(error)}
  }
  return {
    addressChanged(address){
      if(disposed)return
      const target=validateChatUrl(address,platform)
      if(target===desired)return
      desired=target;epoch++;issued=null
      chain=null;redirects=new Set()
      pending=!(available&&readUrl()===target)
      issue()
    },
    started(event){
      if(disposed||event.isMainFrame===false)return false
      const target=validateChatUrl(event.url,platform)
      if(!pending)return true
      if(target!==desired)return false
      chain={epoch,process:event.frameProcessId,routing:event.frameRoutingId};redirects=new Set([target]);return true
    },
    redirect(event){
      if(disposed||event.isMainFrame===false)return false
      const target=validateChatUrl(event.url,platform)
      if(!pending)return true
      if(!chain||chain.epoch!==epoch||chain.process!==event.frameProcessId||chain.routing!==event.frameRoutingId)return false
      redirects.add(target);return true
    },
    navigate(address){
      if(disposed)return false
      const target=validateChatUrl(address,platform)
      if(pending&&target!==desired&&!redirects.has(target))return false
      desired=target;pending=false;issued=null;chain=null;redirects=new Set();commit(target);return true
    },
    domReady(){
      if(disposed)return false
      available=true
      const current=validateChatUrl(readUrl(),platform)
      if(pending&&current!==desired&&!redirects.has(current)){issue();return false}
      if(pending){desired=current;commit(current)}
      pending=false;issued=null;return true
    },
    retry(){if(disposed||!pending||!available)return false;issued=null;issue();return true},
    dispose(){disposed=true;epoch++}
  }
}
