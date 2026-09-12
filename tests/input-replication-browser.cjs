'use strict';
const {chromium}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs');
const {createLanServer}=require('../tools/lan-server.cjs');
(async()=>{
 const server=createLanServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));
 let browser;const errors=[];
 try{
  browser=await chromium.launch({headless:true});const base=`http://127.0.0.1:${server.address().port}`,pages=[];
  for(let i=0;i<2;i++){const context=await browser.newContext();const p=await context.newPage();p.on('pageerror',e=>errors.push(e.message));await p.goto(base);await p.evaluate(()=>{document.documentElement.requestFullscreen=()=>Promise.resolve();document.querySelector('#boot').onclick();arcade.frame(3);});pages.push(p);}
  const [h,g]=pages,run=(p,s)=>p.evaluate(s),wait=(p,s)=>p.waitForFunction(s,null,{timeout:10000});
  await run(h,"document.querySelector('#lan-create').onclick()");const code=await h.inputValue('#lan-code');
  await g.evaluate(code=>{document.querySelector('#lan-code').value=code;return document.querySelector('#lan-join').onclick();},code);
  await wait(h,'lan.ready');await wait(g,'lan.ready');
  for(const p of pages)await run(p,"document.querySelector('#lan-dialog').close()");
  await run(h,"document.querySelector('#pilot-confirm-0').onclick()");await run(g,"document.querySelector('#pilot-confirm-1').onclick()");await wait(h,'aircraftMenu.canStart()');
  await run(h,"start();wave=999;players.forEach(p=>p.inv=999)");await wait(g,"mode==='playing' && players[1] && !players[1].entering");
  await g.route('**/lan/input',async route=>{await new Promise(r=>setTimeout(r,100));await route.continue();});
  const before=await run(h,'players[1].x');await run(g,"keys.add('KeyD')");await g.waitForTimeout(50);
  assert.ok(await run(g,'lan.lastVisual.players[1].x')>before+2,'prediction moves before delayed input reaches P1');
  assert.equal(await run(h,'players[1].x'),before,'P2 cannot directly set authority');
  await g.waitForTimeout(500);await run(g,'keys.clear()');await g.waitForTimeout(650);
  const d=await run(g,'lan.diagnostics().inputReplication'),host=await run(h,'lan.diagnostics().inputReplication');
  assert.ok(host.processed>0&&d.reconciliations>0);assert.ok(d.pendingInputs<30);
  const x=await run(h,'players[1].x'),visual=await run(g,'lan.lastVisual.players[1].x');assert.ok(Math.abs(x-visual)<1,'ACK/replay converges after release');
  await run(h,'pause()');await wait(g,"mode==='paused'");const epoch=await run(g,'lan.diagnostics().inputReplication.inputEpoch');
  assert.equal(await run(g,'lan.diagnostics().inputReplication.pendingInputs'),0);
  await run(h,'pause()');await wait(g,"mode==='playing'");await g.waitForTimeout(250);
  assert.ok(await run(g,'lan.diagnostics().inputReplication.inputEpoch')>epoch);assert.equal(await run(h,'players[1].x'),x);
  assert.deepEqual(errors,[]);const result={guest:d,host,finalError:Math.abs(x-visual)};fs.writeFileSync('/tmp/cat-b1-diagnostics.json',JSON.stringify(result,null,2));console.log('PASS: two Chromium clients, delayed input, immediate prediction, authority, ACK convergence, pause/resume epoch, no page errors.');console.log(JSON.stringify(result));
 }finally{await browser?.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1});
