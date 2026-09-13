const {chromium}=require('playwright'),assert=require('node:assert/strict'),path=require('node:path');
(async()=>{
 const browser=await chromium.launch({headless:true});
 try {
  const page=await browser.newPage({viewport:{width:820,height:1180},hasTouch:true});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{
   window.requestAnimationFrame=()=>0;
   window.rawPad={id:'Joy-Con (L/R) (STANDARD GAMEPAD)',index:1,mapping:'standard',axes:[0,0,0,0],buttons:Array.from({length:17},()=>({pressed:false,value:0}))};
   navigator.getGamepads=()=>[rawPad];
  });
  await page.goto('file://'+path.resolve('index.html'));
  await page.evaluate(()=>{document.documentElement.requestFullscreen=()=>Promise.resolve();});
  await page.locator('#boot').click();await page.evaluate(()=>arcade.frame(3));
  // Reported hardware: right half pressed first, then left half.
  await page.evaluate(()=>{rawPad.buttons[2].pressed=true;poll();rawPad.buttons[2].pressed=false;poll();rawPad.buttons[13].pressed=true;poll();rawPad.buttons[13].pressed=false;poll();});
  assert.deepEqual(await page.evaluate(()=>[...assignments]),[-100,-101]);
  await page.locator('#demo-controllers').tap();await page.evaluate(()=>poll());
  assert.match(await page.locator('#joycon-ready-0').textContent(),/LEFT JOY-CON · READY · P1/);
  assert.match(await page.locator('#joycon-ready-1').textContent(),/RIGHT JOY-CON · READY · P2/);
  assert.ok(await page.locator('#demo-controllers').evaluate(el=>el.getBoundingClientRect().height>=44));
  assert.ok(await page.locator('#close').evaluate(el=>el.getBoundingClientRect().height>=44));
  assert.equal(await page.locator('#settings').evaluate(el=>el.scrollWidth<=el.clientWidth),true);
  assert.match(await page.locator('[data-pad="-100"] b').textContent(),/P1 · Joy-Con · Left half/);
  assert.match(await page.locator('[data-pad="-101"] b').textContent(),/P2 · Joy-Con · Right half/);
  await page.evaluate(()=>{rawPad.axes[3]=-.8;poll();});
  assert.equal(await page.locator('[data-pad="-101"]').evaluate(el=>el.classList.contains('controller-active')),true);
  await page.evaluate(()=>{rawPad.axes[3]=0;});
  await page.locator('#controller-pair-0').click();
  await page.evaluate(()=>{rawPad.buttons[2].pressed=true;poll();rawPad.buttons[2].pressed=false;poll();});
  assert.deepEqual(await page.evaluate(()=>[...assignments]),[-101,-100]);
  assert.match(await page.locator('[data-pad="-101"] b').textContent(),/P1 · Joy-Con · Right half/);
  assert.match(await page.locator('[data-pad="-100"] b').textContent(),/P2 · Joy-Con · Left half/);
  await page.evaluate(()=>{rawPad.buttons[0].pressed=true;poll();rawPad.buttons[0].pressed=false;poll();});
  assert.equal(await page.locator('#settings').isVisible(),true,'testing bomb must not dismiss settings');
  await page.locator('#controller-pair-1').click();await page.locator('#controller-pair-cancel').click();
  assert.deepEqual(await page.evaluate(()=>[...assignments]),[-101,-100]);
  // Reconnect the same physical pair with a new browser index.
  await page.evaluate(()=>{rawPad.index=7;poll();});
  assert.deepEqual(await page.evaluate(()=>pads().map(p=>p.index)),[-100,-101]);
  const report=await page.evaluate(()=>controllerReport.snapshot());
  assert.equal(report.playerControllers[0].half,'right');
  assert.equal(report.controllerMode,'automatic-with-calibration');
  await page.locator('#close').tap();
  await page.evaluate(()=>{arcade.dismiss();});
  await page.locator('#test').tap();
  assert.equal(await page.locator('#settings').isVisible(),true);
  await page.locator('#close').tap();
  // Saved manual calibration reloads and binds to the unique physical device.
  await page.evaluate(()=>localStorage.setItem('catfighter-half-controllers-v1',JSON.stringify({defaultsEnabled:false,profiles:[{id:rawPad.id,index:99,axes:[{axis:1,rest:0,sign:1},{axis:0,rest:0,sign:1}],buttons:[13,14,15]},null]})));
  await page.reload();
  assert.equal(await page.evaluate(()=>controllerSetup.preferredSlot(pads()[0])),1,'explicit player pairing survives reload');
  assert.equal(await page.evaluate(()=>pads()[0].index),-100);
  assert.equal(await page.evaluate(()=>halfControllers.snapshot().profiles[0].index),1);
  await page.evaluate(()=>$('#half-default').onclick());
  assert.equal(await page.evaluate(()=>controllerSetup.preferredSlot(pads()[0])),undefined,'restore defaults clears explicit half-player preferences');
  assert.equal(await page.evaluate(()=>availableControllerSlot(pads()[0])),0);
  // Settings must be discoverable before Safari exposes any controller.
  for (const [width,height] of [[390,844],[820,1180],[1180,820]]) {
   const touch=await browser.newPage({viewport:{width,height},hasTouch:true});
   touch.on('pageerror',e=>errors.push(e.message));
   await touch.addInitScript(()=>{window.requestAnimationFrame=()=>0;navigator.getGamepads=()=>[];});
   await touch.goto('file://'+path.resolve('index.html'));
   await touch.evaluate(()=>{document.documentElement.requestFullscreen=()=>Promise.resolve();});
   await touch.locator('#boot').tap();await touch.evaluate(()=>arcade.frame(3));
   await touch.locator('#demo-controllers').tap();
   assert.equal(await touch.locator('#settings').isVisible(),true);
   assert.match(await touch.locator('#joycon-ready-0').textContent(),/NOT DETECTED/);
   assert.equal(await touch.locator('#settings').evaluate(el=>el.scrollWidth<=el.clientWidth),true);
   await touch.locator('.half-controllers > summary').tap();
   for (const id of ['half-p1','half-p2','half-default','controller-pair-0','controller-pair-1','close']) {
    assert.ok(await touch.locator('#'+id).evaluate(el=>el.getBoundingClientRect().height>=44));
   }
   // Hardware becomes visible after the touch-only settings panel is open.
   await touch.evaluate(()=>{
    window.singlePads=['R','L'].map((side,index)=>({id:`Joy-Con (${side}) (STANDARD GAMEPAD)`,index,mapping:'standard',connected:true,axes:[0,0],buttons:Array.from({length:17},()=>({pressed:false,value:0}))}));
    navigator.getGamepads=()=>singlePads;poll();
   });
   assert.match(await touch.locator('#joycon-ready-0').textContent(),/LEFT JOY-CON · READY · P1/);
   assert.match(await touch.locator('#joycon-ready-1').textContent(),/RIGHT JOY-CON · READY · P2/);
   assert.deepEqual(await touch.evaluate(()=>halfControllers.snapshot().profiles),[null,null]);
   await touch.locator('#close').tap();
   await touch.evaluate(()=>arcade.dismiss());await touch.locator('#test').tap();
   assert.equal(await touch.locator('#settings').isVisible(),true);
   await touch.close();
  }
  assert.deepEqual(errors,[]);
  console.log('PASS: reported Joy-Con pair right-first/left-first assignment, clear physical names, activity, explicit swap/cancel, no accidental close, reconnect, export and saved calibration reload.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
