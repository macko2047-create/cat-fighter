'use strict';
const {chromium} = require('playwright');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
(async () => {
  const browser = await chromium.launch({headless:true, ...(process.env.CHROME_PATH ? {executablePath:process.env.CHROME_PATH} : {})});
  const out = path.resolve('artifacts/arcade-boot'); fs.mkdirSync(out,{recursive:true});
  try {
    const page = await browser.newPage({viewport:{width:390,height:844},hasTouch:true,isMobile:true});
    const errors=[]; page.on('pageerror', e=>errors.push(e.message));
    await page.addInitScript(()=>{window.requestAnimationFrame=()=>0;});
    await page.goto('file://'+path.resolve('index.html'));
    assert.equal(await page.locator('header, aside, .help, .instructions').count(),0,'page contains only the arcade, with no external manuals');
    await page.evaluate(()=>{document.documentElement.requestFullscreen=()=>Promise.resolve();});
    assert.equal(await page.locator('#boot').isVisible(),true);
    assert.equal(await page.locator('#demo-start').isVisible(),false);
    await page.evaluate(()=>start());
    assert.equal(await page.evaluate(()=>mode),'ready','BOOT cannot be bypassed by start');
    await page.screenshot({path:path.join(out,'01-boot.png')});
    await page.locator('#boot').click();
    await page.evaluate(()=>{sound=false;});
    await page.evaluate(()=>arcade.frame(1.5));
    await page.screenshot({path:path.join(out,'02-booting.png')});
    await page.evaluate(()=>arcade.frame(1.4));
    assert.equal(await page.evaluate(()=>arcade.phase),'demo');
    await page.evaluate(()=>arcade.frame(8));
    assert.match(await page.locator('#demo-title').textContent(),/HOLD & DRAG/);
    await page.screenshot({path:path.join(out,'03-touch-demo.png')});
    const before = await page.evaluate(()=>JSON.stringify({players,score,elapsed,shots,drops,joined}));
    assert.ok(await page.evaluate(()=>arcade.demoState.score>0),'real shots kill enemies and award points');
    await page.evaluate(()=>arcade.frame(5));
    assert.equal(await page.evaluate(()=>arcade.chapter),'release');
    const releasePosition=await page.evaluate(()=>arcade.demoState.players[0].x);
    await page.evaluate(()=>arcade.frame(2));
    assert.equal(await page.evaluate(()=>arcade.demoState.players[0].x),releasePosition);
    assert.equal(await page.evaluate(()=>arcade.demoState.shots.length),0,'release stops firing');
    await page.evaluate(()=>arcade.frame(1)); // RAPID starts at 16 seconds.
    for(const [chapter,length,check,carrier] of [
      ['rapid',6,p=>p.rapid,'small'],['battle',4,null],['double',6,p=>p.level===2,'boat'],
      ['bomb',6,p=>p.bombs===2],['supply',6,p=>p.bombs===4,'heavy'],
      ['spread',6,p=>p.level===3,'boat'],['life',6,p=>p.lives===4,'heavy'],['boss',11,null],['loop',7,null],
    ]) {
      assert.equal(await page.evaluate(()=>arcade.chapter),chapter);
      if(carrier) {
        const state=await page.evaluate(()=>arcade.demoState);
        assert.equal(state.drops.length,0,'rewards cannot appear before a kill');
        assert.equal(state.enemies.filter(e=>e.reward).length,1);
        assert.equal(state.enemies[0].type,carrier);
        if(chapter==='rapid')assert.equal(state.enemies[0].chargeState,'ready');
        await page.screenshot({path:path.join(out,`carrier-${chapter}.png`)});
        if(carrier==='heavy')assert.match(await page.locator('#demo-copy').textContent(),/example/);
      }
      const observation=await page.evaluate(seconds=>{
        let dropped=false,killed=false,windup=false;
        for(let t=0;t<Math.round(seconds*10)-1;t++) {
          arcade.frame(.1);const state=arcade.demoState;
          dropped ||= state.drops.length>0;killed ||= state.score>0;
          windup ||= state.enemies.some(e=>e.chargeState==='windup'||e.chargeState==='charging');
        }
        return {dropped,killed,windup,state:arcade.demoState};
      },length);
      if(check)assert.ok(check(observation.state.players[0]),chapter+' uses actual pickup/bomb rules: '+JSON.stringify(observation));
      if(carrier) {
        assert.ok(observation.killed,chapter+' requires a real kill');
        assert.ok(observation.dropped,chapter+' shows a collectible drop');
        await page.screenshot({path:path.join(out,`reward-${chapter}.png`)});
      }
      if(chapter==='boss')assert.ok(observation.state.enemies.length===0 || observation.state.enemies[0].hp<195,'boss takes damage from actual shots');
      if(chapter==='loop') {
        assert.equal(observation.state.loop,2);
        assert.equal(observation.state.enemies[0].difficulty,1.05);
        assert.match(await page.locator('#demo-title').textContent(),/\+5%/);
      }
      await page.evaluate(()=>arcade.frame(.1));
    }
    assert.equal(await page.evaluate(()=>arcade.chapter),'title','74-second lesson cycle wraps');
    assert.equal(await page.evaluate(()=>JSON.stringify({players,score,elapsed,shots,drops,joined})),before,'demo cannot mutate live game');
    assert.ok(await page.evaluate(()=>{
      const livePlayers=players,liveMode=mode;
      try {runGamePreview(arcade.demoState,()=>{throw Error('probe');});}catch{}
      return players===livePlayers&&mode===liveMode;
    }),'preview restores live state on exceptions');
    await page.evaluate(()=>arcade.frame(8));
    for(const [width,height] of [[360,640],[844,390],[1440,900]]) {
      await page.setViewportSize({width,height});
      await page.waitForTimeout(100);
      await page.evaluate(()=>arcade.frame(0));
      const rect=await page.locator('#demo-start').boundingBox();
      assert.ok(rect.y>=0&&rect.y+rect.height<=height,'START stays on screen');
      assert.equal(await page.locator('#test').isVisible(),false);
      const hand=await page.locator('#demo-finger').boundingBox();
      await page.screenshot({path:path.join(out,`05-demo-${width}.png`)});
      assert.ok(hand.y+hand.height<rect.y,'hand instruction remains above START: '+JSON.stringify({width,height,hand,rect}));
    }
    await page.setViewportSize({width:390,height:844});
    await page.locator('#demo-start').click();
    assert.equal(await page.evaluate(()=>mode),'ready');
    await page.locator('#pilot-confirm-0').click();await page.locator('#start').click();
    assert.equal(await page.evaluate(()=>mode),'playing');
    assert.equal(await page.evaluate(()=>players[0].bombs),3);
    assert.equal(await page.evaluate(()=>score),0);
    await page.locator('#pause').click();
    await page.locator('#watch-demo').click();
    assert.equal(await page.evaluate(()=>arcade.phase),'demo');
    await page.locator('#demo-options').click();
    await page.locator('[data-slot="0"][data-model="1"]').click();
    await page.locator('#pilot-confirm-0').click();
    await page.locator('#start').click();
    assert.equal(await page.evaluate(()=>players.length),1);
    await page.evaluate(()=>{mode='over';show('GAME OVER','Test');arcade.frame(14);});
    assert.equal(await page.evaluate(()=>arcade.phase),'game');
    await page.locator('#start').click();
    await page.locator('#pilot-confirm-0').click();await page.locator('#start').click();
    await page.evaluate(()=>arcade.frame(20));
    assert.equal(await page.evaluate(()=>mode),'playing','retry cancels idle return');
    await page.evaluate(()=>{mode='over';show('GAME OVER','Test');const original=window.lan;window.lan={active:true};try{arcade.frame(30);}finally{window.lan=original;}});
    assert.equal(await page.evaluate(()=>arcade.phase),'game','LAN never auto leaves for demo');
    await page.evaluate(()=>arcade.frame(15));
    assert.equal(await page.evaluate(()=>arcade.phase),'demo','idle GAME OVER returns automatically');
    assert.deepEqual(errors,[]);
    console.log('PASS: BOOT, real demo kills/pickups/bombs/Boss damage, chapters and wrap, state isolation and exception recovery, visible gestures, START, solo selection, idle return/retry/LAN guard, no browser errors.');
  } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
