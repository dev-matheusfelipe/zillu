const {test}=require('node:test');
const assert=require('node:assert/strict');
const {jwtToken}=require('../sfu/token.cjs');
const {createHmac}=require('node:crypto');
const {createServer}=require('../server.cjs');
const post=async(base,route,data={},token)=>{const r=await fetch(base+'/api/'+route,{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify(data)});return {status:r.status,body:await r.json()};};
test('LiveKit token HS256 assinado, sala vinculada e prazo limitado',()=>{
const t=jwtToken({key:'key',secret:'secret',identity:'peer',name:'Pessoa',room:'ABC123',ttl:900});
const [h,p,signature]=t.split('.');
assert.equal(createHmac('sha256','secret').update(h+'.'+p).digest('base64url'),signature);
const claims=JSON.parse(Buffer.from(p,'base64url').toString());
assert.equal(claims.video.room,'ABC123');assert.equal(claims.sub,'peer');assert.equal(claims.exp-claims.iat,900);
});
test('SFU token somente após aprovação; sem credencial no connect', async()=>{
const s=createServer({livekit:{url:'ws://127.0.0.1:7880',key:'devkey',secret:'devsecret'}});
await new Promise(r=>s.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+s.address().port;
try{
const owner=(await post(base,'connect',{name:'Dono'})).body;
const member=(await post(base,'connect',{name:'Amigo'})).body;
assert.equal(owner.mediaMode,'sfu');assert.equal(owner.token.includes('devsecret'),false);
const room=(await post(base,'create',{},owner.token)).body;
await post(base,'join',{code:room.code},member.token);
assert.equal((await post(base,'sfu-token',{},member.token)).status,403);
assert.equal((await post(base,'sfu-token',{},owner.token)).status,200);
await post(base,'approve',{target:member.id},owner.token);
const granted=await post(base,'sfu-token',{},member.token);assert.equal(granted.status,200);assert.equal(granted.body.url,'ws://127.0.0.1:7880');
}finally{s.closeAllConnections();await new Promise(r=>s.close(r));}
});
