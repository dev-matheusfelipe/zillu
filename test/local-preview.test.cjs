'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../public/app.js'),'utf8');
test('prévia inclui a track local viva e não apenas remotas',()=>{
 assert.match(source,/streams\.set\('__local__',myStream\)/);
 assert.match(source,/for\(const \[pid,stream\] of remoteStreams\) streams\.set\(pid,stream\)/);
});
test('prévia local não reproduz áudio e indica proprietário',()=>{
 assert.match(source,/video\.muted=pid==='__local__'/);
 assert.match(source,/Você · Prévia local/);
});
test('preview limpa quando transmissão encerra',()=>{
 assert.match(source,/async function stopMyStream\(\)[\s\S]*?renderStreams\(\)/);
});
