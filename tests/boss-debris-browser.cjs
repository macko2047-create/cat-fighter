const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const path=require('node:path');
const fs=require('node:fs');
const {pathToFileURL}=require('node:url');
(async()=>{
  const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
  try {
    const page=await browser.newPage({viewport:{width:1100,height:1000}}),errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.addInitScript(()=>{window.requestAnimationFrame=()=>0;});
    await page.goto(pathToFileURL(path.resolve('index.html')).href);
    await page.waitForFunction(()=>enemyAssets.isReady('bossDamage'));
    await page.evaluate(()=>{keyboard2=true;start();elapsed=180;wave=999;ambient=30;});
    const result=await page.evaluate(()=>{
      const e={type:'boss',x:300,y:220,hp:100,max:100,age:0,shoot:99};
      enemies=[e]; const counts=[];
      const random=Math.random;
      Math.random=()=>{throw new Error('Visual debris consumed gameplay RNG');};
      try {
        for(const hp of [75,50,25,10]) {
          damageEnemy(e,e.hp-hp);counts.push(bossDebris.length);
          const count=bossDebris.length;damageEnemy(e,.01);
          if(bossDebris.length!==count)throw new Error('Repeated burst within one stage');
        }
        damageEnemy({type:'small',x:1,y:1,hp:3},1);
      } finally {Math.random=random;}
      const before=JSON.stringify(bossDebris);draw();
      const readOnly=JSON.stringify(bossDebris)===before;
      const initial={...bossDebris[0]};updateBossDebris(.2);
      const moved={...bossDebris[0]};
      mode='paused';const paused=JSON.stringify(bossDebris);frame(last+35);
      const frozen=JSON.stringify(bossDebris)===paused;mode='playing';
      updateBossDebris(3);const expired=bossDebris.length;
      e.hp=100;damageEnemy(e,95);const skipped=bossDebris.length;
      const scores=score,lives=players.map(p=>p.lives);updateBossDebris(.2);
      return {counts,readOnly,initial,moved,frozen,expired,skipped,scoreUnchanged:score===scores,livesUnchanged:JSON.stringify(lives)===JSON.stringify(players.map(p=>p.lives))};
    });
    assert.deepEqual(result.counts,[36,86,150,228]);
    assert.equal(result.readOnly,true);assert.equal(result.frozen,true);
    assert.equal(result.expired,0);assert.equal(result.skipped,228);
    assert.notEqual(result.initial.x,result.moved.x);assert.notEqual(result.initial.angle,result.moved.angle);
    assert.ok(result.moved.life<result.initial.life);
    assert.equal(result.scoreUnchanged,true);assert.equal(result.livesUnchanged,true);
    const dir='artifacts/boss-debris';fs.mkdirSync(dir,{recursive:true});
    for (const [stage,hp] of [[1,75],[2,50],[3,25],[4,10]]) {
      await page.evaluate(({stage,hp})=>{
        bossDebris=[];sparks=[];enemies[0].hp=hp+.1;damageEnemy(enemies[0],.1);
        updateBossDebris(.23);draw();updateHUD();
      },{stage,hp});
      await page.locator('#game').screenshot({path:`${dir}/stage-${stage}.png`});
    }
    assert.deepEqual(await page.evaluate(()=>{
      bossDebris=[];enemies[0].hp=100;bomb(players[0]);const count=bossDebris.length;
      damageEnemy(enemies[0],10);kill(enemies[0],players[0]);
      const dying=bossDebris.length;updateBossDebris(.2);const animating=bossDebris[0].life<bossDebris[0].duration;
      update(LEVEL1.loopClearDelay);const cleared=bossDebris.length;
      burstBossDebris({x:300,y:200},4);mode='over';start();
      return {count,dying,animating,cleared,restart:bossDebris.length};
    }),{count:228,dying:228,animating:true,cleared:0,restart:0});
    assert.deepEqual(errors,[]);
    console.log('PASS: four damage bursts, threshold-only triggers, multi-stage bomb, no gameplay RNG, read-only rendering, rotation/expiry, pause, defeat and restart/next-loop cleanup');
  } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
