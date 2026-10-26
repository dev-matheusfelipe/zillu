'use strict';
const $ = id => document.getElementById(id);
let token = null, base = '', role = null, roomCode = '', myStream = null, iceServers = [], generation = 0, paused = false, pollingController;
const peers = new Map(); // key: remoteParticipantId, value: RTCPeerConnection
const remoteStreams = new Map(); // key: remoteParticipantId, value: MediaStream
const requests = new Map();
let diagnosticMessage='';
let localAudioPublication=null,localAudioMuted=false,captureSourceId=null,audioPublishPromise=null;
const remoteAudioStreams=new Map(),remoteAudioElements=new Map(),remoteAudioMuted=new Set();
const remotePaused=new Set();
const participantNames = new Map();
const minimizedStreams=new Set();let currentParticipants=[],administrationReady=false,roomRevision=-1;
let statsTimer = null, audioEnabled = false, soundEnabled = true, layoutMode = 'grid', focusedStreamId = null;
const profiles = {
  low: { width: 1280, height: 720, fps: 15, bitrate: 1500000, label: 'Econ\u00f4mica \u00b7 720p / 15 FPS' },
  balanced: { width: 1280, height: 720, fps: 30, bitrate: 2500000, label: 'Equilibrada \u00b7 720p / 30 FPS' },
  high: { width: 1920, height: 1080, fps: 30, bitrate: 4000000, label: 'Alta qualidade \u00b7 1080p / 30 FPS' },
  smooth: {width:1280,height:720,fps:60,bitrate:4500000,label:'Fluida · 720p / 60 FPS'},
  high60: {width:1920,height:1080,fps:60,bitrate:8000000,label:'Alta fluidez · 1080p / 60 FPS'},
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
   if(track.kind==='audio'){
    const stream=new MediaStream([track.mediaStreamTrack]);remoteAudioStreams.set(participant.identity,stream);
    removeRemoteAudioElement(participant.identity);
    const audio=document.createElement('audio');audio.autoplay=true;audio.srcObject=stream;audio.hidden=true;document.body.append(audio);remoteAudioElements.set(participant.identity,audio);audio.play().catch(()=>toast('Clique na sala para ouvir o áudio.'));
    if(pub.isMuted)remoteAudioMuted.add(participant.identity);else remoteAudioMuted.delete(participant.identity);
    syncAudioMeters();return;
   }
   if(track.kind!=='video')return;
   remoteStreams.set(participant.identity,new MediaStream([track.mediaStreamTrack]));
   diagnosticMessage='Vídeo remoto recebido do LiveKit: '+participant.identity.slice(0,8);
   console.info('[Zillu] Vídeo remoto inscrito', {participant:participant.identity,trackSid:pub.trackSid});
   renderStreams();
  });
  room.on(window.LivekitClient.RoomEvent.TrackMuted,(pub,participant)=>{if(pub.kind==='audio'){remoteAudioMuted.add(participant.identity);updateAudioBorders();}if(pub.kind==='video'){remotePaused.add(participant.identity);renderStreams();}});
  room.on(window.LivekitClient.RoomEvent.TrackUnmuted,(pub,participant)=>{if(pub.kind==='audio'){remoteAudioMuted.delete(participant.identity);updateAudioBorders();}if(pub.kind==='video'){remotePaused.delete(participant.identity);renderStreams();}});
  room.on(window.LivekitClient.RoomEvent.TrackUnsubscribed,(track,pub,participant)=>{
   if(track.kind==='audio'){clearRemoteAudio(participant.identity);syncAudioMeters();return;}
   remoteStreams.delete(participant.identity);renderStreams();
  });
  room.on(window.LivekitClient.RoomEvent.ParticipantDisconnected,participant=>{
   clearRemoteAudio(participant.identity);
   remoteStreams.delete(participant.identity);renderStreams();
  });
  room.on(window.LivekitClient.RoomEvent.Disconnected,()=>{
   if(livekitRoom===room){clearAllRemoteAudio();livekitRoom=null;localAudioPublication=null;localPublication=null;remoteStreams.clear();renderStreams();status('Conexão interrompida');}
  });
  room.on(window.LivekitClient.RoomEvent.Reconnecting,()=>status('Reconectando…'));
 room.on(window.LivekitClient.RoomEvent.Reconnected,()=>status('Conectado'));
 await room.connect(conf.url,conf.token,{autoSubscribe:true});
  diagnosticMessage='Conectado ao LiveKit. Nenhuma tela publicada ainda.';
  livekitRoom=room;
  status('Conectado');
 })();
 try{await sfuConnecting;}finally{sfuConnecting=null;}
}
async function publishSFU(stream){
 await connectSFU();
 const track=stream.getVideoTracks()[0];
 if(!track)throw Error('Nenhuma faixa de vídeo disponível');
 if(localPublication||localAudioPublication)await unpublishSFU();
 const localTrack=new window.LivekitClient.LocalVideoTrack(track,undefined,false);
 localTrack.contentHint='detail';
 try {
  localPublication=await livekitRoom.localParticipant.publishTrack(localTrack,{source:window.LivekitClient.Track.Source.ScreenShare,simulcast:false,videoEncoding:{maxBitrate:profile.bitrate,maxFramerate:profile.fps}});
  try{await publishAudioSFU(stream);}catch(error){console.warn('Áudio da transmissão indisponível',error);for(const audio of stream.getAudioTracks()){audio.stop();stream.removeTrack(audio);}toast('Tela compartilhada sem áudio.');}
  console.info('[Zillu] Tela publicada no LiveKit', {sid:localPublication.trackSid,source:localPublication.source});
  diagnosticMessage='Tela publicada no LiveKit (SFU). Aguarde um participante para validar o recebimento.';
 } catch(error) {
  console.error('[Zillu] Falha ao publicar a tela no LiveKit',error);
  throw error;
 }
}
async function unpublishSFU(){
 if(audioPublishPromise)try{await audioPublishPromise;}catch{}
 if(livekitRoom&&localAudioPublication){try{await livekitRoom.localParticipant.unpublishTrack(localAudioPublication.track);}catch{}localAudioPublication=null;}
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
 const audioSupported=await window.zulluDesktop.getSystemAudioSupport();$('share-audio').disabled=!audioSupported;
 if(!audioSupported){$('share-audio').checked=false;$('settings-share-audio').checked=false;}
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
  try{audioEnabled=$('share-audio').checked;captureSourceId=selected;await window.zulluDesktop.selectSource(selected);$('sources').close();await startStreaming(replace);toast(replace?'Fonte alterada.':'Transmissão iniciada.');}
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
  const constraints=isDesktop?{video:true,audio:false}:{video:{width:{ideal:profile.width},height:{ideal:profile.height},frameRate:{ideal:profile.fps}},audio:false};
  myStream=await navigator.mediaDevices.getDisplayMedia(constraints);
  if(audioEnabled){try{await acquireSystemAudio();}catch(error){console.warn('Áudio não capturado',error);toast('Compartilhando somente a tela. Não foi possível capturar o áudio.');}}
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
 paused=false;localAudioMuted=false;status('Transmitindo');
 renderStreams();
}

async function stopMyStream() {
 await unpublishSFU();
 if (myStream) { myStream.getTracks().forEach(t => t.stop()); myStream = null; }
 try { await api('stop-stream'); } catch {}
 $('share-screen').hidden = false;
 diagnosticMessage='Transmissão encerrada.';toast('Compartilhamento encerrado.');
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
 const grid=$('streams-grid'),strip=$('focus-strip');grid.replaceChildren();strip.replaceChildren();
 const streams=new Map();
 if(myStream?.getVideoTracks().some(track=>track.readyState==='live')) streams.set('__local__',myStream);
 for(const [pid,stream] of remoteStreams) streams.set(pid,stream);
 for(const id of minimizedStreams)if(!streams.has(id))minimizedStreams.delete(id);
 if(focusedStreamId&&!streams.has(focusedStreamId))focusedStreamId=null;
 if(!focusedStreamId&&streams.size)focusedStreamId=streams.keys().next().value;
 const visible=new Map([...streams].filter(([id])=>!minimizedStreams.has(id)));
 const displayedFocus=visible.has(focusedStreamId)?focusedStreamId:visible.keys().next().value;
 grid.dataset.count=visible.size;$('empty-stage').hidden=visible.size>0;
 if(!visible.size&&minimizedStreams.size)$('empty-stage-message').textContent='Restaure uma transmissão pela faixa abaixo.';
 else if(!$('share-screen').disabled)$('empty-stage-message').textContent='Compartilhe uma tela para começar.';
 const minimized=$('minimized-streams');minimized.replaceChildren();minimized.hidden=!minimizedStreams.size;
 for(const id of minimizedStreams){const button=document.createElement('button');const name=id==='__local__'?'Você':participantNames.get(id)||'Participante';button.append(createIcon('rotate-ccw'),document.createTextNode(name));button.dataset.tooltip='Restaurar transmissão de '+name;button.setAttribute('aria-label',button.dataset.tooltip);button.onclick=()=>{minimizedStreams.delete(id);renderStreams();};minimized.append(button);}
 const focusVideo=$('focus-video'),focusMain=document.querySelector('.focus-main');focusMain.dataset.streamId=displayedFocus||'';
 focusMain.querySelector('.minimize-stream')?.remove();
 if(layoutMode==='focus'&&displayedFocus){
  focusVideo.srcObject=visible.get(displayedFocus);focusVideo.muted=displayedFocus==='__local__';focusVideo.play().catch(()=>{});
  $('focus-name').textContent=displayedFocus==='__local__'?'Você · Prévia local':participantNames.get(displayedFocus)||'Participante';
  $('focus-stats').textContent=(displayedFocus==='__local__'?paused:remotePaused.has(displayedFocus))?'Pausada':'Compartilhando';focusMain.append(minimizeButton(displayedFocus));
 }else{focusVideo.pause();focusVideo.srcObject=null;}
 for(const [pid,stream] of visible){
  if(layoutMode==='focus'&&pid===displayedFocus)continue;
  const card=document.createElement('div');card.dataset.streamId=pid;card.className='stream-card'+(pid==='__local__'?' stream-card-local':'');
  card.classList.toggle('is-paused',pid==='__local__'?paused:remotePaused.has(pid));card.tabIndex=0;card.setAttribute('role','group');card.setAttribute('aria-label','Transmissão de '+(pid==='__local__'?'você':participantNames.get(pid)||'participante'));
  const video=document.createElement('video');video.autoplay=true;video.playsInline=true;video.muted=pid==='__local__';video.srcObject=stream;video.addEventListener('loadedmetadata',()=>video.play().catch(()=>{}),{once:true});
  const overlay=document.createElement('div');overlay.className='stream-overlay';const label=document.createElement('span');label.textContent=pid==='__local__'?'Você · Prévia local':participantNames.get(pid)||'Participante';overlay.append(label);card.append(video,overlay,minimizeButton(pid));
  card.onclick=event=>{if(event.target.closest('button'))return;focusedStreamId=pid;layoutMode='focus';renderStreams();};
  card.onkeydown=event=>{if(event.target===card&&(event.key==='Enter'||event.key===' ')){event.preventDefault();focusedStreamId=pid;layoutMode='focus';renderStreams();}};
  (layoutMode==='grid'?grid:strip).append(card);video.play().catch(()=>{});
 }
 updateLayout();if(!visible.size)$('focus-container').hidden=true;syncAudioMeters();
}
function minimizeButton(id){const button=document.createElement('button');button.className='minimize-stream';button.dataset.tooltip='Minimizar transmissão';button.setAttribute('aria-label','Minimizar transmissão');button.append(createIcon('minus'));button.onclick=event=>{event.stopPropagation();minimizedStreams.add(id);renderStreams();};return button;}

function updateLayout() {
 requestAnimationFrame(fitStreamCards);
 setControl('toggle-layout',layoutMode==='grid'?'focus':'grid',layoutMode==='grid'?'Modo Foco':'Modo Grade');
 $('toggle-layout').setAttribute('aria-pressed',String(layoutMode==='focus'));
 $('share-screen').hidden=!!myStream;
 for(const id of ['pause','swap-screen','stop-stream'])$(id).hidden=!myStream;
 setControl('pause',paused?'play':'pause',paused?'Retomar transmissão':'Pausar transmissão');
 $('pause').setAttribute('aria-pressed',String(paused));
 const hasAudio=myStream?.getAudioTracks().some(track=>track.readyState==='live');
 $('mute-stream-audio').hidden=false;
 setControl('mute-stream-audio',!hasAudio||localAudioMuted?'volumeOff':'volume',hasAudio?(localAudioMuted?'Ativar áudio da transmissão':'Silenciar áudio da transmissão'):'Configurar áudio da transmissão');
 $('mute-stream-audio').classList.toggle('audio-muted',!!hasAudio&&localAudioMuted);
 $('audio-settings-status').textContent=hasAudio?'O alto-falante silencia ou ativa o áudio compartilhado. Desligue a opção para parar a captura de áudio.':(myStream?'Sem áudio. Ativar esta opção inicia somente o áudio, sem interromper o vídeo.':'Sem áudio por padrão. O microfone não é capturado.');
 $('mute-stream-audio').setAttribute('aria-pressed',String(localAudioMuted));
if (layoutMode === 'grid') {
$('streams-grid').hidden = false;
$('focus-container').hidden = true;
} else {
$('streams-grid').hidden = true;
$('focus-container').hidden = false;
}
}
function createIcon(name){
 const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('class','icon');svg.setAttribute('aria-hidden','true');
 const use=document.createElementNS('http://www.w3.org/2000/svg','use');use.setAttribute('href','/icons.svg#'+name);svg.append(use);return svg;
}
function iconStatus(icon,label,active=false){const span=document.createElement('span');span.className='participant-status'+(active?' positive':'');span.dataset.tooltip=label;span.setAttribute('aria-label',label);span.tabIndex=0;span.append(createIcon(icon));return span;}
function updateParticipants(participants) {
 if($('participant-menu').matches(':popover-open'))$('participant-menu').hidePopover();
 currentParticipants=participants;
 const self=participants.find(p=>p.id===myId);if(self)role=self.role;
 for(const p of participants)participantNames.set(p.id,p.name);
 requests.clear();if(['owner','admin'].includes(role))for(const p of participants)if(!p.approved)requests.set(p.id,{id:p.id,name:p.name});
 updateRequestsUI(false);renderStreams();
 $('count').textContent=participants.filter(p=>p.approved).length+' / 6';$('empty-participants').hidden=participants.some(p=>p.id!==myId&&p.approved);
 $('end-room').hidden=role!=='owner'||!administrationReady;
 const list=$('participants-list');list.replaceChildren();
 for(const p of participants.filter(p=>p.approved)){
  const row=document.createElement('div');row.className='participant-item';
  const avatar=document.createElement('span');avatar.className='avatar';avatar.textContent=p.name.trim().split(/\s+/).map(n=>n[0]).slice(0,2).join('').toUpperCase();
  const info=document.createElement('div');info.className='participant-info';
  const name=document.createElement('strong');name.textContent=p.name+(p.id===myId?' (Você)':'');name.dataset.tooltip=name.textContent;
  const statuses=document.createElement('div');statuses.className='participant-statuses';statuses.append(iconStatus(p.streaming?'monitor-up':'eye',p.streaming?'Transmitindo':'Assistindo',p.streaming));
  if(p.role==='owner')statuses.append(iconStatus('crown','Proprietário'));if(p.role==='admin')statuses.append(iconStatus('shield-check','Administrador'));
  info.append(name,statuses);row.append(avatar,info);
  if(p.id!==myId&&(role==='owner'||role==='admin'&&p.role==='member')){
   const button=document.createElement('button');button.className='participant-more';button.dataset.tooltip='Ações de '+p.name;button.setAttribute('aria-label','Ações de '+p.name);button.setAttribute('aria-haspopup','menu');button.append(createIcon('ellipsis'));button.onclick=()=>openParticipantMenu(p,button);row.append(button);
  }
  list.append(row);
 }
}
function confirmAction(title,message,action){
 $('confirm-action-title').textContent=title;$('confirm-action-message').textContent=message;$('accept-action').disabled=false;$('confirm-action').showModal();
 $('accept-action').onclick=async()=>{$('accept-action').disabled=true;try{await action();$('confirm-action').close();}catch(error){toast(error.message);}finally{$('accept-action').disabled=false;}};
}
$('cancel-action').onclick=()=>$('confirm-action').close();
function openParticipantMenu(participant,anchor){
 const menu=$('participant-menu');menu.replaceChildren();
 const add=(label,icon,route,confirm=false)=>{const button=document.createElement('button');button.append(createIcon(icon),document.createTextNode(label));button.setAttribute('role','menuitem');if(route==='remove')button.className='danger';button.onclick=()=>{menu.hidePopover();const action=async()=>{await api(route,{target:participant.id});toast('Ação concluída.');};if(confirm)confirmAction(label,label+' — '+participant.name+'?',action);else action().catch(error=>toast(error.message));};menu.append(button);};
 if(role==='owner'&&administrationReady){add(participant.role==='admin'?'Remover cargo de administrador':'Tornar administrador',participant.role==='admin'?'shield-minus':'shield-plus',participant.role==='admin'?'demote':'promote',participant.role==='admin');add('Transferir propriedade','arrow-right-left','transfer',true);}
 if(role==='owner'||role==='admin'&&participant.role==='member')add('Remover da sala','user-round-x','remove',true);
 menu.showPopover();const rect=anchor.getBoundingClientRect();menu.style.left=Math.max(8,Math.min(innerWidth-menu.offsetWidth-8,rect.right-menu.offsetWidth))+'px';menu.style.top=Math.max(8,Math.min(innerHeight-menu.offsetHeight-8,rect.bottom+5))+'px';menu.querySelector('button')?.focus();
}
document.addEventListener('pointerdown',event=>{const menu=$('participant-menu');if(menu.matches(':popover-open')&&!menu.contains(event.target)&&!event.target.closest('.participant-more'))menu.hidePopover();});
$('participant-menu').addEventListener('keydown',event=>{const buttons=[...$('participant-menu').querySelectorAll('button')],index=buttons.indexOf(document.activeElement);if(event.key==='Escape'){$('participant-menu').hidePopover();event.preventDefault();}if(event.key==='ArrowDown'||event.key==='ArrowUp'){event.preventDefault();buttons[(index+(event.key==='ArrowDown'?1:buttons.length-1))%buttons.length]?.focus();}});

async function handle(e) {
if (e.type === 'room-state') {
 if(e.revision!==undefined&&e.revision<roomRevision)return;roomRevision=e.revision??roomRevision;if(e.apiVersion==='0.6.2')administrationReady=true;
 updateParticipants(e.participants);
 const active=new Set(e.participants.filter(p=>p.streaming).map(p=>p.id));
 if(mediaMode==='sfu'){for(const id of remoteStreams.keys())if(!active.has(id))remoteStreams.delete(id);for(const id of remoteAudioStreams.keys())if(!active.has(id))clearRemoteAudio(id);renderStreams();}
}
if (e.type === 'request'&&['owner','admin'].includes(role)) { requests.set(e.id, { id: e.id, name: e.name }); updateRequestsUI(); }
if (e.type === 'approved') { $('room-title').textContent = 'Sala de telas';$('empty-stage-message').textContent='Compartilhe uma tela para começar.'; status('Aprovado. Você pode transmitir.'); toast('Entrada autorizada!'); $('share-screen').disabled = false; if(mediaMode==='sfu')connectSFU().catch(er=>toast('Não foi possível conectar as telas. Tente entrar novamente.')); }
if (e.type === 'signal' && mediaMode==='p2p') await handleSignal(e.from, e.data);
if (e.type === 'stream-started') { toast(e.participantName + ' começou a transmitir'); }
if (e.type === 'stream-ended' && mediaMode==='sfu') { clearRemoteAudio(e.participantId); remoteStreams.delete(e.participantId); renderStreams(); }
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
dn.onclick=()=>confirmAction('Recusar entrada','Recusar a entrada de '+r.name+'?',async()=>{await api('remove',{target:r.id});requests.delete(r.id);updateRequestsUI(false);});
a.append(al, dn); d.append(b, a); $('requests-list').append(d);
}
if (l.length && notify) {
 const f=l[l.length-1];toast(f.name+' pediu para entrar. Veja os participantes.');playNotifSound();
 window.zulluDesktop?.notifyRequest(f.name).catch(()=>{});
}

}
function cleanup() {
generation++;
clearAllRemoteAudio();localAudioMuted=false;
if (pollingController) pollingController.abort();
if(livekitRoom){livekitRoom.disconnect();livekitRoom=null;}localPublication=null;localAudioPublication=null;
for (const [, pc] of peers) pc.close();
peers.clear(); remoteStreams.clear(); requests.clear();remotePaused.clear();
if (myStream) { myStream.getTracks().forEach(t => t.stop()); myStream = null; }
token = null; role = null; roomCode = '';
$('lobby').hidden = false; $('room').hidden = true;
status('Desconectado');
focusedStreamId=null; paused=false;minimizedStreams.clear();administrationReady=false;roomRevision=-1;participantNames.clear();updateParticipants([]);updateRequestsUI(false);renderStreams();
}

for (const t of ['host', 'view']) $('tab-' + t).onclick = () => {
$('host-form').hidden = t !== 'host'; $('view-form').hidden = t !== 'view';
$('tab-host').classList.toggle('selected', t === 'host'); $('tab-view').classList.toggle('selected', t === 'view');
$('tab-host').setAttribute('aria-pressed',String(t==='host'));$('tab-view').setAttribute('aria-pressed',String(t==='view'));
};
function changeQuality(){
 const custom=$('quality').value==='custom';$('custom-quality').hidden=!custom;
 if(custom){const height=Number($('custom-resolution').value);profiles.custom={width:height===1080?1920:1280,height,fps:Number($('custom-fps').value),bitrate:(height===1080?4000000:2500000)*Math.max(1,Number($('custom-fps').value)/30),label:height+'p / '+$('custom-fps').value+' FPS'};}
 profile=profiles[$('quality').value]||profiles.low;
 window.zulluDesktop?.setConfig({lastQuality:$('quality').value,lastFps:profile.fps}).catch(()=>{});
}
$('quality').onchange=changeQuality;$('custom-resolution').onchange=changeQuality;$('custom-fps').onchange=changeQuality;
let myId = null;
async function startHost() {
await connect();
const res = await api('create');
administrationReady=res.apiVersion==='0.6.2';roomRevision=-1;roomCode = res.code; role = 'owner'; myId = res.myId || myId;
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
administrationReady=res.apiVersion==='0.6.2';roomRevision=-1;roomCode = res.code; role = 'member'; myId = res.myId || myId;
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
$('leave').onclick=()=>{
 if(role==='owner'&&!administrationReady){toast('Atualize a API para sair sem encerrar a sala.');return;}
 const action=async()=>{await api('leave');cleanup();};
 if(role==='owner')confirmAction('Sair da sala','A sala continuará aberta. Um administrador ou o primeiro participante aprovado assumirá a propriedade.',action);else action().catch(error=>toast(error.message));
};
$('end-room').onclick=()=>confirmAction('Encerrar sala','Todos serão desconectados. Deseja encerrar a sala?',async()=>{await api('end-room');cleanup();});
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
function syncFullscreen(active){fullscreenActive=active;document.body.classList.toggle('is-fullscreen',active);$('fullscreen').setAttribute('aria-pressed',String(active));setControl('fullscreen',active?'minimize':'maximize',active?'Sair da tela cheia':'Entrar em tela cheia');}
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
$('sharing-settings').onclick=()=>$('settings').showModal();
$('close-settings').onclick=()=>$('settings').close();
$('toggle-participants').onclick=()=>{const hidden=document.querySelector('.room-layout').classList.toggle('panel-hidden');$('toggle-participants').setAttribute('aria-expanded',String(!hidden));};

$('name').value = localStorage.getItem('zullu-name') || '';
const params = new URLSearchParams(location.search);
if (params.has('room')) {
const c = params.get('room').toUpperCase();
if (/^[A-Z2-9]{6}$/.test(c)) { $('code').value = c; $('tab-view').click(); toast('Convite preenchido.'); }
else toast('Convite inválido.');
history.replaceState(null, '', location.pathname);
}
window.addEventListener('pagehide', () => { if (token&&(role!=='owner'||administrationReady)) fetch(base + '/api/leave', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, body: '{}', keepalive: true }).catch(() => {}); myStream?.getTracks().forEach(t => t.stop()); });

// Inicialização: carrega preferências persistidas (Electron ou localStorage)
(async () => {
 try {
  if (window.zulluDesktop?.getConfig) {
   const cfg = await window.zulluDesktop.getConfig();
   if (cfg.lastName) $('name').value = cfg.lastName;
   if (cfg.lastQuality && profiles[cfg.lastQuality]) {
    $('quality').value = cfg.lastQuality;
    profile = profiles[cfg.lastQuality];
    if(cfg.lastQuality==='custom'&&[15,30,60].includes(Number(cfg.lastFps))){$('custom-fps').value=String(cfg.lastFps);changeQuality();}
    refreshSelects();
   }
  } else {
   // Fallback web: usa localStorage
   const n = localStorage.getItem('zullu-name');
   if (n) $('name').value = n;
  }
 } catch (e) { console.warn('Falha ao carregar config:', e); }
})();

const icons={screen:'monitor-up',settings:'sliders-horizontal',swap:'replace',pause:'pause',play:'play',stop:'square',focus:'panels-top-left',grid:'layout-grid',maximize:'maximize',minimize:'minimize',leave:'log-out',users:'users',volume:'volume-2',volumeOff:'volume-x',end:'power'};
function setControl(id,icon,label){
 const button=$(id);button.replaceChildren();button.dataset.tooltip=label;button.removeAttribute('title');button.setAttribute('aria-label',label);
 if(button.hasAttribute('aria-describedby')&&!$('app-tooltip').hidden)$('app-tooltip').textContent=label;
 button.append(createIcon(icons[icon]));
 if(id==='share-screen'){const text=document.createElement('span');text.textContent=label;button.append(text);}
}
for(const [id,icon,label] of [['share-screen','screen','Compartilhar tela'],['sharing-settings','settings','Qualidade e FPS'],['mute-stream-audio','volumeOff','Configurar áudio da transmissão'],['swap-screen','swap','Trocar fonte de captura'],['pause','pause','Pausar transmissão'],['stop-stream','stop','Encerrar transmissão'],['toggle-layout','focus','Modo Foco'],['fullscreen','maximize','Entrar em tela cheia'],['end-room','end','Encerrar sala para todos'],['leave','leave','Sair da sala'],['toggle-participants','users','Mostrar ou ocultar participantes']])setControl(id,icon,label);

// Keep equal landscape tiles within the space available, rather than stretching rows.
function fitStreamCards(){
 const grid=$('streams-grid'), count=grid.children.length;
 if(layoutMode==='grid'&&count){
  const width=grid.clientWidth,height=grid.clientHeight,gap=10,ratio=16/9;
  let best=0;
  for(let columns=1;columns<=count;columns++){
   const rows=Math.ceil(count/columns);
   const tileWidth=Math.min((width-gap*(columns-1))/columns,((height-gap*(rows-1))/rows)*ratio);
   best=Math.max(best,tileWidth);
  }
  grid.style.setProperty('--stream-width',Math.floor(best)+'px');
 }
 if(layoutMode==='focus'){
  const container=$('focus-container'),strip=$('focus-strip'),main=container.querySelector('.focus-main');
  const stripHeight=strip.children.length?strip.getBoundingClientRect().height+10:0;
  const width=Math.max(0,Math.min(container.clientWidth,(container.clientHeight-stripHeight)*16/9));
  main.style.width=Math.floor(width)+'px';main.style.height=Math.floor(width*9/16)+'px';
 }
}
new ResizeObserver(fitStreamCards).observe(document.querySelector('.stage-viewport'));

// App-styled tooltips for mouse and keyboard, without the operating system's title popup.
const tooltip=$('app-tooltip');let tooltipTarget=null;
function hideTooltip(){tooltip.hidden=true;if(tooltipTarget)tooltipTarget.removeAttribute('aria-describedby');tooltipTarget=null;}
function showTooltip(target){
 if(!target||target.disabled)return;hideTooltip();tooltipTarget=target;
 tooltip.textContent=target.dataset.tooltip;tooltip.hidden=false;target.setAttribute('aria-describedby','app-tooltip');
 const rect=target.getBoundingClientRect(),box=tooltip.getBoundingClientRect();
 tooltip.style.left=Math.max(8,Math.min(innerWidth-box.width-8,rect.left+(rect.width-box.width)/2))+'px';
 tooltip.style.top=(rect.top>box.height+16?rect.top-box.height-10:rect.bottom+10)+'px';
}
for(const button of document.querySelectorAll('button[title]')){button.dataset.tooltip=button.title;button.removeAttribute('title');}
document.addEventListener('pointerover',event=>{const target=event.target.closest('[data-tooltip]');if(target!==tooltipTarget){hideTooltip();showTooltip(target);}});
document.addEventListener('pointerout',event=>{if(tooltipTarget&&!tooltipTarget.contains(event.relatedTarget))hideTooltip();});
document.addEventListener('focusin',event=>showTooltip(event.target.closest('[data-tooltip]')));
document.addEventListener('focusout',hideTooltip);document.addEventListener('pointerdown',hideTooltip);
document.addEventListener('keydown',event=>{if(event.key==='Escape')hideTooltip();});window.addEventListener('resize',hideTooltip);

$('mute-stream-audio').onclick=async()=>{
 if(!myStream?.getAudioTracks().some(track=>track.readyState==='live')){$('settings').showModal();return;}
 const button=$('mute-stream-audio');button.disabled=true;
 try{const next=!localAudioMuted;if(localAudioPublication)await(next?localAudioPublication.track.mute():localAudioPublication.track.unmute());myStream.getAudioTracks().forEach(track=>track.enabled=!next);localAudioMuted=next;updateLayout();updateAudioBorders();}
 catch(error){console.error(error);toast('Não foi possível alterar o áudio.');}finally{button.disabled=false;}
};
function removeRemoteAudioElement(id){const element=remoteAudioElements.get(id);if(element){element.pause();element.srcObject=null;element.remove();remoteAudioElements.delete(id);}}
function clearRemoteAudio(id){removeRemoteAudioElement(id);remoteAudioStreams.delete(id);remoteAudioMuted.delete(id);}
function clearAllRemoteAudio(){for(const id of remoteAudioElements.keys())clearRemoteAudio(id);remoteAudioStreams.clear();remoteAudioMuted.clear();}
const audioMeters=new Map();let audioMeterTimer=null;
function syncAudioMeters(){
 const streams=new Map(remoteAudioStreams);
 for(const [id,stream] of remoteStreams)if(stream.getAudioTracks().length)streams.set(id,stream);
 if(myStream)streams.set('__local__',myStream);
 for(const [id,meter] of audioMeters){const track=streams.get(id)?.getAudioTracks().find(t=>t.readyState==='live');if(track!==meter.track){meter.source.disconnect();meter.analyser.disconnect();audioMeters.delete(id);}}
 for(const [id,stream] of streams){
  const track=stream.getAudioTracks().find(t=>t.readyState==='live');if(!track||audioMeters.has(id))continue;
  try{if(!audioCtx)audioCtx=new(window.AudioContext||window.webkitAudioContext)();
   audioCtx.resume().catch(()=>{});
   const source=audioCtx.createMediaStreamSource(new MediaStream([track])),analyser=audioCtx.createAnalyser();analyser.fftSize=512;source.connect(analyser);
   audioMeters.set(id,{track,source,analyser,samples:new Float32Array(analyser.fftSize),activeUntil:0});
  }catch(error){console.warn('Não foi possível analisar o áudio',error);}
 }
 if(audioMeters.size&&!audioMeterTimer)audioMeterTimer=setInterval(updateAudioBorders,80);
 if(!audioMeters.size&&audioMeterTimer){clearInterval(audioMeterTimer);audioMeterTimer=null;}
 updateAudioBorders();
}
function updateAudioBorders(){
 const now=performance.now();
 for(const meter of audioMeters.values()){
  meter.analyser.getFloatTimeDomainData(meter.samples);let energy=0;for(const sample of meter.samples)energy+=sample*sample;
  if(meter.track.enabled&&!meter.track.muted&&Math.sqrt(energy/meter.samples.length)>.012)meter.activeUntil=now+200;
 }
 for(const element of document.querySelectorAll('.stream-card,.focus-main')){
  const id=element.dataset.streamId,meter=audioMeters.get(id);
  const muted=id==='__local__'?localAudioMuted:remoteAudioMuted.has(id);
  const inactive=id==='__local__'?paused:remotePaused.has(id);
  element.classList.toggle('is-audio-muted',muted);
  element.classList.toggle('is-audio-active',!muted&&!inactive&&!!meter&&meter.track.enabled&&!meter.track.muted&&meter.activeUntil>now);
  let badge=element.querySelector('.audio-state');
  if(muted&&!badge){badge=document.createElement('span');badge.className='audio-state';badge.textContent='Áudio silenciado';element.append(badge);}
  if(!muted&&badge)badge.remove();
 }
}
document.addEventListener('pointerdown',()=>{audioCtx?.resume().catch(()=>{});for(const audio of remoteAudioElements.values())if(audio.paused)audio.play().catch(()=>{});});

// Use the same audio preference in settings and in the native source picker.
$('share-audio').addEventListener('change',()=>{$('settings-share-audio').checked=$('share-audio').checked;});
$('settings-share-audio').addEventListener('change',()=>configureSharedAudio($('settings-share-audio').checked));

// Custom listboxes replace the operating system's select menus.
const styledSelects=[];
function refreshSelects(){for(const item of styledSelects)item.refresh();}
for(const select of document.querySelectorAll('#settings select')){
 const label=document.querySelector('label[for="'+select.id+'"]');
 const wrapper=document.createElement('div');wrapper.className='app-select';select.after(wrapper);select.hidden=true;
 const trigger=document.createElement('button');trigger.type='button';trigger.className='select-trigger';trigger.id=select.id+'-trigger';
 if(label){label.htmlFor=trigger.id;label.id=select.id+'-label';trigger.setAttribute('aria-labelledby',label.id+' '+trigger.id);}
 trigger.setAttribute('aria-haspopup','listbox');trigger.setAttribute('aria-expanded','false');
 const value=document.createElement('span'),chevron=document.createElement('span');chevron.textContent='⌄';chevron.setAttribute('aria-hidden','true');trigger.append(value,chevron);
 const menu=document.createElement('div');menu.className='select-options';menu.id=select.id+'-options';menu.hidden=true;menu.setAttribute('role','listbox');menu.setAttribute('aria-label',label?.textContent||'Opções');trigger.setAttribute('aria-controls',menu.id);
 const close=(restore=false)=>{menu.hidden=true;trigger.setAttribute('aria-expanded','false');if(restore)trigger.focus();};
 const refresh=()=>{value.textContent=select.selectedOptions[0]?.textContent||'';for(const [index,option] of [...menu.children].entries()){const chosen=select.selectedIndex===index;option.setAttribute('aria-selected',String(chosen));option.tabIndex=chosen?0:-1;}};
 for(const [index,option] of [...select.options].entries()){
  const button=document.createElement('button');button.type='button';button.setAttribute('role','option');button.textContent=option.textContent;
  button.onclick=()=>{select.value=option.value;select.dispatchEvent(new Event('change',{bubbles:true}));refresh();close(true);};
  button.onkeydown=event=>{let next=index;if(event.key==='ArrowDown')next=(index+1)%menu.children.length;else if(event.key==='ArrowUp')next=(index+menu.children.length-1)%menu.children.length;else if(event.key==='Home')next=0;else if(event.key==='End')next=menu.children.length-1;else if(event.key==='Escape'){event.preventDefault();close(true);return;}else if(event.key==='Tab'){close();return;}else return;event.preventDefault();menu.children[next].focus();};menu.append(button);
 }
 const open=()=>{for(const item of styledSelects)item.close();menu.hidden=false;trigger.setAttribute('aria-expanded','true');menu.classList.toggle('opens-up',trigger.getBoundingClientRect().bottom+menu.offsetHeight>innerHeight-20);menu.children[select.selectedIndex]?.focus();};
 trigger.onclick=()=>menu.hidden?open():close();trigger.onkeydown=event=>{if(['ArrowDown','ArrowUp','Enter',' '].includes(event.key)){event.preventDefault();open();}};
 wrapper.append(trigger,menu);styledSelects.push({refresh,close});select.addEventListener('change',refresh);refresh();
 document.addEventListener('pointerdown',event=>{if(!wrapper.contains(event.target))close();});
}
$('settings').addEventListener('close',()=>{for(const item of styledSelects)item.close();});

let audioCapturePromise=null;
async function acquireSystemAudio(){
 if(!myStream||!captureSourceId||!window.zulluDesktop)throw Error('Selecione uma fonte no aplicativo desktop.');
 if(myStream.getAudioTracks().some(track=>track.readyState==='live'))return;
 if(audioCapturePromise)return audioCapturePromise;
 const target=myStream;
 audioCapturePromise=(async()=>{
  await window.zulluDesktop.selectSource(captureSourceId);
  const capture=await navigator.mediaDevices.getDisplayMedia({video:true,audio:{restrictOwnAudio:true}});
  // Electron requires a video grant to obtain loopback audio; discard that temporary video.
  capture.getVideoTracks().forEach(track=>track.stop());
  const tracks=capture.getAudioTracks();if(target!==myStream){tracks.forEach(track=>track.stop());return;}
  if(!tracks.length)throw Error('Áudio geral indisponível neste dispositivo.');
  for(const track of tracks)target.addTrack(track);
 })();try{await audioCapturePromise;}finally{audioCapturePromise=null;}
}
async function publishAudioSFU(stream=myStream){
 if(audioPublishPromise)return audioPublishPromise;
 const track=stream?.getAudioTracks().find(track=>track.readyState==='live'),room=livekitRoom;
 if(!track||!room||localAudioPublication)return;
 audioPublishPromise=(async()=>{
  const publication=await room.localParticipant.publishTrack(new window.LivekitClient.LocalAudioTrack(track,undefined,true),{source:window.LivekitClient.Track.Source.ScreenShareAudio});
  if(livekitRoom===room&&myStream===stream&&track.readyState==='live')localAudioPublication=publication;
  else await room.localParticipant.unpublishTrack(publication.track);
 })();try{await audioPublishPromise;}finally{audioPublishPromise=null;}
}

async function configureSharedAudio(enabled){
 $('settings-share-audio').disabled=true;$('share-audio').disabled=true;
 try{
  if(myStream){
   if(!enabled&&audioPublishPromise)await audioPublishPromise;
   if(enabled){await acquireSystemAudio();if(mediaMode==='sfu')await publishAudioSFU();localAudioMuted=false;}
   else{if(localAudioPublication&&livekitRoom)await livekitRoom.localParticipant.unpublishTrack(localAudioPublication.track);localAudioPublication=null;for(const track of myStream.getAudioTracks()){track.stop();myStream.removeTrack(track);}localAudioMuted=false;}
   if(mediaMode==='p2p')for(const [id,pc] of peers){for(const sender of pc.getSenders())if(sender.track?.kind==='audio')pc.removeTrack(sender);for(const track of myStream.getAudioTracks())pc.addTrack(track,myStream);const offer=await pc.createOffer();await pc.setLocalDescription(offer);await api('signal',{target:id,data:offer});}
  }
  audioEnabled=enabled;$('share-audio').checked=enabled;$('settings-share-audio').checked=enabled;updateLayout();syncAudioMeters();
 }catch(error){console.error(error);const hasAudio=!!myStream?.getAudioTracks().some(track=>track.readyState==='live');$('settings-share-audio').checked=hasAudio;$('share-audio').checked=hasAudio;toast('Não foi possível alterar o áudio compartilhado.');}
 finally{$('settings-share-audio').disabled=false;$('share-audio').disabled=false;}
}
