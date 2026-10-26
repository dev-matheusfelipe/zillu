'use strict';
const {randomBytes,randomInt}=require('node:crypto');
const {jwtToken}=require('../sfu/token.cjs');
const TTL=3600,MAX_PARTICIPANTS=12,ID=()=>randomBytes(24).toString('hex');
const keys={session:t=>'z:session:'+t,participant:id=>'z:participant:'+id,room:code=>'z:room:'+code,reserve:code=>'z:reserve:'+code};
const fail=(message,status=400)=>{throw Object.assign(Error(message),{status});};
const unique=xs=>[...new Set(xs.filter(Boolean))];
const roleOf=(room,id)=>room.owner===id?'owner':room.admins.includes(id)?'admin':'member';
const roomIds=room=>unique([room.owner,...room.members]);
class RoomService{
 constructor(db,{livekit=null}={}){this.db=db;this.livekit=livekit;}
 async connect(name){const session={id:ID(),token:ID(),name:String(name||'Visitante').trim().slice(0,32)||'Visitante',room:null,approved:false,lastSeen:Date.now()};await this.db.set(keys.session(session.token),session,TTL);await this.db.set(keys.participant(session.id),session.token,TTL);return {token:session.token,id:session.id,mediaMode:this.livekit?'sfu':'p2p',iceServers:[{urls:'stun:stun.l.google.com:19302'}]};}
 async operate(token,route,body={}){
  for(let attempt=0;attempt<12;attempt++){
   const expected=new Map(),writes=new Map(),events=[],jobs=[];
   const read=async key=>{if(!expected.has(key))expected.set(key,await this.db.get(key));const raw=expected.get(key);return raw?JSON.parse(raw):null;};
   const put=(key,value,ttl=TTL)=>writes.set(key,{value:JSON.stringify(value),ttl});
   const del=key=>writes.set(key,{value:null});
   const actor=await read(keys.session(token));if(!actor)fail('Sessão expirada. Entre novamente.',401);
   const code=route==='join'?String(body.code||'').trim().toUpperCase():actor.room;
   let room=code?await read(keys.room(code)):null;
   const sessions=new Map([[actor.id,actor]]);
   const member=async id=>{if(!id)return null;if(sessions.has(id))return sessions.get(id);const t=await read(keys.participant(id));const s=t?await read(keys.session(t)):null;if(s)sessions.set(id,s);return s;};
   const emit=(id,event)=>events.push({id,event});
   const save=s=>{put(keys.session(s.token),s);put(keys.participant(s.id),s.token);};
   if(room){room.admins=room.admins||[];room.denied=room.denied||[];room.members=room.members||[];room.streamers=room.streamers||[];await Promise.all(roomIds(room).map(member));}
   const detach=(target,type)=>{room.members=room.members.filter(id=>id!==target.id);room.admins=room.admins.filter(id=>id!==target.id);room.streamers=room.streamers.filter(id=>id!==target.id);room.denied=unique([...room.denied,target.id]);if(room.owner===target.id)room.owner=null;target.room=null;target.approved=false;save(target);emit(target.id,{type});jobs.push({method:'RemoveParticipant',room:room.code,identity:target.id,cutoff:Math.floor(Date.now()/1000)+1});};
   const elect=()=>{if(!room.owner){const eligible=roomIds(room).map(id=>sessions.get(id)).filter(s=>s?.approved&&s.room===room.code);const next=eligible.find(s=>room.admins.includes(s.id))||eligible[0];room.owner=next?.id||null;room.admins=room.admins.filter(id=>id!==room.owner);}};
   const finish=()=>{for(const id of roomIds(room)){const s=sessions.get(id);if(s){s.room=null;s.approved=false;save(s);emit(id,{type:'ended'});jobs.push({method:'RemoveParticipant',room:room.code,identity:id,cutoff:Math.floor(Date.now()/1000)+1});}}jobs.push({method:'DeleteRoom',room:room.code});del(keys.room(room.code));put(keys.reserve(room.code),'closed');};
   let result={ok:true};let changed=false;
   actor.lastSeen=Date.now();save(actor);
   if(route==='create'){
    if(actor.room)fail('Saia da sala atual primeiro');
    const alphabet='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';const generated=Array.from({length:6},()=>alphabet[randomInt(alphabet.length)]).join('');
    if(await read(keys.room(generated))||await read(keys.reserve(generated)))continue;
    room={code:generated,owner:actor.id,admins:[],members:[],streamers:[],denied:[],revision:0};actor.room=generated;actor.approved=true;save(actor);put(keys.reserve(generated),'active');changed=true;result={code:generated,role:'owner',apiVersion:'0.6.2'};
   }else if(route==='join'){
    if(actor.room)fail('Saia da sala atual primeiro');if(!room)fail('Sala não encontrada ou encerrada',404);
    if(room.denied.includes(actor.id))fail('Entre novamente para solicitar acesso com uma nova sessão.',403);
    if(roomIds(room).length>=MAX_PARTICIPANTS)fail('Sala cheia',409);
    room.members.push(actor.id);actor.room=room.code;actor.approved=false;save(actor);changed=true;result={code:room.code,role:'member',apiVersion:'0.6.2'};
    for(const id of roomIds(room))if(['owner','admin'].includes(roleOf(room,id)))emit(id,{type:'request',id:actor.id,name:actor.name});
   }else if(route==='heartbeat'){
    if(actor.room&&!room){actor.room=null;actor.approved=false;save(actor);emit(actor.id,{type:'ended'});}
    if(room){
     // Dead sessions are pruned by approved activity; pending clients cannot keep a room alive.
     if(actor.approved){for(const id of roomIds(room)){const s=sessions.get(id);if(!s||s.room!==room.code){room.denied=unique([...room.denied,id]);jobs.push({method:'RemoveParticipant',room:room.code,identity:id,cutoff:Math.floor(Date.now()/1000)+1});room.members=room.members.filter(x=>x!==id);room.admins=room.admins.filter(x=>x!==id);room.streamers=room.streamers.filter(x=>x!==id);if(room.owner===id)room.owner=null;changed=true;}else if(id!==actor.id&&s.lastSeen&&Date.now()-s.lastSeen>90000){detach(s,'removed');changed=true;}}elect();}
     if(!room.owner&&actor.approved){finish();room=null;}
    }
   }else{
    if(!room||!roomIds(room).includes(actor.id))fail('Você não está em nenhuma sala',404);
    const role=roleOf(room,actor.id),manager=actor.approved&&['owner','admin'].includes(role);
    if(['approve','remove','promote','demote','transfer'].includes(route)){
     if(!manager)fail('Você não tem permissão para gerenciar a sala.',403);
     const target=await member(String(body.target||''));if(!target||target.room!==room.code||target.id===actor.id||!roomIds(room).includes(target.id))fail('Participante inválido',404);
     const targetRole=roleOf(room,target.id);
     if(['promote','demote','transfer'].includes(route)&&role!=='owner')fail('Apenas o proprietário pode alterar cargos.',403);
     if(role==='admin'&&targetRole!=='member')fail('Administradores só podem gerenciar participantes comuns.',403);
     if(route==='approve'){target.approved=true;save(target);emit(target.id,{type:'approved'});}
     if(route==='remove')detach(target,'removed');
     if(['promote','demote','transfer'].includes(route)){
      if(!target.approved)fail('O participante ainda não foi aprovado.',409);
      if(route==='promote')room.admins=unique([...room.admins,target.id]);
      if(route==='demote')room.admins=room.admins.filter(id=>id!==target.id);
      if(route==='transfer'){room.members=unique([actor.id,...room.members.filter(id=>id!==target.id)]);room.owner=target.id;room.admins=room.admins.filter(id=>id!==target.id&&id!==actor.id);}
     }
     changed=true;
    }else if(route==='leave'){
     detach(actor,'left');elect();changed=true;if(!room.owner){finish();room=null;}
    }else if(route==='end-room'){
     if(role!=='owner'||!actor.approved)fail('Apenas o proprietário pode encerrar a sala.',403);finish();room=null;
    }else{
     if(!actor.approved)fail('Aprovação necessária',403);
     if(route==='sfu-token'){
      if(!this.livekit)fail('SFU não configurado',503);
      // Mint before CAS: a concurrent removal either rejects this snapshot or revokes this nbf.
      result={url:this.livekit.url,token:jwtToken({key:this.livekit.key,secret:this.livekit.secret,identity:actor.id,name:actor.name,room:room.code,ttl:120})};
     }else if(['start-stream','stop-stream'].includes(route)){
      room.streamers=room.streamers.filter(id=>id!==actor.id);if(route==='start-stream')room.streamers.push(actor.id);
      for(const id of roomIds(room))if(sessions.get(id)?.approved)emit(id,{type:route==='start-stream'?'stream-started':'stream-ended',participantId:actor.id,participantName:actor.name});changed=true;
     }else if(route==='signal'){
      const target=await member(String(body.target||''));if(!target?.approved||target.room!==room.code||!roomIds(room).includes(target.id)||target.id===actor.id)fail('Destino inválido',403);
      if(!['offer','answer','candidate'].includes(body.data?.type))fail('Sinal inválido');emit(target.id,{type:'signal',from:actor.id,data:body.data});
     }else fail('Rota inválida',404);
    }
   }
   if(room){
    if(changed)room.revision=(room.revision||0)+1;
    // Join requests preserve the existing deadline. Only approved activity renews the room.
    put(keys.room(room.code),room,actor.approved?TTL:0);
    if(actor.approved)put(keys.reserve(room.code),'active');
    if(changed||route==='create'){
     const participants=roomIds(room).map(id=>sessions.get(id)).filter(s=>s&&s.room===room.code).map(s=>({id:s.id,name:s.name,approved:s.approved,role:roleOf(room,s.id),streaming:room.streamers.includes(s.id)}));
     for(const p of participants)if(p.approved)emit(p.id,{type:'room-state',participants,revision:room.revision,apiVersion:'0.6.2'});
    }
   }
   if(await this.db.commit({expected:[...expected],writes:[...writes],events,jobs})){return result;}
  }
  fail('A sala está ocupada. Tente novamente.',409);
 }
}
module.exports={RoomService,keys,TTL,roleOf,MAX_PARTICIPANTS};
