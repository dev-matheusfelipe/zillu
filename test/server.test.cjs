const {test}=require('node:test');const assert=require('node:assert/strict');const {createServer}=require('../server.cjs');
const post=async(base,route,data={},token)=>{const r=await fetch(base+'/api/'+route,{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify(data)});return {status:r.status,body:await r.json()};};
test('v0.3.0: salas, aprovação, stream e sinalização multiponto',async()=>{
const s=createServer();await new Promise(r=>s.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${s.address().port}`;
try{
const h=(await post(base,'connect',{name:'Host'})).body;
const v1=(await post(base,'connect',{name:'Viewer1'})).body;
const v2=(await post(base,'connect',{name:'Viewer2'})).body;
const {code}=(await post(base,'create',{},h.token)).body;
assert.match(code,/^[A-Z2-9]{6}$/);
assert.equal((await post(base,'join',{code},v1.token)).status,200);
assert.equal((await post(base,'join',{code},v2.token)).status,200);
assert.equal((await post(base,'approve',{target:v1.id},h.token)).status,200);
assert.equal((await post(base,'start-stream',{},v1.token)).status,200);
assert.equal((await post(base,'start-stream',{},v2.token)).status,403);
assert.equal((await post(base,'approve',{target:v2.id},h.token)).status,200);
assert.equal((await post(base,'start-stream',{},v2.token)).status,200);
assert.equal((await post(base,'signal',{target:v2.id,data:{type:'offer',sdp:'test'}},v1.token)).status,200);
assert.equal((await post(base,'stop-stream',{},v1.token)).status,200);
await post(base,'end-room',{},h.token);
const ev=(await post(base,'events',{},v1.token)).body;
assert.ok(ev.some(e=>e.type==='ended'));
}finally{s.closeAllConnections();await new Promise(r=>s.close(r));}
});
test('v0.3.0: limite de participantes e remoção durante transmissão',async()=>{
const s=createServer();await new Promise(r=>s.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${s.address().port}`;
try{
const h=(await post(base,'connect')).body;
const {code}=(await post(base,'create',{},h.token)).body;
const members=[];
for(let i=0;i<6;i++){
const m=(await post(base,'connect',{name:`M${i}`})).body;
members.push(m);
const res=await post(base,'join',{code},m.token);
assert.equal(res.status,i<5?200:409);
}
await post(base,'approve',{target:members[0].id},h.token);
assert.equal((await post(base,'start-stream',{},members[0].token)).status,200);
assert.equal((await post(base,'remove',{target:members[0].id},h.token)).status,200);
const ev=(await post(base,'events',{},members[0].token)).body;
assert.ok(ev.some(e=>e.type==='removed'));
}finally{s.closeAllConnections();await new Promise(r=>s.close(r));}
});
