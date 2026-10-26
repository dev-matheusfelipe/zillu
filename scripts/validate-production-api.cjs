'use strict';
// Explicit production opt-in. Creates only its own temporary room and closes it in finally.
const assert=require('node:assert/strict'),fs=require('node:fs');
if(!process.argv.includes('--production'))throw Error('Execute com --production para autorizar a criação de uma sala temporária na API publicada.');
const base='https://zillu-backend.vercel.app',users=[],report={api:base,version:null,checks:{}};let room=null,ended=false;
async function request(route,body={},token){const response=await fetch(base+'/api/'+route,{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify(body),signal:AbortSignal.timeout(25000)});const data=await response.json();return{status:response.status,data};}
async function ok(route,body={},index){const result=await request(route,body,index===undefined?undefined:users[index].token);assert.equal(result.status,200,route+': '+JSON.stringify(result.data));return result.data;}
async function denied(route,body,index,status=403){const result=await request(route,body,users[index].token);assert.equal(result.status,status,route+' deveria ser recusado');}
(async()=>{try{
 const health=await ok('health');assert.equal(health.apiVersion,'0.6.2');report.version=health.apiVersion;
 for(let i=0;i<13;i++)users.push(await ok('connect',{name:'Validação publicação '+(i+1)}));
 room=await ok('create',{},0);assert.equal(room.apiVersion,'0.6.2');
 for(let i=1;i<12;i++)await ok('join',{code:room.code},i);await denied('join',{code:room.code},12,409);report.checks.capacityTwelve=true;
 await denied('sfu-token',{},3);report.checks.pendingCannotReceiveToken=true;
 await ok('approve',{target:users[1].id},0);await ok('promote',{target:users[1].id},0);await ok('approve',{target:users[2].id},1);await ok('promote',{target:users[2].id},0);report.checks.adminApproval=true;
 await denied('remove',{target:users[0].id},1);await denied('remove',{target:users[2].id},1);await denied('promote',{target:users[3].id},1);await denied('end-room',{},1);report.checks.permissionsEnforced=true;
 const grant=await ok('sfu-token',{},1);const claims=JSON.parse(Buffer.from(grant.token.split('.')[1],'base64url'));assert.equal(claims.exp-claims.iat,120);assert.equal(claims.video.roomAdmin,undefined);report.checks.approvedTokenLimited=true;
 await ok('approve',{target:users[3].id},1);await ok('remove',{target:users[3].id},1);await denied('sfu-token',{},3,404);report.checks.removalBlocksNewToken=true;
 await ok('leave',{},0);const events=await ok('events',{},1);assert(events.some(event=>event.type==='room-state'&&event.participants.some(p=>p.id===users[1].id&&p.role==='owner')));report.checks.ownerExitKeepsRoom=true;
 await ok('transfer',{target:users[2].id},1);await denied('end-room',{},1);report.checks.transferEnforced=true;
 await ok('end-room',{},2);ended=true;const remaining=await ok('events',{},4);assert(remaining.some(event=>event.type==='ended'));report.checks.explicitEnd=true;
 console.log(JSON.stringify(report));
 }finally{
  if(room&&!ended)for(const index of [2,1,0]){if(users[index])try{const result=await request('end-room',{},users[index].token);if(result.status===200){ended=true;break;}}catch{}}
  report.temporaryRoomClosed=ended;fs.writeFileSync('docs/versions/zillu-production-validation.json',JSON.stringify(report,null,2));if(room&&!ended)console.error('A sala temporária não pôde ser encerrada.');
 }
})().catch(error=>{console.error(error.message);process.exit(1)});
