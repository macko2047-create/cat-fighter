'use strict';
// Real RTCDataChannels in isolated browser contexts; no system Chrome path.
const {chromium,webkit}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const out=path.join('artifacts/smoothness');
const {createP2PServer}=require('../tools/p2p-server.cjs');
(async()=>{
  const server=createP2PServer({iceServers:[]});
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  const base=`http://127.0.0.1:${server.address().port}`;
  let browser,secondary;const errors=[],requests=[];
  try{
    browser=await (process.env.P2P_BROWSER==='webkit'?webkit:chromium).launch({headless:true});
    if(process.env.P2P_BROWSER==='mixed')secondary=await webkit.launch({headless:true});
    const pages=[];
    for(let i=0;i<2;i++){
      const context=await (i===1&&secondary?secondary:browser).newContext({viewport:{width:390,height:844},hasTouch:true});
      await context.addInitScript(()=>{
        window.__pcs=[];window.__channels=[];window.__drop=false;window.__pads=[];
        navigator.getGamepads=()=>window.__pads;
        if(navigator.mediaDevices)navigator.mediaDevices.getUserMedia=()=>{throw Error('Media permission must not be requested');};
        const Native=window.RTCPeerConnection;
        window.RTCPeerConnection=class extends Native {
          constructor(...args){super(...args);window.__pcs.push(this);this.addEventListener('datachannel',e=>this.track(e.channel));}
          track(dc){window.__channels.push(dc);const send=dc.send.bind(dc);dc.send=data=>{if(!window.__drop)send(data);};return dc;}
          createDataChannel(...args){return this.track(super.createDataChannel(...args));}
        };
      });
      const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
      page.on('request',req=>{if(/\/(p2p|lan)\//.test(req.url()))requests.push({url:req.url(),body:req.postData()});});
      await page.route(base+'/',async route=>{const response=await route.fetch();await route.fulfill({response,body:(await response.text()).replace(/(<meta name="cat-fighter-signaling-origin" content=")[^"]*/, '$1')});});
      if(process.env.PRESENTATION_SOURCE)await page.route('**/src/presentation.js*',route=>route.fulfill({contentType:'text/javascript',body:fs.readFileSync(process.env.PRESENTATION_SOURCE,'utf8')}));
      await page.goto(base);
      await page.evaluate(()=>{document.documentElement.requestFullscreen=()=>Promise.resolve();document.querySelector('#boot').onclick();window.arcade.frame(3);});
      pages.push(page);
    }
    const [host,guest]=pages;
    const run=(page,code)=>page.evaluate(code);
    const wait=(page,code)=>page.waitForFunction(code,null,{timeout:15000});
    const click=(page,id)=>page.evaluate(id=>document.querySelector(id).onclick(),id);
    await click(host,'#demo-lan');await click(host,'#p2p-create');
    const code=await host.inputValue('#p2p-code');assert.match(code,/^\d{6}$/);
    assert.equal(await run(host,'window.lan.canStart()'),false);
    await click(guest,'#demo-lan');await click(guest,'#coop-guest');await guest.fill('#p2p-code',code);await click(guest,'#p2p-join');
    await Promise.all(pages.map(p=>wait(p,'window.lan.ready')));
    assert.equal(await run(host,'mode'),'ready','pairing cannot start the game');
    assert.equal(await run(guest,'window.lan.canStart()'),false);
    fs.mkdirSync(out,{recursive:true});
    await host.screenshot({path:path.join(out,'paired.png')});
    const third=await fetch(base+'/p2p/join',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({code})});assert.equal(third.status,409);
    for(const p of pages)await click(p,'#lan-close');
    await run(host,"start();wave=999;nextSupply=999;extraLifeSpawned=true;players.forEach(p=>p.inv=999)");
    await wait(guest,"mode==='playing'&&players.length===2");

    await run(guest,`lan.resetPresentationDiagnostics();window.trace=[];const original=draw;draw=function(){const t=performance.now();original();trace.push({t,p:lan.lastVisual.players.map(p=>({x:p.x,y:p.y})),auth:players.map(p=>({x:p.x,y:p.y})),cost:performance.now()-t});};`);
    const results=[];
    for(const [name,h,g] of [['p1',["KeyD"],[]],['p2',[],["KeyD"]],['both-diagonal',["KeyA","KeyW"],["KeyA","KeyW"]],['reverse-fire',["KeyD","KeyF"],["KeyD","KeyF"]],['enemy-heavy',["KeyA","KeyF"],["KeyA","KeyF"]]]){
      await run(host,"players.forEach(p=>{p.x=300;p.y=650});");
      if(name==='enemy-heavy')await run(host,"elapsed=175;bossSpawned=false;update(.01);explode(300,300,'#ffeeaa',150)");
      await guest.waitForTimeout(350);
      await run(guest,'trace=[];lan.resetPresentationDiagnostics()');
      await host.evaluate(k=>{keys.clear();k.forEach(x=>keys.add(x));},h);
      await guest.evaluate(k=>{window.inputAt=performance.now();keys.clear();k.forEach(x=>keys.add(x));},g);
      // Reverse every 400 ms to avoid edge clamping and measure sustained motion.
      for(let i=0;i<10;i++){await guest.waitForTimeout(400);for(const p of pages)await p.evaluate(()=>{for(const [a,b] of [['KeyA','KeyD'],['KeyW','KeyS']]){if(keys.has(a)){keys.delete(a);keys.add(b);}else if(keys.has(b)){keys.delete(b);keys.add(a);}}});}
      const data=await run(guest,'({trace,inputAt,diagnostics:lan.diagnostics()})');results.push({name,...data});
      for(const p of pages)await run(p,'keys.clear()');
    }
    fs.writeFileSync(process.env.MEASURE_OUT||'/tmp/cat-smooth.json',JSON.stringify(results));
    // Actual RTC loss must preserve pause-until-host-resume and clear controls.
    await run(host,'pause()');await wait(guest,"mode==='paused'");
    await run(guest,'lan.command("pause")');await guest.waitForTimeout(150);
    assert.equal(await run(host,'mode'),'paused');
    await run(host,'pause()');await wait(guest,"mode==='playing'");
    await run(guest,'window.__channels.at(-1).close()');
    await wait(host,"mode==='paused'&&!lan.ready");await wait(guest,"mode==='paused'&&!lan.ready");
    const saved=await run(host,'({elapsed,score,x:players[1].x})');
    await click(guest,'#p2p-reconnect');await Promise.all(pages.map(p=>wait(p,'lan.ready')));
    await guest.waitForTimeout(200);
    for(const p of pages)assert.equal(await run(p,'mode'),'paused');
    assert.deepEqual(await run(host,'({elapsed,score,x:players[1].x})'),saved);
    await run(host,'pause()');await wait(guest,"mode==='playing'");
    await guest.waitForTimeout(200);
    assert.equal(await run(host,'players[1].x'),saved.x);
    assert.equal(await run(host,'lan.inputFor(1).fire'),false);
    assert.deepEqual(errors,[]);
    console.log('PASS: real RTC P1/P2/both/diagonal/reversals/fire/Boss scene, pause, disconnect/reconnect, host-only resume, no stale movement/fire, no page errors.');
  }finally{await secondary?.close();await browser?.close();server.dispose();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
