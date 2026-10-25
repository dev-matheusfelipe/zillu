'use strict';
const $ = id => document.getElementById(id);
let token = null, base = '', role = null, roomCode = '', myStream = null, iceServers = [], generation = 0, paused = false, pollingController;
const peers = new Map(); // key: remoteParticipantId, value: RTCPeerConnection
const remoteStreams = new Map(); // key: remoteParticipantId, value: MediaStream
const requests = new Map();
let statsTimer = null, audioEnabled = false, soundEnabled = true, layoutMode = 'grid', focusedStreamId = null;
const profiles = {
  low: { width: 1280, height: 720, fps: 15, bitrate: 1500000, label: 'Econ\u00f4mica \u00b7 720p / 15 FPS' },
  balanced: { width: 1280, height: 720, fps: 30, bitrate: 2500000, label: 'Equilibrada \u00b7 720p / 30 FPS' },
  high: { width: 1920, height: 1080, fps: 30, bitrate: 4000000, label: 'Alta qualidade \u00b7 1080p / 30 FPS' },
  custom: { width: 1280, height: 720, fps: 30, bitrate: 2500000, label: 'Personalizado' }
};
let profile = profiles.low;
// LiveKit SFU: mídia encaminhada pelo servidor, autorização continua no backend Zullu.
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
   remoteStreams.set(participant.identity,new MediaStream([track.mediaStreamTrack]));renderStreams();
  });
  room.on(window.LivekitClient.RoomEvent.TrackUnsubscribed,(track,pub,participant)=>{
   remoteStreams.delete(participant.identity);renderStreams();
  });
  room.on(window.LivekitClient.RoomEvent.ParticipantDisconnected,participant=>{
   remoteStreams.delete(participant.identity);renderStreams();
  });
  room.on(window.LivekitClient.RoomEvent.Disconnected,()=>{
   if(livekitRoom===room){livekitRoom=null;localPublication=null;remoteStreams.clear();renderStreams();status('SFU desconectado');}
  });
  await room.connect(conf.url,conf.token,{autoSubscribe:true});
  livekitRoom=room;
  status('Conectado ao SFU');
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
 localPublication=await livekitRoom.localParticipant.publishTrack(localTrack,{source:window.LivekitClient.Track.Source.ScreenShare,simulcast:false,videoEncoding:{maxBitrate:profile.bitrate,maxFramerate:profile.fps}});
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
function endpoint() { const u = new URL($('endpoint').value.trim() || location.origin); if (u.protocol !== 'https:' && !(u.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(u.hostname))) throw Error('Use HTTPS remoto'); if (u.username || u.password || u.search || u.hash || u.pathname !== '/') throw Error('Endere\u00e7o inv\u00e1lido'); return u.origin; }
async function connect() {
 const n = $('name').value.trim();
 if (!n) throw Error('Nome obrigatório');
 // Persiste nome e qualidade localmente (funciona em web e desktop)
 localStorage.setItem('zullu-name', n);
 if (window.zulluDesktop?.setConfig) {
  try { await window.zulluDesktop.setConfig({ lastName: n, lastQuality: $('quality').value, lastFps: profile.fps }); } catch {}
 }
 // Se estiver no Electron e houver servidor remoto configurado, conecta via IPC
 const ep = $('endpoint').value.trim();
 if (window.zulluDesktop?.connectRemote && ep) {
  try {
   // Só navega se a origem atual for diferente da desejada (evita reload infinito)
   const currentOrigin = location.origin.replace(/\/+$/, '');
   const targetOrigin = ep.replace(/\/+$/, '');
   if (currentOrigin !== targetOrigin) {
    console.log('[Zullu] Navegando para servidor remoto:', targetOrigin);
    status('Conectando ao servidor…');
    await window.zulluDesktop.connectRemote(ep);
    // Após loadURL, o app recarrega nesta nova origem; a reconexão será automática via params ou estado salvo
    return;
   } else {
    console.log('[Zullu] Já conectado ao servidor alvo, prosseguindo sem reload.');
   }
  } catch (e) { console.error('[Zullu] Falha connectRemote:', e); toast('Falha ao conectar: ' + e.message); throw e; }
 }
 // Fluxo padrão (web ou localhost)
 base = endpoint();
 localStorage.setItem('zullu-endpoint', base === location.origin ? '' : base);
 const r = await api('connect', { name: n });
 token = r.token;
 iceServers = r.iceServers;
 myId=r.id;
 mediaMode=r.mediaMode||'p2p';
}

async function chooseSource(replace = false) {
 if (!window.zulluDesktop) throw Error('Captura disponível apenas no app desktop.');
 const sources = await window.zulluDesktop.sources();
 $('source-list').replaceChildren();
 for (const s of sources) {
  const btn = document.createElement('button');
  btn.className = 'source-option';
  const img=document.createElement('img');img.src=s.thumbnail;img.alt='Prévia da tela';const caption=document.createElement('span');caption.textContent=s.name;btn.append(img,caption);
  btn.onclick = async () => {
   await window.zulluDesktop.selectSource(s.id);
   $('sources').close();
   try { await startStreaming(replace); } catch (e) { toast(e.message); }
  };
  $('source-list').append(btn);
 }
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
   console.error('[Zullu] getDisplayMedia falhou:', err);
   throw Error(err.name + ': ' + err.message);
  }
  myStream.getVideoTracks()[0].addEventListener('ended', () => stopMyStream());
 }
 // Aplica parâmetros de qualidade se suportado
 if(mediaMode==='sfu') await publishSFU(myStream);
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
 status('Transmitindo · '+(mediaMode==='sfu'?'SFU':'P2P'));
 renderStreams();
}

async function stopMyStream() {
 await unpublishSFU();
 if (myStream) { myStream.getTracks().forEach(t => t.stop()); myStream = null; }
 try { await api('stop-stream'); } catch {}
 $('share-screen').hidden = false;
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

function renderStreams() {
const grid = $('streams-grid');
const strip = $('focus-strip');
grid.replaceChildren();
strip.replaceChildren();
for (const [pid, stream] of remoteStreams) {
const card = document.createElement('div');
card.className = 'stream-card';
const video = document.createElement('video');
video.autoplay = true; video.playsinline = true; video.muted = true;
video.srcObject = stream;
const overlay = document.createElement('div');
overlay.className = 'stream-overlay';
overlay.innerHTML = '<span>' + pid.slice(0,6) + '</span>';
card.append(video, overlay);
card.onclick = () => { focusedStreamId = pid; updateLayout(); };
if (layoutMode === 'grid') {
grid.append(card);
} else {
if (pid === focusedStreamId) {
$('focus-video').srcObject = stream;
$('focus-name').textContent = pid.slice(0,6);
} else {
strip.append(card);
}
}
}
if (layoutMode === 'focus' && !focusedStreamId && remoteStreams.size > 0) {
focusedStreamId = remoteStreams.keys().next().value;
renderStreams();
return;
}
updateLayout();
}
function updateLayout() {
if (layoutMode === 'grid') {
$('streams-grid').hidden = false;
$('focus-container').hidden = true;
} else {
$('streams-grid').hidden = true;
$('focus-container').hidden = false;
}
}
function updateParticipants(participants) {
$('count').textContent = participants.length + ' / 6';
$('empty-participants').hidden = !!participants.length;
const list = $('participants-list');
list.replaceChildren();
for (const p of participants) {
const div = document.createElement('div');
div.className = 'participant-item';
const name = document.createElement('strong');
name.textContent = p.name + (p.id === myId ? ' (Você)' : '');
const statusSpan = document.createElement('small');
statusSpan.textContent = p.streaming ? ' — Transmitindo' : (p.approved ? ' — Assistindo' : ' — Aguardando');
div.append(name, statusSpan);
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
if (e.type === 'room-state') updateParticipants(e.participants);
if (e.type === 'request') { requests.set(e.id, { id: e.id, name: e.name }); updateRequestsUI(); }
if (e.type === 'approved') { status('Aprovado. Você pode transmitir.'); toast('Entrada autorizada!'); $('share-screen').disabled = false; if(mediaMode==='sfu')connectSFU().catch(er=>toast('SFU: '+er.message)); }
if (e.type === 'signal' && mediaMode==='p2p') await handleSignal(e.from, e.data);
if (e.type === 'stream-started') { toast(e.participantName + ' começou a transmitir'); }
if (e.type === 'stream-ended' && mediaMode==='p2p') { remoteStreams.delete(e.participantId); peers.get(e.participantId)?.close(); peers.delete(e.participantId); renderStreams(); }
if (e.type === 'participant-left') { remoteStreams.delete(e.participantId); peers.get(e.participantId)?.close(); peers.delete(e.participantId); renderStreams(); }
if (e.type === 'ended' || e.type === 'removed') { cleanup(); toast(e.type === 'ended' ? 'Sala encerrada pelo proprietário.' : 'Você foi removido da sala.'); }
}
async function poll(cur) {
let fail = 0;
while (cur === generation && token) {
try {
pollingController = new AbortController();
const ev = await api('events', {}, pollingController.signal);
fail = 0;
for (const e of ev) { if (cur !== generation) return; try { await handle(e); } catch (er) { toast('Erro evento: ' + er.message); } }
} catch (er) {
if (cur !== generation) return;
status('Reconectando servidor…');
if (++fail >= 10) { cleanup(); toast('Servidor perdido.'); return; }
await new Promise(r => setTimeout(r, Math.min(1000 * Math.pow(2, fail), 30000)));
}
}
}
function updateRequestsUI() {
const l = [...requests.values()];
$('req-count').textContent = l.length;
$('requests-panel').hidden = !l.length;
$('requests-list').replaceChildren();
for (const r of l) {
const d = document.createElement('div'); d.className = 'req-item';
const b = document.createElement('b'); b.textContent = r.name;
const a = document.createElement('div');
const al = document.createElement('button'); al.className = 'primary small'; al.textContent = 'Permitir';
al.onclick = () => api('approve', { target: r.id }).then(() => requests.delete(r.id)).then(updateRequestsUI).catch(e => toast(e.message));
const dn = document.createElement('button'); dn.className = 'danger small'; dn.textContent = 'Recusar';
dn.onclick = () => api('remove', { target: r.id }).then(() => requests.delete(r.id)).then(updateRequestsUI).catch(e => toast(e.message));
a.append(al, dn); d.append(b, a); $('requests-list').append(d);
}
if (l.length) {
const f = l[0]; $('notif-name').textContent = f.name; $('request-notif').hidden = false;
$('notif-allow').onclick = () => api('approve', { target: f.id }).then(() => requests.delete(f.id)).then(updateRequestsUI).catch(e => toast(e.message));
$('notif-deny').onclick = () => api('remove', { target: f.id }).then(() => requests.delete(f.id)).then(updateRequestsUI).catch(e => toast(e.message));
playNotifSound();
if (window.zulluDesktop) window.zulluDesktop.notifyRequest(f.name).catch(() => {});
} else $('request-notif').hidden = true;
}
function cleanup() {
generation++;
if (pollingController) pollingController.abort();
if(livekitRoom){livekitRoom.disconnect();livekitRoom=null;localPublication=null;}
for (const [, pc] of peers) pc.close();
peers.clear(); remoteStreams.clear(); requests.clear();
if (myStream) { myStream.getTracks().forEach(t => t.stop()); myStream = null; }
token = null; role = null; roomCode = '';
$('lobby').hidden = false; $('room').hidden = true;
status('Desconectado');
}

for (const t of ['host', 'view']) $('tab-' + t).onclick = () => {
$('host-form').hidden = t !== 'host'; $('view-form').hidden = t !== 'view';
$('tab-host').classList.toggle('selected', t === 'host'); $('tab-view').classList.toggle('selected', t === 'view');
};
$('quality').onchange = () => { const v = $('quality').value; profile = profiles[v] || profiles.low; };
let myId = null;
async function startHost() {
await connect();
const res = await api('create');
roomCode = res.code; role = 'owner'; myId = res.myId || myId;
$('lobby').hidden = true; $('room').hidden = false;
$('copy').textContent = roomCode;
$('role-label').textContent = 'PROPRIETÁRIO DA SALA';
$('room-title').textContent = 'Sala criada. Compartilhe o código.';
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
$('lobby').hidden = true; $('room').hidden = false;
$('copy').textContent = roomCode;
$('role-label').textContent = 'PARTICIPANTE';
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
$('pause').onclick = () => { if (!myStream) return; paused = !paused; myStream.getVideoTracks().forEach(t => t.enabled = !paused); $('pause').textContent = paused ? 'Retomar' : 'Pausar'; status(paused ? 'Pausado' : 'Transmitindo'); };
$('toggle-layout').onclick = () => { layoutMode = layoutMode === 'grid' ? 'focus' : 'grid'; $('toggle-layout').textContent = layoutMode === 'grid' ? 'Modo Foco' : 'Modo Grade'; renderStreams(); };
$('fullscreen').onclick = () => { const el = layoutMode === 'focus' ? $('focus-video') : $('streams-grid'); const p = document.fullscreenElement ? document.exitFullscreen() : el.requestFullscreen(); p?.catch(() => toast('Tela cheia indisponível')); };
async function safeCopy(text) {
if (window.zulluDesktop?.clipboardWrite) {
try { await window.zulluDesktop.clipboardWrite(text); return true; } catch (e) { console.error('[Zullu] Clipboard IPC falhou:', e); throw e; }
}
if (navigator.clipboard?.writeText) {
try { await navigator.clipboard.writeText(text); return true; } catch (e) { console.warn('[Zullu] Clipboard web falhou:', e); }
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
const l = base + '/?room=' + roomCode;
try {
const ok = await safeCopy(l);
toast(ok ? 'Link copiado!' : 'Não foi possível copiar. Link: ' + l);
} catch (e) { toast('Erro ao copiar link: ' + e.message); }
};
$('cancel-source').onclick = () => $('sources').close();
$('diag-toggle').onclick = () => { $('diag-detail').hidden = !$('diag-detail').hidden; };
$('name').value = localStorage.getItem('zullu-name') || '';
$('endpoint').value = localStorage.getItem('zullu-endpoint') || location.origin;
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
   if (cfg.serverUrl) $('endpoint').value = cfg.serverUrl;
   if (cfg.lastQuality && profiles[cfg.lastQuality]) {
    $('quality').value = cfg.lastQuality;
    profile = profiles[cfg.lastQuality];
   }
  } else {
   // Fallback web: usa localStorage
   const n = localStorage.getItem('zullu-name');
   const ep = localStorage.getItem('zullu-endpoint');
   if (n) $('name').value = n;
   if (ep) $('endpoint').value = ep;
  }
 } catch (e) { console.warn('Falha ao carregar config:', e); }
})();
