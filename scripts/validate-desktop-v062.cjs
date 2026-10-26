const assert=require('node:assert/strict');
const {_electron:electron}=require(process.env.ZILLU_PLAYWRIGHT_PATH||process.env.TEMP+'/zillu-ui-validation/node_modules/playwright');
const {createServer}=require('../server.cjs');
(async()=>{
 const server=createServer({mediaCommand:async()=>{}});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const local='http://127.0.0.1:'+server.address().port;
 const apps=[],pages=[],saved=[];const errors=[],results=[];
 try{
  for(let i=0;i<2;i++){
   const app=await electron.launch({executablePath:require('electron'),args:['.'],env:Object.fromEntries(Object.entries(process.env).filter(([key])=>key!=='ELECTRON_RUN_AS_NODE'))});apps.push(app);
   const page=await app.firstWindow();pages.push(page);page.on('pageerror',error=>errors.push(error.message));await page.waitForLoadState('domcontentloaded');saved.push(await page.evaluate(()=>window.zulluDesktop.getConfig()));
   await page.route('**/api/**',async route=>{const req=route.request();try{const upstream=await fetch(local+new URL(req.url()).pathname,{method:req.method(),headers:{'Content-Type':'application/json',...(req.headers().authorization?{Authorization:req.headers().authorization}:{})},body:req.postData()});await route.fulfill({status:upstream.status,contentType:'application/json',body:await upstream.text()});}catch{await route.abort();}});
  }
  const [owner,admin]=pages;await owner.fill('#name','Dono da sala');await owner.click('#create');await owner.locator('#room').waitFor({state:'visible'});const code=await owner.locator('#copy').textContent();
  await admin.fill('#name','Administrador de nome bem longo');await admin.click('#tab-view');await admin.fill('#code',code);await admin.click('#join');await owner.locator('#requests-list .primary').waitFor();await owner.locator('#requests-list .primary').click();await admin.waitForFunction(()=>$('share-screen').disabled===false);
  await owner.locator('.participant-more').click();await owner.getByRole('menuitem',{name:'Tornar administrador',exact:true}).click();await admin.waitForFunction(()=>role==='admin');results.push({rolesSynced:true});
  assert.equal(await admin.locator('.participant-status[aria-label="Administrador"]').count(),1);
  await owner.evaluate(()=>{
   const canvas=document.createElement('canvas');canvas.width=1280;canvas.height=720;const context=canvas.getContext('2d');context.fillStyle='#152638';context.fillRect(0,0,1280,720);context.fillStyle='#a7c7ff';context.font='34px sans-serif';context.fillText('Transmissão de teste',100,180);window.fixtureStream=canvas.captureStream(15);
   for(let i=0;i<3;i++){participantNames.set('fixture-'+i,'Tela '+(i+1));remoteStreams.set('fixture-'+i,fixtureStream);}layoutMode='focus';focusedStreamId='fixture-0';renderStreams();
  });
  await owner.locator('.focus-main .minimize-stream').click();assert.equal(await owner.evaluate(()=>focusedStreamId),'fixture-0');assert.equal(await owner.locator('#minimized-streams button').count(),1);assert.equal(await owner.evaluate(()=>remoteStreams.size),3);
  await owner.locator('#minimized-streams button').click();assert.equal(await owner.evaluate(()=>document.querySelector('.focus-main').dataset.streamId),'fixture-0');results.push({minimizeRestorePreservesFocus:true,noTracksStopped:await owner.evaluate(()=>fixtureStream.getVideoTracks()[0].readyState==='live')});
  assert.equal(await admin.locator('.participant-more').count(),0);
  for(let i=0;i<3;i++)await owner.locator('.focus-main .minimize-stream').click();
  assert.equal(await owner.locator('#minimized-streams button').count(),3);assert(await owner.locator('#focus-container').isHidden());assert.equal(await owner.evaluate(()=>remoteStreams.size),3);
  while(await owner.locator('#minimized-streams button').count())await owner.locator('#minimized-streams button').first().click();
  assert.equal(await owner.evaluate(()=>focusedStreamId),'fixture-0');results.push({allMinimizedRestored:true,adminCannotManageOwner:true});
  for(const size of [[1280,720],[1366,768],[1920,1080],[860,680]]){
   await apps[0].evaluate(({BrowserWindow},size)=>BrowserWindow.getAllWindows()[0].setSize(...size),size);
   const layout=await owner.evaluate(()=>({overflow:document.documentElement.scrollHeight>innerHeight,toolbar:[...document.querySelectorAll('.control-buttons button:not([hidden])')].every(button=>button.getBoundingClientRect().right<innerWidth&&button.querySelector('use'))}));assert(!layout.overflow);assert(layout.toolbar);results.push({size,iconsAndControls:true});
  }
  await apps[0].evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(1280,720));await owner.click('#toggle-layout');await owner.mouse.move(10,110);await owner.evaluate(()=>$('toast').hidden=true);await owner.screenshot({path:'docs/versions/zillu-0.6.2-room.png'});
  const sprite=await owner.evaluate(async()=>new DOMParser().parseFromString(await(await fetch('/icons.svg')).text(),'image/svg+xml').querySelectorAll('symbol').length);assert(sprite>=25);assert.equal(await owner.locator('#share-audio').isChecked(),false);results.push({lucideSymbols:sprite,audioOffByDefault:true});
  const incoming=await(await fetch(local+'/api/connect',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'Terceiro participante'})})).json();
  await fetch(local+'/api/join',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+incoming.token},body:JSON.stringify({code})});
  await admin.locator('#requests-list .primary').waitFor();await admin.locator('#requests-list .primary').click();results.push({adminApproval:true});
  await owner.click('#leave');await owner.click('#accept-action');await owner.locator('#lobby').waitFor({state:'visible'});await admin.waitForFunction(()=>role==='owner');results.push({ownerExitKeepsRoom:true,adminBecomesOwner:true});
  await admin.click('#end-room');await admin.click('#accept-action');await admin.locator('#lobby').waitFor({state:'visible'});assert.equal(await server.db.json('z:room:'+code),null);results.push({explicitEnd:true,errors});assert.deepEqual(errors,[]);
  require('fs').writeFileSync('docs/versions/zillu-0.6.2-desktop-validation.json',JSON.stringify(results,null,2));console.log(JSON.stringify(results));
 }finally{
  for(let i=0;i<pages.length;i++)if(saved[i])await pages[i].evaluate(config=>window.zulluDesktop.setConfig({lastName:config.lastName,lastQuality:config.lastQuality,lastFps:config.lastFps}),saved[i]).catch(()=>{});
  for(const app of apps.reverse())await app.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));
 }
})().catch(error=>{console.error(error);process.exit(1);});
