import {spawn} from 'node:child_process'
import {createRequire} from 'node:module'
import {fileURLToPath} from 'node:url'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
const require=createRequire(import.meta.url), executable=require('electron')
const env={...process.env};delete env.ELECTRON_RUN_AS_NODE
const taskDataDir=fs.mkdtempSync(path.join(os.tmpdir(),'moyu-huya-fill-smoke-'))
env.MOYU_HUYA_FILL_DATA_DIR=taskDataDir
const script=fileURLToPath(new URL('./huya-window-fill-smoke.cjs',import.meta.url))
const run=(args=[])=>new Promise((resolve,reject)=>{
  const child=spawn(executable,[script,...args],{env,stdio:'inherit',windowsHide:true})
  child.on('error',reject);child.on('exit',code=>resolve(code??1))
})
try{const first=await run();process.exitCode=first}
catch(error){console.error(error);process.exitCode=1}
finally{
  const resolved=path.resolve(taskDataDir)
  if(path.dirname(resolved)===path.resolve(os.tmpdir())&&path.basename(resolved).startsWith('moyu-huya-fill-smoke-')){
    fs.rmSync(resolved,{recursive:true,force:true,maxRetries:10,retryDelay:100})
    console.log('Isolated Huya fill test data removed; user configuration was not used.')
  }
}
