const {_electron:electron}=require(process.env.ZILLU_PLAYWRIGHT_PATH || 'playwright');
(async()=>{
 const app=await electron.launch({executablePath:require('electron'),args:['.'],env:Object.fromEntries(Object.entries(process.env).filter(([key])=>key!=='ELECTRON_RUN_AS_NODE'))});
 const page=await app.firstWindow();const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.waitForLoadState('domcontentloaded');
 if(await page.title()!=='Zillu')throw Error('Título incorreto');
 if(await page.locator('header').isVisible())throw Error('Faixa visível na entrada');
 if(await page.locator('.setup h1').textContent()!=='Dev.matheusFelipe')throw Error('Mensagem incorreta');
 await page.screenshot({path:'docs/versions/zillu-0.6.0-corrections-lobby.png'});
 const report=[];
 for(const size of [[1280,720],[1366,768],[1920,1080],[860,680]]){
 await app.evaluate(({BrowserWindow},size)=>BrowserWindow.getAllWindows()[0].setSize(...size),size);
 report.push({size,lobby:await page.evaluate(()=>({overflow:document.documentElement.scrollHeight>innerHeight,logo:document.querySelector('.lobby-brand img').naturalWidth}))});
 }
 await page.evaluate(()=>{document.getElementById('lobby').hidden=true;document.getElementById('room').hidden=false;role='owner';myId='me';updateParticipants([{id:'me',name:'Matheus',role:'owner',approved:true,streaming:true},{id:'remote1',name:'Ana',approved:true,streaming:true}]);});
 for(const size of [[1280,720],[1366,768],[1920,1080],[860,680]]){
 await app.evaluate(({BrowserWindow},size)=>BrowserWindow.getAllWindows()[0].setSize(...size),size);
 for(let count=1;count<=6;count++){
 await page.evaluate(count=>{remoteStreams.clear();for(let i=0;i<count;i++)remoteStreams.set('remote'+i,new MediaStream());layoutMode='grid';renderStreams();},count);
 await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
 const measure=await page.evaluate(()=>({overflow:document.documentElement.scrollHeight>innerHeight,cards:[...document.querySelectorAll('#streams-grid .stream-card')].map(e=>({w:e.clientWidth,h:e.clientHeight})),controls:document.querySelector('.stage-controls').getBoundingClientRect().bottom<innerHeight}));
 if(measure.overflow||!measure.controls||measure.cards.some(c=>c.w<50||c.h<50||Math.abs(c.w/c.h-16/9)>.04))throw Error(JSON.stringify({size,count,measure}));
 }
 report.push({size,grid:'1–6 em 16:9, sem overflow'});
 }
 await page.hover('#sharing-settings');await page.locator('#app-tooltip').waitFor({state:'visible'});
 if(await page.locator('#sharing-settings').getAttribute('title'))throw Error('Tooltip nativo permanece');
 if(await page.locator('#open-diagnostics').count())throw Error('Botão conexão permanece');
 report.push({customTooltip:true,noConnectionDialog:true});
 await page.click('#toggle-layout');if(await page.locator('#focus-container').isHidden())throw Error('Foco não abriu');
 await page.locator('#focus-strip .stream-card').first().click();
 await page.click('#fullscreen');await page.waitForTimeout(500);
 report.push({fullscreen:await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].isFullScreen())});
 await page.keyboard.press('Escape');await page.waitForTimeout(500);
 report.push({escape:!(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].isFullScreen())),button:await page.locator('#fullscreen').getAttribute('aria-pressed')});
 await page.evaluate(()=>{remoteStreams.clear();layoutMode='grid';renderStreams();});
 await page.click('#share-screen');await page.waitForTimeout(500);
 await page.locator('#sources').waitFor({state:'visible'});report.push({captureModal:await page.locator('#sources').isVisible(),windows:await page.locator('.source-option').count()});
 await page.click('#source-monitors');report.push({monitors:await page.locator('.source-option').count()});
 await page.screenshot({path:'docs/versions/zillu-0.6.0-capture.png'});await page.click('#cancel-source');
 await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(1280,720));
 await page.evaluate(()=>{for(let i=0;i<4;i++)remoteStreams.set('remote'+i,new MediaStream());renderStreams();});
 await page.screenshot({path:'docs/versions/zillu-0.6.0-corrections-room.png'});
 report.push({errors});require('fs').writeFileSync('docs/versions/zillu-0.6.0-corrections-validation.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));await app.close();
})().catch(e=>{console.error(e);process.exit(1)});
