const finiteArea=area=>area&&['x','y','width','height'].every(field=>Number.isFinite(area[field]))

export function centerWindowOnActiveDisplay(win,screen){
  const current=win.getBounds()
  let display
  try{
    const point=screen.getCursorScreenPoint?.()
    if(point)display=screen.getDisplayNearestPoint?.(point)
  }catch{}
  const workArea=finiteArea(display?.workArea)?display.workArea:screen.getPrimaryDisplay().workArea
  const width=Math.min(workArea.width,Math.max(100,Math.round(current.width)))
  const height=Math.min(workArea.height,Math.max(100,Math.round(current.height)))
  const bounds={
    x:workArea.x+Math.round((workArea.width-width)/2),
    y:workArea.y+Math.round((workArea.height-height)/2),
    width,height
  }
  if(width===current.width&&height===current.height&&typeof win.setPosition==='function'){
    win.setPosition(bounds.x,bounds.y)
  }else win.setBounds(bounds)
  return bounds
}

export function normalizeNewFeatureWindow({kind,key,win,screen,windowControls,adWindowControls,topmost}){
  if(kind==='ad'){
    adWindowControls.setOpacity(key,1)
    win.setAlwaysOnTop(false)
  }else if(kind==='chat'){
    win.setOpacity(1)
    win.setAlwaysOnTop(false)
  }else{
    windowControls.setOpacity(key,1)
    windowControls.setTopmost(key,!!topmost)
    windowControls.setAutoHide(key,false)
  }
  return centerWindowOnActiveDisplay(win,screen)
}

export function presentWindow(win){
  if(!win||win.isDestroyed())return false
  if(win.isMinimized?.())win.restore()
  win.show()
  try{win.moveTop?.()}catch{}
  win.focus()
  return true
}
