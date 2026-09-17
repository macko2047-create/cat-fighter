// Real Chromium acceptance. Requires playwright on NODE_PATH and local server.
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const path=require('node:path');
const fs=require('node:fs');
const root=path.resolve(__dirname,'..');
async function main(){
  const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
  try {
    const page=await browser.newPage({viewport:{width:1440,height:1080},deviceScaleFactor:1});
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(process.env.LEVEL1_URL||'http://127.0.0.1:8767');
    await page.waitForFunction(()=>Object.keys(PLAYER_ASSETS).every(id=>playerAssets.isReady(id))&&Object.keys(ENEMY_ASSETS).every(id=>enemyAssets.isReady(id)));
    await page.screenshot({path:path.join(root,'artifacts/level1/ready.png')});
    await page.evaluate(()=>{joined[0]=joined[1]=true;});await page.locator('#start').click();
    assert.equal(await page.evaluate(()=>players.length),2);
    await page.keyboard.down('KeyF');await page.waitForTimeout(300);await page.keyboard.up('KeyF');
    assert.ok(await page.evaluate(()=>shots.length>0));
    await page.keyboard.press('Escape');assert.equal(await page.evaluate(()=>mode),'paused');
    await page.keyboard.press('Enter');assert.equal(await page.evaluate(()=>mode),'playing');
    // Freeze RAF for reproducible renderer and simulation checks; production is unchanged.
    await page.evaluate(()=>{window.requestAnimationFrame=()=>0;});await page.waitForTimeout(60);
    await page.evaluate(()=>{
      players.forEach(p=>{p.lives=3;p.inv=0;});
      enemies=[{type:'small',x:170,y:230,hp:3},{type:'small',x:280,y:270,hp:3},
        {type:'heavy',x:425,y:350,hp:18},{type:'boat',x:120,y:440,hp:3}];
      hostile=[{x:235,y:560},{x:260,y:540},{x:285,y:520}];
      drops=[{x:360,y:520,type:'W'}];ambient=25;draw();updateHUD();
    });
    await page.locator('#game').screenshot({path:path.join(root,'artifacts/level1/formation.png')});
    await page.evaluate(()=>{
      mode='ready';start();
      for(let i=0;i<175*60+1;i++){players.forEach(p=>{p.lives=3;p.inv=10});update(1/60)}
      const boss=enemies.find(e=>e.type==='boss');
      if(!boss||boss.max!==1050)throw new Error('2P Boss spawn/HP');
      enemies=[boss];boss.y=150;boss.x=300;boss.hp=500;boss.shoot=0;update(.016);
      if(boss.shoot!==.62)throw new Error('mid-damage fire cadence');
      players.forEach(p=>p.inv=0);draw();updateHUD();
    });
    await page.locator('#game').screenshot({path:path.join(root,'artifacts/level1/boss.png')});
    await page.evaluate(()=>{enemies[0].hp=1;bomb(players[0]);draw();updateHUD()});
    assert.equal(await page.evaluate(()=>mode),'playing');
    assert.ok(await page.evaluate(()=>loopTransition>0));
    await page.screenshot({path:path.join(root,'artifacts/level1/victory.png')});
    await page.evaluate(()=>{update(LEVEL1.loopClearDelay);draw();updateHUD()});
    assert.equal(await page.evaluate(()=>loop),2);
    assert.equal(await page.evaluate(()=>elapsed),0);
    await page.evaluate(()=>{update(.8);update(.8)});
    await page.evaluate(()=>{for(let life=0;life<3;life++){players.forEach(p=>{p.inv=0;hurt(p)});if(life<2){update(.8);update(.8)}}});
    assert.equal(await page.evaluate(()=>mode),'over');
    await page.evaluate(()=>{joined[0]=true;joined[1]=false;});await page.locator('#start').click();
    assert.equal(await page.evaluate(()=>players.length),1);
    await page.evaluate(()=>{elapsed=175;update(.016)});
    assert.equal(await page.evaluate(()=>enemies.find(e=>e.type==='boss').max),650);
    await page.goto('file://'+path.join(root,'index.html'));
    await page.waitForFunction(()=>Object.keys(PLAYER_ASSETS).every(id=>playerAssets.isReady(id))&&Object.keys(ENEMY_ASSETS).every(id=>enemyAssets.isReady(id)));
    await page.locator('#start').click();
    assert.equal(await page.evaluate(()=>mode),'playing');
    assert.deepEqual(errors,[]);
    fs.writeFileSync(path.join(root,'artifacts/level1/browser-results.json'),JSON.stringify({passed:true,checks:['all six PNG assets loaded','2P start','keyboard fire','pause/resume','175-second simulation','2P Boss HP','mid-damage fire','mission clear','automatic next loop','team defeat','restart reset'],pageErrors:errors},null,2));
    console.log('PASS Level 1 Chromium acceptance');
  }finally{await browser.close()}
}
main().catch(e=>{console.error(e);process.exitCode=1});
