const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const app=fs.readFileSync(path.join(__dirname,'../public/app.js'),'utf8');
const html=fs.readFileSync(path.join(__dirname,'../public/index.html'),'utf8');
test('nenhuma referência dinâmica ao campo endpoint removido',()=>{assert.doesNotMatch(app,/\$\(['"]endpoint['"]\)/);assert.doesNotMatch(html,/id=["']endpoint["']/);});
test('publicação SFU exibe diagnóstico após sucesso',()=>{assert.match(app,/localPublication=await livekitRoom\.localParticipant\.publishTrack/);assert.match(app,/Tela publicada no LiveKit/);});
