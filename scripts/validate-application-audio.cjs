'use strict';
const {execFileSync,spawn}=require('node:child_process'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const temp=path.join(process.env.TEMP,'zillu-native-isolation-test');fs.mkdirSync(temp,{recursive:true});const player=path.join(temp,'ZilluTestMovie.exe'),voice=path.join(temp,'Discord.exe');
execFileSync('g++',['-O2','-static','native/test-tone.cpp','-o',player,'-lwinmm'],{windowsHide:true,stdio:'inherit'});fs.copyFileSync(player,voice);
const children=[];const launch=(binary,args)=>{const child=spawn(binary,args,{windowsHide:true,stdio:['pipe','pipe','pipe']});children.push(child);return child;};
const ready=child=>new Promise((resolve,reject)=>{child.stdout.once('data',resolve);child.once('error',reject);child.once('exit',code=>{if(code)reject(Error('Tone failed '+code));});});
(async()=>{try{
 const movie=launch(player,['440']),chat=launch(voice,['880']);await Promise.all([ready(movie),ready(chat)]);
 const capture=launch(path.resolve('native/bin/zillu-audio.exe'),['--capture',String(movie.pid)]);const chunks=[];let status='';capture.stdout.on('data',data=>chunks.push(data));
 await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Capture not ready: '+status)),12000);capture.stderr.on('data',data=>{status+=data.toString();if(status.includes('READY')){clearTimeout(timer);resolve();}});capture.once('exit',code=>{clearTimeout(timer);reject(Error('Capture exited '+code+' '+status));});});
 await new Promise(resolve=>setTimeout(resolve,1800));capture.kill();const bytes=Buffer.concat(chunks);assert(bytes.length>48000,'No audio samples received');const samples=new Float32Array(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+Math.floor(bytes.length/8)*8));
 const power=freq=>{let real=0,imag=0;for(let i=0;i<samples.length/2;i++){const phase=2*Math.PI*freq*i/48000;real+=samples[i*2]*Math.cos(phase);imag+=samples[i*2]*Math.sin(phase);}return real*real+imag*imag;};const moviePower=power(440),voicePower=power(880),ratio=voicePower/moviePower;assert(moviePower>1);assert(ratio<.02,'Other application leaked: '+ratio);
 const blocked=launch(path.resolve('native/bin/zillu-audio.exe'),['--capture',String(chat.pid)]);const code=await new Promise(resolve=>blocked.once('exit',resolve));assert.equal(code,2);
 const report={selectedApplicationSignal:true,otherApplicationRejected:true,otherProcessPowerRatio:ratio,voiceProcessCaptureBlocked:true,samples:samples.length/2};fs.writeFileSync('docs/versions/zillu-application-audio-isolation.json',JSON.stringify(report,null,2));console.log(report);
 }finally{for(const child of children)child.kill();}})().catch(error=>{console.error(error);process.exit(1)});
