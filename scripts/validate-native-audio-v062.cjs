const assert=require('node:assert/strict');
const {_electron:electron}=require(process.env.ZILLU_PLAYWRIGHT_PATH||process.env.TEMP+'/zillu-ui-validation/node_modules/playwright');
const {createServer}=require('../server.cjs');
(async()=>{const server=createServer({mediaCommand:async()=>{}});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+server.address().port;let app,page,saved;
 try{
 app=await electron.launch({executablePath:require('electron'),args:['.'],env:Object.fromEntries(Object.entries(process.env).filter(([key])=>key!=='ELECTRON_RUN_AS_NODE'))});page=await app.firstWindow();await page.waitForLoadState('domcontentloaded');saved=await page.evaluate(()=>window.zulluDesktop.getConfig());
 await page.route('**/api/**',async route=>{const request=route.request();try{const response=await fetch(base+new URL(request.url()).pathname,{method:request.method(),headers:{'Content-Type':'application/json',...(request.headers().authorization?{Authorization:request.headers().authorization}:{})},body:request.postData()});await route.fulfill({status:response.status,contentType:'application/json',body:await response.text()});}catch{await route.abort();}});
 await page.fill('#name','Teste nativo local');await page.click('#create');await page.locator('#room').waitFor();
 await page.evaluate(()=>{window.microphoneAttempts=0;navigator.mediaDevices.getUserMedia=async()=>{window.microphoneAttempts++;throw Error('Microfone proibido neste teste');};});
 await page.click('#share-screen');await page.locator('#sources').waitFor({state:'visible'});await page.click('#source-monitors');await page.locator('.source-option').first().click();assert.equal(await page.locator('#share-audio').isChecked(),false);await page.click('#confirm-source');await page.waitForFunction(()=>!!myStream);assert.equal(await page.evaluate(()=>myStream.getAudioTracks().length),0);
 const originalVideo=await page.evaluate(()=>myStream.getVideoTracks()[0].id);
 await page.click('#sharing-settings');await page.check('#settings-share-audio');await page.waitForFunction(()=>myStream?.getAudioTracks().length===1,{timeout:20000});
 assert.equal(await page.evaluate(()=>myStream.getVideoTracks()[0].id),originalVideo);assert.equal(await page.evaluate(()=>microphoneAttempts),0);assert.equal(await page.evaluate(()=>myStream.getAudioTracks()[0].readyState),'live');
 await page.uncheck('#settings-share-audio');await page.waitForFunction(()=>myStream.getAudioTracks().length===0);assert.equal(await page.evaluate(()=>myStream.getVideoTracks()[0].id),originalVideo);assert.equal(await page.evaluate(()=>myStream.getVideoTracks()[0].readyState),'live');
 const report={videoOnlyByDefault:true,nativeSystemAudioTrack:true,microphoneAttempts:0,audioTogglePreservesVideo:true,applicationIsolationSupported:false,discordExclusionVerified:false};
 require('fs').writeFileSync('docs/versions/zillu-0.6.2-native-audio-validation.json',JSON.stringify(report,null,2));console.log(report);
 await page.click('#close-settings');await page.click('#stop-stream');await page.click('#end-room');await page.click('#accept-action');
 }finally{if(saved&&page)await page.evaluate(config=>window.zulluDesktop.setConfig({lastName:config.lastName,lastQuality:config.lastQuality,lastFps:config.lastFps}),saved).catch(()=>{});await app?.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exit(1)});
