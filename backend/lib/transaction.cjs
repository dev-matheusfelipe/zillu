'use strict';
// Compare-and-set every observed key, write state and enqueue notifications in one Redis operation.
const COMMIT_LUA=`
local tx=cjson.decode(ARGV[1])
for _,entry in ipairs(tx.expected) do
 local current=redis.call('GET',entry[1])
 if entry[2]==cjson.null then if current then return 0 end
 elseif current~=entry[2] then return 0 end
end
for _,entry in ipairs(tx.writes) do
 local key=entry[1];local item=entry[2]
 if item.value==cjson.null then redis.call('DEL',key)
 elseif item.ttl==0 then redis.call('SET',key,item.value,'KEEPTTL')
 else redis.call('SET',key,item.value,'EX',item.ttl) end
end
for _,item in ipairs(tx.events) do
 local key='z:events:'..item.id
 redis.call('LPUSH',key,cjson.encode(item.event));redis.call('LTRIM',key,0,199);redis.call('EXPIRE',key,3600)
end
for _,job in ipairs(tx.jobs) do redis.call('LPUSH','z:media-jobs',cjson.encode(job)) end
if #tx.jobs>0 then redis.call('EXPIRE','z:media-jobs',3600) end
return 1`;
module.exports={COMMIT_LUA};
