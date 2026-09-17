'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const {create}=require('../src/input-replication.js');
const source=fs.readFileSync(process.env.CAT_P2_GAME_SOURCE||require.resolve('../game.js'),'utf8');
const lanSource=fs.readFileSync(process.env.CAT_P2_LAN_SOURCE||require.resolve('../src/lan.js'),'utf8');
const {createShotPrediction}=require(process.env.CAT_P2_PRESENTATION_SOURCE||'../src/presentation.js');
const geometry=vm.createContext({});
vm.runInContext(fs.readFileSync(require.resolve('../src/levels/level1.js'),'utf8'),geometry);
vm.runInContext(source.slice(source.indexOf('function playerProjectiles('),source.indexOf('function update(')),geometry);
const player=()=>({netId:2,index:1,x:300,y:400,lives:3,respawn:0,entering:false,cool:0,level:1,rapid:false});
const state=(p,ack=0)=>({inputEpoch:1,lastProcessedInput:ack,mode:'playing',loop:1,loopTransition:0,players:[{}, {...p}],shots:[]});

// Use the real frame dt plumbing and real LAN send gate; deterministic network
// scheduling keeps comparisons reproducible without confusing ACK error with lag.
function movementTrial(hostMs,reverse){
 const guest=create(),host=create(),p=player();host.reset(1);guest.reconcile(state(p));
 const sent=[],snapshots=[];let now=0,max=0,collisionMax=0,lastHost=0,snapshotAt=0,nearMiss;
 const send=vm.createContext({session:{role:'guest'},lan:{guest:true},busy:false,lastSend:0,checkTimeout(){}});
 vm.runInContext('function due(now){'+lanSource.slice(lanSource.indexOf('      if(!session)return;',lanSource.indexOf('    tick(now)')),lanSource.indexOf('      busy=true;lastSend=now;',lanSource.indexOf('    tick(now)')))+'lastSend=now;return true;}',send);
 const runtime=vm.createContext({last:0,window:{lan:{tick(){}}},ambient:0,mode:'playing',poll(){},draw(){},updateEffects(){},requestAnimationFrame(){},hudClock:0,updateHUD(){},
  update(dt,movementDt=dt){host.process(p,movementDt,true);collisionMax=Math.max(collisionMax,Math.abs(guest.visual(0).x-p.x));}
 });
 vm.runInContext(source.slice(source.indexOf('function frame(ts) {'),source.indexOf('\nupdateHUD();',source.indexOf('function frame(ts) {'))),runtime);
 for(now=0;now<=2000;now++){
  if(now>0&&now%10===0){const x=reverse?(Math.floor((now-1)/250)%2?-1:1):1;guest.capture({x,y:0,target:null},.01);
   if(send.due(now))sent.push({at:now+10,data:guest.packet()});}
  while(sent[0]?.at<=now)host.receive(sent.shift().data);
  if(now>0&&now%hostMs===0){runtime.frame(now);lastHost=now;
   if(now>=snapshotAt){snapshots.push({at:now+10,data:state(p,host.diagnostics().lastProcessedInput)});snapshotAt=now+50;}}
  while(snapshots[0]?.at<=now)guest.reconcile(snapshots.shift().data);
  const visible=guest.visual(0);max=Math.max(max,Math.abs(visible.x-p.x));
  // At the authoritative collision tick, a bullet that clears the visible
  // plane by 40 px must also clear the host plane in this 10 ms LAN fixture.
  if(now===800&&lastHost===now){const bullet={x:visible.x-40,y:p.y,vx:0,vy:0};
   const collision=source.slice(source.indexOf('  for (const b of hostile) {',source.indexOf('function update(')),source.indexOf('  for (const d of drops) {',source.indexOf('function update(')));
   const c=vm.createContext({hostile:[bullet],players:[p],dt:.035,mode:'playing',Math,hurt(){c.hit=true;},hit:false});
   vm.runInContext('(function(){'+collision+'})()',c);nearMiss={visibleClearance:40,hostClearance:Math.abs(p.x-bullet.x),hit:c.hit};}
 }
 return {max,collisionMax,nearMiss,queued:host.diagnostics().queuedInputs,replayError:guest.diagnostics().maxError};
}
for(const hostMs of [20,40,50])for(const reverse of [false,true])test(`D/E: host ${hostMs} ms, ${reverse?'reversals':'sustained movement'}`,()=>{
 const r=movementTrial(hostMs,reverse);console.log('P2 divergence',JSON.stringify({hostMs,reverse,...r}));
 assert.ok(r.collisionMax<=10.4+1e-7,'movement queued by frame dt must not accumulate before collision');
 assert.ok(r.max<=23.4+1e-7,'same-wall-time divergence bounded by input delivery and one host frame');
 assert.ok(r.replayError<1e-7,'ACK replay uses identical movement deltas');
 assert.equal(r.nearMiss.hit,false,'host agrees with the visible near miss');
});

test('A/B/C: every newly visible P2 shot is born at the current rendered muzzle, including unmatched host volleys',()=>{
 const p=player(),s=state(p),pred=createShotPrediction(geometry.playerProjectiles,geometry.playerFireCooldown,()=>{});pred.accept(s);
 let serial=10,births=0;
 for(let frame=0;frame<180;frame++){
  p.x+=(Math.floor(frame/13)%2?-1:1)*260/60;
  // Host can deliver two volleys while only one local pellet is pending.
  if(frame%9===0){s.shots=[0,1].map(i=>({...geometry.playerProjectiles({...p,x:p.x-45})[0],owner:{index:1},netId:serial++,y:p.y-25-i*70}));pred.accept(s);}
  const out=pred.render(s,p,1/60,true,true);
  for(const v of out.shots){assert.notEqual(v.age,undefined,'no delayed host fallback may masquerade as a local birth');
   if(v.age===0){births++;assert.equal(v.x,p.x);assert.equal(v.y,p.y-25);}}
 }
 assert.ok(births>20);
});

test('nearest-match supersession cannot reveal a delayed second host volley',()=>{
 const p=player(),s=state(p),pred=createShotPrediction(geometry.playerProjectiles,geometry.playerFireCooldown,()=>{});pred.accept(s);
 pred.render(s,p,0,true,true);
 const newest=pred.render(s,p,.14,true,true).shots.at(-1);
 const host={...s,shots:[{...newest,age:undefined,netId:90,y:newest.y-8},{...newest,age:undefined,netId:91,y:newest.y+58}]};
 pred.accept(host);
 const out=pred.render(host,p,0,false,true);
 assert.deepEqual(out.shots.map(v=>v.netId),[90]);
 assert.equal(out.shots[0].y,newest.y,'keep nearest flight matching without moving the visual');
 pred.accept({...s,shots:[]});assert.equal(pred.render({...s,shots:[]},p,0,false,true).shots.length,0);
});
