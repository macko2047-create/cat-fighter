'use strict';
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const path=require('node:path');

(async()=>{
  const browser=await chromium.launch({headless:true});
  try {
    const page=await browser.newPage({viewport:{width:390,height:844},hasTouch:true});
    const errors=[];page.on('pageerror',error=>errors.push(error.message));
    await page.addInitScript(()=>{window.requestAnimationFrame=()=>0;});
    await page.goto('file://'+path.resolve('index.html'));
    await page.evaluate(()=>{document.documentElement.requestFullscreen=()=>Promise.resolve();});
    await page.locator('#boot').click();await page.evaluate(()=>arcade.frame(3));
    assert.equal(await page.locator('#demo-start').isVisible(),true,'boot reaches the existing attract menu');

    await page.locator('#demo-start').click();
    assert.deepEqual(await page.evaluate(()=>({mode,phase:arcade.phase,joined:[...joined],aircraft:[...aircraft]})),
      {mode:'ready',phase:'game',joined:[true,false],aircraft:[0,1]});
    assert.equal(await page.locator('select[id^="aircraft-"]').count(),0,'aircraft dropdowns are absent');
    assert.equal(await page.locator('#aircraft-menu').count(),0,'aircraft selection panel is absent');
    assert.match(await page.locator('#player-status-0').textContent(),/P1 · GINGER.*READY/s);
    assert.match(await page.locator('#player-status-1').textContent(),/P2.*NOT JOINED/s);
    assert.match(await page.locator('#controller-activation-text').textContent(),/PRESS START \/ PRIMARY/);

    await page.locator('#start').click();
    assert.deepEqual(await page.evaluate(()=>({mode,players:players.map(p=>[p.controlSlot,p.aircraft])})),
      {mode:'playing',players:[[0,0]]},'single-player starts without confirmation');
    await page.evaluate(()=>{score=12345;loop=2;wave=17;mode='over';show('GAME OVER','Try again.');arcade.frame(30);});
    assert.equal(await page.locator('#game-over-panel').isVisible(),true,'Game Over uses its dedicated result panel');
    assert.equal(await page.locator('#final-score').textContent(),'012345');
    assert.equal(await page.locator('#final-progress').textContent(),'LOOP 2 · WAVE 17');
    assert.equal(await page.evaluate(()=>arcade.phase),'game','normal browser play does not auto-dismiss Game Over');
    assert.equal(await page.locator('#player-status').isVisible(),false,'Game Over hides ready and join controls');
    for(const [width,height] of [[360,640],[390,844],[844,390],[768,1024],[1024,768],[1440,900]]) {
      await page.setViewportSize({width,height});await page.evaluate(()=>window.dispatchEvent(new Event('resize')));
      const fit=await page.evaluate(()=>{const overlay=$('#overlay'),panel=$('#game-over-panel'),o=overlay.getBoundingClientRect(),p=panel.getBoundingClientRect();return {
        scroll:overlay.scrollHeight<=overlay.clientHeight+1,
        panel:p.top>=o.top-1&&p.left>=o.left-1&&p.right<=o.right+1&&p.bottom<=o.bottom+1,
        page:document.documentElement.scrollWidth<=innerWidth+1&&document.documentElement.scrollHeight<=innerHeight+1,
        overflow:getComputedStyle(overlay).overflowY,
      };});
      assert.deepEqual(fit,{scroll:true,panel:true,page:true,overflow:'hidden'},`Game Over fits ${width}x${height}`);
    }
    await page.setViewportSize({width:390,height:844});await page.evaluate(()=>window.dispatchEvent(new Event('resize')));
    await page.locator('#game-over-retry').click();
    assert.deepEqual(await page.evaluate(()=>players.map(p=>[p.controlSlot,p.aircraft])),[[0,0]],'retry starts directly with fixed P1');

    await page.evaluate(()=>{$('#watch-demo').click();arcade.frame(0);});
    await page.locator('#demo-start').click();
    await page.evaluate(()=>{
      window.rawPads=[0,1].map(index=>({id:'Controller '+index,index,connected:true,mapping:'standard',axes:[0,0],buttons:Array.from({length:17},()=>({pressed:false,value:0}))}));
      navigator.getGamepads=()=>rawPads;poll();
    });
    const press=async(index,button=1)=>page.evaluate(([index,button])=>{
      rawPads[index].buttons[button].pressed=true;rawPads[index].buttons[button].value=1;poll();
      rawPads[index].buttons[button].pressed=false;rawPads[index].buttons[button].value=0;poll();
    },[index,button]);
    await press(0);
    assert.deepEqual(await page.evaluate(()=>({mode,assignments:[...assignments],joined:[...joined]})),
      {mode:'ready',assignments:[0,null],joined:[true,false]},'first controller takes P1 without starting');
    await press(1);
    assert.deepEqual(await page.evaluate(()=>({mode,assignments:[...assignments],joined:[...joined],aircraft:[...aircraft]})),
      {mode:'ready',assignments:[0,1],joined:[true,true],aircraft:[0,1]},'P2 join edge is consumed');
    assert.match(await page.locator('#player-status-1').textContent(),/P2 · MINT.*P2 JOINED/s);
    assert.match(await page.locator('#controller-activation-text').textContent(),/P2 JOINED/);
    await press(0);
    assert.deepEqual(await page.evaluate(()=>players.map(p=>[p.controlSlot,p.aircraft])),[[0,0],[1,1]]);

    await page.evaluate(()=>{$('#watch-demo').click();arcade.frame(0);});
    await page.locator('#demo-start').click();await page.locator('#start').click();
    await page.evaluate(()=>{assignments[0]=0;assignments[1]=null;previous.clear();poll();});
    await press(1);await press(1);await press(1);
    assert.deepEqual(await page.evaluate(()=>({players:players.map(p=>[p.controlSlot,p.aircraft,p.lives,p.bombs,p.inv,p.entering]),mode})),
      {players:[[0,0,3,3,2,false],[1,1,3,3,3,true]],mode:'playing'},'mid-game fixed P2 keeps existing entry balance');

    await page.evaluate(()=>{pause();});
    assert.equal(await page.evaluate(()=>mode),'paused');
    await page.locator('#start').click();assert.equal(await page.evaluate(()=>mode),'playing','Phase 1 pause/resume remains intact');

    await page.evaluate(()=>{score=999;mode='over';show('GAME OVER','Done');});
    await page.locator('#game-over-retry').click();
    assert.deepEqual(await page.evaluate(()=>players.map(p=>[p.controlSlot,p.aircraft])),[[0,0],[1,1]],'co-op retry preserves fixed player composition');

    await page.evaluate(()=>{mode='over';show('GAME OVER','Done');});
    await page.locator('#game-over-main-menu').click();
    assert.deepEqual(await page.evaluate(()=>({mode,phase:arcade.phase})),{mode:'ready',phase:'demo'},'Game Over returns to the main menu');

    await page.evaluate(()=>{$('#watch-demo').click();arcade.frame(0);});
    await page.locator('#demo-lan').click();await page.evaluate(()=>poll());
    assert.equal(await page.locator('#lan-dialog').isVisible(),true,'Wi-Fi entry still opens');
    assert.equal(await page.locator('#link-title').textContent(),'WI-FI CO-OP');
    assert.equal(await page.locator('#coop-host').textContent(),'CREATE GAME');
    assert.equal(await page.locator('#coop-guest').textContent(),'FIND GAME');
    await page.locator('#lan-close').click();

    await page.locator('#demo-start').click();
    for(const [width,height] of [[360,640],[390,844],[844,390],[768,1024],[1440,900]]) {
      await page.setViewportSize({width,height});
      await page.evaluate(()=>window.dispatchEvent(new Event('resize')));
      await page.waitForFunction(()=>
        Math.abs(parseFloat(document.documentElement.style.getPropertyValue('--play-width'))-visualViewport.width)<1 &&
        Math.abs(parseFloat(document.documentElement.style.getPropertyValue('--play-height'))-visualViewport.height)<1);
      const fit=await page.evaluate(()=>{const overlay=$('#overlay'),r=overlay.getBoundingClientRect();return {
        overflow:getComputedStyle(overlay).overflowY,
        vertical:overlay.scrollHeight<=overlay.clientHeight+1,
        overlaySize:{scrollHeight:overlay.scrollHeight,clientHeight:overlay.clientHeight},
        viewport:r.top>=-1&&r.left>=-1&&r.right<=innerWidth+1&&r.bottom<=innerHeight+1,
        page:document.documentElement.scrollWidth<=innerWidth+1&&document.documentElement.scrollHeight<=innerHeight+1,
        rect:{top:r.top,left:r.left,right:r.right,bottom:r.bottom},
        viewportSize:{width:innerWidth,height:innerHeight},
        pageSize:{width:document.documentElement.scrollWidth,height:document.documentElement.scrollHeight},
      };});
      assert.deepEqual({overflow:fit.overflow,vertical:fit.vertical,viewport:fit.viewport,page:fit.page},
        {overflow:'hidden',vertical:true,viewport:true,page:true},`ready UI fits ${width}x${height}: ${JSON.stringify(fit)}`);
    }
    assert.deepEqual(errors,[]);
    console.log('PASS: fixed P1/P2 identities, direct ready-screen controller join, consumed join edge, solo/retry/touch-ready path, drop-in balance, pause, Wi-Fi entry, and no-scroll representative layouts.');
  } finally { await browser.close(); }
})().catch(error=>{console.error(error);process.exitCode=1;});
