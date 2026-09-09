'use strict';
const {chromium} = require('playwright');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
(async () => {
  const browser = await chromium.launch({headless:true, executablePath:process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
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
    for(const [chapter,length,check] of [
      ['rapid',5,p=>p.rapid],['battle',4,null],['double',5,p=>p.level===2],
      ['bomb',6,p=>p.bombs===2],['supply',4,p=>p.bombs===4],
      ['spread',5,p=>p.level===3],['life',4,p=>p.lives===4],['boss',11,null],
    ]) {
      assert.equal(await page.evaluate(()=>arcade.chapter),chapter);
      await page.evaluate(()=>arcade.frame(2.5));
      if(check)assert.ok(check(await page.evaluate(()=>arcade.demoState.players[0])),chapter+' uses actual pickup/bomb rules');
      if(chapter==='bomb'){
        assert.equal(await page.evaluate(()=>arcade.demoState.hostile.length),0,'bomb clears actual bullets');
        assert.ok(await page.evaluate(()=>arcade.demoState.score>0),'bomb kills actual enemies');
        await page.screenshot({path:path.join(out,'04-bomb-demo.png')});
      }
      if(chapter==='spread')await page.screenshot({path:path.join(out,'04-reward-demo.png')});
      if(chapter==='boss')assert.ok(await page.evaluate(()=>arcade.demoState.enemies[0].hp<LEVEL1.bossHP1P*.3),'boss takes damage from actual shots');
      await page.evaluate(dt=>arcade.frame(dt),length-2.5);
    }
    assert.equal(await page.evaluate(()=>arcade.chapter),'title','60-second loop wraps');
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
      assert.ok(hand.y+hand.height<rect.y,'hand instruction remains above START');
      await page.screenshot({path:path.join(out,`05-demo-${width}.png`)});
    }
    await page.setViewportSize({width:390,height:844});
    await page.locator('#demo-start').click();
    assert.equal(await page.evaluate(()=>mode),'playing');
    assert.equal(await page.evaluate(()=>players[0].bombs),3);
    assert.equal(await page.evaluate(()=>score),0);
    await page.locator('#pause').click();
    await page.locator('#watch-demo').click();
    assert.equal(await page.evaluate(()=>arcade.phase),'demo');
    await page.locator('#demo-options').click();
    await page.locator('#join-p1').click(); await page.locator('#join').click();
    await page.locator('#start').click();
    assert.equal(await page.evaluate(()=>players.length),2);
    await page.evaluate(()=>{mode='over';show('GAME OVER','Test');arcade.frame(14);});
    assert.equal(await page.evaluate(()=>arcade.phase),'game');
    await page.locator('#start').click();
    await page.evaluate(()=>arcade.frame(20));
    assert.equal(await page.evaluate(()=>mode),'playing','retry cancels idle return');
    await page.evaluate(()=>{mode='over';show('GAME OVER','Test');const original=window.lan;window.lan={active:true};try{arcade.frame(30);}finally{window.lan=original;}});
    assert.equal(await page.evaluate(()=>arcade.phase),'game','LAN never auto leaves for demo');
    await page.evaluate(()=>arcade.frame(15));
    assert.equal(await page.evaluate(()=>arcade.phase),'demo','idle GAME OVER returns automatically');
    assert.deepEqual(errors,[]);
    console.log('PASS: BOOT, real demo kills/pickups/bombs/Boss damage, chapters and wrap, state isolation and exception recovery, visible gestures, START, co-op, idle return/retry/LAN guard, no browser errors.');
  } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
