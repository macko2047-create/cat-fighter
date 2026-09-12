'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {create,move}=require('../src/input-replication.js');
const protocol=require('../src/net-protocol.js');
const player=()=>({netId:2,x:100,y:100,lives:3,respawn:0,entering:false});
const command=seq=>({seq,dt:.02,x:1,y:0,target:null});
const state=(p,ack=0,epoch=1)=>({players:[{},p],inputEpoch:epoch,lastProcessedInput:ack,mode:'playing',loopTransition:0});
test('RIGHT x3 processes in sequence, gaps wait, duplicates/stale never move twice',()=>{
 const h=create(),p=player();h.reset(1);
 h.receive({inputEpoch:1,moves:[command(3),command(1),command(1)]});h.process(p,.035,true);assert.equal(p.x,105.2);
 h.receive({inputEpoch:1,moves:[command(2)]});h.process(p,.035,true);assert.ok(Math.abs(p.x-115.6)<1e-9);assert.equal(h.diagnostics().lastProcessedInput,3);
 h.receive({inputEpoch:1,moves:[command(3),command(1)]});h.process(p,.035,true);assert.ok(Math.abs(p.x-115.6)<1e-9);assert.equal(h.diagnostics().duplicates,1);assert.equal(h.diagnostics().stale,2);
});
test('ACK 102 retains only 103; replay restores authoritative position',()=>{
 const g=create();g.reconcile(state(player()));for(let i=0;i<103;i++)g.capture({x:1,y:0,target:null},.001);
 const p=player();p.x=120;g.reconcile(state(p,102));assert.deepEqual(g.packet().moves.map(c=>c.seq),[103]);
 assert.ok(Math.abs(g.visual(10).x-120.26)<1e-8);assert.equal(g.diagnostics().reconciliations,1);
});
test('prediction is immediate; ACK does not apply commands twice',()=>{
 const g=create(),h=create(),p=player();h.reset(1);g.reconcile(state(player()));
 for(let i=0;i<3;i++)g.capture(command(i),.02);
 assert.ok(Math.abs(g.visual(0).x-115.6)<1e-9);
 h.receive(g.packet());h.process(p,.04,true);g.reconcile(state({...p},2));
 assert.deepEqual(g.packet().moves.map(c=>c.seq),[3]);assert.ok(Math.abs(g.visual(10).x-115.6)<1e-9);
 h.process(p,.02,true);g.reconcile(state({...p},3));assert.equal(g.packet().moves.length,0);assert.ok(Math.abs(g.visual(10).x-p.x)<1e-9);
});
test('epoch reset rejects old connection commands and clears prediction/queues',()=>{
 const g=create(),h=create(),p=player();h.reset(1);g.reconcile(state(player()));g.capture(command(1),.02);const old=g.packet();h.receive(old);
 h.reset(2);g.reconcile({...state(player(),0,2),mode:'paused'});h.receive(old);h.process(p,.035,true);
 assert.equal(p.x,100);assert.equal(g.packet().moves.length,0);g.capture(command(1),.02);assert.equal(g.packet().moves[0].seq,1);
});
test('movement restrictions, bounds and touch share authoritative/prediction math',()=>{
 for(const patch of [{lives:0},{respawn:1},{entering:true}]){const p={...player(),...patch};move(p,command(1),.02);assert.equal(p.x,100);}
 const p=player();move(p,{x:1,y:0,target:{x:101,y:100}},.02);assert.equal(p.x,101);
 p.x=575;move(p,command(1),.02);assert.equal(p.x,576);
 const h=create();h.reset(1);h.receive({inputEpoch:1,moves:[command(1)]});h.process(p,.02,false);assert.equal(h.diagnostics().lastProcessedInput,1);assert.equal(p.x,576);
});
test('wire rejects malformed/oversized commands, copies targets and excludes supplied position',()=>{
 const input={x:1,y:0,fire:false,target:null,actions:[],inputEpoch:1,moves:[command(1)]};
 for(const patch of [{seq:0},{seq:1.5},{dt:1},{x:NaN},{target:{x:900,y:100}}])assert.throws(()=>protocol.input({...input,moves:[{...command(1),...patch}]}));
 assert.throws(()=>protocol.input({...input,moves:Array(181).fill(command(1))}));
 assert.equal(protocol.input({...input,position:{x:500,y:500}}).position,undefined);
});
test('host budget bounds burst movement and queues stay bounded',()=>{
 const h=create(),p=player();h.reset(1);h.receive({inputEpoch:1,moves:Array.from({length:180},(_,i)=>command(i+1))});h.process(p,.02,true);assert.equal(p.x,105.2);assert.equal(h.diagnostics().lastProcessedInput,1);
});
test('small correction smooths rendering while replay corrects simulation; large correction snaps',()=>{
 const g=create();g.reconcile(state(player()));g.capture(command(1),.02);
 const p=player();p.x=102;g.reconcile(state(p,1));assert.equal(g.visual(0).x,105.2);assert.ok(Math.abs(g.visual(10).x-102)<1e-8);
 p.x=400;g.reconcile(state(p,1));assert.equal(g.visual(0).x,400);
});
test('failed send can retransmit pending commands; stale ACK cannot undo cleanup',()=>{
 const g=create(),h=create(),p=player();g.reconcile(state(player()));h.reset(1);g.capture(command(1),.02);const retry=g.packet();
 h.receive(retry);h.receive(retry);h.process(p,.02,true);g.reconcile(state(p,1));g.reconcile(state(player(),0));assert.equal(g.packet().moves.length,0);assert.equal(g.visual(10).x,105.2);
});
