const fs = require('node:fs'), vm = require('node:vm'), assert = require('node:assert/strict');
const draws = [];
const ctx = new Proxy({}, {get:(_,key)=>key==='drawImage' ? image=>draws.push(image.id) : ()=>{}});
const sandbox = {ctx};vm.createContext(sandbox);
vm.runInContext(fs.readFileSync('src/render.js','utf8'),sandbox);
const renderer=vm.runInContext(`createRenderer(ctx,600,800,()=>{},(v,a,b)=>Math.max(a,Math.min(b,v)),null,{
 image:id=>({id}),definition:()=>({cell:{width:256,height:256},displayScale:1})})`,sandbox);
const heavy={type:'heavy',x:300,y:300}, boat={type:'boat',x:300,y:300}, small={type:'small',x:300,y:300};
for(const enemies of [[heavy,boat,small],[boat,heavy,small],[heavy,small,boat]]) {
 const original=[...enemies];draws.length=0;
 renderer({mode:'playing',ambient:0,elapsed:0,score:0,loop:1,loopTransition:0,players:[],enemies,shots:[],hostile:[],drops:[],sparks:[],bossDebris:[],flash:0});
 assert.deepEqual(draws,['boat','heavy','small']);
 assert.deepEqual(enemies,original,'render order must not mutate simulation order');
}
console.log('PASS: overlapping ships render below aircraft for every spawn order; enemy simulation order is unchanged.');
