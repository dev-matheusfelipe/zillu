// Electron-only cloud gateway: local UI, fixed trusted API destination.
'use strict';
const http=require('node:http');
const fs=require('node:fs');
const path=require('node:path');
const API_ORIGIN='https://zillu-backend.vercel.app';
const ASSETS={'/app-audio-worklet.js':'app-audio-worklet.js','/icons.svg':'icons.svg','/logo-simbolo1.png':'logo-simbolo1.png','/logo-simbolo2.png':'logo-simbolo2.png','/':'index.html','/app.js':'app.js','/style.css':'style.css','/refinements.css':'refinements.css','/livekit.bundle.js':'livekit.bundle.js'};
const TYPES={'.svg':'image/svg+xml','.png':'image/png','.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8'};
function createCloudServer(options={}){
 const fetchImpl=options.fetchImpl||fetch;
 const remote=options.apiOrigin||API_ORIGIN;
 if(new URL(remote).protocol!=='https:')throw Error('API precisa usar HTTPS');
 return http.createServer(async(req,res)=>{
  res.setHeader('Cache-Control','no-store');
  res.setHeader('X-Content-Type-Options','nosniff');
  try{
   const url=new URL(req.url,'http://localhost');
   if(url.pathname.startsWith('/api/')){
    if(req.method!=='POST')return reply(res,405,{error:'Método inválido'});
    if(!/^\/api\/[a-z-]+$/.test(url.pathname))return reply(res,404,{error:'Rota inválida'});
    let body='';for await(const chunk of req){body+=chunk;if(body.length>65536)return reply(res,413,{error:'Requisição muito grande'});}
    const upstream=await fetchImpl(remote+url.pathname,{method:'POST',headers:{'Content-Type':'application/json',...(req.headers.authorization?{Authorization:req.headers.authorization}:{})},body:body||'{}',signal:AbortSignal.timeout(15000)});
    res.statusCode=upstream.status;
    res.setHeader('Content-Type','application/json; charset=utf-8');
    return res.end(await upstream.text());
   }
   if(req.method!=='GET')return reply(res,405,{error:'Método inválido'});
   const name=ASSETS[url.pathname];if(!name)return reply(res,404,{error:'Arquivo não encontrado'});
   const file=path.join(__dirname,'public',name);
   if(!fs.existsSync(file))return reply(res,503,{error:'Bundle LiveKit ausente. Execute npm run build:web'});
   res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data:; media-src 'self' blob:; connect-src 'self' https: wss:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
   res.setHeader('Content-Type',TYPES[path.extname(file)]);
   fs.createReadStream(file).pipe(res);
  }catch(err){if(!res.headersSent)reply(res,502,{error:'Servidor Zillu indisponível. Verifique a conexão à internet.'});else res.end();}
 });
}
function reply(res,status,data){res.statusCode=status;res.setHeader('Content-Type','application/json; charset=utf-8');res.end(JSON.stringify(data));}
module.exports={createCloudServer,API_ORIGIN};
