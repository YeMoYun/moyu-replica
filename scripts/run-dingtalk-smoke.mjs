import {spawn} from 'node:child_process'
import {createRequire} from 'node:module'
import {fileURLToPath} from 'node:url'
import fs from 'node:fs';import path from 'node:path';import os from 'node:os'
const executable=createRequire(import.meta.url)('electron'),env={...process.env};delete env.ELECTRON_RUN_AS_NODE
const taskDir=fs.mkdtempSync(path.join(os.tmpdir(),'moyu-dingtalk-smoke-'));env.MOYU_DINGTALK_DATA_DIR=taskDir
const run=args=>new Promise((resolve,reject)=>{const c=spawn(executable,[fileURLToPath(new URL('./dingtalk-smoke.cjs',import.meta.url)),...args],{env,stdio:'inherit',windowsHide:true});c.on('error',reject);c.on('exit',code=>resolve(code??1))})
try{const first=await run([]);process.exitCode=first===0?await run(['--restore-only']):first}
finally{const target=path.resolve(taskDir);if(path.dirname(target)===path.resolve(os.tmpdir())&&path.basename(target).startsWith('moyu-dingtalk-smoke-'))fs.rmSync(target,{recursive:true,force:true,maxRetries:10,retryDelay:100})}
