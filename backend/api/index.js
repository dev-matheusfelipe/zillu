'use strict';
const {RedisStore}=require('../lib/redis.cjs');
const {readJsonBody}=require('../lib/body.cjs');
const {RoomService,keys,TTL}=require('../lib/room-service.cjs');
const {livekitConfig,flushMediaJob}=require('../lib/livekit.cjs');
function createHandler({dbFactory=()=>new RedisStore(),livekit,pollIterations=16,pollDelay=500,mediaCommand}={}){
 return async function handler(req,res){
  res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Access-Control-Allow-Methods','POST,OPTIONS');res.setHeader('Access-Control-Allow-Headers','Content-Type,Authorization');
  const allowed=process.env.ZULLU_ALLOWED_ORIGIN,origin=req.headers.origin;
  if(allowed&&origin&&origin!==allowed)return end(res,403,{error:'Origem não autorizada'});
  if(origin&&origin===allowed)res.setHeader('Access-Control-Allow-Origin',origin);
  if(req.method==='OPTIONS'){res.statusCode=204;return res.end();}if(req.method!=='POST')return end(res,405,{error:'Método não permitido'});
  try{
   const parsed=new URL(req.url,'https://zillu.invalid'),route=String(req.query?.route||parsed.searchParams.get('route')||parsed.pathname.replace(/^\/api\//,'')).trim();
   const body=await readJsonBody(req),db=dbFactory(),config=livekit===undefined?livekitConfig():livekit;
   const service=new RoomService(db,{livekit:config});
   if(route==='health')return end(res,200,{ok:true,service:'zillu-api',apiVersion:'0.6.3',mediaMode:config?'sfu':'p2p'});
   if(route==='connect')return end(res,200,await service.connect(body.name));
   const token=(req.headers.authorization||'').replace(/^Bearer /,'');
   if(route==='diagnose-room'){
    if(!await db.json(keys.session(token)))return end(res,401,{error:'Sessão expirada'});
    const code=String(body.code||'').trim().toUpperCase();if(!/^[A-HJ-NP-Z2-9]{6}$/.test(code))return end(res,400,{error:'Código inválido'});
    return end(res,200,{code,exists:Boolean(await db.json(keys.room(code))),ttl:await db.cmd('TTL',keys.room(code)),store:db.fingerprint});
   }
   if(route==='events'){
    await service.operate(token,'heartbeat');
    const mediaReady=await flushMediaJob(db,config,mediaCommand);
    const current=await db.json(keys.session(token));const events=[];
    for(let i=0;i<pollIterations;i++){let event;while(events.length<50&&(event=await db.pop(current.id)))events.push(event);if(events.length)break;await new Promise(resolve=>setTimeout(resolve,pollDelay));}
    if(!mediaReady)console.warn('[Zillu] Há trabalhos de revogação em espera.');
    return end(res,200,events);
   }
   const result=await service.operate(token,route,body);
   const mediaReady=await flushMediaJob(db,config,mediaCommand);if(!mediaReady)result.mediaPending=true;
   return end(res,200,result);
  }catch(error){return end(res,error.status||500,{error:error.status?error.message:'Erro interno'});}
 };
}
function end(res,status,data){res.statusCode=status;return res.end(JSON.stringify(data));}
module.exports=createHandler();module.exports.createHandler=createHandler;
