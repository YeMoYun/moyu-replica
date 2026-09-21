export const READING_PLATFORMS = {
  fanQue:{key:'fanQue',name:'番茄读书',home:'https://fanqienovel.com/',root:'fanqienovel.com',content:'.muye-reader-content',controls:['.reader-toolbar','.muye-reader-btns'],background:'.muye-reader,.muye-reader-inner,.muye-reader-box'},
  jinJiang:{key:'jinJiang',name:'晋江书城',home:'https://www.jjwxc.net/',root:'jjwxc.net',content:'.noveltext',controls:['#chapter_list','#chapter_prev_link','#chapter_next_link','#reader_setting_panel'],background:'.novelbody,.noveltext,#showcontent'}
}
export function isReadingSiteURL(platform,value){
  try{const url=new URL(value);return url.protocol==='https:'&&!url.port&&!url.username&&!url.password&&(url.hostname===platform.root||url.hostname.endsWith('.'+platform.root))}catch{return false}
}
export function isReadingURL(platform,value){
  if(!isReadingSiteURL(platform,value))return false
  const url=new URL(value)
  return platform.key==='fanQue'?/^\/reader\/\d+\/?$/.test(url.pathname):url.pathname==='/onebook.php'&&/^[1-9]\d*$/.test(url.searchParams.get('novelid')||'')&&/^[1-9]\d*$/.test(url.searchParams.get('chapterid')||'')
}
