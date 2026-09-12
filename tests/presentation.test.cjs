'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');
const {create}=require('../src/presentation.js');
const entity=(netId,x,more={})=>({netId,x,y:100,...more});
const state=(x=100)=>({mode:'playing',loop:1,loopTransition:0,elapsed:1,ambient:1,players:[entity(1,x),entity(2,300,{lives:3,respawn:0,entering:false})],enemies:[entity(3,x,{type:'boss'})],shots:[entity(4,x)],hostile:[entity(5,x)],drops:[entity(6,x)],sparks:[],bossDebris:[]});
const neutral={x:0,y:0,target:null};
function setup(){const p=create(),a=state(),b=state(120);b.elapsed=a.elapsed+.05;p.accept(a,0);p.accept(b,50);return {p,a,b};}
test('interpolates every moving group using copies; authoritative state stays byte-identical',()=>{const {p,b}=setup(),before=JSON.stringify(b),r=p.render(b,125,neutral,true);for(const g of ['players','enemies','shots','hostile','drops'])assert.equal(r[g][0].x,110);assert.equal(JSON.stringify(b),before);});
test('latest membership prevents ghosts and mismatched IDs cannot blend',()=>{const {p,b}=setup();const c={...b,enemies:[entity(30,400,{type:'boss'})],shots:[]};p.accept(c,100);const r=p.render(c,125,neutral,true);assert.equal(r.enemies[0].x,400);assert.equal(r.shots.length,0);});
test('teleport, death, entering and pause snap safely',()=>{for(const patch of [{x:450},{lives:2},{entering:true},{respawn:2}]){const {p,b}=setup();Object.assign(b.players[1],patch);p.accept(b,100);assert.deepEqual(p.render(b,125,neutral,true).players[1],b.players[1]);}const {p,b}=setup();b.mode='paused';p.accept(b,100);assert.equal(p.render(b,125,neutral,true),b);});
test('immediate local motion, smooth release reconciliation, no authoritative write',()=>{const {p,b}=setup();p.render(b,100,neutral,true);const r=p.render(b,116.67,{x:1,y:0,target:null},true);assert.ok(r.players[1].x>300);assert.equal(b.players[1].x,300);for(let t=133;t<230;t+=16)p.render(b,t,neutral,true);assert.ok(p.render(b,240,neutral,true).players[1].x<r.players[1].x);p.reset();assert.equal(p.render(b,250,neutral,true),b);});
test('stale stream, loop reset and reconnect do not interpolate prior history',()=>{const {p,b}=setup();assert.equal(p.render(b,400,neutral,true),b);const c=state(300);c.loop=2;p.accept(c,410);assert.equal(p.render(c,425,neutral,true).enemies[0].x,300);assert.equal(p.render(c,430,neutral,false),c);});
test('reordered projectiles follow IDs, not array indices',()=>{const p=create(),a=state(),b=state();a.shots=[entity(10,50),entity(11,150)];b.shots=[entity(11,170),entity(10,70)];b.elapsed=a.elapsed+.05;p.accept(a,0);p.accept(b,50);assert.deepEqual(p.render(b,125,neutral,true).shots.map(s=>s.x),[160,60]);});
test('touch prediction stops at target and never writes the input or hitbox',()=>{const {p,b}=setup(),input={x:1,y:0,target:{x:301,y:100}},before=JSON.stringify(input);p.render(b,100,neutral,true);const r=p.render(b,117,input,true);assert.ok(r.players[1].x<=301);assert.equal(b.players[1].x,300);assert.equal(JSON.stringify(input),before);});
test('stable simulation clock rejects arrival jitter without changing any snapshot',()=>{
  const p=create();let latest,previous,velocities=[];
  for(let t=0,n=0;t<1200;t+=1000/60){
    while(n*50+[0,20,-10,10][n%4]<=t){latest=state(100+n*13);latest.elapsed=n*.05;p.accept(latest,n*50+[0,20,-10,10][n%4]);n++;}
    const before=JSON.stringify(latest),r=p.render(latest,t,neutral,true);
    assert.equal(JSON.stringify(latest),before);
    if(previous&&t>300)velocities.push((r.players[0].x-previous)*60);
    previous=r.players[0].x;
  }
  assert.ok(Math.min(...velocities)>254&&Math.max(...velocities)<266);
  assert.equal(p.diagnostics().categories.frozen.count,6,'only initial buffer warmup freezes');
});
test('P2 constant-speed prediction has no snapshot-frequency sawtooth',()=>{
  const p=create();let latest,previous,velocities=[];
  for(let t=0,n=0;t<1200;t+=1000/60){
    while(n*50<=t){latest=state();latest.elapsed=n*.05;latest.players[1].x=100+n*13;p.accept(latest,n*50);n++;}
    const r=p.render(latest,t,{x:1,y:0},true);
    if(previous&&t>500)velocities.push((r.players[1].x-previous)*60);
    previous=r.players[1].x;
  }
  assert.ok(Math.min(...velocities)>259&&Math.max(...velocities)<262);
});
test('diagnostics are bounded, read-only, and distinguish pause from stale waiting',()=>{
  const {p,b}=setup();p.render(b,125,neutral,true);const before=JSON.stringify(b);
  const d=p.diagnostics();d.categories.interpolated.count=999;
  assert.equal(p.diagnostics().categories.interpolated.count,1);
  p.render({...b,mode:'paused'},150,neutral,true);p.render(b,400,neutral,true);
  assert.equal(p.diagnostics().categories.inactive.count,1);assert.equal(p.diagnostics().categories.stale.count,1);
  assert.equal(JSON.stringify(b),before);p.resetDiagnostics();assert.equal(p.diagnostics().frames,0);
});
test('forward simulation discontinuity rebuilds presentation without a long freeze',()=>{
  const {p,b}=setup();p.render(b,125,neutral,true);
  const c=state(150);c.elapsed=175;p.accept(c,150);
  assert.equal(p.render(c,166,neutral,true).players[0].x,150);
  assert.ok(p.diagnostics().effectiveRenderDelayMs.max<=100.001);
});
