const {chromium}=require('playwright'),assert=require('node:assert/strict'),path=require('node:path');
(async()=>{
 const browser=await chromium.launch({headless:true});
 try {
  const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{window.requestAnimationFrame=()=>0;});
  await page.goto('file://'+path.resolve('index.html'));
  await page.evaluate(()=>{
   window.testNow=100;Object.defineProperty(performance,'now',{value:()=>testNow});
   window.makePad=(id,index)=>({id,index,mapping:'standard',connected:true,axes:[0,0,0,0],buttons:Array.from({length:17},()=>({pressed:false,value:0}))});
   window.disconnect=p=>{const e=new Event('gamepaddisconnected');Object.defineProperty(e,'gamepad',{value:p});window.dispatchEvent(e);};
   window.raw=[];navigator.getGamepads=()=>raw;
   window.resetRun=()=>{mode='playing';players=[{...pilot(0),controlSlot:0}];assignments.fill(null);previous.clear();};
  });
  for(const [side,fire] of [['L',1],['R',3]]) {
   const input=await page.evaluate(([side,fire])=>{
    resetRun();raw=[makePad(`Joy-Con (${side}) (STANDARD GAMEPAD)`,4)];
    raw[0].axes=[.7,-.6,0,0];raw[0].buttons[fire].pressed=true;poll();
    return {slot:assignments[0],input:input(0),mode};
   },[side,fire]);
   assert.equal(input.slot,side==='L'?-100:-101,'single controller attaches to existing solo player');
   assert.ok(input.input.x>0 && input.input.y<0 && input.input.fire);
   assert.equal(input.mode,'playing');
  }
  for(const [side,slot] of [['L',0],['R',1]]) {
   const state=await page.evaluate(([side,slot])=>{
    resetRun();raw=[makePad('Joy-Con (L/R) (STANDARD GAMEPAD)',1)];pads();assignments[0]=-100-slot;
    const combined=raw[0];raw=[makePad(`Joy-Con (${side}) (STANDARD GAMEPAD)`,8)];
    raw[0].axes=[.6,0,0,0];disconnect(combined);poll();testNow+=600;poll();
    return {mode,x:input(0).x,slot:assignments[0]};
   },[side,slot]);
   assert.equal(state.mode,'playing','unused half sleeps: combined-to-single handover does not pause');
   assert.equal(state.x,.6);assert.equal(state.slot,-100-slot);
  }
  await page.evaluate(()=>{const used=raw[0];raw=[];disconnect(used);poll();});
  assert.equal(await page.evaluate(()=>mode),'playing','allow bounded browser handover');
  await page.evaluate(()=>{testNow+=600;poll();});
  assert.equal(await page.evaluate(()=>mode),'paused','active half really disconnected: pause');
  const modeAfterIdle=await page.evaluate(()=>{
   resetRun();raw=[makePad('Full pad 1',10),makePad('Full pad 2',11)];assignments[0]=10;assignments[1]=11;
   const unused=raw.pop();disconnect(unused);return mode;
  });
  assert.equal(modeAfterIdle,'playing','assigned but nonparticipating full pad cannot pause solo game');
  await page.evaluate(()=>{const used=raw.pop();disconnect(used);});
  assert.equal(await page.evaluate(()=>mode),'paused','participating full pad still pauses safely');
  assert.deepEqual(errors,[]);
  console.log('PASS: left/right standalone movement/fire, solo hot attachment, combined-to-single survival after unused half sleep, active-half disconnect and unused/active full-pad disconnect.');
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
