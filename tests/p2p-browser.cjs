'use strict';
// Real RTCDataChannels in isolated browser contexts; no system Chrome path.
const {chromium,webkit}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const out=path.join('artifacts/p2p',process.env.P2P_BROWSER||'chromium');
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
      await page.goto(base);
      await page.evaluate(()=>{document.documentElement.requestFullscreen=()=>Promise.resolve();document.querySelector('#boot').onclick();window.arcade.frame(3);});
      pages.push(page);
    }
    const [host,guest]=pages;
    const run=(page,code)=>page.evaluate(code);
    const wait=(page,code)=>page.waitForFunction(code,null,{timeout:15000});
    const click=(page,id)=>page.evaluate(id=>document.querySelector(id).onclick(),id);
    await click(host,'#lan-open');await click(host,'#p2p-create');
    const code=await host.inputValue('#p2p-code');assert.match(code,/^\d{6}$/);
    assert.equal(await run(host,'window.lan.canStart()'),false);
    await click(guest,'#lan-open');await guest.fill('#p2p-code',code);await click(guest,'#p2p-join');
    await Promise.all(pages.map(p=>wait(p,'window.lan.ready')));
    assert.equal(await run(host,'mode'),'ready','pairing cannot start the game');
    assert.equal(await run(guest,'window.lan.canStart()'),false);
    fs.mkdirSync(out,{recursive:true});
    await host.screenshot({path:path.join(out,'paired.png')});
    const third=await fetch(base+'/p2p/join',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({code})});assert.equal(third.status,409);
    for(const p of pages)await click(p,'#lan-close');
    await run(host,"start();wave=999;nextSupply=999;extraLifeSpawned=true;players.forEach(p=>p.inv=999)");
    await wait(guest,"mode==='playing'&&players.length===2");
    assert.equal(await run(guest,'window.lan.owns(0)'),false);
    assert.equal(await run(host,'window.lan.owns(1)'),false);
    // No signaling or relay service is needed once the channel is open.
    for(const p of pages)await p.route('**/p2p/**',route=>route.abort());
    const x=await run(host,'players[1].x'),p1=await run(host,'players[0].x');
    await run(guest,"keys.add('KeyD');keys.add('KeyF')");
    await wait(host,`players[1].x>${x+20}&&shots.some(s=>s.owner.index===1)`);
    await run(guest,'keys.clear();window.lan.command("bomb")');
    await wait(host,'players[1].bombs===2');assert.equal(await run(host,'players[0].x'),p1);
    assert.equal(await run(host,'players[0].bombs'),3);
    await run(guest,"Object.defineProperty(window.__channels.at(-1),'bufferedAmount',{configurable:true,get:()=>300000});window.lan.command('bomb')");
    await new Promise(r=>setTimeout(r,180));assert.equal(await run(host,'players[1].bombs'),2);
    await run(guest,"delete window.__channels.at(-1).bufferedAmount");await wait(host,'players[1].bombs===1');
    await new Promise(r=>setTimeout(r,180));assert.equal(await run(host,'players[1].bombs'),1,'queued bomb delivered once after congestion');
    const input=(p,type,x,y)=>p.evaluate(({type,x,y})=>{
      const field=document.querySelector('.screen'),r=field.getBoundingClientRect();
      field.dispatchEvent(new PointerEvent(type,{pointerId:1,pointerType:'touch',clientX:r.left+x/600*r.width,clientY:r.top+y/800*r.height,bubbles:true}));
    },{type,x,y});
    await input(guest,'pointerdown',100,650);await wait(host,'players[1].x<250');await input(guest,'pointerup',100,650);
    const gx=await run(host,'players[1].x');
    await run(guest,"window.__pads=[{id:'P2 pad',index:0,axes:[1,0],buttons:Array.from({length:16},()=>({pressed:false}))}]");
    await wait(host,`players[1].x>${gx+15}`);await run(guest,'window.__pads=[]');await wait(host,"mode==='paused'");
    await run(host,'pause()');await wait(guest,"mode==='playing'");
    // Full boss visuals/debris and fragmented snapshots use the existing renderer.
    await run(host,"elapsed=175;bossSpawned=false;update(.01);damageEnemy(enemies.find(e=>e.type==='boss'),600);explode(300,300,'#ffeeaa',600)");
    await wait(guest,"enemies.some(e=>e.type==='boss')&&bossDebris.length>0&&sparks.length>100");
    await guest.screenshot({path:path.join(out,'boss-snapshot.png')});
    assert.ok(requests.filter(r=>r.url.includes('/p2p/')).every(r=>!r.body||!r.body.includes('"state"')&&!r.body.includes('"input"')),'signaling never receives gameplay');
    assert.equal(requests.filter(r=>/\/lan\/(state|input|events)/.test(r.url)).length,0,'P2P never uses the LAN relay');
    // Silent stall clears controls and pauses; returned packets do not auto-resume.
    await run(guest,"keys.add('KeyD');window.__drop=true");await wait(host,"mode==='paused'&&!window.lan.ready");
    assert.deepEqual(await run(host,'window.lan.inputFor(1)'),{x:0,y:0,fire:false,target:null});
    await run(guest,'keys.clear();window.__drop=false');await wait(host,'window.lan.ready');assert.equal(await run(host,'mode'),'paused');
    await run(host,'pause()');await wait(guest,"mode==='playing'");
    await run(guest,"window.dispatchEvent(new Event('blur'))");await wait(host,"mode==='paused'");
    await run(host,'pause()');await wait(guest,"mode==='playing'");
    // Restore signaling only for a fresh direct connection. Preserve game state.
    for(const p of pages)await p.unroute('**/p2p/**');
    // Asymmetric snapshot loss: guest input remains open, including a queued
    // action behind backpressure. Cleanup must not depend on sending pause.
    for(const congested of [false,true]) {
      await run(guest,"keys.add('KeyA');keys.add('KeyF')");
      await wait(host,'window.lan.inputFor(1).fire');
      const bombs=await run(host,'players[1].bombs');
      await run(host,'window.__drop=true');
      if(congested)await run(guest,"Object.defineProperty(window.__channels.at(-1),'bufferedAmount',{configurable:true,get:()=>300000});window.lan.command('bomb');window.lan.command('rejoin')");
      await wait(guest,"mode==='paused'&&!window.lan.ready");
      assert.equal(await run(guest,'keys.size'),0,'snapshot timeout clears held movement/fire');
      assert.equal(await run(guest,"window.__channels.at(-1).readyState==='open'"),false,'timeout closes the stale channel');
      await wait(host,"mode==='paused'&&!window.lan.ready");
      const elapsed=await run(host,'elapsed');
      assert.deepEqual(await run(host,'window.lan.inputFor(1)'),{x:0,y:0,fire:false,target:null});
      await run(host,'window.__drop=false');
      await new Promise(r=>setTimeout(r,250));
      for(const p of pages)assert.equal(await run(p,'mode'),'paused','restoring snapshots cannot resume either peer');
      assert.equal(await run(host,'elapsed'),elapsed,'authoritative simulation stops');
      await run(host,'pause()');assert.equal(await run(host,'mode'),'paused','cannot resume before reconnection');
      await click(guest,'#p2p-reconnect');
      await Promise.all(pages.map(p=>wait(p,'window.lan.ready')));
      await new Promise(r=>setTimeout(r,150));
      for(const p of pages)assert.equal(await run(p,'mode'),'paused','reconnection cannot auto-resume');
      await run(host,'pause()');await wait(guest,"mode==='playing'");
      const position=await run(host,'({x:players[1].x,y:players[1].y})');
      await new Promise(r=>setTimeout(r,200));
      assert.deepEqual(await run(host,'({x:players[1].x,y:players[1].y})'),position,'no stale movement');
      assert.equal(await run(host,'window.lan.inputFor(1).fire'),false,'no stale shooting');
      assert.equal(await run(host,'players[1].bombs'),bombs,'no queued bomb survives recovery');
    }
    const score=await run(host,'score');
    await run(guest,'window.__channels.at(-1).close()');
    await wait(host,"mode==='paused'&&!window.lan.ready");
    await run(host,'pause()');assert.equal(await run(host,'mode'),'paused');
    await click(guest,'#p2p-reconnect');await Promise.all(pages.map(p=>wait(p,'window.lan.ready')));
    assert.equal(await run(host,'mode'),'paused');assert.equal(await run(host,'score'),score);
    await run(host,'pause()');await wait(guest,"mode==='playing'");
    // Malicious guest cannot publish authoritative state, even a well-formed one.
    await run(guest,`window.__channels.at(-1).send(JSON.stringify({id:9999,part:0,total:1,data:JSON.stringify({kind:'state',data:{score:999999}})}))`);
    await wait(host,"mode==='paused'&&!window.lan.ready");assert.notEqual(await run(host,'score'),999999);
    await click(host,'#p2p-reconnect');await Promise.all(pages.map(p=>wait(p,'window.lan.ready')));
    await click(guest,'#lan-leave');await wait(host,'!window.lan.active');
    await click(host,'#p2p-create');
    const nextCode=await host.inputValue('#p2p-code');
    await guest.evaluate(code=>document.querySelector('#p2p-code').value=code,nextCode);await click(guest,'#p2p-join');
    await Promise.all(pages.map(p=>wait(p,'window.lan.ready')));
    await run(guest,"window.dispatchEvent(new Event('pagehide'))");
    assert.equal(await run(guest,'window.lan.active'),false,'pagehide cannot leave a closed transport active after bfcache restore');
    await wait(host,'!window.lan.active');
    assert.deepEqual(errors,[]);
    console.log('PASS: real direct RTCDataChannels, six-digit room flow, explicit host start, no relay/media, keyboard/touch/gamepad, bomb ownership, boss/debris fragmentation, signaling outage, both asymmetric traffic stalls, snapshot-loss cleanup under backpressure, explicit host resume, blur pause, reconnect, authority rejection and leave.');
  }finally{await secondary?.close();await browser?.close();server.dispose();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
