'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {RoomService,keys}=require('../lib/room-service.cjs');
const {MemoryStore}=require('../lib/memory.cjs');
const {flushMediaJob}=require('../lib/livekit.cjs');
const livekit={url:'wss://example.livekit.cloud',key:'test',secret:'test-secret'};
async function fixture(count=4){const db=new MemoryStore(),service=new RoomService(db,{livekit});const users=[];for(let i=0;i<count;i++)users.push(await service.connect('Pessoa '+i));const room=await service.operate(users[0].token,'create');for(const u of users.slice(1))await service.operate(u.token,'join',{code:room.code});return {db,service,users,code:room.code,op:(i,route,body={})=>service.operate(users[i].token,route,body)};}
const denied=(promise,status=403)=>assert.rejects(promise,e=>e.status===status);
test('owner promotes/demotes; admin approves but cannot alter roles or remove managers',async()=>{
 const f=await fixture();await f.op(0,'approve',{target:f.users[1].id});await f.op(0,'promote',{target:f.users[1].id});
 await f.op(1,'approve',{target:f.users[2].id});await f.op(0,'promote',{target:f.users[2].id});
 for(const target of [f.users[0].id,f.users[2].id])await denied(f.op(1,'remove',{target}));
 for(const route of ['promote','demote','transfer'])await denied(f.op(1,route,{target:f.users[2].id}));
 await denied(f.op(1,'end-room'));await denied(f.op(3,'approve',{target:f.users[2].id,role:'owner'}));
 await f.op(0,'demote',{target:f.users[2].id});assert.deepEqual((await f.db.json(keys.room(f.code))).admins,[f.users[1].id]);
 await f.op(1,'remove',{target:f.users[3].id});assert.equal((await f.db.json(keys.session(f.users[3].token))).room,null);
});
test('pending and removed users cannot get tokens, share, or regain approval with forged roles',async()=>{
 const f=await fixture(2);await denied(f.op(1,'sfu-token'));await denied(f.op(1,'start-stream'));
 await f.op(0,'approve',{target:f.users[1].id});const granted=await f.op(1,'sfu-token');const claims=JSON.parse(Buffer.from(granted.token.split('.')[1],'base64url'));assert.equal(claims.exp-claims.iat,120);assert.equal(claims.video.roomAdmin,undefined);
 await f.op(0,'remove',{target:f.users[1].id});await denied(f.op(1,'sfu-token'),404);await denied(f.op(1,'join',{code:f.code}));
 const room=await f.db.json(keys.room(f.code));assert(room.denied.includes(f.users[1].id));
});
test('owner leave keeps room, elects admin first; transfer demotes previous owner to member',async()=>{
 const f=await fixture();await f.op(0,'approve',{target:f.users[1].id});await f.op(0,'approve',{target:f.users[2].id});await f.op(0,'promote',{target:f.users[2].id});
 await f.op(0,'leave');assert.equal((await f.db.json(keys.room(f.code))).owner,f.users[2].id);
 await f.op(2,'approve',{target:f.users[3].id});await f.op(2,'transfer',{target:f.users[1].id});
 const room=await f.db.json(keys.room(f.code));assert.equal(room.owner,f.users[1].id);assert(room.members.includes(f.users[2].id));await denied(f.op(2,'promote',{target:f.users[3].id}));
 await f.op(1,'end-room');assert.equal(await f.db.json(keys.room(f.code)),null);assert.equal((await f.db.json(keys.session(f.users[3].token))).room,null);
});
test('no-admin owner exit elects first approved member; last approved exit closes pending room',async()=>{
 const f=await fixture(3);await f.op(0,'approve',{target:f.users[1].id});await f.op(0,'leave');assert.equal((await f.db.json(keys.room(f.code))).owner,f.users[1].id);await f.op(1,'leave');assert.equal(await f.db.json(keys.room(f.code)),null);assert.equal((await f.db.json(keys.session(f.users[2].token))).room,null);
});
test('concurrent approves preserve every approval and admin; remove wins against approval',async()=>{
 const f=await fixture(6);await f.op(0,'approve',{target:f.users[1].id});await f.op(0,'promote',{target:f.users[1].id});
 await Promise.all(f.users.slice(2).map((u,index)=>f.op(index%2,'approve',{target:u.id})));
 for(const user of f.users)assert.equal((await f.db.json(keys.session(user.token))).approved,true);
 await Promise.allSettled([f.op(0,'remove',{target:f.users[2].id}),f.op(1,'approve',{target:f.users[2].id})]);
 assert.equal((await f.db.json(keys.session(f.users[2].token))).room,null);assert(!(await f.db.json(keys.room(f.code))).members.includes(f.users[2].id));
});
test('transfer/remove race never leaves a removed owner or double ownership',async()=>{
 const f=await fixture(3);await f.op(0,'approve',{target:f.users[1].id});await f.op(0,'approve',{target:f.users[2].id});
 await Promise.allSettled([f.op(0,'transfer',{target:f.users[1].id}),f.op(0,'remove',{target:f.users[1].id})]);
 const room=await f.db.json(keys.room(f.code)),owner=f.users.find(u=>u.id===room.owner);assert(owner);assert.equal((await f.db.json(keys.session(owner.token))).room,f.code);assert(!room.members.includes(room.owner));assert(!room.denied.includes(room.owner));
});
test('authorized activity renews TTL; pending heartbeat does not; stale owner is replaced',async()=>{
 const f=await fixture(3),key=keys.room(f.code);f.db.deadlines.set(key,Date.now()+2000);const before=f.db.deadlines.get(key);await f.op(2,'heartbeat');assert.equal(f.db.deadlines.get(key),before);
 await f.op(0,'approve',{target:f.users[1].id});await f.op(1,'heartbeat');assert(f.db.deadlines.get(key)>Date.now()+3500000);
 const owner=await f.db.json(keys.session(f.users[0].token));owner.lastSeen=Date.now()-100000;await f.db.set(keys.session(owner.token),owner);
 await f.op(1,'heartbeat');assert.equal((await f.db.json(key)).owner,f.users[1].id);
});
test('media revocations persist and retry; forged failures do not roll back Redis security',async()=>{
 const f=await fixture(2);await f.op(0,'approve',{target:f.users[1].id});await f.op(0,'remove',{target:f.users[1].id});
 assert.equal(await flushMediaJob(f.db,livekit,async()=>{throw Error('offline')}),false);assert(await f.db.cmd('LINDEX','z:media-jobs',-1));
 let job;await flushMediaJob(f.db,livekit,async(_config,item)=>{job=item;});assert.equal(job.method,'RemoveParticipant');assert.equal(job.identity,f.users[1].id);assert.equal(await f.db.cmd('LINDEX','z:media-jobs',-1),null);
});
test('persisted pre-0.6.3 room acquires safe defaults without changing identifiers',async()=>{
 const f=await fixture(2);const room=await f.db.json(keys.room(f.code));delete room.admins;delete room.denied;delete room.revision;await f.db.set(keys.room(f.code),room);await f.op(0,'approve',{target:f.users[1].id});await f.op(0,'promote',{target:f.users[1].id});assert.deepEqual((await f.db.json(keys.room(f.code))).admins,[f.users[1].id]);
});

test('an admin demoted while approval is in flight cannot commit stale permissions',async()=>{
 const f=await fixture(3);await f.op(0,'approve',{target:f.users[1].id});await f.op(0,'promote',{target:f.users[1].id});
 const commit=f.db.commit.bind(f.db);let paused=false,release,entered;const gate=new Promise(resolve=>release=resolve),ready=new Promise(resolve=>entered=resolve);
 f.db.commit=async tx=>{const target=tx.writes.find(([key])=>key===keys.session(f.users[2].token));if(!paused&&target&&JSON.parse(target[1].value).approved){paused=true;entered();await gate;}return commit(tx);};
 const approving=f.op(1,'approve',{target:f.users[2].id});await ready;await f.op(0,'demote',{target:f.users[1].id});release();await denied(approving);assert.equal((await f.db.json(keys.session(f.users[2].token))).approved,false);
});
test('ending a room drains every revocation before SFU DeleteRoom',async()=>{
 const f=await fixture(3);await f.op(0,'approve',{target:f.users[1].id});await f.op(0,'approve',{target:f.users[2].id});await f.op(0,'end-room');
 const calls=[];await flushMediaJob(f.db,livekit,async(_config,job)=>{calls.push(job.method);});assert.equal(calls.filter(method=>method==='RemoveParticipant').length,3);assert.equal(calls.at(-1),'DeleteRoom');assert.equal((await f.db.cmd('LRANGE','z:media-jobs',0,-1)).length,0);
});

test('expired participant records still enqueue media removal and cannot become ghost owners',async()=>{
 const f=await fixture(2);await f.op(0,'approve',{target:f.users[1].id});await f.db.del(keys.session(f.users[0].token));await f.op(1,'heartbeat');const room=await f.db.json(keys.room(f.code));assert.equal(room.owner,f.users[1].id);assert(room.denied.includes(f.users[0].id));assert((await f.db.cmd('LRANGE','z:media-jobs',0,-1)).some(raw=>JSON.parse(raw).identity===f.users[0].id));
});
test('RoomService signs removal and deletion with the grants required by LiveKit',async()=>{
 const {roomCommand}=require('../lib/livekit.cjs');const requests=[];const capture=async(url,options)=>{requests.push({url:String(url),claims:JSON.parse(Buffer.from(options.headers.Authorization.split('.')[1],'base64url')),body:JSON.parse(options.body)});return{ok:true,status:200};};
 await roomCommand(livekit,{method:'RemoveParticipant',room:'ABC234',identity:'participant',cutoff:123},capture);await roomCommand(livekit,{method:'DeleteRoom',room:'ABC234'},capture);
 assert.equal(requests[0].claims.video.roomAdmin,true);assert.equal(requests[0].claims.video.room,'ABC234');assert.equal(requests[0].body.revoke_token_ts,'123');assert.equal(requests[1].claims.video.roomCreate,true);assert.equal(requests[1].claims.video.roomJoin,undefined);assert(requests[1].url.startsWith('https:'));
});

test('capacity accepts twelve including owner; simultaneous joins cannot exceed the limit',async()=>{
 const db=new MemoryStore(),service=new RoomService(db);const owner=await service.connect('Dono');const room=await service.operate(owner.token,'create');const members=[];for(let i=0;i<12;i++)members.push(await service.connect('Pessoa '+i));await Promise.all(members.slice(0,11).map(user=>service.operate(user.token,'join',{code:room.code})));assert.equal((await db.json(keys.room(room.code))).members.length,11);await denied(service.operate(members[11].token,'join',{code:room.code}),409);
});
