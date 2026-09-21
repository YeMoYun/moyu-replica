import { AD_MODES } from '../shared/ad-modes.mjs'

// Separate registry: advertising windows must never enter the transparency boss-hide manager.
export function createAdWindowController({store,screen}){
  const records=new Map();let covered=false
  function record(key){const r=records.get(key);if(!r||r.win.isDestroyed())throw Error('广告窗口不存在');return r}
  function state(key){const r=record(key);return {key,covered:r.covered,expanded:r.win.getBounds().width>500,opacity:r.win.getOpacity(),bounds:r.win.getBounds()}}
  function send(key){const r=record(key);if(!r.win.webContents.isDestroyed())r.win.webContents.send('ad-mode:state',state(key))}
  function persist(key){const r=record(key);store.set(`adModes.${key}.window`,{bounds:r.win.getBounds(),opacity:r.win.getOpacity()})}
  function attach(key,win){
    if(!Object.hasOwn(AD_MODES,key))throw Error('不支持的广告窗口')
    const r={win,covered,smallBounds:null};records.set(key,r)
    const saved=store.get(`adModes.${key}.window`),work=screen.getPrimaryDisplay().workArea
    if(saved?.bounds&&['x','y','width','height'].every(k=>Number.isFinite(saved.bounds[k]))){
      const b=saved.bounds,width=Math.min(work.width,Math.max(240,b.width)),height=Math.min(work.height,Math.max(200,b.height))
      win.setBounds({width,height,x:Math.max(work.x,Math.min(b.x,work.x+work.width-width)),y:Math.max(work.y,Math.min(b.y,work.y+work.height-height))})
    }
    if(Number.isFinite(saved?.opacity))win.setOpacity(Math.max(.1,Math.min(1,saved.opacity)))
    const changed=()=>{if(!win.isDestroyed()){persist(key);send(key)}}
    win.on('resize',changed);win.on('move',changed);win.on('close',()=>{if(!win.isDestroyed())persist(key)})
    win.on('closed',()=>{if(records.get(key)===r)records.delete(key)})
    return state(key)
  }
  function toggleBoss(){covered=!covered;for(const [key,r]of records)if(!r.win.isDestroyed()){r.covered=covered;send(key)}return covered}
  function expand(key){
    const r=record(key),bounds=r.win.getBounds(),work=screen.getPrimaryDisplay().workArea
    if(bounds.width<=500){r.smallBounds=bounds;r.win.setBounds({x:work.x+Math.max(0,Math.round((work.width-900)/2)),y:work.y+20,width:Math.min(900,work.width),height:Math.min(760,work.height-20)})}
    else{const def=AD_MODES[key];r.win.setBounds(r.smallBounds||{...bounds,width:def.width,height:def.height})}
    return state(key)
  }
  function setOpacity(key,value){const r=record(key);if(!Number.isFinite(value))throw Error('透明度必须是数字');r.win.setOpacity(Math.max(.1,Math.min(1,value)));persist(key);send(key);return state(key)}
  function close(key){record(key).win.close();return true}
  return {attach,state,toggleBoss,expand,setOpacity,close}
}
