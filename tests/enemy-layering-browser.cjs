const {chromium}=require('playwright'), assert=require('node:assert/strict'), path=require('node:path');
(async()=>{
 const browser=await chromium.launch({headless:true});
 try {
  const page=await browser.newPage({viewport:{width:600,height:850}});
  await page.addInitScript(()=>window.requestAnimationFrame=()=>0);
  await page.goto('file://'+path.resolve('index.html'));
  await page.waitForFunction(()=>enemyAssets.isReady('boat')&&enemyAssets.isReady('heavy'));
  await page.evaluate(()=>{
   mode='playing';players=[];shots=[];hostile=[];drops=[];sparks=[];bossDebris=[];flash=0;
   const heavy={type:'heavy',x:300,y:300},boat={type:'boat',x:300,y:315};
   enemies=[heavy,boat];draw();
  });
  await page.evaluate(()=>{document.querySelector('#boot-screen').hidden=true;document.body.dataset.arcade='game';document.querySelector('#overlay').style.display='none';});
  await page.evaluate(()=>document.fonts.ready);
  const first=await page.locator('#game').screenshot();
  await page.evaluate(()=>{enemies.reverse();draw();});
  const second=await page.locator('#game').screenshot({path:'/private/tmp/enemy-layering.png'});
  assert.deepEqual(second,first,'actual sprite overlap is identical for either spawn order');
  console.log('PASS: rendered ship/heavy-aircraft overlap is independent of spawn order with actual sprite assets.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
