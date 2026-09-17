'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const {createShotPrediction}=require('../src/presentation.js');
const {create}=require('../src/input-replication.js');
// Exercise the real shared weapon geometry/cooldown, without running world updates.
const source=fs.readFileSync(require.resolve('../game.js'),'utf8');
const context=vm.createContext({});
vm.runInContext(fs.readFileSync(require.resolve('../src/levels/level1.js'),'utf8'),context);
vm.runInContext(source.slice(source.indexOf('function playerProjectiles('),source.indexOf('function update(')),context);
const spawn=p=>context.playerProjectiles(p),cooldown=p=>context.playerFireCooldown(p);
const player=()=>({netId:2,index:1,x:300,y:690,lives:3,respawn:0,entering:false,cool:0,level:1,rapid:false});
const state=p=>({inputEpoch:1,lastProcessedInput:0,mode:'playing',loop:1,loopTransition:0,players:[{},p],shots:[]});
for(const direction of [-1,0,1])test(`held fire direction ${direction}: current predicted muzzle, independent flight, no gameplay writes`,()=>{
 const p=player(),s=state(p),movement=create();movement.reconcile(s);let sounds=0;
 const shots=createShotPrediction(spawn,cooldown,()=>sounds++);shots.accept(s);
 let previous=[],newCount=0;
 for(let frame=0;frame<30;frame++){
  movement.capture({x:direction,y:0},1/60);const visible=movement.visual(1/60),before=JSON.stringify(s);
  const out=shots.render(s,visible,1/60,true,true);
  assert.equal(JSON.stringify(s),before);assert.equal(s.shots.length,0);
  for(const bullet of out.shots){
   if(bullet.age===0){assert.equal(bullet.x,visible.x);assert.equal(bullet.y,visible.y-25);newCount++;}
   else {const old=previous.find(v=>Math.abs(v.age+1/60-bullet.age)<1e-8);if(old){assert.equal(bullet.x,old.x);assert.ok(Math.abs(bullet.y-old.y-bullet.vy/60)<1e-8);}}
  }
  previous=out.shots;
 }
 assert.equal(sounds,4);assert.equal(newCount,4);
});
test('3-way rapid fire matches host IDs once, keeps independent path and uses host removal',()=>{
 const p={...player(),level:3,rapid:true},s=state(p);let sounds=0;
 const pred=createShotPrediction(spawn,cooldown,()=>sounds++);pred.accept(s);
 const initial=pred.render(s,p,.016,true,true).shots;
 assert.equal(initial.length,3);assert.equal(sounds,1);
 initial.forEach((v,i)=>{assert.equal(v.x,p.x+(i-1)*12);assert.ok(Math.abs(Math.hypot(v.vx,v.vy)-550)<1e-9);});
 const host={...s,shots:initial.map((v,i)=>({...v,x:v.x-30,y:v.y+20,netId:10+i}))};
 const p1={netId:1,x:50,y:100,vx:0,vy:-550,owner:{index:0}};host.shots.push(p1);
 const before=JSON.stringify(host);pred.accept(host);
 let out=pred.render(host,{...p,x:400},.016,true,true);
 assert.equal(out.shots.length,4);assert.equal(out.shots[0],p1);
 out.shots.slice(1).forEach((v,i)=>{assert.equal(v.netId,10+i);assert.equal(v.x,initial[i].x+initial[i].vx*.016);});
 pred.accept(host);out=pred.render(host,p,.016,true,true);assert.equal(out.shots.length,4);assert.equal(sounds,1);
 out=pred.render(host,p,.032,true,true);assert.equal(out.shots.length,7);assert.equal(sounds,2);
 assert.equal(JSON.stringify(host),before);
 const removed={...host,shots:[p1]};pred.accept(removed);out=pred.render(removed,p,0,false,true);
 assert.equal(out.shots.filter(v=>v.netId>=10).length,0);
});
test('unconfirmed shots expire; pause, stale connection, respawn and epoch reset clear prediction',()=>{
 for(const patch of [{mode:'paused'},{loopTransition:1},{inputEpoch:2},{players:[{}, {...player(),respawn:2}]}]){
  const s=state(player()),pred=createShotPrediction(spawn,cooldown,()=>{});pred.accept(s);pred.render(s,s.players[1],.01,true,true);
  const next={...s,...patch};pred.accept(next);assert.equal(pred.render(next,next.players[1],0,false,true).shots.length,0);
 }
 const s=state(player()),pred=createShotPrediction(spawn,cooldown,()=>{});pred.accept(s);pred.render(s,s.players[1],.01,true,true);
 assert.equal(pred.render(s,s.players[1],0,true,false).shots.length,0);
 pred.accept(s);pred.render(s,s.players[1],.01,true,true);
 assert.equal(pred.render(s,s.players[1],.51,false,true).shots.length,0);
});

test('a newer authoritative volley cannot inherit an old pending visual lifetime',()=>{
 const p={...player(),y:400,rapid:true},s=state(p),pred=createShotPrediction(spawn,cooldown,()=>{});
 pred.accept(s);
 const old=pred.render(s,p,0,true,true).shots[0];
 pred.render(s,p,.07,true,true);
 const local=pred.render(s,p,.07,true,true).shots;
 const newest=local.at(-1),host={...s,shots:[{...newest,netId:99,y:newest.y-8}]};
 pred.accept(host);
 const out=pred.render(host,p,0,false,true);
 assert.equal(out.shots.length,1,'superseded unconfirmed pellets must not remain as ghosts');
 assert.equal(out.shots[0].y,newest.y,'match nearest flight, without snapping it');
 assert.notEqual(out.shots[0].y,old.y-550*.14,'do not attach a new ID to the oldest volley');
 const hit={...host,shots:[]};pred.accept(hit);
 assert.equal(pred.render(hit,p,.016,false,true).shots.length,0,'the corresponding visual dies on authoritative removal');
});

for(const [direction,level,rapid] of [[0,1,false],[-1,1,false],[1,1,false],[0,3,false],[0,3,true]]){
 test(`sustained host/client cadence mismatch: direction=${direction}, level=${level}, rapid=${rapid}`,()=>{
  const p={...player(),y:400,level,rapid},s=state(p),pred=createShotPrediction(spawn,cooldown,()=>{});
  pred.accept(s);
  let hostTime=0,nextHost=.035,nextSnapshot=.05,hostCool=0,serial=10,removed=new Set(),hits=0;
  for(let frame=1;frame<=600;frame++){
   const now=frame/60;p.x=300+direction*40*Math.sin(now*2);
   while(nextHost<=now){
    const dt=.035;hostTime=nextHost;nextHost+=dt;hostCool-=dt;
    if(hostCool<=0){hostCool=cooldown(p);s.shots.push(...spawn(p).map(v=>({...v,netId:serial++})));}
    // Authoritative fixture supplies impact/removal; prediction never sees a
    // target or performs collision. All three lanes strike the Boss face.
    for(const v of s.shots){v.x+=v.vx*dt;v.y+=v.vy*dt;if(v.y<195){removed.add(v.netId);hits++;}}
    s.shots=s.shots.filter(v=>!removed.has(v.netId));
   }
   if(now>=nextSnapshot){pred.accept(s);nextSnapshot=now+.05;}
   const before=JSON.stringify(s),out=pred.render(s,p,1/60,true,true);
   assert.equal(JSON.stringify(s),before,'presentation cannot change authority or damage');
   for(const v of out.shots){
    assert.ok(v.y>35,'no predicted bullet emerges above the Boss silhouette');
    const host=s.shots.find(h=>h.netId===v.netId);
    if(host)assert.ok(host.y-v.y<90,'matching must not accumulate volley-sized flight lead');
   }
   assert.equal(new Set(out.shots.filter(v=>v.netId!=null).map(v=>v.netId)).size,out.shots.filter(v=>v.netId!=null).length);
  }
  assert.ok(hits>30);assert.ok(hostTime>9);
  pred.accept({...s,shots:[]});
  assert.equal(pred.render({...s,shots:[]},p,0,false,true).shots.filter(v=>v.netId!=null).length,0);
 });
}

test('authoritative dead flag terminates a matched visual before array compaction',()=>{
 const p=player(),s=state(p),pred=createShotPrediction(spawn,cooldown,()=>{});pred.accept(s);
 const v=pred.render(s,p,0,true,true).shots[0],host={...s,shots:[{...v,netId:99}]};pred.accept(host);
 pred.accept({...host,shots:[{...host.shots[0],dead:true}]});
 const out=pred.render({...host,shots:[{...host.shots[0],dead:true}]},p,0,false,true);
 assert.equal(out.shots.length,0);
});

test('shots already in flight on activation remain visible until host removal',()=>{
 const p=player(),s=state(p);s.shots=[{...spawn(p)[0],owner:{index:1},netId:81}];
 const pred=createShotPrediction(spawn,cooldown,()=>{});pred.accept(s);
 assert.equal(pred.render(s,p,0,false,true).shots[0].netId,81);
 pred.accept({...s,shots:[]});
 assert.equal(pred.render({...s,shots:[]},p,0,false,true).shots.length,0);
});
