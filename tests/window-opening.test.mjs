import test from 'node:test'
import assert from 'node:assert/strict'

let opening={}
try{opening=await import('../src/main/window-opening.mjs')}catch(error){if(error.code!=='ERR_MODULE_NOT_FOUND')throw error}

function fakeWindow(bounds={x:50,y:60,width:800,height:600}){
  const calls=[]
  let value={...bounds},destroyed=false,minimized=false
  return {
    calls,
    getBounds:()=>({...value}),
    setBounds:next=>{value={...next};calls.push(['bounds',next])},
    setOpacity:value=>calls.push(['opacity',value]),
    setAlwaysOnTop:value=>calls.push(['topmost',value]),
    isDestroyed:()=>destroyed,
    isMinimized:()=>minimized,
    restore:()=>calls.push(['restore']),
    show:()=>calls.push(['show']),
    moveTop:()=>calls.push(['moveTop']),
    focus:()=>calls.push(['focus']),
    set destroyed(value){destroyed=value},
    set minimized(value){minimized=value}
  }
}
const second={workArea:{x:1920,y:40,width:1280,height:720}}
const screen={
  getCursorScreenPoint:()=>({x:2300,y:300}),
  getDisplayNearestPoint:point=>{assert.deepEqual(point,{x:2300,y:300});return second},
  getPrimaryDisplay:()=>({workArea:{x:0,y:0,width:1920,height:1040}})
}

test('centered opening keeps size and uses the display nearest the cursor',()=>{
  assert.equal(typeof opening.centerWindowOnActiveDisplay,'function')
  const win=fakeWindow({x:-900,y:-700,width:900,height:600})
  assert.deepEqual(opening.centerWindowOnActiveDisplay(win,screen),{x:2110,y:100,width:900,height:600})
  assert.deepEqual(win.getBounds(),{x:2110,y:100,width:900,height:600})
})

test('oversized windows are clamped before centering and primary display is a safe fallback',()=>{
  const win=fakeWindow({x:0,y:0,width:2500,height:1200})
  const fallback={getPrimaryDisplay:screen.getPrimaryDisplay}
  assert.deepEqual(opening.centerWindowOnActiveDisplay(win,fallback),{x:0,y:0,width:1920,height:1040})
})

test('ordinary opening resets appearance through its controller but preserves boss semantics',()=>{
  const win=fakeWindow(),calls=[]
  opening.normalizeNewFeatureWindow({kind:'standard',key:'huyaOpacity',win,screen,
    windowControls:{setOpacity:(...args)=>calls.push(['opacity',...args]),setTopmost:(...args)=>calls.push(['topmost',...args]),setAutoHide:(...args)=>calls.push(['autoHide',...args])}})
  assert.deepEqual(calls,[['opacity','huyaOpacity',1],['topmost','huyaOpacity',false],['autoHide','huyaOpacity',false]])
  assert.deepEqual(win.getBounds(),{x:2160,y:100,width:800,height:600})
})

test('advertisement and chat openings reset only their supported native appearance',()=>{
  const ad=fakeWindow(),chat=fakeWindow(),adCalls=[]
  opening.normalizeNewFeatureWindow({kind:'ad',key:'douyin',win:ad,screen,adWindowControls:{setOpacity:(...args)=>adCalls.push(args)}})
  assert.deepEqual(adCalls,[['douyin',1]])
  assert.ok(ad.calls.some(call=>call[0]==='topmost'&&call[1]===false))
  opening.normalizeNewFeatureWindow({kind:'chat',key:'wechat',win:chat,screen})
  assert.ok(chat.calls.some(call=>call[0]==='opacity'&&call[1]===1))
  assert.ok(chat.calls.some(call=>call[0]==='topmost'&&call[1]===false))
})

test('foreground presentation restores only when minimized and never persists topmost',()=>{
  const win=fakeWindow();win.minimized=true
  assert.equal(opening.presentWindow(win),true)
  assert.deepEqual(win.calls,[['restore'],['show'],['moveTop'],['focus']])
  const closed=fakeWindow();closed.destroyed=true
  assert.equal(opening.presentWindow(closed),false)
  assert.deepEqual(closed.calls,[])
})
