'use strict';
const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const {MemoryStore}=require('./backend/lib/memory.cjs');
const {createHandler}=require('./backend/api/index.js');
function createServer(options={}){
 const db=options.db||new MemoryStore();
 const livekit=options.livekit===undefined?require('./backend/lib/livekit.cjs').livekitConfig():options.livekit;
 const handler=createHandler({dbFactory:()=>db,livekit,pollIterations:16,pollDelay:500,mediaCommand:options.mediaCommand});
 const reply=(res,status,data)=>{res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(data));};
 const fail=(message,status=400)=>{throw Object.assign(Error(message),{status});};
 const server=http.createServer(async(req,res)=>{
  const url=new URL(req.url,'http://localhost');
  if(url.pathname.startsWith('/api/'))return handler(req,res);
  try{
if (req.method !== 'GET') fail('Método inválido', 405);
const files = {'/icons.svg':'icons.svg','/logo-simbolo1.png':'logo-simbolo1.png','/logo-simbolo2.png':'logo-simbolo2.png', '/': 'index.html', '/app.js': 'app.js', '/style.css': 'style.css', '/refinements.css':'refinements.css', '/livekit.bundle.js':'livekit.bundle.js' };
const file = files[url.pathname];
if (!file || (file==='livekit.bundle.js' && !fs.existsSync(path.join(__dirname,'public',file)))) fail('Não encontrado', 404);
res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data:; media-src 'self' blob:; connect-src 'self' https: wss: ws://localhost:* ws://127.0.0.1:* http://localhost:* http://127.0.0.1:*; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
const contentType = file.endsWith('.svg') ? 'image/svg+xml' : file.endsWith('.png') ? 'image/png' : file.endsWith('.js') ? 'text/javascript; charset=utf-8' : file.endsWith('.css') ? 'text/css; charset=utf-8' : 'text/html; charset=utf-8';
res.writeHead(200, { 'Content-Type': contentType });
fs.createReadStream(path.join(__dirname, 'public', file)).pipe(res);
  }catch(error){if(!res.headersSent)reply(res,error.status||500,{error:error.status?error.message:'Erro interno'});else res.end();}
 });
 server.db=db;return server;
}
if(require.main===module){const server=createServer();server.listen(Number(process.env.PORT)||3210,process.env.HOST||'0.0.0.0',()=>console.log('Zillu v0.6.2 em http://localhost:'+server.address().port));}
module.exports={createServer};
