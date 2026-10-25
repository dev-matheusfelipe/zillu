const {app,BrowserWindow,ipcMain,desktopCapturer,session}=require('electron');
const path=require('node:path');
const {createCloudServer}=require('./cloud-server.cjs');
const Store=require('electron-store');
// Preserve pre-0.6 preferences even though the displayed product name changed.
const fs=require('node:fs');
for(const legacyName of ['Zullu','zullu-screen']){
 const legacyPath=path.join(app.getPath('appData'),legacyName);
 if(fs.existsSync(path.join(legacyPath,'zullu-config.json'))){app.setPath('userData',legacyPath);break;}
}

const store=new Store({name:'zullu-config',defaults:{serverUrl:'',lastName:'',lastQuality:'low',lastFps:30}});
let server,win,localOrigin,remoteUrl=null,selected;
const sameOrigin=(value,allowed)=>{try{return !!allowed&&new URL(value).origin===new URL(allowed).origin;}catch{return false;}};
const isTrusted=e=>{
 if(!win||e.sender!==win.webContents)return false;
 const frame=e.senderFrame;
 if(!frame||frame!==win.webContents.mainFrame)return false;
 return sameOrigin(frame.url,localOrigin)||sameOrigin(frame.url,remoteUrl);
};
const isCaptureTrusted=request=>{
 const frame=request.frame;
 return !!frame&&!!win&&frame===win.webContents.mainFrame&&
   (sameOrigin(frame.url,localOrigin)||sameOrigin(frame.url,remoteUrl))&&
   sameOrigin(frame.url,request.securityOrigin);
};
app.whenReady().then(async()=>{
 server=createCloudServer();
 await new Promise((res,rej)=>{server.once('error',rej);server.listen(0,'127.0.0.1',res);});
 localOrigin=`http://127.0.0.1:${server.address().port}`;
 ipcMain.handle('get-config',(e)=>{if(!isTrusted(e))throw Error('Origem inválida');return {serverUrl:'',lastName:store.get('lastName'),lastQuality:store.get('lastQuality'),lastFps:store.get('lastFps')};});
 ipcMain.handle('set-config',(e,data)=>{if(!isTrusted(e))throw Error('Origem inválida');const allowed={lastName:32,lastQuality:32,lastFps:3};if(!data||typeof data!=='object')throw Error('Configuração inválida');for(const[k,v]of Object.entries(data)){if(!(k in allowed))throw Error('Campo inválido');if(typeof v==='string'&&v.length>allowed[k])throw Error('Valor muito longo');store.set(k,v);}return true;});
 ipcMain.handle('connect-remote',()=>{throw Error('A API do Zillu já está configurada automaticamente.');});
 ipcMain.handle('disconnect-remote',()=>true);
 ipcMain.handle('get-fullscreen',e=>{if(!isTrusted(e))throw Error('Origem inválida');return win.isFullScreen();});
 ipcMain.handle('set-fullscreen',(e,value)=>{if(!isTrusted(e)||typeof value!=='boolean')throw Error('Origem inválida');win.setFullScreen(value);return win.isFullScreen();});
 ipcMain.handle('sources',async e=>{if(!isTrusted(e))throw Error('Origem inválida');return(await desktopCapturer.getSources({types:['screen','window'],thumbnailSize:{width:240,height:135}})).map(s=>({id:s.id,name:s.name,thumbnail:s.thumbnail.toDataURL()}));});
 ipcMain.handle('select-source',(e,id)=>{if(!isTrusted(e)||typeof id!=='string'||id.length>256)throw Error('Origem inválida');selected=id;});
 ipcMain.handle('replace-source',async(e,id)=>{if(!isTrusted(e)||typeof id!=='string'||id.length>256)throw Error('Origem inválida');selected=id;return{ok:true,requiresRecapture:true};});
 ipcMain.handle('system-audio-support',()=>process.platform==='win32');
 ipcMain.handle('clipboard-write',(e,text)=>{if(!isTrusted(e)){console.error('[IPC] clipboard-write rejeitado: origem não confiável');throw Error('Origem inválida');}if(typeof text!=='string'||text.length>2048)throw Error('Conteúdo inválido');require('electron').clipboard.writeText(text);console.log('[Electron] Clipboard escrito com sucesso.');return true;});
ipcMain.handle('notify-request',(e,name)=>{if(!isTrusted(e))return;if(win.isMinimized())win.restore();win.focus();win.flashFrame(true);setTimeout(()=>win.flashFrame(false),4000);});
 const ses=session.defaultSession;
 ses.setPermissionRequestHandler((contents,permission,callback,details)=>{
  const trusted=!!win&&contents===win.webContents&&
   (sameOrigin(details?.requestingUrl||contents.getURL(),localOrigin)||sameOrigin(details?.requestingUrl||contents.getURL(),remoteUrl));
  callback(trusted&&permission==='display-capture');
 });
 ses.setPermissionCheckHandler((contents,permission,requestingOrigin)=>
  permission==='display-capture'&&!!win&&contents===win.webContents&&
  (sameOrigin(requestingOrigin,localOrigin)||sameOrigin(requestingOrigin,remoteUrl)));
 ses.setDisplayMediaRequestHandler(async(request,callback)=>{
  console.log('[Electron] display capture request', {origin:request.securityOrigin,video:request.videoRequested,audio:request.audioRequested});
  try {
   if(!isCaptureTrusted(request)||!request.videoRequested||!selected){
    console.warn('[Electron] Captura recusada: origem, gesto ou fonte inválida');
    return callback(null);
   }
   // A seleção é consumida uma única vez, inclusive em caso de falha.
   const id=selected; selected=null;
   const sources=await desktopCapturer.getSources({types:['screen','window'],thumbnailSize:{width:0,height:0}});
   const source=sources.find(item=>item.id===id);
   if(!source){console.warn('[Electron] Fonte selecionada não encontrada');return callback(null);}
   // Electron 45: o callback recebe DesktopCapturerSource ({id,name}), NÃO uma MediaStreamTrack.
   // Áudio não solicitado é omitido; false não é um valor válido de audio neste callback.
   callback({video:source});
   console.log('[Electron] Fonte autorizada', {id:source.id,name:source.name});
  }catch(error){console.error('[Electron] Erro na captura',error);callback(null);}
 });
 win=new BrowserWindow({width:1280,height:850,minWidth:860,minHeight:680,title:'Zillu',titleBarStyle:'hidden',titleBarOverlay:{color:'#10141c',symbolColor:'#edf1f8',height:32},icon:path.join(__dirname,'public','zillu.ico'),backgroundColor:'#0c111b',autoHideMenuBar:true,webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true}});
 win.webContents.setWindowOpenHandler(()=>({action:'deny'}));
 win.webContents.on('will-navigate',(event,url)=>{
  const allowed=[localOrigin+'/',remoteUrl&&remoteUrl+'/'].filter(Boolean);
  if(!allowed.some(a=>sameOrigin(url,a)))event.preventDefault();
 });
 win.on('enter-full-screen',()=>win.webContents.send('fullscreen-changed',true));
 win.on('leave-full-screen',()=>win.webContents.send('fullscreen-changed',false));
 win.webContents.on('before-input-event',(event,input)=>{if(input.type==='keyDown'&&input.key==='Escape'&&win.isFullScreen()){event.preventDefault();win.setFullScreen(false);}});
 await win.loadURL(localOrigin+'/');
});
app.on('window-all-closed',()=>app.quit());
app.on('before-quit',()=>{server?.close();server?.closeAllConnections?.();});
