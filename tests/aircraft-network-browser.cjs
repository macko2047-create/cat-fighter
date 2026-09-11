const {chromium}=require('playwright'),assert=require('node:assert/strict'),path=require('node:path');
(async()=>{
 const browser=await chromium.launch({headless:true});
 try {
  const errors=[];
  const pages=await Promise.all([0,1].map(async()=>{
   const page=await browser.newPage({viewport:{width:390,height:844},hasTouch:true});
   page.on('pageerror',e=>errors.push(e.message));
   await page.addInitScript(()=>{window.requestAnimationFrame=()=>0;window.setInterval=()=>0;});
   await page.goto('file://'+path.resolve('index.html'));
   await page.evaluate(()=>{
    document.documentElement.requestFullscreen=()=>Promise.resolve();
    window.testNow=performance.now();Object.defineProperty(performance,'now',{value:()=>testNow});
    window.outbox=[];
    window.CatP2P={request:async action=>({role:action==='create'?'host':'guest',code:'654321',token:'a'.repeat(48)}),
     create:(session,callbacks)=>{window.connection=callbacks;return {close(){},send(kind,data){outbox.push({kind,data});return true;},reconnect(){},disconnect(){}};}};
   });
   await page.locator('#boot').click();await page.evaluate(()=>arcade.frame(3));
   await page.locator('#demo-lan').tap();await page.evaluate(()=>poll());
   return page;
  }));
  const [host,guest]=pages;
  await host.locator('#coop-host').tap();await host.locator('#p2p-create').tap();
  await host.waitForFunction(()=>lan.active);await host.evaluate(()=>poll());
  assert.equal(await host.locator('#coop-start').isDisabled(),true);
  await host.locator('#lan-close').tap();
  assert.equal(await host.locator('#aircraft-menu .pilot-choice:visible').count(),1,'host waiting alone sees only own choice');
  await host.locator('#pilot-confirm-0').tap();
  assert.equal(await host.locator('#start').isDisabled(),true,'cannot start waiting room alone');
  await guest.locator('#coop-guest').tap();
  for(const digit of ['6','5','4','3','2','1'])await guest.locator('#coop-keypad').getByRole('button',{name:digit,exact:true}).tap();
  await guest.locator('#p2p-join').tap();await guest.waitForFunction(()=>lan.guest);
  for(const page of pages)await page.evaluate(()=>{connection.ready();poll();});
  await guest.locator('#coop-start').tap();
  const transfer=async(from,to)=>{
   const messages=await from.evaluate(()=>{testNow+=60;lan.tick(testNow);return outbox.splice(0);});
   for(const m of messages)await to.evaluate(({kind,data})=>connection.message(kind,data),m);
  };
  const sync=async()=>{await transfer(guest,host);await transfer(host,guest);};
  await sync();
  for(const page of pages)assert.equal(await page.locator('#aircraft-menu .pilot-choice:visible').count(),2);
  assert.equal(await host.locator('[data-slot="1"][data-model="1"]').isDisabled(),true,'host cannot choose guest plane');
  assert.equal(await guest.locator('[data-slot="0"][data-model="0"]').isDisabled(),true,'guest cannot choose host plane');
  assert.equal(await guest.locator('[data-slot="1"][data-model="0"]').isDisabled(),true,'confirmed host plane is taken');
  await guest.locator('#pilot-confirm-1').tap();await sync();
  assert.deepEqual(await host.evaluate(()=>aircraftMenu.snapshot()),[true,true]);
  assert.deepEqual(await guest.evaluate(()=>aircraftMenu.snapshot()),[true,true]);
  assert.equal(await host.locator('#start').isEnabled(),true);
  assert.equal(await guest.locator('#start').isDisabled(),true);
  await guest.locator('#pilot-cancel-1').tap();await sync();
  assert.equal(await host.locator('#start').isDisabled(),true,'guest cancellation prevents host start');
  await host.locator('#pilot-cancel-0').tap();
  await host.locator('[data-slot="0"][data-model="1"]').tap();await host.locator('#pilot-confirm-0').tap();await sync();
  await guest.locator('#pilot-confirm-1').tap();await sync();
  assert.deepEqual(await guest.evaluate(()=>[...aircraft]),[1,0]);
  await host.evaluate(()=>connection.lost('Peer disconnected'));
  assert.equal(await host.locator('#aircraft-menu .pilot-choice:visible').count(),1);
  assert.equal(await host.locator('#start').isDisabled(),true);
  await host.evaluate(()=>connection.ready());await sync();
  assert.equal(await host.locator('#start').isDisabled(),true,'reconnected peer must confirm again');
  await guest.locator('#pilot-confirm-1').tap();await sync();
  await host.screenshot({path:'/private/tmp/aircraft-touch-network.png'});
  await host.locator('#start').tap();await transfer(host,guest);
  for(const page of pages) {
   assert.equal(await page.evaluate(()=>mode),'playing');
   assert.deepEqual(await page.evaluate(()=>players.map(p=>[p.controlSlot,p.aircraft])),[[0,1],[1,0]]);
   assert.equal(await page.locator('#aircraft-menu').isVisible(),false);
  }
  await host.locator('#lan-bar').tap();await host.evaluate(()=>poll());
  assert.equal(await host.locator('#coop-start').textContent(),'RESUME ▶');
  await host.locator('#coop-start').tap();assert.equal(await host.evaluate(()=>mode),'playing');
  await host.locator('#lan-bar').tap();await host.locator('#lan-leave').tap();await host.locator('#lan-close').tap();
  await host.locator('#start').tap();
  assert.equal(await host.locator('#aircraft-menu .pilot-choice:visible').count(),1,'leaving returns to single selection');
  assert.deepEqual(errors,[]);
  console.log('PASS: waiting room solo view, two-device shared choices, own-device authority, confirm/cancel sync, distinct planes, host-only start, resume and leave.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
