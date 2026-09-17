const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const path=require('node:path');
const fs=require('node:fs');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
 try {
 const page=await browser.newPage({viewport:{width:1200,height:1000}}), errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:8767');
 await page.waitForFunction(()=>enemyAssets.isReady('bossDamage'));
 await page.locator('#start').click();
 await page.evaluate(()=>window.requestAnimationFrame=()=>0);
 await page.waitForTimeout(70);
 const root=path.resolve(__dirname,'../artifacts/boss-damage');
 for(const [i,hp] of [100,75,50,25,10].entries()) {
  await page.evaluate(hp=>{elapsed=180;ambient=30;enemies=[{type:'boss',x:300,y:185,hp,max:100,age:0,shoot:99}];hostile=[];shots=[];sparks=[];flash=0;draw()},hp);
  const bounds = await page.evaluate(() => {
   const context = canvas.getContext('2d'), original = context.drawImage, calls = [];
   context.drawImage = function(image, ...args) {
    // Cached enemy stamps include 32px padding on each side.
    if (image.width === 364 && image.height === 364) {
     const m = this.getTransform();
     calls.push([m.a, m.b, m.c, m.d, m.e + args[0] + 32, m.f + args[1] + 32, image.width - 64]);
    }
    return original.call(this, image, ...args);
   };
   try { draw(); } finally { context.drawImage = original; }
   return calls;
  });
  assert.deepEqual(bounds, [[1,0,0,1,150,35,300]], `stage ${i}: 300px sprite centered on Boss without extra scaling`);
  await page.locator('#game').screenshot({path:path.join(root,`stage-${i}.png`)});
 }
 await page.evaluate(()=>{enemies[0].hp=76;damageEnemy(enemies[0],1);draw()});
 assert.equal(await page.evaluate(()=>enemies[0].damageReactUntil),180.8);
 await page.locator('#game').screenshot({path:path.join(root,'reaction.png')});
 await page.evaluate(()=>{mode='paused';frame(last+35)});
 assert.equal(await page.evaluate(()=>elapsed),180);
 await page.evaluate(()=>{mode='playing';enemies[0].hp=1;bomb(players[0]);flash=0;sparks=[];draw()});
 assert.equal(await page.evaluate(()=>bossDamageStage(bossWreck)),4);
 assert.equal(await page.evaluate(()=>enemies.length),0);
 await page.locator('#game').screenshot({path:path.join(root,'defeat.png')});
 await page.evaluate(()=>update(LEVEL1.loopClearDelay));
 assert.equal(await page.evaluate(()=>bossWreck),null);
 await page.goto('file://'+path.resolve(__dirname,'../index.html'));
 await page.waitForFunction(()=>enemyAssets.isReady('bossDamage'));
 assert.deepEqual(errors,[]);
 fs.writeFileSync(path.join(root,'results.json'),JSON.stringify({passed:true,checks:['five appearances','threshold reaction','pause clock','bomb defeat','harmless angry wreck','next loop reset','file startup'],errors},null,2));
 console.log('PASS Boss damage browser acceptance');
 } finally {await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
