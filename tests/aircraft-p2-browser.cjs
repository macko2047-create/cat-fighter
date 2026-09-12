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
  await page.locator('#demo-start').click();await page.locator('#pilot-confirm-0').click();
  await page.evaluate(()=>{
   window.raw={id:'Joy-Con (L/R) (STANDARD GAMEPAD)',index:1,mapping:'standard',axes:[0,0,0,0],buttons:Array.from({length:17},()=>({pressed:false}))};
   navigator.getGamepads=()=>[raw];
  });
  const select=()=>page.evaluate(()=>{raw.buttons[2].pressed=true;poll();raw.buttons[2].pressed=false;poll();});
  const move=(x,y)=>page.evaluate(([x,y])=>{raw.axes[3]=-x;raw.axes[2]=y;poll();raw.axes[3]=0;raw.axes[2]=0;poll();},[x,y]);
  const focused=()=>page.locator('.pad-focus-1').getAttribute('id');
  await select();
  assert.equal(await page.locator('[data-slot="1"][data-model="1"]').evaluate(el=>el.classList.contains('pad-focus-1')),true);
  await move(1,0);await move(0,-1);await move(-1,0);
  assert.equal(await page.locator('[data-slot="1"][data-model="1"]').evaluate(el=>el.classList.contains('pad-focus-1')),true,'edges/taken card cannot jump to unrelated buttons');
  assert.equal(await page.locator('#start').isEnabled(),true,'connected P2 without joining does not block solo');
  await select();assert.equal(await page.locator('#start').isDisabled(),true);
  await move(0,1);assert.equal(await focused(),'pilot-confirm-1');
  // A tilted stick that wobbles between axes cannot trigger multiple steps.
  await page.evaluate(()=>{raw.axes[3]=-.9;raw.axes[2]=.8;poll();raw.axes[3]=-.7;raw.axes[2]=.9;poll();});
  assert.equal(await focused(),'pilot-confirm-1');
  await page.evaluate(()=>{raw.axes.fill(0);poll();});
  await move(0,1);assert.equal(await focused(),'pilot-leave-1');
  await select();
  assert.equal(await page.evaluate(()=>joined[1]),false);
  assert.equal(await page.locator('#start').isEnabled(),true);
  // Connected opted-out controller remains opted out across normal frames.
  await page.evaluate(()=>{for(let i=0;i<60;i++)poll();});
  assert.equal(await page.evaluate(()=>joined[1]),false);
  // Join and lock, then opt out directly from READY too.
  await move(0,-1);await select();
  await select(); // JOIN then CONFIRM on the same visible button.
  assert.match(await page.locator('#pilot-state-1').textContent(),/READY/);
  assert.equal(await focused(),'pilot-cancel-1');
  await move(1,0);assert.equal(await focused(),'pilot-leave-1');await select();
  assert.equal(await page.locator('#start').isEnabled(),true);
  await page.screenshot({path:'/private/tmp/p2-opt-out.png'});
  await page.locator('#start').click();
  assert.deepEqual(await page.evaluate(()=>players.map(p=>p.controlSlot)),[0]);
  assert.deepEqual(errors,[]);
  console.log('PASS: real paired Joy-Con P2 axes, stable row navigation, no diagonal jitter, unjoined/choosing/READY opt-out, connected idle P2 and solo start.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
