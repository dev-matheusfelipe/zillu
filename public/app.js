'use strict';
const $ = id => document.getElementById(id);
let token = null, base = '', role = null, roomCode = '', myStream = null, iceServers = [], generation = 0, paused = false, pollingController;
const peers = new Map(); // key: remoteParticipantId, value: RTCPeerConnection
const remoteStreams = new Map(); // key: remoteParticipantId, value: MediaStream
const requests = new Map();
const remotePaused=new Set();
const participantNames = new Map();
let statsTimer = null, audioEnabled = false, soundEnabled = true, layoutMode = 'grid', focusedStreamId = null;
const profiles = {
  low: { width: 1280, height: 720, fps: 15, bitrate: 1500000, label: 'Econ\u00f4mica \u00b7 720p / 15 FPS' },
  balanced: { width: 1280, height: 720, fps: 30, bitrate: 2500000, label: 'Equilibrada \u00b7 720p / 30 FPS' },
  high: { width: 1920, height: 1080, fps: 30, bitrate: 4000000, label: 'Alta qualidade \u00b7 1080p / 30 FPS' },
  custom: { width: 1280, height: 720, fps: 30, bitrate: 2500000, label: 'Personalizado' }
};
let profile = profiles.low;
// LiveKit SFU: mídia encaminhada pelo servidor, autorização continua no backend Zillu.
let mediaMode='p2p',livekitRoom=null,localPublication=null,sfuConnecting=null;
async function connectSFU(){
 if(mediaMode!=='sfu'||livekitRoom)return;
 if(sfuConnecting)return sfuConnecting;
 sfuConnecting=(async()=>{
  if(!window.LivekitClient)throw Error('Cliente LiveKit indisponível. Execute npm install e npm run build:web.');
  const conf=await api('sfu-token');
  const room=new window.LivekitClient.Room({adaptiveStream:true,dynacast:true,stopLocalTrackOnUnpublish:false});
  room.on(window.LivekitClient.RoomEvent.TrackSubscribed,(track,pub,participant)=>{
   if(track.kind!=='video')return;
   remoteStreams.set(participant.identity,new MediaStream([track.mediaStreamTrack]));
   $('diag-msg').textContent='Vídeo remoto recebido do LiveKit: '+participant.identity.slice(0,8);
   console.info('[Zillu] Vídeo remoto inscrito', {participant:participant.identity,trackSid:pub.trackSid});
   renderStreams();
  });
  room.on(window.LivekitClient.RoomEvent.TrackMuted,(pub,participant)=>{if(pub.kind==='video'){remotePaused.add(participant.identity);renderStreams();}});
  room.on(window.LivekitClient.RoomEvent.TrackUnmuted,(pub,participant)=>{if(pub.kind==='video'){remotePaused.delete(participant.identity);renderStreams();}});
  room.on(window.LivekitClient.RoomEvent.TrackUnsubscribed,(track,pub,participant)=>{
   remoteStreams.delete(participant.identity);renderStreams();
  });
  room.on(window.LivekitClient.RoomEvent.ParticipantDisconnected,participant=>{
   remoteStreams.delete(participant.identity);renderStreams();
  });
  room.on(window.LivekitClient.RoomEvent.Disconnected,()=>{
   if(livekitRoom===room){livekitRoom=null;localPublication=null;remoteStreams.clear();renderStreams();status('Conexão interrompida');}
  });
  room.on(window.LivekitClient.RoomEvent.Reconnecting,()=>status('Reconectando…'));
 room.on(window.LivekitClient.RoomEvent.Reconnected,()=>status('Conectado'));
 await room.connect(conf.url,conf.token,{autoSubscribe:true});
  $('diag-msg').textContent='Conectado ao LiveKit. Nenhuma tela publicada ainda.';
  livekitRoom=room;
  status('Conectado');
 })();
 try{await sfuConnecting;}finally{sfuConnecting=null;}
}
async function publishSFU(stream){
 await connectSFU();
 const track=stream.getVideoTracks()[0];
 if(!track)throw Error('Nenhuma faixa de vídeo disponível');
 if(localPublication){await livekitRoom.localParticipant.unpublishTrack(localPublication.track);localPublication=null;}
 const localTrack=new window.LivekitClient.LocalVideoTrack(track,undefined,false);
 localTrack.contentHint='detail';
 try {
  localPublication=await livekitRoom.localParticipant.publishTrack(localTrack,{source:window.LivekitClient.Track.Source.ScreenShare,simulcast:false,videoEncoding:{maxBitrate:profile.bitrate,maxFramerate:profile.fps}});
  console.info('[Zillu] Tela publicada no LiveKit', {sid:localPublication.trackSid,source:localPublication.source});
  $('diag-msg').textContent='Tela publicada no LiveKit (SFU). Aguarde um participante para validar o recebimento.';
 } catch(error) {
  console.error('[Zillu] Falha ao publicar a tela no LiveKit',error);
  throw error;
 }
}
async function unpublishSFU(){
 if(livekitRoom&&localPublication){try{await livekitRoom.localParticipant.unpublishTrack(localPublication.track);}catch{}localPublication=null;}
}

// Áudio de notificação compatível com CSP (media-src 'self' blob:)
// Gera um beep curto via Web Audio API para evitar data: URIs bloqueados
let audioCtx = null;
function playNotifSound() {
  if (!soundEnabled) return;
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, audioCtx.currentTime);
    gain.gain.setValueAtTime(0.1, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.3);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.3);
  } catch (e) { console.warn('Audio notif failed:', e); }
}
function toast(m) { $('toast').textContent = m; $('toast').hidden = false; clearTimeout(toast.timer); toast.timer = setTimeout(() => $('toast').hidden = true, 7000); }
function status(m) { $('connection').textContent = m; }
async function api(r, d = {}, s) { const res = await fetch(base + '/api/' + r, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: JSON.stringify(d), signal: s }); const j = await res.json(); if (!res.ok) throw Error(j.error || 'Falha'); return j; }
async function connect() {
 const n = $('name').value.trim();
 if (!n) throw Error('Nome obrigatório');
 // Persiste nome e qualidade localmente (funciona em web e desktop)
 localStorage.setItem('zullu-name', n);
 if (window.zulluDesktop?.setConfig) {
  try { await window.zulluDesktop.setConfig({ lastName: n, lastQuality: $('quality').value, lastFps: profile.fps }); } catch {}
 }
 // Electron usa o gateway local fixo, que encaminha /api para a Vercel.
 base = location.origin;
 const r = await api('connect', { name: n });
 token = r.token;
 iceServers = r.iceServers;
 myId=r.id;
 mediaMode=r.mediaMode||'p2p';
}

async function chooseSource(replace = false) {
 if (!window.zulluDesktop) throw Error('Captura disponível apenas no app desktop.');
 const sources = await window.zulluDesktop.sources();
 let selected=null, tab='window';
 $('confirm-source').disabled=true;
 $('source-quality').textContent=profile.label;
 $('confirm-source').textContent=replace?'Trocar fonte':'Compartilhar';
 const render=()=>{
  $('source-list').replaceChildren();
  for(const source of sources.filter(item=>item.id.startsWith(tab+':'))){
   const btn=document.createElement('button');btn.className='source-option';
   btn.classList.toggle('selected',selected===source.id);btn.setAttribute('aria-pressed',String(selected===source.id));
   const img=document.createElement('img');img.src=source.thumbnail;img.alt='Prévia de '+source.name;
   const caption=document.createElement('span');caption.textContent=source.name;btn.append(img,caption);
   btn.onclick=()=>{selected=source.id;$('confirm-source').disabled=false;render();};
   $('source-list').append(btn);
  }
  if(!$('source-list').children.length){const text=document.createElement('p');text.textContent='Nenhuma fonte disponível nesta aba.';$('source-list').append(text);}
 };
 for(const [id,type] of [['source-windows','window'],['source-monitors','screen']]) $(id).onclick=()=>{
  tab=type;selected=null;$('confirm-source').disabled=true;
  for(const [other,t] of [['source-windows','window'],['source-monitors','screen']]){$(other).classList.toggle('selected',t===tab);$(other).setAttribute('aria-pressed',String(t===tab));}render();
 };
 $('source-windows').click();
 $('confirm-source').onclick=async()=>{
  if(!selected)return;$('confirm-source').disabled=true;
  try{await window.zulluDesktop.selectSource(selected);$('sources').close();await startStreaming(replace);toast(replace?'Fonte alterada.':'Transmissão iniciada.');}
  catch(error){toast('Não foi possível compartilhar a tela. Tente selecionar a fonte novamente.');console.error(error);renderStreams();}
  finally{$('confirm-source').disabled=!selected;}
 };
 $('sources').showModal();
}

async function startStreaming(replace = false) {
 if (replace && myStream && mediaMode==='sfu') await unpublishSFU();
 if (replace && myStream) {
  // Troca de fonte: para tracks antigas e recaptura
  myStream.getTracks().forEach(t => t.stop());
  myStream = null;
 }
 if (!myStream) {
  // No Electron, getDisplayMedia via setDisplayMediaRequestHandler ignora constraints complexas;
  // usamos constraints mínimas válidas e aplicamos qualidade via sender.setParameters depois.
  const isDesktop = !!window.zulluDesktop;
  // In Electron, audio must be false — system audio capture requires loopback device
  // support and requesting it triggers "Invalid capture constraints" on most systems.
  // The setDisplayMediaRequestHandler also forces audio:false for safety.
  const constraints = isDesktop
    ? { video: true, audio: false }
    : { video: { width: { ideal: profile.width }, height: { ideal: profile.height }, frameRate: { ideal: profile.fps } }, audio: audioEnabled };
  try {
   myStream = await navigator.mediaDevices.getDisplayMedia(constraints);
  } catch (err) {
   console.error('[Zillu] getDisplayMedia falhou:', err);
   throw Error(err.name + ': ' + err.message);
  }
  myStream.getVideoTracks()[0].addEventListener('ended', () => stopMyStream());
 }
 try{await myStream.getVideoTracks()[0].applyConstraints({width:{ideal:profile.width},height:{ideal:profile.height},frameRate:{ideal:profile.fps}});}catch(error){console.warn('Qualidade não suportada pela fonte',error);}
 // Aplica parâmetros de qualidade se suportado
 if(mediaMode==='sfu') {
  try { await publishSFU(myStream); } catch(error) {
   myStream?.getTracks().forEach(track=>track.stop());
   myStream=null;
   throw error;
  }
 }
 const sender = mediaMode==='sfu' ? null : getLocalSender();
 if (sender) {
  try {
   const params = sender.getParameters();
   if (!params.encodings) params.encodings = [{}];
   params.encodings[0].maxBitrate = profile.bitrate;
   params.encodings[0].maxFramerate = profile.fps;
   await sender.setParameters(params);
  } catch {}
 }
 // Notifica servidor que estou transmitindo
 if (!replace) {
  await api('start-stream');
 }
 $('share-screen').hidden = true;
 $('stop-stream').hidden = false;
 $('pause').hidden = false;
 $('swap-screen').hidden = false;
 paused=false;status('Transmitindo');
 renderStreams();
}

async function stopMyStream() {
 await unpublishSFU();
 if (myStream) { myStream.getTracks().forEach(t => t.stop()); myStream = null; }
 try { await api('stop-stream'); } catch {}
 $('share-screen').hidden = false;
 $('diag-msg').textContent='Transmissão encerrada.';toast('Compartilhamento encerrado.');
 $('stop-stream').hidden = true;
 $('pause').hidden = true;
 $('swap-screen').hidden = true;
 $('pause').textContent = 'Pausar';
 paused = false;
 status('Parado');
 renderStreams();
}

function getLocalSender() {
 // Retorna o RTCRtpSender da minha própria conexão (se existir)
 // Em modelo multiponto, cada peer é identificado pelo remoteParticipantId
 // Para enviar, precisamos de uma conexão onde somos offerer ou answerer
 // Simplificação: busca qualquer peer ativo onde temos track local
 for (const [, pc] of peers) {
  const senders = pc.getSenders();
  if (senders.length > 0) return senders[0];
 }
 return null;
}

async function createPeer(remoteId, isOfferer) {
 if (peers.has(remoteId)) return peers.get(remoteId);
 const pc = new RTCPeerConnection({ iceServers });
 peers.set(remoteId, pc);
 pc.onicecandidate = e => { if (e.candidate) api('signal', { target: remoteId, data: e.candidate }).catch(() => {}); };
 pc.ontrack = e => {
  const stream = e.streams[0] || new MediaStream([e.track]);
  remoteStreams.set(remoteId, stream);
  renderStreams();
 };
 pc.onconnectionstatechange = () => {
  if (pc.connectionState === 'failed') { pc.restartIce(); }
  if (pc.connectionState === 'disconnected' || pc.connectionState === 'closed') {
   remoteStreams.delete(remoteId);
   renderStreams();
  }
 };
 // Adiciona track local se estiver transmitindo
 if (myStream) {
  myStream.getTracks().forEach(t => pc.addTrack(t, myStream));
 }
 if (isOfferer) {
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  await api('signal', { target: remoteId, data: offer });
 }
 return pc;
}

async function handleSignal(from, data) {
 let pc = peers.get(from);
 if (data.type === 'offer') {
  if (!pc) pc = await createPeer(from, false);
  await pc.setRemoteDescription(new RTCSessionDescription(data));
  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);
  await api('signal', { target: from, data: answer });
 } else if (data.type === 'answer') {
  if (pc) await pc.setRemoteDescription(new RTCSessionDescription(data));
 } else if (data.type === 'candidate') {
  if (pc) await pc.addIceCandidate(new RTCIceCandidate(data)).catch(() => {});
 }
}

// Renderiza também a captura local: o LiveKit não reenvia a própria track ao publicador.
function renderStreams() {
 const grid=$('streams-grid');
 const strip=$('focus-strip');
 grid.replaceChildren();
 strip.replaceChildren();
 const streams=new Map();
 if(myStream?.getVideoTracks().some(track=>track.readyState==='live')) streams.set('__local__',myStream);
 for(const [pid,stream] of remoteStreams) streams.set(pid,stream);
 if(focusedStreamId && !streams.has(focusedStreamId)) focusedStreamId=null;
 if(!focusedStreamId && streams.size) focusedStreamId=streams.keys().next().value;
 grid.dataset.count=streams.size;
 $('empty-stage').hidden=streams.size>0;
 const focusVideo=$('focus-video');
 if(layoutMode==='focus' && focusedStreamId && streams.has(focusedStreamId)) {
  focusVideo.srcObject=streams.get(focusedStreamId);
  focusVideo.muted=focusedStreamId==='__local__';
  focusVideo.play().catch(()=>{});
  $('focus-name').textContent=focusedStreamId==='__local__'?'Você · Prévia local':(participantNames.get(focusedStreamId)||'Participante');
  $('focus-stats').textContent=(focusedStreamId==='__local__'?paused:remotePaused.has(focusedStreamId))?'Pausada':'Compartilhando';
 } else {
  focusVideo.pause();
  focusVideo.srcObject=null;
 }
 for(const [pid,stream] of streams){
  if(layoutMode==='focus' && pid===focusedStreamId)continue;
  const card=document.createElement('div');
  card.className='stream-card'+(pid==='__local__'?' stream-card-local':'');
  card.classList.toggle('is-paused',pid==='__local__'?paused:remotePaused.has(pid));card.tabIndex=0;card.setAttribute('role','button');card.setAttribute('aria-label','Focar '+(pid==='__local__'?'sua tela':participantNames.get(pid)||'participante'));
  const video=document.createElement('video');
  video.autoplay=true;
  video.playsInline=true;
  video.muted=pid==='__local__';
  video.srcObject=stream;
  // Reaplicar play após a inserção na página, inclusive quando o layout mudar.
  video.addEventListener('loadedmetadata',()=>video.play().catch(()=>{}),{once:true});
  const overlay=document.createElement('div');
  overlay.className='stream-overlay';
  const label=document.createElement('span');
  label.textContent=pid==='__local__'?'Você · Prévia local':(participantNames.get(pid)||'Participante');
  overlay.append(label);
  card.append(video,overlay);
  card.onclick=()=>{focusedStreamId=pid;layoutMode='focus';renderStreams();};
  card.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();card.click();}};
  (layoutMode==='grid'?grid:strip).append(card);
  video.play().catch(()=>{});
 }
 updateLayout();
}
function updateLayout() {
 setControl('toggle-layout',layoutMode==='grid'?'focus':'grid',layoutMode==='grid'?'Modo Foco':'Modo Grade');
 $('toggle-layout').setAttribute('aria-pressed',String(layoutMode==='focus'));
 $('share-screen').hidden=!!myStream;
 for(const id of ['pause','swap-screen','stop-stream'])$(id).hidden=!myStream;
 setControl('pause',paused?'play':'pause',paused?'Retomar transmissão':'Pausar transmissão');
 $('pause').setAttribute('aria-pressed',String(paused));
if (layoutMode === 'grid') {
$('streams-grid').hidden = false;
$('focus-container').hidden = true;
} else {
$('streams-grid').hidden = true;
$('focus-container').hidden = false;
}
}
function updateParticipants(participants) {
for(const p of participants)participantNames.set(p.id,p.name);
for(const id of requests.keys())if(!participants.some(p=>p.id===id&&!p.approved))requests.delete(id);
updateRequestsUI(false);
renderStreams();
$('count').textContent = participants.length + ' / 6';
$('empty-participants').hidden = !!participants.length;
const list = $('participants-list');
list.replaceChildren();
for (const p of participants.filter(p=>p.approved)) {
const div = document.createElement('div');
div.className = 'participant-item'+(p.streaming?' streaming':'');
const avatar=document.createElement('span');avatar.className='avatar';avatar.textContent=p.name.trim().split(/\s+/).map(n=>n[0]).slice(0,2).join('').toUpperCase();
const info=document.createElement('div');info.className='participant-info';
const name = document.createElement('strong');
name.textContent = p.name + (p.id === myId ? ' (Você)' : '');
const statusSpan = document.createElement('small');
statusSpan.textContent=(p.role==='owner'?'Proprietário · ':'')+(p.streaming?'Transmitindo':'Assistindo');
info.append(name,statusSpan);div.append(avatar,info);
if (role === 'owner' && p.id !== myId) {
const actions = document.createElement('div');
actions.className = 'p-actions';
if (!p.approved) {
const btnApp = document.createElement('button');
btnApp.className = 'primary small'; btnApp.textContent = 'Aprovar';
btnApp.onclick = () => api('approve', { target: p.id }).catch(e => toast(e.message));
actions.append(btnApp);
}
const btnRem = document.createElement('button');
btnRem.className = 'danger small'; btnRem.textContent = 'Remover';
btnRem.onclick = () => api('remove', { target: p.id }).catch(e => toast(e.message));
actions.append(btnRem);
div.append(actions);
}
list.append(div);
}
}

async function handle(e) {
if (e.type === 'room-state') {
 updateParticipants(e.participants);
 const active=new Set(e.participants.filter(p=>p.streaming).map(p=>p.id));
 if(mediaMode==='sfu')for(const id of remoteStreams.keys())if(!active.has(id)){remoteStreams.delete(id);renderStreams();}
}
if (e.type === 'request') { requests.set(e.id, { id: e.id, name: e.name }); updateRequestsUI(); }
if (e.type === 'approved') { $('room-title').textContent = 'Sala de telas';$('empty-stage-message').textContent='Compartilhe uma tela para começar.'; status('Aprovado. Você pode transmitir.'); toast('Entrada autorizada!'); $('share-screen').disabled = false; if(mediaMode==='sfu')connectSFU().catch(er=>toast('Não foi possível conectar as telas. Tente entrar novamente.')); }
if (e.type === 'signal' && mediaMode==='p2p') await handleSignal(e.from, e.data);
if (e.type === 'stream-started') { toast(e.participantName + ' começou a transmitir'); }
if (e.type === 'stream-ended' && mediaMode==='sfu') { remoteStreams.delete(e.participantId); renderStreams(); }
if (e.type === 'stream-ended' && mediaMode==='p2p') { remoteStreams.delete(e.participantId); peers.get(e.participantId)?.close(); peers.delete(e.participantId); renderStreams(); }
if (e.type === 'participant-left') { requests.delete(e.participantId);updateRequestsUI(false); remoteStreams.delete(e.participantId); peers.get(e.participantId)?.close(); peers.delete(e.participantId); renderStreams(); }
if (e.type === 'ended' || e.type === 'removed') { cleanup(); toast(e.type === 'ended' ? 'Sala encerrada pelo proprietário.' : 'Você foi removido da sala.'); }
}
async function poll(cur) {
let fail = 0;
while (cur === generation && token) {
try {
pollingController = new AbortController();
const ev = await api('events', {}, pollingController.signal);
if(fail)status(myStream?'Transmitindo':'Conectado');
fail = 0;
for (const e of ev) { if (cur !== generation) return; try { await handle(e); } catch (er) { console.error('Falha ao processar evento',er); } }
} catch (er) {
if (cur !== generation) return;
status('Reconectando servidor…');
if (++fail >= 10) { cleanup(); toast('Servidor perdido.'); return; }
await new Promise(r => setTimeout(r, Math.min(1000 * Math.pow(2, fail), 30000)));
}
}
}
function updateRequestsUI(notify = true) {
const l = [...requests.values()];
$('req-count').textContent = l.length;
$('requests-panel').hidden = !l.length;
$('requests-list').replaceChildren();
for (const r of l) {
const d = document.createElement('div'); d.className = 'req-item';
const b = document.createElement('b'); b.textContent = r.name;
const a = document.createElement('div');
const al = document.createElement('button'); al.className = 'primary small'; al.textContent = 'Permitir';
al.onclick = () => api('approve', { target: r.id }).then(() => requests.delete(r.id)).then(()=>updateRequestsUI(false)).catch(e => toast(e.message));
const dn = document.createElement('button'); dn.className = 'danger small'; dn.textContent = 'Recusar';
dn.onclick = () => api('remove', { target: r.id }).then(() => requests.delete(r.id)).then(()=>updateRequestsUI(false)).catch(e => toast(e.message));
a.append(al, dn); d.append(b, a); $('requests-list').append(d);
}
if (l.length && notify) {
 const f=l[l.length-1];toast(f.name+' pediu para entrar. Veja os participantes.');playNotifSound();
 window.zulluDesktop?.notifyRequest(f.name).catch(()=>{});
}

}
function cleanup() {
generation++;
if (pollingController) pollingController.abort();
if(livekitRoom){livekitRoom.disconnect();livekitRoom=null;localPublication=null;}
for (const [, pc] of peers) pc.close();
peers.clear(); remoteStreams.clear(); requests.clear();remotePaused.clear();
if (myStream) { myStream.getTracks().forEach(t => t.stop()); myStream = null; }
token = null; role = null; roomCode = '';
$('lobby').hidden = false; $('room').hidden = true;
status('Desconectado');
focusedStreamId=null; paused=false;participantNames.clear();updateParticipants([]);updateRequestsUI(false);renderStreams();
}

for (const t of ['host', 'view']) $('tab-' + t).onclick = () => {
$('host-form').hidden = t !== 'host'; $('view-form').hidden = t !== 'view';
$('tab-host').classList.toggle('selected', t === 'host'); $('tab-view').classList.toggle('selected', t === 'view');
$('tab-host').setAttribute('aria-pressed',String(t==='host'));$('tab-view').setAttribute('aria-pressed',String(t==='view'));
};
function changeQuality(){
 const custom=$('quality').value==='custom';$('custom-quality').hidden=!custom;
 if(custom){const height=Number($('custom-resolution').value);profiles.custom={width:height===1080?1920:1280,height,fps:Number($('custom-fps').value),bitrate:height===1080?4000000:2500000,label:height+'p / '+$('custom-fps').value+' FPS'};}
 profile=profiles[$('quality').value]||profiles.low;
 window.zulluDesktop?.setConfig({lastQuality:$('quality').value,lastFps:profile.fps}).catch(()=>{});
}
$('quality').onchange=changeQuality;$('custom-resolution').onchange=changeQuality;$('custom-fps').onchange=changeQuality;
let myId = null;
async function startHost() {
await connect();
const res = await api('create');
roomCode = res.code; role = 'owner'; myId = res.myId || myId;
$('lobby').hidden = true; $('room').hidden = false;renderStreams();
$('copy').textContent = roomCode;
$('share-screen').disabled=false;
$('room-title').textContent = 'Sala de telas';
status('Sala ativa');
if(mediaMode==='sfu')await connectSFU();
poll(generation);
}
async function joinRoom() {
await connect();
const code = $('code').value.trim().toUpperCase();
if (!/^[A-Z2-9]{6}$/.test(code)) throw Error('Código inválido');
const res = await api('join', { code });
roomCode = res.code; role = 'member'; myId = res.myId || myId;
$('lobby').hidden = true; $('room').hidden = false;renderStreams();
$('copy').textContent = roomCode;
$('empty-stage-message').textContent='Aguardando o proprietário aprovar sua entrada.';
$('room-title').textContent = 'Aguardando aprovação…';
$('share-screen').disabled = true;
status('Aguardando aprovação');
poll(generation);
}
$('create').onclick = async () => { $('create').disabled = true; try { await startHost(); } catch (e) { toast(e.message); cleanup(); } finally { $('create').disabled = false; } };
$('join').onclick = async () => { $('join').disabled = true; try { await joinRoom(); } catch (e) { toast(e.message); cleanup(); } finally { $('join').disabled = false; } };
$('leave').onclick = async () => { try { await api('leave'); } catch {} cleanup(); };
$('share-screen').onclick = () => chooseSource().catch(e => toast(e.message));
$('stop-stream').onclick = () => stopMyStream();
$('swap-screen').onclick = () => chooseSource(true).catch(e => toast(e.message));
$('pause').onclick=async()=>{
 if(!myStream)return;$('pause').disabled=true;
 try{const next=!paused;if(localPublication?.track)await(next?localPublication.track.mute():localPublication.track.unmute());myStream.getVideoTracks().forEach(track=>track.enabled=!next);paused=next;status(paused?'Transmissão pausada':'Transmitindo');renderStreams();}
 catch(error){toast('Não foi possível alterar a pausa.');console.error(error);}finally{$('pause').disabled=false;}
};
$('toggle-layout').onclick = () => { layoutMode = layoutMode === 'grid' ? 'focus' : 'grid'; $('toggle-layout').textContent = layoutMode === 'grid' ? 'Modo Foco' : 'Modo Grade'; renderStreams(); };
let fullscreenActive=false;
function syncFullscreen(active){fullscreenActive=active;$('fullscreen').setAttribute('aria-pressed',String(active));setControl('fullscreen',active?'minimize':'maximize',active?'Sair da tela cheia':'Entrar em tela cheia');}
$('fullscreen').onclick=async()=>{try{if(window.zulluDesktop?.setFullscreen)syncFullscreen(await window.zulluDesktop.setFullscreen(!fullscreenActive));else{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();}}catch{toast('Não foi possível alternar a tela cheia.');}};
document.addEventListener('fullscreenchange',()=>syncFullscreen(!!document.fullscreenElement));
window.zulluDesktop?.onFullscreenChanged(syncFullscreen);
window.zulluDesktop?.getFullscreen().then(syncFullscreen).catch(()=>{});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&fullscreenActive&&window.zulluDesktop?.setFullscreen)window.zulluDesktop.setFullscreen(false).then(syncFullscreen).catch(()=>{});});

async function safeCopy(text) {
if (window.zulluDesktop?.clipboardWrite) {
try { await window.zulluDesktop.clipboardWrite(text); return true; } catch (e) { console.error('[Zillu] Clipboard IPC falhou:', e); throw e; }
}
if (navigator.clipboard?.writeText) {
try { await navigator.clipboard.writeText(text); return true; } catch (e) { console.warn('[Zillu] Clipboard web falhou:', e); }
}
return false;
}
$('copy').onclick = async () => {
try {
const ok = await safeCopy(roomCode);
toast(ok ? 'Código copiado: ' + roomCode : 'Não foi possível copiar. Código: ' + roomCode);
} catch (e) { toast('Erro ao copiar: ' + e.message); }
};
$('copy-link').onclick = async () => {
// Convite por código: não usar URL localhost, inacessível no PC do amigo.
const l = roomCode;
try {
const ok = await safeCopy(l);
toast(ok ? 'Código de convite copiado!' : 'Não foi possível copiar o código: ' + l);
} catch (e) { toast('Erro ao copiar link: ' + e.message); }
};
$('cancel-source').onclick = () => $('sources').close();
$('diag-toggle').onclick=()=>{$('diag-detail').hidden=!$('diag-detail').hidden;$('diag-detail').textContent=JSON.stringify({mediaMode,connection:livekitRoom?.state||'desconectado',screens:remoteStreams.size,local:!!myStream,profile:profile.label},null,2);};
$('sharing-settings').onclick=()=>$('settings').showModal();
$('close-settings').onclick=()=>$('settings').close();
$('open-diagnostics').onclick=()=>$('diagnostics').showModal();
$('close-diagnostics').onclick=()=>$('diagnostics').close();
$('toggle-participants').onclick=()=>{const hidden=document.querySelector('.room-layout').classList.toggle('panel-hidden');$('toggle-participants').setAttribute('aria-expanded',String(!hidden));};

$('name').value = localStorage.getItem('zullu-name') || '';
const params = new URLSearchParams(location.search);
if (params.has('room')) {
const c = params.get('room').toUpperCase();
if (/^[A-Z2-9]{6}$/.test(c)) { $('code').value = c; $('tab-view').click(); toast('Convite preenchido.'); }
else toast('Convite inválido.');
history.replaceState(null, '', location.pathname);
}
window.addEventListener('pagehide', () => { if (token) fetch(base + '/api/leave', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, body: '{}', keepalive: true }).catch(() => {}); myStream?.getTracks().forEach(t => t.stop()); });

// Inicialização: carrega preferências persistidas (Electron ou localStorage)
(async () => {
 try {
  if (window.zulluDesktop?.getConfig) {
   const cfg = await window.zulluDesktop.getConfig();
   if (cfg.lastName) $('name').value = cfg.lastName;
   if (cfg.lastQuality && profiles[cfg.lastQuality]) {
    $('quality').value = cfg.lastQuality;
    profile = profiles[cfg.lastQuality];
    if(cfg.lastQuality==='custom'&&[15,30,60].includes(Number(cfg.lastFps))){$('custom-fps').value=String(cfg.lastFps);profiles.custom.fps=Number(cfg.lastFps);$('custom-quality').hidden=false;}
   }
  } else {
   // Fallback web: usa localStorage
   const n = localStorage.getItem('zullu-name');
   if (n) $('name').value = n;
  }
 } catch (e) { console.warn('Falha ao carregar config:', e); }
})();

const icons={screen:'M3 4h18v12H3z M8 21h8 M12 16v5',settings:'M4 7h16 M4 17h16 M8 4v6 M16 14v6',swap:'M4 7h15l-3-3 M20 17H5l3 3',pause:'M8 5v14 M16 5v14',play:'m8 5 11 7-11 7z',stop:'M6 6h12v12H6z',focus:'M3 4h18v12H3z M15 19h6v3h-6z',grid:'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z',maximize:'M8 3H3v5 M16 3h5v5 M3 16v5h5 M21 16v5h-5',minimize:'M3 8h5V3 M21 8h-5V3 M3 16h5v5 M21 16h-5v5',leave:'M9 4H4v16h5 M10 12h11 m-5-5 5 5-5 5',users:'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0 M17 4a4 4 0 0 1 0 8 M22 21v-2a4 4 0 0 0-3-4',activity:'m2 12 5 0 3-8 4 16 3-8h5'};
function setControl(id,icon,label){
 const button=$(id);button.replaceChildren();button.title=label;button.setAttribute('aria-label',label);
 const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('class','icon');svg.setAttribute('aria-hidden','true');
 const path=document.createElementNS('http://www.w3.org/2000/svg','path');path.setAttribute('d',icons[icon]);svg.append(path);button.append(svg);
 if(id==='share-screen'){const text=document.createElement('span');text.textContent=label;button.append(text);}
}
for(const [id,icon,label] of [['share-screen','screen','Compartilhar tela'],['sharing-settings','settings','Qualidade e FPS'],['swap-screen','swap','Trocar fonte de captura'],['pause','pause','Pausar transmissão'],['stop-stream','stop','Encerrar transmissão'],['toggle-layout','focus','Modo Foco'],['fullscreen','maximize','Entrar em tela cheia'],['leave','leave','Sair da sala'],['toggle-participants','users','Mostrar ou ocultar participantes'],['open-diagnostics','activity','Diagnóstico de conexão']])setControl(id,icon,label);
