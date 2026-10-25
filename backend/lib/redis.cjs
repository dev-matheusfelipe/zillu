'use strict';
class RedisStore {
 constructor(env=process.env){this.url=env.KV_REST_API_URL||env.UPSTASH_REDIS_REST_URL;this.token=env.KV_REST_API_TOKEN||env.UPSTASH_REDIS_REST_TOKEN;if(!this.url||!this.token)throw Object.assign(new Error('Configure UPSTASH_REDIS_REST_URL e UPSTASH_REDIS_REST_TOKEN'),{status:503});}
 async cmd(...args){const res=await fetch(this.url.replace(/\/$/,'')+'/',{method:'POST',headers:{Authorization:'Bearer '+this.token,'Content-Type':'application/json'},body:JSON.stringify(args),signal:AbortSignal.timeout(7000)});if(!res.ok)throw Error('Banco temporariamente indisponível ('+res.status+')');const body=await res.json();if(body.error)throw Error('Falha na operação de armazenamento');return body.result;}
 get(k){return this.cmd('GET',k)}
 set(k,v,ttl=120){return this.cmd('SET',k,JSON.stringify(v),'EX',ttl)}
 async json(k){const v=await this.get(k);return v?JSON.parse(v):null}
 del(k){return this.cmd('DEL',k)}
 exists(k){return this.cmd('EXISTS',k)}
 async enqueue(id,event){await this.cmd('LPUSH','z:events:'+id,JSON.stringify(event));await this.cmd('LTRIM','z:events:'+id,0,199);await this.cmd('EXPIRE','z:events:'+id,180)}
 async pop(id){const e=await this.cmd('RPOP','z:events:'+id);return e?JSON.parse(e):null}
}
module.exports={RedisStore};
