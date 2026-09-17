const {chromium} = require('playwright');
const assert = require('node:assert/strict');
const path = require('node:path');
(async () => {
  const browser = await chromium.launch({headless:true, executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto('file://' + path.resolve(process.env.CAT_ROOT || '.', 'index.html'));
    await page.evaluate(() => { window.requestAnimationFrame = () => 0; });
    await page.waitForTimeout(80);
    const result = await page.evaluate(() => {
      start(); wave=999; nextSupply=999; extraLifeSpawned=true;
      const results=[];
      for (const order of [['rapid','double','spread','double','rapid'], ['double','rapid'], ['spread','rapid']]) {
        Object.assign(players[0], {level:1, rapid:false});
        for (const weapon of order) {
          keys.clear(); supply(players[0].x,players[0].y,'W',weapon); update(0);
          keys.add('KeyF'); shots=[]; players[0].cool=0; update(0);
          results.push({weapon,level:players[0].level,cool:players[0].cool,
            angles:shots.map(s=>Math.atan2(s.vx,-s.vy)*180/Math.PI),
            speeds:shots.map(s=>Math.hypot(s.vx,s.vy))});
        }
      }
      keys.clear(); enemies=[]; drops=[]; nextSupply=50; extraLifeSpawned=false;
      elapsed=50; update(0);
      const scheduled=[enemies.find(e=>e.reward).reward.weapon];
      elapsed=100; update(0);
      if(enemies.filter(e=>e.reward).length!==1) throw Error('overlapping carriers');
      const carrier=enemies.find(e=>e.reward); carrier.hp=0; kill(carrier,players[0]); update(0);
      if(enemies.some(e=>e.reward)) throw Error('carrier overlaps drop');
      drops=[]; update(0); scheduled.push(enemies.find(e=>e.reward).reward.weapon);
      enemies=[]; update(0); scheduled.push(enemies.find(e=>e.reward).reward.type);
      enemies=[]; elapsed=150; update(0); scheduled.push(enemies.find(e=>e.reward).reward.weapon);
      enemies[0].x=300; enemies[0].y=220; draw();
      return {results,scheduled};
    });
    assert.deepEqual(result.scheduled,['rapid','double','1UP','spread']);
    const levels=[1,2,3,2,2,2,2,3,3], cooldowns=[.06,.06,.06,.06,.06,.12,.06,.12,.06];
    result.results.forEach((r,i)=>{
      assert.equal(r.level,levels[i]); assert.equal(r.cool,cooldowns[i]);
      assert.equal(r.angles.length,r.level);
      r.angles.forEach((a,j)=>assert.ok(Math.abs(a-(r.level===3?(j-1)*30:0))<1e-9));
      r.speeds.forEach(v=>assert.ok(Math.abs(v-550)<1e-9));
    });
    await page.screenshot({path:'artifacts/touch-ui/bonus-three-types.png'});
    for (const [width,height] of [[390,844],[360,640],[844,390],[1440,900]]) {
      await page.setViewportSize({width,height});
      const r=await page.evaluate(()=>{
        const g=canvas.getBoundingClientRect(), b=document.querySelector('.bottomline').getBoundingClientRect();
        return {w:g.width,h:g.height,x:g.x,y:g.y,bottom:b.bottom,hudHeight:b.height,deck:!!document.querySelector('.control-deck')};
      });
      assert.equal(r.deck,false);
      assert.ok(Math.abs(r.w/r.h-.75)<.001);
      assert.ok(Math.abs(r.h-Math.min(height-r.hudHeight,width/0.75))<1);
      assert.ok(r.x>=0 && r.y>=0 && r.bottom<=height+1);
    }
    assert.deepEqual(errors,[]);
    console.log('PASS: three independent bonuses, 30-degree spread, serialized carriers and pickups, four maximum-size layouts, no browser errors');
  } finally { await browser.close(); }
})().catch(e=>{console.error(e);process.exitCode=1});
