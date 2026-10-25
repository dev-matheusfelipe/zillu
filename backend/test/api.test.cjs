'use strict';
const test=require('node:test');const assert=require('node:assert/strict');
const handler=require('../api/index.js');
function request({url='/api/health',method='POST',body={},headers={}}={}){return new Promise(resolve=>{const req={url,method,body,headers:{'content-type':'application/json',...headers},query:{route:url.split('/').at(-1)}};const res={headers:{},setHeader(k,v){this.headers[k]=v},end(x){resolve({status:this.statusCode||200,data:x?JSON.parse(x):null})}};handler(req,res);});}
test('health fails closed when Redis credentials missing',async()=>{const old=process.env.UPSTASH_REDIS_REST_URL;delete process.env.UPSTASH_REDIS_REST_URL;const r=await request();assert.equal(r.status,503);if(old)process.env.UPSTASH_REDIS_REST_URL=old;});
test('invalid methods rejected',async()=>{const r=await request({method:'GET'});assert.equal(r.status,405);});
test('LiveKit tokens are signed and limited in scope',()=>{const {jwtToken}=require('../sfu/token.cjs');const token=jwtToken({key:'key',secret:'secret',identity:'id',room:'ABCDEF',ttl:120});const p=JSON.parse(Buffer.from(token.split('.')[1],'base64url'));assert.equal(p.video.roomJoin,true);assert.equal(p.video.roomAdmin,undefined);assert.equal(p.video.room,'ABCDEF');});
