'use strict';
const {spawn,execFile}=require('node:child_process');const {promisify}=require('node:util');const exec=promisify(execFile);const path=require('node:path');const fs=require('node:fs');const crypto=require('node:crypto');
function createApplicationAudio({app,send}){
 const binary=app.isPackaged?path.join(process.resourcesPath,'zillu-audio.exe'):path.join(__dirname,'native','bin','zillu-audio.exe');let active=null,allowed=new Set();
 async function supported(){if(process.platform!=='win32'||!fs.existsSync(binary))return false;try{return(await exec(binary,['--probe'],{windowsHide:true,timeout:3000})).stdout.trim()==='true';}catch{return false;}}
 async function list(){if(!await supported())return[];const {stdout}=await exec(binary,['--list'],{windowsHide:true,timeout:5000,maxBuffer:1024*1024});const apps=JSON.parse(stdout).filter(item=>Number.isSafeInteger(item.pid)&&item.pid>0&&typeof item.name==='string'&&typeof item.process==='string').map(item=>({pid:item.pid,name:item.name.slice(0,180),process:item.process.slice(0,100)}));allowed=new Set(apps.map(item=>item.pid));return apps;}
 function stop(){if(active){const previous=active;active=null;previous.child.stdin?.end();previous.child.kill();}}
 async function start(pid){
  if(!Number.isSafeInteger(pid)||!allowed.has(pid))throw Error('Escolha um aplicativo de áudio válido.');
  await list();if(!allowed.has(pid))throw Error('O aplicativo selecionado não está mais disponível.');stop();
  const id=crypto.randomUUID(),child=spawn(binary,['--capture',String(pid)],{windowsHide:true,stdio:['pipe','pipe','pipe']});active={id,child};
  return new Promise((resolve,reject)=>{let settled=false,pending=Buffer.alloc(0),status='';const timer=setTimeout(()=>{if(!settled){settled=true;stop();reject(Error('Não foi possível iniciar o áudio deste aplicativo.'));}},12000);
   child.stderr.on('data',chunk=>{status+=chunk.toString();if(!settled&&status.includes('READY')){settled=true;clearTimeout(timer);resolve({id,sampleRate:48000,channels:2});}});
   child.stdout.on('data',chunk=>{if(active?.id!==id)return;pending=Buffer.concat([pending,chunk]);const size=960*2*4;while(pending.length>=size){send('app-audio-data',{id,pcm:new Uint8Array(pending.subarray(0,size))});pending=pending.subarray(size);}});
   child.once('error',error=>{clearTimeout(timer);if(!settled){settled=true;reject(Error('Captura por aplicativo indisponível.'));}if(active?.id===id)active=null;});
   child.once('exit',()=>{clearTimeout(timer);if(!settled){settled=true;reject(Error('Não foi possível capturar o áudio do aplicativo selecionado.'));}if(active?.id===id){active=null;send('app-audio-ended',{id});}});
  });
 }
 return {supported,list,start,stop};
}
module.exports={createApplicationAudio};
