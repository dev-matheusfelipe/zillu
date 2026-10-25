const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
// Contract test: a real screen-capture E2E still needs an interactive Windows session.
test('Electron capture callback contract uses DesktopCapturerSource, not MediaStreamTrack',()=>{
 const code=fs.readFileSync(path.join(__dirname,'..','electron.cjs'),'utf8');
 assert.match(code,/callback\(\{video:source\}\)/);
 assert.doesNotMatch(code,/source\.mediaStream/);
 assert.match(code,/setDisplayMediaRequestHandler/);
});
