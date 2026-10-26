'use strict';
const {jwtToken}=require('../sfu/token.cjs');
function livekitConfig(env=process.env){return env.LIVEKIT_URL&&env.LIVEKIT_API_KEY&&env.LIVEKIT_API_SECRET?{url:env.LIVEKIT_URL,key:env.LIVEKIT_API_KEY,secret:env.LIVEKIT_API_SECRET}:null;}
async function roomCommand(config,job,fetchImpl=fetch){
 if(!config)return;
 const url=new URL(config.url);url.protocol=url.protocol==='wss:'?'https:':url.protocol==='ws:'?'http:':url.protocol;
 if(!['http:','https:'].includes(url.protocol))throw Error('URL LiveKit inválida');url.pathname='/twirp/livekit.RoomService/'+job.method;url.search='';
 const token=jwtToken({key:config.key,secret:config.secret,identity:'zillu-room-service',room:job.room,admin:true,roomCreate:job.method==='DeleteRoom',ttl:60});
 const payload=job.method==='RemoveParticipant'?{room:job.room,identity:job.identity,revoke_token_ts:String(job.cutoff)}:{room:job.room};
 const result=await fetchImpl(url,{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify(payload),signal:AbortSignal.timeout(2500)});
 if(!result.ok&&result.status!==404)throw Error('LiveKit RoomService indisponível');
}
async function flushMediaJob(db,config,command=roomCommand){
 const pending=await db.cmd('LRANGE','z:media-jobs',-32,-1);if(!pending?.length)return true;
 let complete=true;
 const apply=async raw=>{try{await command(config,JSON.parse(raw));await db.cmd('LREM','z:media-jobs',1,raw);return true;}catch(error){complete=false;console.error('[Zillu] Remoção SFU pendente; será repetida na próxima atividade.');return false;}};
 // Revoke individual identities before deleting the SFU room. Parallel I/O stays within Vercel's request budget.
 await Promise.all(pending.filter(raw=>JSON.parse(raw).method!=='DeleteRoom').map(apply));
 const remaining=await db.cmd('LRANGE','z:media-jobs',0,-1);
 await Promise.all(pending.filter(raw=>JSON.parse(raw).method==='DeleteRoom').map(async raw=>{const job=JSON.parse(raw);if(remaining.some(item=>{const other=JSON.parse(item);return other.room===job.room&&other.method==='RemoveParticipant';})){complete=false;return;}await apply(raw);}));
 return complete;
}

module.exports={livekitConfig,roomCommand,flushMediaJob};
