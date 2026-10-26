'use strict';
const net=require('node:net'),http=require('node:http');
function command(args,port){return new Promise((resolve,reject)=>{
 const socket=net.createConnection({host:'127.0.0.1',port});let buffer=Buffer.alloc(0);socket.setTimeout(5000,()=>socket.destroy(Error('Redis TCP timeout')));socket.on('error',reject);
 socket.on('connect',()=>{const chunks=[Buffer.from('*'+args.length+'\r\n')];for(const value of args){const data=Buffer.from(String(value));chunks.push(Buffer.from('$'+data.length+'\r\n'),data,Buffer.from('\r\n'));}socket.write(Buffer.concat(chunks));});
 socket.on('data',chunk=>{buffer=Buffer.concat([buffer,chunk]);try{const result=parse(buffer,0);if(result){socket.end();resolve(result[0]);}}catch(error){socket.destroy();reject(error);}});
});}
function parse(buffer,offset){const end=buffer.indexOf('\r\n',offset);if(end<0)return null;const tag=String.fromCharCode(buffer[offset]),line=buffer.toString('utf8',offset+1,end),start=end+2;
 if(tag==='+')return[line,start];if(tag==='-')throw Error(line);if(tag===':')return[Number(line),start];
 if(tag==='$'){const size=Number(line);if(size<0)return[null,start];if(buffer.length<start+size+2)return null;return[buffer.toString('utf8',start,start+size),start+size+2];}
 if(tag==='*'){const count=Number(line);if(count<0)return[null,start];let next=start,items=[];for(let index=0;index<count;index++){const item=parse(buffer,next);if(!item)return null;items.push(item[0]);next=item[1];}return[items,next];}throw Error('Unknown RESP type');
}
async function restProxy(port){
 const server=http.createServer(async(req,res)=>{try{let body='';for await(const chunk of req)body+=chunk;const result=await command(JSON.parse(body),port);res.setHeader('Content-Type','application/json');res.end(JSON.stringify({result}));}catch(error){res.statusCode=500;res.end(JSON.stringify({error:error.message}));}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));return{url:'http://127.0.0.1:'+server.address().port,close:()=>new Promise(resolve=>{server.closeAllConnections();server.close(resolve);})};
}
module.exports={command,restProxy};
