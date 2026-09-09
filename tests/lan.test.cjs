'use strict';
// Two isolated game runtimes, real HTTP/SSE relay, deterministic DOM/input stubs.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {createLanServer}=require('../tools/lan-server.cjs');
let base=process.env.CAT_LAN_URL, server;
const streams=[];
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
  class SSE {
    constructor(url){this.url=url;this.handlers={};streams.push(this);this.open();}
    addEventListener(n,f){this.handlers[n]=f;}
    async open(){
      const controller=this.controller=new AbortController();
      try{
        const res=await fetch(base+this.url,{signal:controller.signal});
        if(!res.ok)throw Error('SSE '+res.status);
        let buffer='';const decoder=new TextDecoder();
        for await(const chunk of res.body){buffer+=decoder.decode(chunk,{stream:true});let cut;
          while((cut=buffer.indexOf('\n\n'))>=0){const part=buffer.slice(0,cut);buffer=buffer.slice(cut+2);
            const event=/event: (.+)/.exec(part)?.[1],data=/data: (.+)/.exec(part)?.[1];
            if(event&&data)this.handlers[event]?.({data});
          }
        }
      }catch(e){if(!controller.signal.aborted)this.onerror?.(e);}
    }
    close(){this.controller.abort();}
    interrupt(){this.close();this.onerror?.();}
  }
  const sandbox={console,Math,performance,AbortSignal,EventSource:SSE,
    fetch:(url,options)=>fetch(base+url,options),location:{origin:base},
    document:{createElement:()=>el('created-'+Math.random()),hidden:false,body:{classList:{toggle(){}},dataset:{}},documentElement:{style:{setProperty(){}}},querySelector:el,
      addEventListener:(n,f)=>(documentEvents[n]??=[]).push(f)},
    window:{innerHeight:800,innerWidth:600,addEventListener:(n,f)=>(events[n]??=[]).push(f)},
    navigator:{getGamepads:()=>gamepads},localStorage:{getItem:()=>null,setItem(){}},requestAnimationFrame(){}};
  vm.createContext(sandbox);
  for(const file of ['src/world.js','src/assets.js','src/render.js','src/audio.js','src/levels/level1.js','src/enemies.js','game.js','src/controls.js','src/lan.js','src/arcade.js'])vm.runInContext(fs.readFileSync(path.join(__dirname,'..',file),'utf8'),sandbox,{filename:file});
  const run=s=>vm.runInContext(s,sandbox);
  return {run,el,events,pad:p=>{gamepads=p;},key:(code,up=false)=>{for(const fn of events[up?'keyup':'keydown']||[])fn({code,repeat:false,target:{tagName:'BODY'},preventDefault(){}});},pointer:(type,x,y)=>{for(const fn of el('.screen').listeners[type]||[])fn({pointerId:1,pointerType:'touch',clientX:x,clientY:y,preventDefault(){}});}};
}
(async()=>{
  if(!base){server=createLanServer();await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});base=`http://127.0.0.1:${server.address().port}`;}
  let timer;
  const host=runtime(),guest=runtime();
  const post=(route,data={},token)=>fetch(base+'/lan/'+route,{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify(data)});
  try{
    for(const peer of [host,guest]){peer.el('#boot').onclick();peer.run('window.arcade.frame(3)');}
    const cancel=runtime();
    cancel.run("mode='playing';$('#lan-open').onclick()");
    assert.equal(cancel.run('mode'),'paused','opening Wi-Fi settings pauses an active run');
    cancel.el('#lan-close').onclick();
    assert.equal(cancel.run('mode'),'playing','closing Wi-Fi settings without a room resumes the active run');
    assert.equal((await fetch(base+'/tools/lan-server.cjs')).status,404,'server source not served');
    assert.equal((await fetch(base+'/src/..%2FREADME.md')).status,403,'encoded traversal rejected');
    const checkHost=await (await post('create')).json();
    assert.deepEqual(await (await fetch(base+'/lan/rooms')).json(),{rooms:[]},'host without event stream is not advertised');
    const checkGuest=await (await post('join',{code:checkHost.code})).json();
    assert.equal((await post('state',{code:checkHost.code,state:{players:[]}},checkGuest.token)).status,405,'guest cannot publish game state');
    assert.equal((await post('input',{code:checkHost.code,input:{}},checkHost.token)).status,405,'host cannot impersonate guest input');
    await post('leave',{code:checkHost.code},checkHost.token);
    assert.equal((await post('join',{code:'XXXXXX'})).status,404);
    await host.el('#lan-create').onclick();
    const code=host.el('#lan-code').value;assert.match(code,/^[A-F0-9]{6}$/);
    const roomList=async()=>{const response=await fetch(base+'/lan/rooms');assert.equal(response.headers.get('cache-control'),'no-store');return response.json();};
    await wait(()=>streams[0].handlers.presence);
    let listed;
    for(let i=0;i<50;i++){listed=await roomList();if(listed.rooms.some(r=>r.code===code))break;await new Promise(r=>setTimeout(r,20));}
    assert.deepEqual(listed,{rooms:[{code}]},'only connected empty room is public, no credentials');
    await guest.el('#lan-open').onclick();
    assert.equal(guest.el('#lan-rooms').children.length,1,'dialog discovers available host');
    assert.ok(guest.el('#lan-addresses').textContent.includes(base),'server address visible before joining');
    guest.el('#lan-close').onclick();
    host.run('start()');assert.equal(host.run('mode'),'ready','host waits for P2');
    await guest.el('#lan-rooms').children[0].onclick();
    assert.deepEqual(await roomList(),{rooms:[]},'full room is excluded');
    timer=setInterval(()=>{const now=performance.now();host.run(`frame(${now})`);guest.run(`frame(${now})`);},16);
    await wait(()=>host.run('window.lan.ready')&&guest.run('window.lan.ready'));
    assert.equal((await post('join',{code})).status,409,'third player rejected');
    assert.equal((await post('state',{code,state:{players:[]}},'invalid')).status,403);
    host.run("start();wave=999;nextSupply=999;extraLifeSpawned=true;players.forEach(p=>p.inv=99)");
    await wait(()=>guest.run("mode==='playing'&&players.length===2"));
    assert.equal(guest.el('#start').disabled,true,'guest cannot restart host');
    const x=host.run('players[1].x'),p1x=host.run('players[0].x');
    guest.key('KeyD');guest.key('KeyF');
    await wait(()=>host.run('players[1].x')>x+20&&host.run('shots.some(s=>s.owner.index===1)'));
    guest.key('KeyD',true);guest.key('KeyF',true);
    assert.equal(host.run('players[0].x'),p1x,'guest only moves P2');
    guest.key('KeyG');guest.key('KeyG',true);await wait(()=>host.run('players[1].bombs')===2);
    assert.equal(host.run('players[0].bombs'),3,'guest bomb stock independent');
    host.run('bomb(players[1])');assert.equal(host.run('players[1].bombs'),2,'host cannot spend P2 bombs');
    await wait(()=>guest.run('players[1].bombs')===2);
    guest.pointer('pointerdown',100,650);
    await wait(()=>host.run('players[1].x')<300);
    guest.pointer('pointerup',100,650);
    assert.equal(host.run('players[0].x'),p1x,'full-screen guest touch belongs to P2');
    host.pointer('pointerdown',550,650);
    await wait(()=>host.run('players[0].x')>p1x+20);
    host.pointer('pointerup',550,650);
    const pad={id:'LAN test pad',index:0,axes:[-1,0],buttons:Array.from({length:16},()=>({pressed:false}))};
    const gx=host.run('players[1].x');guest.pad([pad]);await wait(()=>host.run('players[1].x')<gx-10);guest.pad([]);
    await wait(()=>host.run('mode')==='paused');
    host.run('pause()');await wait(()=>guest.run('mode')==='playing');
    host.run('Object.assign(players[1],{inv:0,level:3,rapid:true});hurt(players[1])');
    await wait(()=>guest.run('players[1].lives')===2);
    assert.equal(guest.run('players[1].level'),1);assert.equal(guest.run('players[1].rapid'),false);
    await wait(()=>host.run('players[1].entering'));
    assert.ok(host.run('recoveryRewardPending||enemies.some(e=>e.reward?.type==="W")'));
    await wait(()=>!host.run('players[1].entering'));
    host.run('players[1].lives=0;players[1].rejoinRemaining=0');
    await wait(()=>guest.run('players[1].lives')===0);guest.key('KeyF');guest.key('KeyF',true);
    await wait(()=>host.run('players[1].lives')===3);
    guest.key('Escape');guest.key('Escape',true);await wait(()=>host.run('mode')==='paused');
    const elapsed=host.run('elapsed');await new Promise(r=>setTimeout(r,120));assert.equal(host.run('elapsed'),elapsed);
    host.run('pause()');await wait(()=>guest.run('mode')==='playing');
    streams[1].interrupt();await wait(()=>host.run('mode')==='paused'&&!host.run('window.lan.ready'));
    host.run('pause()');assert.equal(host.run('mode'),'paused','cannot resume with P2 disconnected');
    streams[1].open();await wait(()=>host.run('window.lan.ready')&&guest.run('window.lan.ready'));
    assert.equal(host.run('mode'),'paused','reconnection requires deliberate resume');
    host.run('pause()');await wait(()=>guest.run('mode')==='playing');
    host.run('completeLoop()');await wait(()=>guest.run('loopTransition')>0);
    host.run('nextLoop();wave=999');await wait(()=>guest.run('loop')===2);
    assert.equal(guest.run('players[1].lives'),3,'next loop keeps lives synchronized');
    guest.el('#lan-leave').onclick();await wait(()=>host.run('mode')==='paused'&&!host.run('window.lan.ready'));
    guest.el('#lan-code').value=code;await guest.el('#lan-join').onclick();await wait(()=>host.run('window.lan.ready'));
    host.el('#lan-leave').onclick();await wait(()=>!guest.run('window.lan.active'));
    assert.deepEqual(await roomList(),{rooms:[]},'closed host is removed');
    await guest.el('#lan-search').onclick();
    assert.equal(guest.el('#lan-rooms').children.length,0);
    assert.match(guest.el('#lan-discovery-status').textContent,/No available rooms/);
    console.log('PASS: host discovery, one-click join, empty/full/closed rooms, real HTTP/SSE rooms, isolation, P2 keyboard/touch/gamepad, bombs, death/reset/rejoin/rewards, pause, disconnect/reconnect, next loop, leave and host shutdown.');
  }finally{clearInterval(timer);for(const s of streams)s.close();host.el('#lan-leave').onclick();guest.el('#lan-leave').onclick();if(server){server.dispose();await new Promise(r=>server.close(r));}}
})().catch(e=>{console.error(e);process.exitCode=1;});
