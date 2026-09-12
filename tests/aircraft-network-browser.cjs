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
    window.fetch=async(url,options)=>{
     const route=String(url).split('/').pop();
     if(route==='info')return new Response(JSON.stringify({addresses:['http://192.168.1.5:8767']}),{headers:{'content-type':'application/json'}});
     if(route==='rooms')return new Response(JSON.stringify({rooms:[]}),{headers:{'content-type':'application/json'}});
     if(['state','input'].includes(route))outbox.push({route,body:JSON.parse(options.body)});
     const data={role:route==='create'?'host':'guest',code:'654321',token:'lan-test'};
     return new Response(JSON.stringify(data),{headers:{'content-type':'application/json'}});
    };
    window.EventSource=class {constructor(){window.connection=this;this.listeners={};}addEventListener(name,cb){this.listeners[name]=cb;}close(){}};
   });
   await page.locator('#boot').click();await page.evaluate(()=>arcade.frame(3));
   await page.locator('#demo-lan').tap();await page.evaluate(()=>poll());
   return page;
  }));
  const [host,guest]=pages;
  for (const page of pages) await page.locator('#coop-wifi').tap();
  await host.locator('#coop-host').tap();
  await host.waitForTimeout(200);assert.equal(await host.evaluate(()=>lan.active),true);await host.evaluate(()=>poll());
  assert.equal(await host.locator('#coop-start').isDisabled(),true);
  await host.locator('#lan-close').tap();
  assert.equal(await host.locator('#aircraft-menu .pilot-choice:visible').count(),1,'host waiting alone sees only own choice');
  assert.equal(await host.locator('#start').isDisabled(),true,'cannot start waiting room alone');
  await guest.locator('#coop-guest').tap();
  await guest.locator('#lan-code').fill('654321');
  await guest.locator('#lan-join').tap();await guest.waitForTimeout(200);assert.equal(await guest.evaluate(()=>lan.guest),true);
  for(const page of pages)await page.evaluate(()=>{connection.listeners.presence({data:JSON.stringify({host:true,guest:true})});poll();});
  await guest.locator('#coop-start').tap();
  const transfer=async(from,to)=>{
   const messages=await from.evaluate(()=>{testNow+=60;lan.tick(testNow);return outbox.splice(0);});
   for(const m of messages)await to.evaluate(m=>connection.listeners[m.route]({data:JSON.stringify(m.route==='state'?m.body.state:{...m.body.input,actions:m.body.actions})}),m);
  };
  const sync=async()=>{await transfer(guest,host);await transfer(host,guest);};
  await sync();
  for(const page of pages)assert.equal(await page.locator('#aircraft-menu .pilot-choice:visible').count(),2);
  assert.equal(await host.locator('[data-slot="1"][data-model="1"]').isDisabled(),true,'host cannot choose guest plane');
  assert.equal(await guest.locator('[data-slot="0"][data-model="0"]').isDisabled(),true,'guest cannot choose host plane');
  // Local changes are immediate, and old snapshots cannot undo them.
  const stale = await host.evaluate(()=>{testNow+=60;lan.tick(testNow);return outbox.splice(0).find(m=>m.route==='state');});
  await guest.locator('[data-slot="1"][data-model="0"]').tap();
  assert.equal(await guest.evaluate(()=>aircraft[1]),0);
  await guest.evaluate(m=>connection.listeners.state({data:JSON.stringify(m.body.state)}),stale);
  assert.equal(await guest.evaluate(()=>aircraft[1]),0,'stale snapshot cannot overwrite local choice');
  await guest.keyboard.down('ArrowRight');await guest.keyboard.down('ArrowRight');await guest.keyboard.up('ArrowRight');
  assert.equal(await guest.evaluate(()=>aircraft[1]),1,'one keypress changes choice once before sync');
  await sync();
  await host.locator('#pilot-confirm-0').tap();await sync();
  await guest.evaluate(m=>connection.listeners.state({data:JSON.stringify(m.body.state)}),stale);
  assert.equal(await guest.evaluate(()=>aircraftMenu.snapshot()[0]),true,'older remote revision cannot undo host confirmation');
  assert.equal(await host.evaluate(()=>aircraft[0]),0,'guest choices never move host selection');
  assert.equal(await guest.locator('[data-slot="1"][data-model="0"]').isDisabled(),true,'confirmed host plane is taken');
  const stable = await guest.locator('#aircraft-menu').boundingBox();
  await guest.evaluate(()=>{window.menuMutations=0;window.menuObserver=new MutationObserver(records=>menuMutations+=records.length);menuObserver.observe(document.querySelector('#aircraft-menu'),{subtree:true,childList:true,attributes:true,characterData:true});});
  for(let i=0;i<30;i++){await sync();for(const page of pages)await page.evaluate(()=>{poll();aircraftMenu.open();});}
  assert.deepEqual(await guest.locator('#aircraft-menu').boundingBox(),stable,'idle preview layout remains fixed');
  assert.equal(await guest.evaluate(()=>menuMutations),0,'unchanged snapshots and polls do not rewrite selection DOM');
  await guest.evaluate(()=>menuObserver.disconnect());
  await guest.locator('#pilot-confirm-1').tap();await sync();
  assert.deepEqual(await host.evaluate(()=>aircraftMenu.snapshot()),[true,true]);
  assert.deepEqual(await guest.evaluate(()=>aircraftMenu.snapshot()),[true,true]);
  assert.equal(await host.locator('#start').isEnabled(),true);
  assert.equal(await guest.locator('#start').isDisabled(),true);
  await guest.locator('#pilot-cancel-1').tap();await sync();
  assert.equal(await host.locator('#start').isDisabled(),true,'guest cancellation prevents host start');
  await host.locator('#pilot-cancel-0').tap();
  await host.locator('[data-slot="0"][data-model="1"]').tap();await host.locator('#pilot-confirm-0').tap();await sync();
  assert.equal(await guest.evaluate(()=>aircraft[1]),1,'host confirmation must not move guest choice');
  await guest.locator('[data-slot="1"][data-model="0"]').tap();
  await guest.locator('#pilot-confirm-1').tap();await sync();
  assert.deepEqual(await guest.evaluate(()=>[...aircraft]),[1,0]);
  await host.evaluate(()=>connection.listeners.presence({data:JSON.stringify({host:true,guest:false})}));
  assert.equal(await host.locator('#aircraft-menu .pilot-choice:visible').count(),1);
  assert.equal(await host.locator('#start').isDisabled(),true);
  for(const page of pages)await page.evaluate(()=>connection.listeners.presence({data:JSON.stringify({host:true,guest:true})}));await sync();
  for(let i=0;i<10;i++)await sync();
  assert.deepEqual(await guest.evaluate(()=>[...aircraft]),[1,0],'reconnect retains selections without flipping');
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
  console.log('PASS: immediate local selection, stale snapshot rejection, per-player ownership, 30 idle syncs with zero DOM mutations and stable geometry, reconnect stability, confirm/cancel, distinct planes, start/resume/leave.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
