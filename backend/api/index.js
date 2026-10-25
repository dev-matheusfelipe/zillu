'use strict';
const {randomBytes,randomInt}=require('node:crypto');
const {RedisStore}=require('../lib/redis.cjs');
const {jwtToken}=require('../sfu/token.cjs');
const ID=()=>randomBytes(24).toString('hex');
const KEY={session:id=>'z:session:'+id,room:code=>'z:room:'+code,participant:id=>'z:participant:'+id};
const TTL=3600;
function error(message,status=400){throw Object.assign(new Error(message),{status});}
async function handler(req,res){
 res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Access-Control-Allow-Methods','POST,OPTIONS');res.setHeader('Access-Control-Allow-Headers','Content-Type,Authorization');
 const origin=req.headers.origin;const allowed=process.env.ZULLU_ALLOWED_ORIGIN;
 if(allowed&&origin&&origin!==allowed){res.statusCode=403;return res.end(JSON.stringify({error:'Origem não autorizada'}));}
 if(origin&&allowed===origin)res.setHeader('Access-Control-Allow-Origin',origin);
 if(req.method==='OPTIONS'){res.statusCode=204;return res.end()}
 if(req.method!=='POST'){res.statusCode=405;return res.end(JSON.stringify({error:'Método não permitido'}));}
 const parsed=new URL(req.url,'https://zullu.invalid');
 const route=String(req.query?.route||parsed.searchParams.get('route')||parsed.pathname.replace(/^\/api\//,'')).trim();
 try {
 const db=new RedisStore();const b=typeof req.body==='object'&&req.body!==null&&!Array.isArray(req.body)?req.body:{};
 if(route==='health')return end(res,200,{ok:true,service:'zullu-api',mediaMode:mediaMode()});
 if(route==='connect'){
  const s={id:ID(),token:ID(),name:String(b.name||'Visitante').trim().slice(0,32)||'Visitante',room:null,approved:false};
  await db.set(KEY.session(s.token),s,TTL);await db.set(KEY.participant(s.id),s.token,TTL);
  return end(res,200,{token:s.token,id:s.id,mediaMode:mediaMode(),iceServers:[{urls:'stun:stun.l.google.com:19302'}]});
 }
 const token=(req.headers.authorization||'').replace(/^Bearer /,'');
 let c=await db.json(KEY.session(token));if(!c)error('Sessão expirada. Entre novamente.',401);
 const persist=async x=>db.set(KEY.session(x.token),x,TTL);
 const getMember=async id=>{const t=await db.json(KEY.participant(id));return t?db.json(KEY.session(t)):null};
 const emit=async(x,event)=>db.enqueue(x.id,event);
 const state=async room=>{const ids=[room.owner,...room.members];const xs=(await Promise.all(ids.map(getMember))).filter(Boolean);const participants=xs.map(x=>({id:x.id,name:x.name,approved:x.approved,role:x.id===room.owner?'owner':'member',streaming:room.streamers.includes(x.id)}));await Promise.all(xs.filter(x=>x.approved).map(x=>emit(x,{type:'room-state',participants})));};
 const room=c.room?await db.json(KEY.room(c.room)):null;
 const isOwner=room&&c.id===room.owner;
 if(route==='events'){
   // Serverless-friendly: one request waits at most 8 seconds.
   const events=[];for(let i=0;i<16;i++){
     let x;while(events.length<50&&(x=await db.pop(c.id)))events.push(x);
     if(events.length)break;
     await new Promise(r=>setTimeout(r,500));
   }
   return end(res,200,events);
 }
 if(route==='create'){
   if(c.room)error('Saia da sala atual primeiro');
   const alphabet='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';let code;
   for(let i=0;i<20;i++){code=Array.from({length:6},()=>alphabet[randomInt(alphabet.length)]).join('');if(await db.cmd('SET','z:reserve:'+code,'1','NX','EX',TTL)==='OK')break;code=null;}
   if(!code)error('Não foi possível gerar o código',503);
   const next={code,owner:c.id,members:[],streamers:[]};c.room=code;c.approved=true;
   await db.set(KEY.room(code),next,TTL);await persist(c);
   return end(res,200,{code,role:'owner'});
 }
 if(route==='join'){
   if(c.room)error('Saia da sala atual primeiro');
   const code=String(b.code||'').trim().toUpperCase();const r=await db.json(KEY.room(code));if(!r)error('Sala não encontrada ou encerrada',404);
   if(r.members.length>=5)error('Sala cheia',409);
   if(!r.members.includes(c.id))r.members.push(c.id);
   c.room=code;c.approved=false;await db.set(KEY.room(code),r,TTL);await persist(c);
   const host=await getMember(r.owner);if(host)await emit(host,{type:'request',id:c.id,name:c.name});
   return end(res,200,{code,role:'member'});
 }
 if(!room)error('Você não está em nenhuma sala',404);
 if(route==='approve'||route==='remove'){
   if(!isOwner)error('Apenas o proprietário pode gerenciar participantes',403);
   const target=await getMember(String(b.target||''));if(!target||target.room!==room.code||target.id===c.id)error('Participante inválido',404);
   if(route==='approve'){target.approved=true;await persist(target);await emit(target,{type:'approved'});await state(room);}
   else {await expel(db,room,target,getMember,emit,persist);await state(room);}
   return end(res,200,{ok:true});
 }
 if(route==='leave'){
   if(isOwner){await db.del(KEY.room(room.code));await db.del('z:reserve:'+room.code);for(const id of room.members){const t=await getMember(id);if(t){t.room=null;t.approved=false;await persist(t);await emit(t,{type:'ended'});}}}
   else {room.members=room.members.filter(id=>id!==c.id);room.streamers=room.streamers.filter(id=>id!==c.id);await db.set(KEY.room(room.code),room,TTL);await state(room);}
   c.room=null;c.approved=false;await persist(c);return end(res,200,{ok:true});
 }
 if(!c.approved)error('Aprovação necessária',403);
 if(route==='sfu-token'){
   if(mediaMode()!=='sfu')error('SFU não configurado',503);
   return end(res,200,{url:process.env.LIVEKIT_URL,token:jwtToken({key:process.env.LIVEKIT_API_KEY,secret:process.env.LIVEKIT_API_SECRET,identity:c.id,name:c.name,room:room.code,ttl:600})});
 }
 if(route==='start-stream'||route==='stop-stream'){
   const active=route==='start-stream';room.streamers=room.streamers.filter(id=>id!==c.id);if(active)room.streamers.push(c.id);
   await db.set(KEY.room(room.code),room,TTL);
   for(const id of [room.owner,...room.members]){const target=await getMember(id);if(target?.approved)await emit(target,{type:active?'stream-started':'stream-ended',participantId:c.id,participantName:c.name});}
   await state(room);return end(res,200,{ok:true});
 }
 if(route==='signal'){
   const target=await getMember(String(b.target||''));if(!target||!target.approved||target.room!==room.code||target.id===c.id)error('Destino inválido',403);
   if(!b.data||!['offer','answer','candidate'].includes(b.data.type))error('Sinal inválido');
   await emit(target,{type:'signal',from:c.id,data:b.data,streamId:b.streamId||null});return end(res,200,{ok:true});
 }
 error('Rota inválida',404);
 }catch(e){return end(res,e.status||500,{error:e.status?e.message:'Erro interno'});}
}
function mediaMode(){return process.env.LIVEKIT_URL&&process.env.LIVEKIT_API_KEY&&process.env.LIVEKIT_API_SECRET?'sfu':'p2p'}
function end(res,status,result){res.statusCode=status;return res.end(JSON.stringify(result))}
async function expel(db,room,target,getMember,emit,persist){room.members=room.members.filter(id=>id!==target.id);room.streamers=room.streamers.filter(id=>id!==target.id);target.room=null;target.approved=false;await persist(target);await db.set(KEY.room(room.code),room,TTL);await emit(target,{type:'removed'});}
module.exports=handler;
