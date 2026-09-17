'use strict';
// Real Wi-Fi HTTP/SSE, bundled headless Chromium, intentionally different frame cadences.
const {chromium}=require('playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {createLanServer}=require('../tools/lan-server.cjs');
(async()=>{
 const server=createLanServer();
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
 let browser;
 try{
  browser=await chromium.launch({headless:true});
  const pages=[],errors=[],results=[],out=path.resolve('artifacts/predicted-hit');fs.mkdirSync(out,{recursive:true});
  for(let i=0;i<2;i++){
   const context=await browser.newContext({viewport:{width:900,height:1000}}),page=await context.newPage();
   page.on('pageerror',e=>errors.push(e.message));
   await page.goto(`http://127.0.0.1:${server.address().port}/?transport=lan`);
   await page.evaluate(()=>{document.documentElement.requestFullscreen=()=>Promise.resolve();document.querySelector('#boot').onclick();window.arcade.frame(3);});
   pages.push(page);
  }
  const [host,guest]=pages,run=(p,s)=>p.evaluate(s),click=(p,id)=>p.evaluate(id=>document.querySelector(id).onclick(),id);
  await click(host,'#lan-create');const code=await host.inputValue('#lan-code');
  await guest.evaluate(code=>document.querySelector('#lan-code').value=code,code);await click(guest,'#lan-join');
  await Promise.all(pages.map(p=>p.waitForFunction('lan.ready')));
  for(const p of pages)await click(p,'#lan-close');
  await run(host,`window.aircraftMenu=null;start();wave=999;nextSupply=999;extraLifeSpawned=true;
   players.forEach(p=>p.inv=999);window.requestAnimationFrame=()=>0;
   window.hostFrames=setInterval(()=>frame(performance.now()),35);
   window.hitDamage=0;const originalDamage=damageEnemy;damageEnemy=function(e,n){const before=e.hp;originalDamage(e,n);window.hitDamage+=before-e.hp;};`);
  await guest.waitForFunction("mode==='playing'&&players.length===2");
  await run(guest,`window.trace=[];const originalDraw=draw;draw=function(){
   const before=JSON.stringify({shots,enemies,players});originalDraw();
   const auth=new Map(shots.map(s=>[s.netId,s])),v=lan.lastVisual;
   window.trace.push({unchanged:before===JSON.stringify({shots,enemies,players}),
    shots:v.shots.map(s=>({...s})),auth:shots.map(s=>({...s})),boss:v.enemies.find(e=>e.type==='boss'),mode,
    orphan:v.shots.some(s=>s.netId!=null&&!auth.has(s.netId)),
    p1Predicted:v.shots.some(s=>s.owner?.index===0&&s.age!==undefined)});
  };`);
  for(const [name,direction,level,rapid,duration,type,owner] of [
   ['stationary',0,1,false,4000,'boss',1],['left',-1,1,false,1100,'boss',1],
   ['right',1,1,false,1100,'boss',1],['three-way',0,3,false,4000,'boss',1],
   ['rapid',0,3,true,12000,'boss',1],['small',0,1,false,1800,'small',1],['p1',0,1,false,2500,'boss',0],
  ]){
   await run(host,"keys.clear();pause()");await guest.waitForFunction("mode==='paused'");
   await run(guest,'keys.clear();trace=[]');
   await host.evaluate(({direction,level,rapid,type,owner})=>{
    shots=[];hostile=[];sparks=[];bossDebris=[];bossSpawned=true;loopTransition=0;
    enemies=type==='boss'?[{type:'boss',x:300,y:135,hp:1050,max:1050,age:0,shoot:999}]:[{type:'small',x:300,y:220,hp:3,max:3,age:0,v:0,phase:0,shoot:999}];
    players.forEach((p,i)=>Object.assign(p,{x:i===owner?(direction<0?450:direction>0?200:300):60,y:400,cool:0,level,rapid,inv:999}));
    hitDamage=0;pause();
   },{direction,level,rapid,type,owner});
   await guest.waitForFunction("mode==='playing'");await run(guest,'trace=[]');
   await run(owner?guest:host,`keys.add('KeyF');${direction?`keys.add('${direction<0?'KeyA':'KeyD'}')`:''}`);
   await guest.waitForTimeout(duration);
   await guest.screenshot({path:path.join(out,name+'.png')});
   const trace=await run(guest,'trace'),health=await run(host,'({damage:hitDamage,hp:enemies[0]?.hp})'),damage=health.damage;
   assert.ok(damage>0,name+' damages target');
   assert.ok(trace.every(t=>t.unchanged&&!t.orphan&&!t.p1Predicted),name+' presentation only, removal immediate, P1 unchanged');
   let maxLead=0,backside=0;
   for(const t of trace){
    const ids=t.shots.filter(s=>s.netId!=null).map(s=>s.netId);assert.equal(new Set(ids).size,ids.length,'no duplicate IDs');
    for(const s of t.shots){const a=t.auth.find(a=>a.netId===s.netId);if(a&&s.age!==undefined)maxLead=Math.max(maxLead,a.y-s.y);
     if(t.boss&&s.age!==undefined&&s.y<t.boss.y-100&&Math.abs(s.x-t.boss.x)<70)backside++;
    }
   }
   console.log(name,{maxLead,backside,damage});
   fs.writeFileSync(path.join(out,name+'-trace.json'),JSON.stringify(trace));
   // Stationary center lanes supply an unambiguous Boss traversal check.
   if(name==='stationary'||name==='rapid'){assert.equal(backside,0,name+' no backside emergence');assert.ok(maxLead<150,name+' no FIFO lifetime drift');}
   if(type==='boss')assert.equal(health.hp,1050-damage,'Boss HP equals actual authoritative damage');
   results.push({name,frames:trace.length,damage,maxLead,backside});
   await run(guest,'keys.clear()');await run(host,'keys.clear()');
  }
  await run(host,'pause()');await guest.waitForFunction("mode==='paused'");await guest.waitForTimeout(100);
  assert.ok(await run(guest,'lan.lastVisual.shots.every(s=>s.age===undefined)'),'pause clears predicted visuals');
  await run(host,'pause()');await guest.waitForFunction("mode==='playing'");await run(guest,"keys.add('KeyF')");
  await guest.waitForTimeout(250);assert.ok(await run(guest,'lan.lastVisual.shots.some(s=>s.age!==undefined)'),'resume restores smooth predicted fire');
  assert.deepEqual(errors,[]);fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(results,null,2));console.log('PASS',JSON.stringify(results));
 }finally{await browser?.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
})().catch(e=>{console.error(e);process.exitCode=1;});
