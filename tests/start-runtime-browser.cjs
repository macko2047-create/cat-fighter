'use strict';
// Reproduce a stale cached dependency, then verify versioned assets with real RAF.
const {chromium}=require('playwright'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
(async()=>{
 const browser=await chromium.launch({headless:true});
 try {
  for(const [legacy,model] of [[true,0],[false,0],[false,1]]) {
   const page=await browser.newPage({viewport:{width:390,height:844},hasTouch:true});
   const errors=[],enemyRequests=[];
   page.on('pageerror',e=>errors.push(e.message));
   await page.route('http://catfighter.test/**',async route=>{
    const url=new URL(route.request().url()),name=url.pathname==='/'?'index.html':url.pathname.slice(1);
    const file=path.join(root,name);
    if(!fs.existsSync(file)){await route.fulfill({status:404,body:''});return;}
    let body=fs.readFileSync(file);
    if(name==='index.html'&&legacy)body=body.toString().replace(/\?v=[a-f0-9]+/g,'');
    if(name==='src/enemies.js') {
     enemyRequests.push(url.search);
     if(!url.search)body=body.toString().replace(/\/\/ Gameplay and authored demo examples[\s\S]*?(?=\/\/ Authored wave routes)/,'');
    }
    const types={'.html':'text/html','.js':'application/javascript','.css':'text/css','.png':'image/png','.woff2':'font/woff2','.wav':'audio/wav','.mp3':'audio/mpeg'};
    await route.fulfill({body,contentType:types[path.extname(file)]||'application/octet-stream'});
   });
   await page.goto('http://catfighter.test/');
   await page.locator('#boot').tap();await page.locator('#demo-start').waitFor();
   await page.locator('#demo-start').tap();
   await page.locator(`[data-slot="0"][data-model="${model}"]`).tap();
   await page.locator('#pilot-confirm-0').tap();await page.locator('#start').tap();
   if(legacy) {
    await page.waitForFunction(()=>wave===1);
    assert.ok(errors.some(e=>e.includes('formationReward is not defined')),'old unversioned assets reproduce the reported startup crash');
   } else {
    await page.waitForFunction(()=>mode==='playing'&&elapsed>.5);
    const first=await page.evaluate(()=>elapsed);
    await page.waitForFunction(t=>elapsed>t+1,first);
    assert.deepEqual(errors,[]);
    assert.ok(enemyRequests.every(q=>/^\?v=[a-f0-9]{12}$/.test(q)));
    assert.equal(await page.evaluate(()=>players[0].aircraft),model);
   }
   await page.close();
  }
  console.log('PASS: stale dependency reproduces START crash; versioned assets start both aircraft and keep the real animation loop running.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
