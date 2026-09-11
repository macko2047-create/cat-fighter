const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const path=require('node:path');
(async()=>{
 const browser=await chromium.launch({headless:true});
 try {
  const page=await browser.newPage({viewport:{width:390,height:844},hasTouch:true});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>window.requestAnimationFrame=()=>0);
  await page.goto('file://'+path.resolve('index.html'));
  await page.evaluate(()=>{document.documentElement.requestFullscreen=()=>Promise.resolve();});
  await page.locator('#boot').click();await page.evaluate(()=>window.arcade.frame(3));
  await page.locator('#demo-lan').click();await page.evaluate(()=>poll());
  await page.locator('#coop-guest').tap();
  assert.equal(await page.locator('#p2p-join').isDisabled(),true);
  for(const digit of ['1','2','3','4','5','6'])await page.locator('#coop-keypad').getByRole('button',{name:digit,exact:true}).tap();
  assert.equal(await page.locator('#p2p-code').inputValue(),'123456');
  assert.equal(await page.locator('#p2p-join').isDisabled(),false);
  await page.locator('#coop-keypad').getByRole('button',{name:'DELETE',exact:true}).tap();
  assert.equal(await page.locator('#p2p-join').isDisabled(),true);
  await page.locator('#coop-back').tap();
  assert.equal(await page.locator('#coop-options').isVisible(),true);
  assert.equal(await page.locator('#coop-local').isVisible(),false,'same-device co-op is hidden');
  await page.locator('#coop-host').tap();
  assert.equal(await page.locator('#coop-host-panel').isVisible(),true);
  await page.locator('#coop-back').tap();
  await page.locator('#coop-guest').focus();
  await page.keyboard.press('Enter');
  assert.equal(await page.locator('#coop-guest-panel').isVisible(),true,'native keyboard activation works');
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#coop-options').isVisible(),true);
  // Exercise the real LAN coordinator with an in-memory transport (no server).
  await page.evaluate(()=>{
   window.CatP2P={request:async action=>({role:action==='create'?'host':'guest',code:'654321',token:'a'.repeat(48)}),
    create:(session,callbacks)=>{window.testConnection=callbacks;return {close(){},send(){},reconnect(){},disconnect(){}};}};
  });
  await page.locator('#coop-host').click();await page.locator('#p2p-create').click();
  await page.waitForFunction(()=>window.lan.active);await page.evaluate(()=>poll());
  assert.match(await page.locator('#coop-role').textContent(),/P1/);
  assert.equal(await page.locator('#coop-start').isDisabled(),true);
  assert.match(await page.locator('#coop-room-code').textContent(),/654321/);
  await page.evaluate(()=>{testConnection.ready();poll();});
  assert.equal(await page.locator('#coop-start').isDisabled(),false);
  assert.equal(await page.locator('#coop-start').evaluate(el=>el.classList.contains('start-ready')),true);
  await page.screenshot({path:'/private/tmp/coop-menu.png'});
  await page.locator('#coop-start').click();
  assert.equal(await page.evaluate(()=>mode),'ready');
  await page.locator('#pilot-confirm-0').tap();
  await page.evaluate(()=>testConnection.message('input',{x:0,y:0,fire:false,target:null,actions:['confirm-aircraft']}));
  await page.locator('#start').tap();
  assert.equal(await page.evaluate(()=>mode),'playing');
  assert.equal(await page.evaluate(()=>players.length),2);
  await page.locator('#lan-bar').click();await page.evaluate(()=>poll());
  assert.equal(await page.locator('#coop-start').textContent(),'RESUME ▶');
  await page.locator('#coop-start').click();
  assert.equal(await page.evaluate(()=>mode),'playing');
  await page.locator('#lan-bar').click();await page.locator('#lan-leave').click();await page.evaluate(()=>poll());
  await page.locator('#coop-guest').click();await page.locator('#p2p-code').fill('654321');
  await page.locator('#p2p-join').click();await page.waitForFunction(()=>window.lan.guest);await page.evaluate(()=>{testConnection.ready();poll();});
  assert.match(await page.locator('#coop-role').textContent(),/P2/);
  assert.equal(await page.locator('#coop-start').isVisible(),true,'guest can open aircraft selection');
  assert.match(await page.locator('#coop-next').textContent(),/Choose your aircraft/);
  await page.evaluate(()=>{testConnection.lost('Test disconnect');poll();});
  assert.equal(await page.locator('#p2p-reconnect').isVisible(),true);
  assert.deepEqual(errors,[]);
  console.log('PASS: co-op mode choice, hidden same-device option, numeric keypad/validation, touch/keyboard activation, P1/P2 identity, waiting/ready/reconnect and host-only start.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
