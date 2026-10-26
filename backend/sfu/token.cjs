'use strict';
const {createHmac}=require('node:crypto');
function jwtToken({key,secret,identity,name,room,ttl=3600,admin=false,roomCreate=false}){
 if(!key||!secret||!identity||!room)throw Error('LiveKit não configurado');
 const now=Math.floor(Date.now()/1000);
 const payload={iss:key,sub:identity,name,iat:now,nbf:now,exp:now+ttl,video:admin?(roomCreate?{roomCreate:true}:{roomAdmin:true,room}):{roomJoin:true,room,canPublish:true,canSubscribe:true,canPublishData:false}};
 const b64=v=>Buffer.from(JSON.stringify(v)).toString('base64url');
 const body=b64({alg:'HS256',typ:'JWT'})+'.'+b64(payload);
 return body+'.'+createHmac('sha256',secret).update(body).digest('base64url');
}
module.exports={jwtToken};
