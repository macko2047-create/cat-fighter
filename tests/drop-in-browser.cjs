const {chromium}=require('playwright'),assert=require('node:assert/strict'),path=require('node:path');
(async()=>{
 const browser=await chromium.launch({headless:true});
 try {
  const page=await browser.newPage({viewport:{width:390,height:844},hasTouch:true});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>window.requestAnimationFrame=()=>0);
  await page.goto('file://'+path.resolve('index.html'));
  await page.evaluate(()=>{document.documentElement.requestFullscreen=()=>Promise.resolve();});
  await page.locator('#boot').click();await page.evaluate(()=>arcade.frame(3));
  await page.locator('#demo-start').click();await page.locator('#start').click();
  await page.evaluate(()=>{
   window.raw=[0,1].map(index=>({id:'Controller '+index,index,mapping:'standard',axes:[0,0],buttons:Array.from({length:16},()=>({pressed:false}))}));
   navigator.getGamepads=()=>raw;assignments[0]=0;assignments[1]=null;
   score=12345;elapsed=80;Object.assign(players[0],{level:3,rapid:true,bombs:2});
   window.originalPilot=players[0];window.originalPilotData=JSON.stringify(players[0]);poll();
  });
  const press=async()=>page.evaluate(()=>{raw[1].buttons[1].pressed=true;poll();});
  const release=async()=>page.evaluate(()=>{raw[1].buttons[1].pressed=false;poll();});
  await press();await release();
  assert.equal(await page.evaluate(()=>players.length),1,'connection only does not join');
  await press();await release();
  assert.equal(await page.evaluate(()=>players.length),1,'JOIN asks for confirmation');
  assert.equal(await page.locator('#drop-in-confirm').isVisible(),true);
  await press();await release();
  assert.equal(await page.evaluate(()=>players.length),2);
  assert.equal(await page.evaluate(()=>players[0]===originalPilot && JSON.stringify(players[0])===originalPilotData),true);
  assert.deepEqual(await page.evaluate(()=>[score,elapsed,players[1].controlSlot,players[1].aircraft,players[1].level,players[1].bombs,players[1].lives,players[1].entering,assignments[1]]),[12345,80,1,1,1,3,3,true,1]);
  await page.evaluate(()=>{players[1].y=691;update(.01);});
  assert.equal(await page.evaluate(()=>players[1].inv),3,'invulnerability starts on arrival');
  await page.evaluate(()=>{players[1].lives=0;players[1].rejoinRemaining=10;assignments[1]=null;poll();});
  await press();await release();
  assert.equal(await page.evaluate(()=>players.length),2);
  assert.equal(await page.evaluate(()=>tryRejoin(1)),false,'reconnecting cannot bypass death timer');
  assert.equal(await page.evaluate(()=>assignments[1]),1,'reconnected controller retains the dead player slot');
  await page.evaluate(()=>{players[1].rejoinRemaining=0;});await press();await release();
  assert.equal(await page.evaluate(()=>players[1].lives),3,'normal rejoin works after the timer');
  assert.equal(await page.locator('#drop-in').isVisible(),false);
  // P2-only run: touch joins missing P1 without renumbering the existing pilot.
  await page.evaluate(()=>{players=[{...pilot(0),controlSlot:1,aircraft:1}];assignments.fill(null);mode='playing';loopTransition=0;poll();});
  assert.equal(await page.locator('#drop-in-join').textContent(),'P1 JOIN');
  await page.locator('#drop-in-join').tap();await page.locator('#drop-in-cancel').tap();
  assert.equal(await page.evaluate(()=>players.length),1);
  await page.locator('#drop-in-join').tap();await page.locator('#drop-in-confirm').tap();
  assert.deepEqual(await page.evaluate(()=>players.map(p=>[p.index,p.controlSlot,p.aircraft])),[[0,1,1],[1,0,0]]);
  assert.deepEqual(errors,[]);
  console.log('PASS: controller and touch drop-in, explicit confirmation/cancel without aircraft choice, preserved solo state, fixed player aircraft, protected entry, P2-only run, and death-timer bypass prevention.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
