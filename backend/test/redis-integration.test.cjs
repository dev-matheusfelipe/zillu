'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {RedisStore}=require('../lib/redis.cjs');
const {RoomService,keys}=require('../lib/room-service.cjs');
const {createHandler}=require('../api/index.js');
const {restProxy}=require('./helpers/redis-rest.cjs');
const port=Number(process.env.ZILLU_TEST_REDIS_PORT||0);
test('real Redis: atomic state/session/events, REST adapter, persistence, roles, CAS races and TTL',{skip:!port},async()=>{
 const proxy=await restProxy(port);const db=new RedisStore({UPSTASH_REDIS_REST_URL:proxy.url,UPSTASH_REDIS_REST_TOKEN:'local-test-only'});
 const config={url:'wss://example.livekit.cloud',key:'local-test',secret:'local-secret'};
 const service=new RoomService(db,{livekit:config});
 const users=[];
 try{
  for(let i=0;i<6;i++)users.push(await service.connect('Redis '+i));const room=await service.operate(users[0].token,'create');
  await Promise.all(users.slice(1).map(user=>new RoomService(db,{livekit:config}).operate(user.token,'join',{code:room.code})));
  assert.equal((await db.json(keys.room(room.code))).members.length,5);
  await service.operate(users[0].token,'approve',{target:users[1].id});await service.operate(users[0].token,'promote',{target:users[1].id});
  const request=async(i,route,body={})=>new Promise(resolve=>{const handler=createHandler({dbFactory:()=>db,livekit:config,pollIterations:1,pollDelay:0,mediaCommand:async()=>{}});handler({method:'POST',url:'/api/'+route,headers:{authorization:'Bearer '+users[i].token},body},{setHeader(){},end(value){resolve({status:this.statusCode,data:JSON.parse(value)});}});});
  assert.equal((await request(2,'sfu-token')).status,403);assert.equal((await request(1,'promote',{target:users[2].id})).status,403);
  const results=await Promise.all(users.slice(2).map((user,index)=>request(index%2,'approve',{target:user.id})));assert(results.every(result=>result.status===200));
  for(const user of users)assert.equal((await db.json(keys.session(user.token))).approved,true);
  const raw=await db.get(keys.room(room.code));await request(0,'demote',{target:users[1].id});assert.equal(await db.commit({expected:[[keys.room(room.code),raw]],writes:[[keys.room(room.code),{value:raw,ttl:3600}]],events:[],jobs:[]}),false);
  await request(0,'promote',{target:users[1].id});await Promise.all([request(0,'remove',{target:users[2].id}),request(1,'approve',{target:users[2].id})]);assert.equal((await db.json(keys.session(users[2].token))).room,null);
  await db.cmd('EXPIRE',keys.room(room.code),2);await request(1,'events');assert(await db.cmd('TTL',keys.room(room.code))>3500);
  await request(0,'leave');assert.equal((await db.json(keys.room(room.code))).owner,users[1].id);
  await request(1,'transfer',{target:users[3].id});assert.equal((await db.json(keys.room(room.code))).owner,users[3].id);assert.equal((await request(1,'end-room')).status,403);
  await request(3,'end-room');assert.equal(await db.json(keys.room(room.code)),null);
  const events=await request(4,'events');assert(events.data.some(event=>event.type==='ended'));
  for(const user of users)await db.del(keys.session(user.token));
 }finally{await proxy.close();}
});
