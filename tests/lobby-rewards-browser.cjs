const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const {pathToFileURL}=require('node:url');
const path=require('node:path');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
 try {
  const page=await browser.newPage({viewport:{width:1100,height:1000}});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{window.requestAnimationFrame=()=>0;});
  await page.goto(pathToFileURL(path.resolve('index.html')).href);
  assert.deepEqual(await page.evaluate(()=>{joined.fill(false);joined[1]=true;aircraft.splice(0,2,1,0);start();return players.map(p=>[p.controlSlot,p.aircraft]);}),[[1,1]],'fixed P2 identity overrides stale selection state');
  assert.equal(await page.evaluate(()=>{keys.add('KeyK');return input(0).fire;}),true);
  await page.evaluate(()=>{keys.clear();mode='ready';joined.fill(false);assignments.fill(null);previous.clear();
    window.testPad={id:'Joy-Con (L/R) (STANDARD GAMEPAD)',index:7,axes:[0,0,0,0],buttons:Array.from({length:17},()=>({pressed:false,value:0}))};
    navigator.getGamepads=()=>[testPad];poll();
  });
  assert.deepEqual(await page.evaluate(()=>[...joined]),[false,false]);
  assert.equal(await page.evaluate(()=>deadzone),.08);
  assert.deepEqual(await page.evaluate(()=>{testPad.buttons[2].pressed=true;poll();testPad.buttons[2].pressed=false;poll();return [...joined];}),[true,false]);
  assert.equal(await page.evaluate(()=>{testPad.buttons[0].pressed=true;poll();testPad.buttons[0].pressed=false;poll();return aircraft[0];}),0,'ready input cannot change fixed P1 aircraft');
  assert.deepEqual(await page.evaluate(()=>{start();testPad.axes[3]=-1;return [players.length,input(0).x];}),[1,1]);
  await page.evaluate(()=>{mode='ready';testPad.axes.fill(0);testPad.buttons[13].pressed=true;poll();testPad.buttons[13].pressed=false;poll();start();});
  assert.equal(await page.evaluate(()=>players.length),2);
  assert.deepEqual(await page.evaluate(()=>{
    elapsed=60;wave=999;update(0);const carrier=enemies.find(e=>e.reward?.type==='W');
    const before=drops.length;kill(carrier,players[0]);draw();
    return [carrier.type,before,drops[0].type,drops[0].weapon];
  }),['heavy',0,'W','rapid']);
  assert.deepEqual(await page.evaluate(()=>{
    enemies=[];drops=[];elapsed=100;update(0);
    if(enemies.find(e=>e.reward)?.reward.weapon!=='double') throw Error('missing double bonus');
    enemies=[];update(0);const e=enemies.find(e=>e.reward?.type==='1UP');
    kill(e,players[0]);return [drops.length,drops[0].type];
  }),[1,'1UP']);
  await page.evaluate(()=>{
    mode='playing';players.forEach(p=>{p.lives=3;p.entering=false;p.respawn=0;});
    const r=canvas.getBoundingClientRect(), screen=$('.screen');
    screen.setPointerCapture=()=>{};
    screen.dispatchEvent(new PointerEvent('pointerdown',{pointerId:11,pointerType:'touch',clientX:r.left+r.width*.25,clientY:r.top+r.height*.7}));
    screen.dispatchEvent(new PointerEvent('pointerdown',{pointerId:12,pointerType:'touch',clientX:r.left+r.width*.75,clientY:r.top+r.height*.7}));
  });
  assert.deepEqual(await page.evaluate(()=>[!!flightControls.targetFor(0),!!flightControls.targetFor(1)]),[true,true]);
  await page.evaluate(()=>$('.screen').dispatchEvent(new PointerEvent('pointerup',{pointerId:11,pointerType:'touch'})));
  assert.deepEqual(await page.evaluate(()=>[!!flightControls.targetFor(0),!!flightControls.targetFor(1)]),[false,true]);
  await page.evaluate(()=>{$('#settings').showModal();$('#half-p1').click();});
  assert.equal(await page.evaluate(()=>halfControllers.snapshot().calibration.slot),0);
  assert.deepEqual(errors,[]);
  console.log('PASS: fixed P2 identity, right Joy-Con first joins solo, preset axes/buttons, second player joins, reward carriers, independent two-touch input and manual calibration access');
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
