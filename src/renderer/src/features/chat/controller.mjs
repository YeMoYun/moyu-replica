import {validateChatState} from '../../../../shared/chat-state.mjs'
export async function loadChatRuntime(controller,api,onRuntime){
  onRuntime(await api.getRuntime())
  await controller.load()
  onRuntime(await api.getRuntime())
}
export function createChatController({api,validate=validateChatState,onState=()=>{},onError=()=>{}}){
  let state=null,queue=Promise.resolve(),closed=false
  function accept(raw){if(closed)return;const next=validate(raw);if(!state||next.revision>state.revision){state=next;onState(structuredClone(state))}return state}
  async function load(){try{return accept(await api.get())}catch(error){onError(error);throw error}}
  function update(operation){
    const task=queue.then(async()=>{
      if(closed)throw Error('聊天窗口已关闭');if(!state)throw Error('聊天配置未加载')
      const next=structuredClone(state);operation(next);validate(next)
      const saved=await api.save(next,state.revision);accept(saved);return saved
    }).catch(async error=>{if(!closed){onError(error);if(error.message.includes('版本冲突'))try{accept(await api.get())}catch{}}throw error})
    queue=task.catch(()=>{});return task
  }
  return {accept,load,update,dispose:()=>{closed=true}}
}
