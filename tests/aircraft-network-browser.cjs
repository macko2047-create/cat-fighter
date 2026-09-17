'use strict';
const {chromium}=require('playwright'),assert=require('node:assert/strict'),path=require('node:path');
(async()=>{
  const browser=await chromium.launch({headless:true});
  try {
    const errors=[];
    const pages=await Promise.all([0,1].map(async()=>{
      const page=await browser.newPage({viewport:{width:390,height:844},hasTouch:true});
      page.on('pageerror',error=>errors.push(error.message));
      await page.addInitScript(()=>{window.requestAnimationFrame=()=>0;window.setInterval=()=>0;});
      await page.goto('file://'+path.resolve('index.html')+'?transport=lan');
      await page.evaluate(()=>{
        document.documentElement.requestFullscreen=()=>Promise.resolve();
        window.testNow=performance.now();Object.defineProperty(performance,'now',{value:()=>testNow});
        window.outbox=[];
        window.fetch=async(url,options)=>{
          const route=String(url).split('/').pop();
          if(route==='rooms')return new Response(JSON.stringify({rooms:[{code:'654321'}]}),{headers:{'content-type':'application/json'}});
          if(['state','input'].includes(route))outbox.push({route,body:JSON.parse(options.body)});
          return new Response(JSON.stringify({role:route==='create'?'host':'guest',code:'654321',token:'lan-test'}),{headers:{'content-type':'application/json'}});
        };
        window.EventSource=class {constructor(){window.connection=this;this.listeners={};}addEventListener(name,cb){this.listeners[name]=cb;}close(){}};
      });
      await page.locator('#boot').click();await page.evaluate(()=>arcade.frame(3));
      await page.locator('#demo-lan').click();await page.evaluate(()=>poll());
      return page;
    }));
    const [host,guest]=pages;
    await host.locator('#coop-host').click();await host.waitForTimeout(150);await host.evaluate(()=>poll());
    assert.equal(await host.evaluate(()=>lan.active),true);
    assert.equal(await host.locator('#coop-start').isDisabled(),true,'host still waits for the network peer');
    assert.equal(await host.locator('#aircraft-menu').count(),0,'network flow exposes no aircraft choice');
    await guest.locator('#coop-guest').click();await guest.waitForFunction(()=>document.querySelectorAll('#lan-rooms button').length===1);await guest.locator('#lan-rooms button').click();await guest.waitForTimeout(150);
    for(const page of pages)await page.evaluate(()=>{connection.listeners.presence({data:JSON.stringify({host:true,guest:true})});poll();});
    assert.deepEqual(await host.evaluate(()=>[...aircraft]),[0,1]);
    assert.deepEqual(await guest.evaluate(()=>[...aircraft]),[0,1]);
    assert.match(await host.locator('#coop-next').textContent(),/P1 · GINGER/);
    assert.match(await guest.locator('#coop-next').textContent(),/P2 · MINT/);
    assert.equal(await host.locator('#coop-start').textContent(),'START ▶');
    assert.equal(await guest.locator('#coop-start').textContent(),'WAIT FOR P1');
    await host.locator('#lan-close').click();await host.locator('#start').click();
    const messages=await host.evaluate(()=>{testNow+=60;lan.tick(testNow);return outbox.splice(0);});
    for(const message of messages)await guest.evaluate(message=>connection.listeners[message.route]({data:JSON.stringify(message.route==='state'?message.body.state:{...message.body.input,actions:message.body.actions})}),message);
    for(const page of pages) {
      assert.equal(await page.evaluate(()=>mode),'playing');
      assert.deepEqual(await page.evaluate(()=>players.map(player=>[player.controlSlot,player.aircraft])),[[0,0],[1,1]]);
    }
    await host.locator('#lan-bar').click();await host.evaluate(()=>poll());
    assert.equal(await host.locator('#coop-start').textContent(),'RESUME ▶');
    await host.locator('#coop-start').click();assert.equal(await host.evaluate(()=>mode),'playing');
    assert.deepEqual(errors,[]);
    console.log('PASS: code-free Wi-Fi discovery, no aircraft selection, fixed P1 GINGER/P2 MINT, host-only start, state sync and resume.');
  } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
