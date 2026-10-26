const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('zulluDesktop',{
  sources:()=>ipcRenderer.invoke('sources'),
  selectSource:(id)=>ipcRenderer.invoke('select-source',id),
  replaceSource:(id)=>ipcRenderer.invoke('replace-source',id),
  getSystemAudioSupport:()=>ipcRenderer.invoke('system-audio-support'),
  notifyRequest:(name)=>ipcRenderer.invoke('notify-request',name),
  getConfig:()=>ipcRenderer.invoke('get-config'),
  setConfig:(data)=>ipcRenderer.invoke('set-config',data),
  connectRemote:(url)=>ipcRenderer.invoke('connect-remote',url),
  disconnectRemote:()=>ipcRenderer.invoke('disconnect-remote'),
  clipboardWrite:(text)=>ipcRenderer.invoke('clipboard-write',text),
  getFullscreen:()=>ipcRenderer.invoke('get-fullscreen'),
  setFullscreen:value=>ipcRenderer.invoke('set-fullscreen',value),
  onFullscreenChanged:callback=>{const listener=(_event,value)=>callback(value);ipcRenderer.on('fullscreen-changed',listener);return()=>ipcRenderer.removeListener('fullscreen-changed',listener);},
  audioApplications:()=>ipcRenderer.invoke('audio-applications'),
  startApplicationAudio:pid=>ipcRenderer.invoke('start-app-audio',pid),
  stopApplicationAudio:()=>ipcRenderer.invoke('stop-app-audio'),
  onApplicationAudio:callback=>{const listener=(_event,data)=>callback(data);ipcRenderer.on('app-audio-data',listener);return()=>ipcRenderer.removeListener('app-audio-data',listener);},
  onApplicationAudioEnded:callback=>{const listener=(_event,data)=>callback(data);ipcRenderer.on('app-audio-ended',listener);return()=>ipcRenderer.removeListener('app-audio-ended',listener);},
  isDesktop:true
});
