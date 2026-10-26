'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createCloudServer}=require('../cloud-server.cjs');
test('Cloud gateway serves local UI and proxies approved API path',async()=>{
 const calls=[];
 const server=createCloudServer({fetchImpl:async(url,init)=>{calls.push({url,init});return {status:200,text:async()=>'{"mediaMode":"sfu"}'}}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const origin='http://127.0.0.1:'+server.address().port;
 try{
  const ui=await fetch(origin+'/');assert.equal(ui.status,200);assert.match(await ui.text(),/Zillu/);
  const res=await fetch(origin+'/api/connect',{method:'POST',headers:{'Content-Type':'application/json'},body:'{"name":"Teste"}'});
  assert.equal(res.status,200);assert.deepEqual(await res.json(),{mediaMode:'sfu'});
  assert.equal(calls[0].url,'https://zillu-backend.vercel.app/api/connect');
  assert.equal(calls[0].init.body,'{"name":"Teste"}');
  assert.equal((await fetch(origin+'/api/connect',{method:'GET'})).status,405);
  assert.equal((await fetch(origin+'/doesnotexist')).status,404);
 }finally{server.closeAllConnections();await new Promise(r=>server.close(r));}
});
