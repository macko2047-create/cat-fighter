'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const protocol=require('../src/net-protocol.js');
const empty=()=>({mode:'ready',elapsed:0,score:0,wave:0,loop:1,loopTransition:0,flash:0,ambient:0,bossSpawned:false,bossWreck:null,
  players:[],enemies:[],shots:[],hostile:[],drops:[],sparks:[],bossDebris:[],aircraft:[0,1]});
test('input bounds, exact action set and untrusted properties',()=>{
  const value=JSON.parse('{"x":9,"y":-9,"fire":true,"target":{"x":999,"y":-1,"extra":true},"actions":["bomb"],"__proto__":{"polluted":true},"players":[]}');
  assert.deepEqual(protocol.input(value),{x:1,y:-1,fire:true,target:{x:576,y:60},actions:['bomb']});
  assert.equal({}.polluted,undefined);
  for(const invalid of [{...value,x:NaN},{...value,fire:1},{...value,actions:['start']},{...value,actions:Array(9).fill('bomb')},{...value,target:{x:1}}])assert.throws(()=>protocol.input(invalid));
});
test('snapshot whitelist, finite numbers, list limits, player identity and complete state',()=>{
  const good=empty();good.extra='ignored';good.enemies=[{type:'boss',x:300,y:130,hp:500,max:1000,age:5,evil:{}}];
  const clean=protocol.state(good);assert.equal(clean.extra,undefined);assert.equal(clean.enemies[0].evil,undefined);
  for(const invalid of [{...good,elapsed:Infinity},{...good,players:{}},{...good,hostile:Array(4097).fill({})},{...good,mode:'playing'},{...good,bossWreck:{}},{...good,aircraft:[3,1]}])assert.throws(()=>protocol.state(invalid));
  assert.throws(()=>protocol.state({players:[]}));
});

test('aircraft lobby readiness and guest choice commands survive the wire boundary',()=>{
  const state={...empty(),aircraftReady:[true,false]};
  assert.deepEqual(protocol.state(state).aircraftReady,[true,false]);
  for(const value of [[true], [true,false,true], [1,false], 'ready'])
    assert.throws(()=>protocol.state({...state,aircraftReady:value}));
  const actions=['aircraft-0','aircraft-1','confirm-aircraft','cancel-aircraft'];
  assert.deepEqual(protocol.input({x:0,y:0,fire:false,target:null,actions}).actions,actions);
  assert.throws(()=>protocol.input({x:0,y:0,fire:false,target:null,actions:['aircraft-2']}));
});
