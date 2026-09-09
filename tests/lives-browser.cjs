const {chromium} = require('playwright');
const assert = require('node:assert/strict');
(async () => {
  const browser = await chromium.launch({headless:true, executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
  try {
    const page = await browser.newPage({viewport:{width:390,height:844},hasTouch:true,isMobile:true});
    const errors=[]; page.on('pageerror',e=>errors.push(e.message));
    await page.goto(process.env.CAT_URL || 'http://127.0.0.1:8767');
    await page.evaluate(()=>{window.requestAnimationFrame=()=>0;});
    await page.waitForTimeout(80);
    const run = fn => page.evaluate(fn);
    assert.deepEqual(await run(()=>{keyboard2=true;start();return players.map(p=>p.lives)}),[3,3]);
    assert.deepEqual(await run(()=>{
      const p=players[0];p.level=3;p.rapid=true;p.bombs=1;p.inv=0;hurt(p);hurt(p);bomb(p);
      return [p.lives,p.respawn,p.level,p.rapid,p.bombs,mode];
    }),[2,.8,1,false,1,'playing']);
    assert.deepEqual(await run(()=>{update(.8);const p=players[0];hurt(p);bomb(p);return [p.y,p.entering,p.lives,p.bombs]}),[855,true,2,1]);
    assert.equal(await run(()=>{update(.3);return players[0].y}),789);
    assert.deepEqual(await run(()=>{update(.5);const p=players[0];hurt(p);return [p.y,p.entering,p.inv,p.lives]}),[690,false,3,2]);
    assert.deepEqual(await run(()=>{
      const p=players[0];p.inv=0;hurt(p);update(.8);update(.8);p.inv=0;hurt(p);
      return [p.lives,players[1].lives,mode];
    }),[0,3,'playing']);
    assert.equal(await run(()=>{const p=players[1];for(let i=0;i<3;i++){p.inv=0;hurt(p);if(p.lives){update(.8);update(.8)}}return mode}),'over');
    assert.deepEqual(await run(()=>{
      start();wave=999;const events=[];const original=supply;
      supply=(x,y,type)=>{events.push([Math.round(elapsed),type]);original(x,y,type)};
      for(let i=0;i<180*60;i++){players.forEach(p=>p.inv=10);update(1/60)}
      supply=original;return events;
    }),[[60,'W'],[100,'1UP'],[120,'W']]);
    assert.deepEqual(await run(()=>{
      start();wave=999;drops=[];supply(1,1,'W');supply(2,2,'B');supply(3,3,'W');supply(4,4,'1UP');
      const types=drops.map(d=>d.type);drops=[{x:235,y:690,type:'1UP'}];update(0);
      return [types,players.map(p=>p.lives)];
    }),[['W','B','1UP'],[4,3]]);
    assert.deepEqual(await run(()=>{
      drops=[];const random=Math.random;Math.random=()=>.03;kill({type:'small',x:100,y:100},players[0]);const noDrop=drops.length;
      Math.random=()=>.014;kill({type:'small',x:100,y:100},players[0]);Math.random=random;
      return [noDrop,drops.map(d=>d.type)];
    }),[0,['W']]);
    await run(()=>{drops=[{x:150,y:560,type:'W'},{x:300,y:560,type:'B'},{x:450,y:560,type:'1UP'}];players[0].inv=0;draw();updateHUD()});
    await page.screenshot({path:'artifacts/touch-ui/lives-rewards.png'});
    assert.equal(await page.locator('#flight-health .p1').getAttribute('aria-label'), 'P1: Lives 4, bombs 3');
    assert.ok((await page.locator('#flight-health .p1').textContent()).includes('×4'));
    assert.deepEqual(errors,[]);
    console.log('PASS: three lives, protected bottom fly-in, reset firepower and preserved bombs, co-op defeat, 60-second supplies, one 1UP per level, pickup cap, 1.5% drop threshold, HUD and rendering');
  } finally { await browser.close(); }
})().catch(e=>{console.error(e);process.exitCode=1});
