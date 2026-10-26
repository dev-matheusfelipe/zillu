'use strict';
// The same CAS contract as Redis, for local development and deterministic tests.
class MemoryStore{
 constructor(){this.values=new Map();this.lists=new Map();this.deadlines=new Map();this.fingerprint='local-memory';}
 async get(key){if(this.deadlines.has(key)&&Date.now()>=this.deadlines.get(key)){this.values.delete(key);this.deadlines.delete(key);}return this.values.get(key)??null;}
 async json(key){const raw=await this.get(key);return raw?JSON.parse(raw):null;}
 async set(key,value,ttl=3600){this.values.set(key,JSON.stringify(value));this.deadlines.set(key,Date.now()+ttl*1000);return 'OK';}
 async del(key){this.values.delete(key);this.deadlines.delete(key);}
 async enqueue(id,event){await this.cmd('LPUSH','z:events:'+id,JSON.stringify(event));}
 async pop(id){const raw=await this.cmd('RPOP','z:events:'+id);return raw?JSON.parse(raw):null;}
 async cmd(command,key,...args){
  const list=this.lists.get(key)||[];
  if(command==='LRANGE'){const start=Number(args[0])<0?Math.max(0,list.length+Number(args[0])):Number(args[0]);const last=Number(args[1])<0?list.length+Number(args[1]):Number(args[1]);return list.slice(start,last+1);}
  if(command==='LINDEX')return list[Number(args[0])<0?list.length+Number(args[0]):Number(args[0])]??null;
  if(command==='LREM'){const index=list.indexOf(args[1]);if(index>=0)list.splice(index,1);return index>=0?1:0;}
  if(command==='LPUSH'){list.unshift(args[0]);this.lists.set(key,list);return list.length;}
  if(command==='RPOP')return list.pop()??null;
  if(command==='TTL'){await this.get(key);return this.values.has(key)?Math.max(0,Math.floor((this.deadlines.get(key)-Date.now())/1000)):-2;}
  throw Error('Unsupported memory command '+command);
 }
 async commit(tx){
  // Do not yield between checking snapshots and applying writes.
  for(const [key,raw] of tx.expected){if(this.deadlines.has(key)&&Date.now()>=this.deadlines.get(key)){this.values.delete(key);this.deadlines.delete(key);}if((this.values.get(key)??null)!==raw)return false;}
  for(const [key,item] of tx.writes){if(item.value===null){this.values.delete(key);this.deadlines.delete(key);}else{this.values.set(key,item.value);if(item.ttl)this.deadlines.set(key,Date.now()+item.ttl*1000);}}
  for(const {id,event} of tx.events){const key='z:events:'+id,list=this.lists.get(key)||[];list.unshift(JSON.stringify(event));this.lists.set(key,list.slice(0,200));}
  for(const job of tx.jobs){const list=this.lists.get('z:media-jobs')||[];list.unshift(JSON.stringify(job));this.lists.set('z:media-jobs',list);}
  return true;
 }
}
module.exports={MemoryStore};
