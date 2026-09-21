// Guest exports must serialize independently; platform is plain data, not a closure.
export function showReadingControls(platform){
  const key='__moyuReadingControls_'+platform.key,previous=window[key]
  if(previous){previous.restore();delete window[key]}
  if(!document.querySelector(platform.content))throw new Error('请先进入'+platform.name+'正文阅读页面并等待加载完成')
  const candidates=platform.controls.flatMap(selector=>Array.from(document.querySelectorAll(selector)))
  const nodes=[...new Set(candidates)].filter(node=>!candidates.some(other=>other!==node&&other.contains(node)))
  if(!nodes.length)throw new Error('未找到'+platform.name+'的原生阅读控件，请等待页面加载完成')
  const wrapper=document.createElement('div');wrapper.id='__moyu-reading-float-'+platform.key
  wrapper.style.cssText='position:fixed;left:8px;top:50%;transform:translateY(-50%);z-index:2147483647;display:flex;align-items:center;gap:8px;max-width:calc(100vw - 16px);max-height:80vh;overflow:auto;background:rgb(233 189 125 / 95%);padding:6px 8px;border-radius:8px;box-sizing:border-box;box-shadow:0 4px 20px #0005;'
  // Preserve delegated React handlers by keeping controls inside their original root.
  const root=document.querySelector('#app')||document.querySelector('#root')||document.body
  const saved=nodes.map(node=>({node,parent:node.parentNode,next:node.nextSibling,style:node.getAttribute('style'),aria:node.getAttribute('aria-hidden')}))
  const sheet=document.createElement('style')
  sheet.textContent=`#${wrapper.id}>:not(style){position:static!important;transform:none!important;display:flex!important;flex-direction:row!important;visibility:visible!important;opacity:1!important;width:auto!important;height:auto!important;top:auto!important;left:auto!important;right:auto!important;bottom:auto!important;flex-shrink:0!important}#${wrapper.id}>#reader_setting_panel{flex-direction:column!important;max-width:320px!important}`
  wrapper.appendChild(sheet)
  root.appendChild(wrapper)
  for(const node of nodes){wrapper.appendChild(node);if(node.hasAttribute('style'))for(const [name,value]of Object.entries({position:'static',transform:'none',display:'flex','flex-direction':'row',visibility:'visible',opacity:'1',width:'auto',height:'auto',top:'auto',left:'auto',right:'auto',bottom:'auto','flex-shrink':'0'}))node.style.setProperty(name,value,'important');if(node.hasAttribute('aria-hidden'))node.setAttribute('aria-hidden','false')}
  const restore=()=>{
    // Reverse order also restores consecutive nodes' original sibling positions.
    for(const item of [...saved].reverse()){
      const parent=item.parent?.isConnected?item.parent:root.isConnected?root:document.body
      parent.insertBefore(item.node,item.next?.parentNode===parent?item.next:null)
      for(const [name,value]of [['style',item.style],['aria-hidden',item.aria]])value===null?item.node.removeAttribute(name):item.node.setAttribute(name,value)
    }
    wrapper.remove()
  }
  window[key]={restore,wrapper};return {shown:true,count:nodes.length}
}
export function hideReadingControls(platform){const key='__moyuReadingControls_'+platform.key;window[key]?.restore();delete window[key];return {shown:false}}
export function startReadingScroll(platform,speed){
  if(!Number.isFinite(speed)||speed<1||speed>10)throw new Error('自动滚动速度必须为 1 至 10 的数字')
  const content=document.querySelector(platform.content)
  if(!content)throw new Error('请先进入'+platform.name+'正文阅读页面再开启自动滚动')
  const key='__moyuReadingScroll_'+platform.key,previous=window[key]
  if(previous){previous.running=false;cancelAnimationFrame(previous.id)}
  let container=content
  while(container&&container!==document.body){if(/auto|scroll/.test(getComputedStyle(container).overflowY)&&container.scrollHeight>container.clientHeight+2)break;container=container.parentElement}
  if(!container||container===document.body)container=document.scrollingElement||document.documentElement
  const state={running:true,id:null,lastTime:performance.now(),accumulated:0,container};window[key]=state
  const tick=time=>{
    if(!state.running||window[key]!==state)return
    const delta=Math.max(0,time-state.lastTime);state.lastTime=time;state.accumulated+=speed*.12*(delta>100?16.67:delta)/16.67
    if(state.accumulated>=1){const move=Math.floor(state.accumulated);container.scrollTop+=move;state.accumulated-=move}
    if(!container.isConnected||container.scrollTop+container.clientHeight>=container.scrollHeight-2){state.running=false;state.id=null;return}
    state.id=requestAnimationFrame(tick)
  }
  state.id=requestAnimationFrame(tick);return {scrolling:true,speed}
}
export function stopReadingScroll(platform){const key='__moyuReadingScroll_'+platform.key,state=window[key];if(state){state.running=false;if(state.id!==null)cancelAnimationFrame(state.id);delete window[key]}return {scrolling:false}}
export function cleanupReadingPage(platform){
  const controls='__moyuReadingControls_'+platform.key,scroll='__moyuReadingScroll_'+platform.key
  window[controls]?.restore();delete window[controls]
  if(window[scroll]){window[scroll].running=false;if(window[scroll].id!==null)cancelAnimationFrame(window[scroll].id);delete window[scroll]}
  return {shown:false,scrolling:false}
}
