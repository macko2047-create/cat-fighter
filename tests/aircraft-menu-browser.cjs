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
  await page.locator('#demo-start').tap();
  assert.equal(await page.locator('#aircraft-menu .pilot-choice:visible').count(),1);
  assert.deepEqual(await page.evaluate(()=>[...joined]),[true,false]);
  assert.equal(await page.locator('#start').isDisabled(),true);
  await page.evaluate(()=>{navigator.getGamepads=()=>[{id:'Joy-Con (R) (STANDARD GAMEPAD)',index:0,mapping:'standard',axes:[1,1],buttons:Array.from({length:17},()=>({pressed:true,value:1}))}];for(let i=0;i<10;i++)poll();});
  assert.deepEqual(await page.evaluate(()=>[...joined]),[true,false],'connected controller cannot add a second player');
  assert.deepEqual(await page.evaluate(()=>pads()),[]);
  await page.keyboard.type('joypad');
  assert.equal(await page.locator('#settings').isVisible(),false);
  await page.locator('[data-slot="0"][data-model="1"]').tap();
  await page.locator('#pilot-confirm-0').tap();
  assert.equal(await page.locator('#start').isEnabled(),true);
  await page.locator('#pilot-cancel-0').tap();
  assert.equal(await page.locator('#start').isDisabled(),true);
  await page.locator('#pilot-confirm-0').tap();
  for(const viewport of [{width:390,height:844},{width:360,height:640},{width:844,height:390}]) {
   await page.setViewportSize(viewport);await page.locator('#start').scrollIntoViewIfNeeded();
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
   assert.equal(await page.locator('#start').evaluate(el=>{const r=el.getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight;}),true);
  }
  await page.setViewportSize({width:390,height:844});
  await page.locator('#aircraft-menu').scrollIntoViewIfNeeded();
  await page.screenshot({path:'/private/tmp/aircraft-touch-solo.png'});
  await page.locator('#start').tap();
  assert.deepEqual(await page.evaluate(()=>players.map(p=>[p.index,p.controlSlot,p.aircraft])),[[0,0,1]]);
  await page.evaluate(()=>poll());assert.equal(await page.locator('#drop-in').isVisible(),false);
  // Both artwork choices must produce the same simulation with identical input/randomness.
  const outcomes=[];
  for(const model of [0,1]) {
   await page.evaluate(()=>{mode='ready';aircraftMenu.reset();start();});
   await page.locator(`[data-slot="0"][data-model="${model}"]`).tap();
   await page.locator('#pilot-confirm-0').tap();await page.locator('#start').tap();
   outcomes.push(await page.evaluate(()=>{
    const random=Math.random;Math.random=()=>.5;
    try {
     const initial={...players[0]};delete initial.aircraft;
     const formations=[];
     for(const n of [1,5,7,15]) {enemies=[];wave=n-1;spawn();formations.push(JSON.parse(JSON.stringify(enemies)));}
     enemies=[];wave=6;spawn();wave=999;
     const reward=enemies.find(e=>e.reward);kill(reward,players[0]);
     const dropped=JSON.parse(JSON.stringify(drops));
     players[0].x=drops[0].x;players[0].y=drops[0].y;enemies=[];update(0);
     const upgrade=[players[0].level,players[0].rapid,players[0].bombs,players[0].lives];
     enemies=[];drops=[];elapsed=175;update(0);
     const boss=enemies.find(e=>e.type==='boss');
     enemies=[];keys.add('KeyF');update(0);keys.clear();
     return {initial,formations,dropped,upgrade,bossHP:boss.hp,shots:shots.map(s=>[s.x,s.y,s.vx,s.vy]),score};
    } finally {Math.random=random;}
   }));
  }
  assert.deepEqual(outcomes[0],outcomes[1],'GINGER and MINT have identical solo difficulty, rewards and firing');
  assert.equal(outcomes[1].formations[0].length,5);assert.equal(outcomes[1].bossHP,650);
  await page.evaluate(()=>{mode='ready';aircraftMenu.reset();start();});
  await page.locator('#lan-open').click();await page.evaluate(()=>poll());
  assert.equal(await page.locator('#coop-local').isVisible(),false);
  assert.deepEqual(errors,[]);
  console.log('PASS: one touch pilot, either aircraft, controller suppression, no local drop-in, responsive selection and identical solo formations/Boss/rewards/fire.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
