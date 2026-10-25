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
