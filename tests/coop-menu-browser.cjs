const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const path=require('node:path');
(async()=>{
 const browser=await chromium.launch({headless:true});
 try {
  const page=await browser.newPage({viewport:{width:390,height:844},hasTouch:true});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>window.requestAnimationFrame=()=>0);
  await page.goto('file://'+path.resolve('index.html'));
  await page.evaluate(()=>{
   document.documentElement.requestFullscreen=()=>Promise.resolve();
   window.fetch=async(url)=>{
    const route=String(url).split('/').pop();
    const data=route==='info'?{addresses:['http://192.168.1.5:8767']}:route==='rooms'?{rooms:[]}:
     {role:route==='create'?'host':'guest',code:'654321',token:'lan-test'};
    return new Response(JSON.stringify(data),{headers:{'content-type':'application/json'}});
   };
   window.EventSource=class {constructor(){window.testEvents=this;this.listeners={};}addEventListener(name,cb){this.listeners[name]=cb;}close(){}};
  });
  await page.locator('#boot').click();await page.evaluate(()=>window.arcade.frame(3));
  await page.locator('#demo-lan').click();await page.evaluate(()=>poll());
  assert.equal(await page.getByText('INTERNET 2 PLAYERS',{exact:true}).count(),0);
  assert.equal(await page.locator('meta[name="cat-fighter-relay-origin"],meta[name="cat-fighter-signaling-origin"]').count(),0);
  assert.match(await page.locator('#coop-wifi').textContent(),/WI-FI CO-OP/);
  assert.match(await page.locator('#coop-wifi').textContent(),/Same network required/);
  await page.locator('#coop-wifi').tap();await page.locator('#coop-guest').tap();
  assert.equal(await page.locator('#lan-join').isDisabled(),true);
  await page.locator('#lan-code').fill('012847');
  assert.equal(await page.locator('#lan-code').inputValue(),'012847','client preserves a leading-zero room code');
  assert.equal(await page.locator('#lan-join').isDisabled(),false,'client accepts six numeric characters');
  await page.locator('#lan-code').fill('72A2D7');
  assert.equal(await page.locator('#lan-code').inputValue(),'7227','client removes non-numeric characters');
  assert.equal(await page.locator('#lan-join').isDisabled(),true);
  await page.locator('#lan-code').fill('12345');assert.equal(await page.locator('#lan-join').isDisabled(),true);
  await page.keyboard.press('Escape');assert.equal(await page.locator('#coop-roles').isVisible(),true);
  assert.equal(await page.locator('#coop-local').isVisible(),false,'same-device co-op is hidden');
  await page.locator('#coop-host').click();await page.waitForTimeout(200);
  assert.equal(await page.evaluate(()=>window.lan.active),true,await page.locator('#lan-status').textContent());await page.evaluate(()=>poll());
  assert.equal(await page.evaluate(()=>lan.menuState.transport),'lan');
  assert.match(await page.locator('#coop-role').textContent(),/P1/);
  assert.match(await page.locator('#coop-room-code').textContent(),/^654321$/);
  await page.evaluate(()=>{testEvents.listeners.presence({data:JSON.stringify({host:true,guest:true})});poll();});
  assert.equal(await page.locator('#coop-start').isVisible(),true);
  await page.locator('#lan-leave').click();await page.evaluate(()=>poll());
  await page.evaluate(()=>window.fetch=async()=>new Response('<!doctype html><title>Static host</title>',{headers:{'content-type':'text/html'}}));
  await page.locator('#coop-wifi').click();await page.locator('#coop-guest').click();await page.locator('#lan-code').fill('123456');await page.locator('#lan-join').click();
  await page.waitForFunction(()=>!lan.menuState.connecting);await page.evaluate(()=>poll());
  assert.match(await page.locator('#lan-status').textContent(),/same local network and connected to the local Cat Fighter server/);
  assert.equal(await page.evaluate(()=>lan.active),false,'static public site never falls back to a remote service');
  assert.deepEqual(errors,[]);
  console.log('PASS: LAN-only co-op entry, same-network copy, six-digit validation, P1 identity, connected state, and no Internet UI/configuration.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
