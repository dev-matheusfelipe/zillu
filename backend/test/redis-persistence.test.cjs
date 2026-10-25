'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {RedisStore}=require('../lib/redis.cjs');
test('RedisStore.set rejects a write not acknowledged by Redis', async()=>{
 const db=new RedisStore({UPSTASH_REDIS_REST_URL:'https://example.invalid',UPSTASH_REDIS_REST_TOKEN:'test'});
 db.cmd=async()=>null;
 await assert.rejects(db.set('room',{}),err=>err.status===503);
});
test('RedisStore.set accepts acknowledged writes', async()=>{
 const db=new RedisStore({UPSTASH_REDIS_REST_URL:'https://example.invalid',UPSTASH_REDIS_REST_TOKEN:'test'});
 db.cmd=async()=> 'OK';
 assert.equal(await db.set('room',{}),'OK');
});

test('RedisStore always chooses the explicit Upstash configuration',()=>{
 const db=new RedisStore({KV_REST_API_URL:'https://outro.invalid',KV_REST_API_TOKEN:'old',UPSTASH_REDIS_REST_URL:'https://upstash.example',UPSTASH_REDIS_REST_TOKEN:'new'});
 assert.equal(db.url,'https://upstash.example');assert.equal(db.token,'new');
 assert.match(db.fingerprint,/^[a-f0-9]{12}$/);
});
test('RedisStore refuses legacy-only KV configuration',()=>{
 assert.throws(()=>new RedisStore({KV_REST_API_URL:'https://outro.invalid',KV_REST_API_TOKEN:'old'}),err=>err.status===503);
});
