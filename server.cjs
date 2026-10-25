const http = require('node:http');
const {randomBytes,randomInt} = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const {jwtToken}=require('./sfu/token.cjs');
function createServer(options={}) {
 const clients = new Map();
 const rooms = new Map();
 const rates = new Map();
 const livekit = options.livekit || (process.env.LIVEKIT_URL && process.env.LIVEKIT_API_KEY && process.env.LIVEKIT_API_SECRET ? {url:process.env.LIVEKIT_URL,key:process.env.LIVEKIT_API_KEY,secret:process.env.LIVEKIT_API_SECRET} : null);
 const iceServers = options.iceServers || JSON.parse(process.env.ICE_SERVERS_JSON || '[{"urls":"stun:stun.l.google.com:19302"}]');
 const id = () => randomBytes(24).toString('hex');
 const send = (c, event) => {
 if (!c) return;
 c.queue.push(event);
 if (c.queue.length > 200) { leave(c); clients.delete(c.token); return; }
 flush(c);
 };
 const reply = (res, status, data) => {
 res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
 res.end(JSON.stringify(data));
 };
 function flush(c) {
 if (c.wait && c.queue.length) {
 const r = c.wait; c.wait = null; clearTimeout(c.timer);
 reply(r, 200, c.queue.splice(0));
 }
 }
 function broadcastRoomState(room) {
 const participants = [];
 const owner = clients.get(room.owner);
 if (owner) participants.push({ id: owner.id, name: owner.name, approved: true, role: 'owner', streaming: !!room.streamers.has(owner.token) });
 for (const token of room.members) {
 const m = clients.get(token);
 if (m) participants.push({ id: m.id, name: m.name, approved: m.approved, role: 'member', streaming: !!room.streamers.has(token) });
 }
 const targets = [room.owner, ...room.members];
 for (const t of targets) {
 const c = clients.get(t);
 if (c && (t === room.owner || c.approved)) {
 send(c, { type: 'room-state', participants });
 }
 }
 }
 function notifyOwnerRequest(room, requester) {
 const owner = clients.get(room.owner);
 if (owner) send(owner, { type: 'request', id: requester.id, name: requester.name });
 }
 function leave(c) {
 const roomCode = c.room;
 c.room = null;
 if (!roomCode) return;
 const room = rooms.get(roomCode);
 if (!room) return;
 if (room.owner === c.token) {
 rooms.delete(roomCode);
 for (const token of room.members) {
 const m = clients.get(token);
 if (m) { m.room = null; send(m, { type: 'ended' }); }
 }
 return;
 }
 room.members.delete(c.token);
 room.streamers.delete(c.token);
 const owner = clients.get(room.owner);
 if (owner) send(owner, { type: 'participant-left', id: c.id });
 for (const token of room.members) {
 const m = clients.get(token);
 if (m && m.approved) send(m, { type: 'participant-left', id: c.id });
 }
 broadcastRoomState(room);
 }
 function stopStreaming(c) {
 if (!c.room) return;
 const room = rooms.get(c.room);
 if (!room || !room.streamers.has(c.token)) return;
 room.streamers.delete(c.token);
 const targets = [room.owner, ...room.members];
 for (const t of targets) {
 const target = clients.get(t);
 if (target && (t === room.owner || target.approved)) {
 send(target, { type: 'stream-ended', participantId: c.id });
 }
 }
 broadcastRoomState(room);
 }
 async function livekitAdmin(method, roomName, identity) {
  if(!livekit)return;
  const url=new URL(livekit.url);
  if(url.protocol==='wss:')url.protocol='https:';
  else if(url.protocol==='ws:')url.protocol='http:';
  else throw Error('URL LiveKit inválida');
  url.pathname='/twirp/livekit.RoomService/'+method;
  url.search='';
  const auth=jwtToken({key:livekit.key,secret:livekit.secret,identity:'zullu-room-admin',room:roomName,admin:true,ttl:60});
  const payload=method==='RemoveParticipant'?{room:roomName,identity}:{room:roomName};
  const res=await fetch(url,{method:'POST',headers:{Authorization:'Bearer '+auth,'Content-Type':'application/json'},body:JSON.stringify(payload),signal:AbortSignal.timeout(5000)});
  if(!res.ok)throw Error('LiveKit RoomService '+method+' respondeu '+res.status);
 }
 function fail(message, status = 400) { throw Object.assign(new Error(message), { status }); }
 const server = http.createServer(async (req, res) => {
res.setHeader('Access-Control-Allow-Origin', '*');
res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
res.setHeader('X-Content-Type-Options', 'nosniff');
res.setHeader('Referrer-Policy', 'no-referrer');
if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
const url = new URL(req.url, 'http://localhost');
try {
if (url.pathname.startsWith('/api/')) {
if (req.method !== 'POST') fail('Método inválido', 405);
if (!req.headers['content-type']?.startsWith('application/json')) fail('Envie JSON', 415);
let raw = '';
for await (const chunk of req) { raw += chunk; if (Buffer.byteLength(raw) > 70000) fail('Mensagem muito grande', 413); }
let b; try { b = JSON.parse(raw || '{}'); } catch { fail('JSON inválido'); }
if (!b || Array.isArray(b) || typeof b !== 'object') fail('JSON inválido');
const route = url.pathname.slice(5);
if (route === 'connect') {
const ip = req.socket.remoteAddress; const now = Date.now();
let rate = rates.get(ip);
if (!rate || now - rate.start > 60000) { rate = { start: now, count: 0 }; rates.set(ip, rate); }
if (++rate.count > 60) fail('Aguarde um minuto e tente novamente', 429);
if (clients.size >= 500) fail('Servidor ocupado', 503);
const token = id();
const c = { id: id(), token, name: String(b.name || 'Visitante').trim().slice(0, 32) || 'Visitante', queue: [], room: null, approved: false, last: now };
clients.set(token, c);
return reply(res, 200, { token, id: c.id, iceServers, mediaMode: livekit ? 'sfu' : 'p2p' });
}
const c = clients.get((req.headers.authorization || '').replace(/^Bearer /, ''));
if (!c) fail('Sessão expirada. Entre novamente.', 401);
c.last = Date.now();
if (route === 'events') {
if (c.wait) reply(c.wait, 200, []);
clearTimeout(c.timer);
c.wait = res;
c.timer = setTimeout(() => { if (c.wait === res) { c.wait = null; reply(res, 200, []); } }, 25000);
res.on('close', () => { if (c.wait === res) { c.wait = null; clearTimeout(c.timer); } });
flush(c);
return;
}
if (route === 'create') {
if (c.room) fail('Saia da sala atual primeiro.');
let code;
const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
do { code = Array.from({ length: 6 }, () => alphabet[randomInt(alphabet.length)]).join(''); } while (rooms.has(code));
const room = { code, owner: c.token, members: new Set(), streamers: new Set() };
rooms.set(code, room);
c.room = code;
c.approved = true;
return reply(res, 200, { code, role: 'owner' });
}
if (route === 'join') {
if (c.room) fail('Saia da sala atual primeiro.');
const code = String(b.code || '').trim().toUpperCase();
const room = rooms.get(code);
if (!room) fail('Sala não encontrada ou encerrada.', 404);
if (room.members.size >= 5) fail('Sala cheia (máximo 5 participantes além do proprietário).', 409);
c.room = code;
c.approved = false;
room.members.add(c.token);
notifyOwnerRequest(room, c);
return reply(res, 200, { code, role: 'member' });
}
if (route === 'leave') {
if (livekit && c.room && rooms.get(c.room)?.owner===c.token) await livekitAdmin('DeleteRoom',c.room);
stopStreaming(c);
leave(c);
return reply(res, 200, { ok: true });
}
const room = rooms.get(c.room);
if (!room) fail('Você não está em nenhuma sala.', 404);
const isOwner = room.owner === c.token;
if (route === 'approve' || route === 'remove') {
if (!isOwner) fail('Apenas o proprietário pode gerenciar participantes.', 403);
const target = [...clients.values()].find(x => x.id === b.target && x.room === room.code);
if (!target || target === c) fail('Participante inválido.', 404);
if (route === 'approve') {
if (!target.approved) {
target.approved = true;
send(target, { type: 'approved' });
broadcastRoomState(room);
}
} else {
if(livekit && target.approved) await livekitAdmin('RemoveParticipant',room.code,target.id);
stopStreaming(target);
leave(target);
send(target, { type: 'removed' });
}
return reply(res, 200, { ok: true });
}
if (route === 'sfu-token') {
 if (!livekit) fail('Servidor SFU não configurado', 503);
 if (!c.approved && !isOwner) fail('Aprovação necessária', 403);
 return reply(res, 200, {url:livekit.url,token:jwtToken({key:livekit.key,secret:livekit.secret,identity:c.id,name:c.name,room:room.code,ttl:900})});
}
if (route === 'start-stream') {
if (!c.approved) fail('Você precisa ser aprovado para transmitir.', 403);
if (room.streamers.has(c.token)) fail('Você já está transmitindo.', 409);
room.streamers.add(c.token);
const targets = [room.owner, ...room.members];
for (const t of targets) {
const target = clients.get(t);
if (target && (t === room.owner || target.approved)) {
send(target, { type: 'stream-started', participantId: c.id, participantName: c.name });
}
}
broadcastRoomState(room);
return reply(res, 200, { ok: true });
}
if (route === 'stop-stream') {
stopStreaming(c);
return reply(res, 200, { ok: true });
}
if (route === 'signal') {
if (!c.approved && !isOwner) fail('Acesso negado.', 403);
const target = [...clients.values()].find(x => x.id === b.target && x.room === room.code);
if (!target || target === c) fail('Destino inválido.', 404);
const targetApproved = target.token === room.owner || target.approved;
if (!targetApproved) fail('Destino não autorizado.', 403);
if (!b.data || !['offer', 'answer', 'candidate'].includes(b.data.type)) fail('Sinal inválido.', 400);
send(target, { type: 'signal', from: c.id, data: b.data, streamId: b.streamId || null });
return reply(res, 200, { ok: true });
}
fail('Rota inválida.', 404);
}
if (req.method !== 'GET') fail('Método inválido', 405);
const files = {'/logo-simbolo1.png':'logo-simbolo1.png','/logo-simbolo2.png':'logo-simbolo2.png', '/': 'index.html', '/app.js': 'app.js', '/style.css': 'style.css', '/refinements.css':'refinements.css', '/livekit.bundle.js':'livekit.bundle.js' };
const file = files[url.pathname];
if (!file || (file==='livekit.bundle.js' && !fs.existsSync(path.join(__dirname,'public',file)))) fail('Não encontrado', 404);
res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data:; media-src 'self' blob:; connect-src 'self' https: wss: ws://localhost:* ws://127.0.0.1:* http://localhost:* http://127.0.0.1:*; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
const contentType = file.endsWith('.png') ? 'image/png' : file.endsWith('.js') ? 'text/javascript; charset=utf-8' : file.endsWith('.css') ? 'text/css; charset=utf-8' : 'text/html; charset=utf-8';
res.writeHead(200, { 'Content-Type': contentType });
fs.createReadStream(path.join(__dirname, 'public', file)).pipe(res);
} catch (e) {
if (!res.headersSent) reply(res, e.status || 500, { error: e.status ? e.message : 'Erro interno' });
else res.end();
}
});
const cleanup = setInterval(() => {
const now = Date.now();
for (const [token, c] of clients) {
if (now - c.last > 65000) {
stopStreaming(c);
leave(c);
if (c.wait) reply(c.wait, 401, { error: 'Sessão expirada' });
clients.delete(token);
}
}
for (const [ip, r] of rates) if (now - r.start > 60000) rates.delete(ip);
}, 10000);
cleanup.unref();
server.on('close', () => {
clearInterval(cleanup);
for (const c of clients.values()) { clearTimeout(c.timer); c.wait?.end(); }
});
return server;
}
if (require.main === module) {
const s = createServer();
s.listen(Number(process.env.PORT) || 3210, process.env.HOST || '0.0.0.0', () => console.log(`Zillu v0.6.0 em http://localhost:${s.address().port}`));
}
module.exports = { createServer };
