import {spawn} from 'node:child_process'
import {createRequire} from 'node:module'
import {fileURLToPath} from 'node:url'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
const executable=createRequire(import.meta.url)('electron'),env={...process.env};delete env.ELECTRON_RUN_AS_NODE
const taskDataDir=fs.mkdtempSync(path.join(os.tmpdir(),'moyu-ad-smoke-'));env.MOYU_AD_DATA_DIR=taskDataDir
const run=args=>new Promise((resolve,reject)=>{const child=spawn(executable,[fileURLToPath(new URL('./ad-modes-smoke.cjs',import.meta.url)),...args],{env,stdio:'inherit',windowsHide:true});child.on('error',reject);child.on('exit',code=>resolve(code??1))})
try{const code=await run([]);process.exitCode=code===0?await run(['--restore-only']):code}
catch(error){console.error(error);process.exitCode=1}
finally{const resolved=path.resolve(taskDataDir);if(path.dirname(resolved)===path.resolve(os.tmpdir())&&path.basename(resolved).startsWith('moyu-ad-smoke-')){fs.rmSync(resolved,{recursive:true,force:true,maxRetries:10,retryDelay:100});console.log('Isolated ad test configuration removed; user settings were not used.')}}
