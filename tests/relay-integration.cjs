'use strict';
// Two isolated game runtimes, real WebSocket relay, deterministic DOM/input stubs.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {createRelayServer}=require('../tools/relay/server.cjs');
const {WebSocket}=require('../tools/relay/node_modules/ws');
let base,server;
const wait=async fn=>{for(let i=0;i<150;i++){if(fn())return;await new Promise(r=>setTimeout(r,20));}throw Error('Timed out waiting for LAN state');};
function runtime(){
  const elements=new Map(),events={},documentEvents={};let gamepads=[];
  const ctx=new Proxy({},{get:(_,n)=>n==='createLinearGradient'?()=>({addColorStop(){}}):()=>{}});
  const el=s=>{
    if(!elements.has(s))elements.set(s,{style:{},dataset:{},textContent:'',innerHTML:'',value:'',open:false,listeners:{},
      children:[],replaceChildren(){this.children=[];},append(child){this.children.push(child);},querySelectorAll(){return this.children;},addEventListener(n,f){(this.listeners[n]??=[]).push(f);},showModal(){this.open=true;},close(){this.open=false;(this.listeners.close||[]).forEach(f=>f());},getContext:()=>ctx,
      getBoundingClientRect:()=>({left:0,top:0,width:600,height:800}),setPointerCapture(){},hasPointerCapture:()=>false,releasePointerCapture(){}});
    return elements.get(s);
  };
  const sandbox={console,Math,performance,TextEncoder,AbortSignal,WebSocket,URL,setTimeout,clearTimeout,setInterval,clearInterval,
    fetch:(url,options)=>fetch(base+url,options),location:{origin:base},
    document:{createElement:()=>el('created-'+Math.random()),hidden:false,body:{classList:{toggle(){}},dataset:{}},documentElement:{style:{setProperty(){}}},querySelector:s=>s==='meta[name="cat-fighter-relay-origin"]'?{content:base}:el(s),
      addEventListener:(n,f)=>(documentEvents[n]??=[]).push(f)},
    window:{innerHeight:800,innerWidth:600,addEventListener:(n,f)=>(events[n]??=[]).push(f)},
    navigator:{getGamepads:()=>gamepads},localStorage:{getItem:()=>null,setItem(){}},requestAnimationFrame(){}};
  vm.createContext(sandbox);
  for(const file of ['src/world.js','src/assets.js','src/render.js','src/audio.js','src/levels/level1.js','src/enemies.js','game.js','src/controls.js','src/presentation.js','src/net-protocol.js','src/relay-transport.js','src/bandwidth.js','src/lan.js','src/arcade.js'])vm.runInContext(fs.readFileSync(path.join(__dirname,'..',file),'utf8'),sandbox,{filename:file});
  const run=s=>vm.runInContext(s,sandbox);
  return {run,el,events,pad:p=>{gamepads=p;},key:(code,up=false)=>{for(const fn of events[up?'keyup':'keydown']||[])fn({code,repeat:false,target:{tagName:'BODY'},preventDefault(){}});},pointer:(type,x,y)=>{for(const fn of el('.screen').listeners[type]||[])fn({pointerId:1,pointerType:'touch',clientX:x,clientY:y,preventDefault(){}});}};
}
(async()=>{
 server=createRelayServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));base=`http://127.0.0.1:${server.address().port}`;
 const host=runtime(),guest=runtime();let timer;
 try {
  for(const p of [host,guest]){p.el('#boot').onclick();p.run('window.arcade.frame(3)');}
  await host.el('#p2p-create').onclick();assert.equal(host.run('window.lan.menuState.transport'),'relay');
  guest.el('#p2p-code').value=host.el('#p2p-code').value;await guest.el('#p2p-join').onclick();
  timer=setInterval(()=>{const now=performance.now();host.run(`frame(${now})`);guest.run(`frame(${now})`);},16);
  await wait(()=>host.run('window.lan.ready')&&guest.run('window.lan.ready'));
  host.run('start();wave=999;nextSupply=999;extraLifeSpawned=true');await wait(()=>guest.run("mode==='playing'&&players.length===2"));
  const x=host.run('players[1].x');guest.key('KeyD');guest.key('KeyF');
  await wait(()=>host.run('players[1].x')>x+20&&host.run('shots.some(s=>s.owner.index===1)'));
  guest.key('KeyD',true);guest.key('KeyF',true);
  guest.run('score=999999');await wait(()=>guest.run('score')===host.run('score'));
  guest.el('#p2p-reconnect').onclick();await wait(()=>host.run("mode==='paused'"));
  await wait(()=>host.run('window.lan.ready')&&guest.run('window.lan.ready'));
  assert.equal(host.run('mode'),'paused');guest.run('pause()');await new Promise(r=>setTimeout(r,100));assert.equal(host.run('mode'),'paused');
  host.run('pause()');await wait(()=>guest.run("mode==='playing'"));
  for(const p of [host,guest]){const b=p.run('window.lan.diagnostics().bandwidth');assert.ok(b.state.messages>0&&b.input.messages>0);}
  guest.el('#lan-leave').onclick();await wait(()=>!host.run('window.lan.active'));
  console.log('PASS: two isolated client runtimes over real WebSockets, P2 movement/fire, P1 snapshot authority, reconnect pauses, explicit P1 resume, diagnostics, leave.');
 }finally{clearInterval(timer);host.el('#lan-leave').onclick();guest.el('#lan-leave').onclick();server.dispose();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
