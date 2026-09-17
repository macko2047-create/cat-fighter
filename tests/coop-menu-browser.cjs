const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const path=require('node:path');
(async()=>{
 const browser=await chromium.launch({headless:true});
 try {
  const page=await browser.newPage({viewport:{width:390,height:844},hasTouch:true});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>window.requestAnimationFrame=()=>0);
  await page.goto('file://'+path.resolve('index.html')+'?transport=lan');
  await page.evaluate(()=>{
   document.documentElement.requestFullscreen=()=>Promise.resolve();
   window.testRooms=[];
   window.fetch=async(url,options)=>{
    const route=String(url).split('/').pop();
    const data=route==='rooms'?{rooms:window.testRooms}:
     {role:route==='create'?'host':'guest',code:route==='join'?JSON.parse(options.body).code:'654321',token:'lan-test'};
    return new Response(JSON.stringify(data),{headers:{'content-type':'application/json'}});
   };
   window.EventSource=class {constructor(){window.testEvents=this;this.listeners={};}addEventListener(name,cb){this.listeners[name]=cb;}close(){}};
  });
  await page.locator('#boot').click();await page.evaluate(()=>window.arcade.frame(3));
  await page.locator('#demo-lan').click();await page.evaluate(()=>poll());
  assert.equal(await page.locator('#link-title').textContent(),'WI-FI CO-OP');
  assert.equal(await page.locator('#coop-host').textContent(),'CREATE GAME');
  assert.equal(await page.locator('#coop-guest').textContent(),'FIND GAME');
  const forbidden=await page.evaluate(()=>{const pattern=/internet|p2p|relay|signaling|host url|diagnostics|room code/i;return [...document.querySelectorAll('body *')].filter(element=>element.children.length===0&&element.getClientRects().length&&pattern.test(element.textContent)).map(element=>element.textContent.trim());});
  assert.deepEqual(forbidden,[],'normal player UI exposes no hidden connection terminology');
  await page.locator('#coop-guest').tap();
  assert.equal(await page.locator('#lan-code').isVisible(),false,'normal players never enter a code');
  await page.waitForTimeout(100);
  assert.match(await page.locator('#lan-discovery-status').textContent(),/No games found/);
  await page.keyboard.press('Escape');assert.equal(await page.locator('#coop-roles').isVisible(),true);
  assert.equal(await page.locator('#coop-local').isVisible(),false,'same-device co-op is hidden');
  await page.locator('#coop-host').click();await page.waitForTimeout(200);
  assert.equal(await page.evaluate(()=>window.lan.active),true,await page.locator('#lan-status').textContent());await page.evaluate(()=>poll());
  assert.equal(await page.evaluate(()=>lan.menuState.transport),'lan');
  assert.match(await page.locator('#coop-role').textContent(),/P1/);
  assert.equal(await page.locator('#coop-room-code').isVisible(),false,'created game code stays internal');
  await page.evaluate(()=>{testEvents.listeners.presence({data:JSON.stringify({host:true,guest:true})});poll();});
  assert.equal(await page.locator('#coop-start').isVisible(),true);
  await page.locator('#lan-leave').click();await page.evaluate(()=>poll());
  await page.evaluate(()=>{window.testRooms=[{code:'012847'},{code:'654321'}];});
  await page.locator('#coop-guest').click();await page.waitForTimeout(100);
  assert.deepEqual(await page.locator('#lan-rooms button').allTextContents(),['JOIN GAME 1','JOIN GAME 2'],'multiple games use a concise list without codes');
  await page.locator('#lan-rooms button').first().click();await page.waitForTimeout(100);
  assert.equal(await page.evaluate(()=>lan.active),true,await page.locator('#lan-status').textContent());
  await page.evaluate(()=>poll());
  assert.equal(await page.evaluate(()=>lan.guest),true,'discovered game joins as fixed P2');
  assert.equal(await page.evaluate(()=>lan.menuState.code),'012847','leading-zero identifier remains intact internally');
  await page.locator('#lan-leave').click();await page.evaluate(()=>poll());
  await page.evaluate(()=>window.fetch=async()=>new Response('<!doctype html><title>Static host</title>',{headers:{'content-type':'text/html'}}));
  await page.locator('#coop-guest').click();await page.waitForTimeout(50);
  assert.match(await page.locator('#lan-discovery-status').textContent(),/not available here/);
  assert.equal(await page.evaluate(()=>lan.active),false,'static public site never falls back to a remote service');
  assert.deepEqual(errors,[]);
  console.log('PASS: simple Wi-Fi create/find, code-free discovery/join, fixed identities, hidden technical UI and no remote fallback.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
