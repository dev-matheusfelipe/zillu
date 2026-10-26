'use strict';
const {execFileSync}=require('node:child_process');const fs=require('node:fs');const crypto=require('node:crypto');
if(process.platform!=='win32'){console.log('Application audio helper: Windows only');process.exit(0);}
const output='native/bin/zillu-audio.exe',stamp='native/bin/source.sha256',digest=crypto.createHash('sha256').update(fs.readFileSync('native/app-audio.cpp')).digest('hex');
if(fs.existsSync(output)&&fs.existsSync(stamp)&&fs.readFileSync(stamp,'utf8')===digest){console.log('Helper WASAPI atualizado.');process.exit(0);}
fs.mkdirSync('native/bin',{recursive:true});
try{execFileSync('g++',['-std=c++17','-O2','-static','native/app-audio.cpp','-o',output,'-lole32','-luuid'],{stdio:'inherit',windowsHide:true});}catch(error){throw Error('Instale um compilador MinGW-w64 com g++ para gerar o helper nativo de áudio.');}
fs.writeFileSync(stamp,digest);console.log('Helper WASAPI criado: '+output);
