'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {WebSocket}=require('../tools/relay/node_modules/ws');
const {createRelayServer,MAX}=require('../tools/relay/server.cjs');
async function fixture(t,options={}){
 const server=createRelayServer(options);await new Promise(r=>server.listen(0,'127.0.0.1',r));
 t.after(()=>{server.dispose();server.close();});
 const url=`ws://127.0.0.1:${server.address().port}/relay`;
 async function peer(message){const ws=new WebSocket(url),queue=[];ws.on('error',()=>{});ws.on('message',b=>queue.push(JSON.parse(b)));await new Promise(r=>ws.once('open',r));const p={ws,send:m=>ws.send(JSON.stringify(m)),async next(kind){for(let i=0;i<200;i++){const n=queue.findIndex(m=>m.kind===kind);if(n>=0)return queue.splice(n,1)[0];await new Promise(r=>setTimeout(r,5));}throw Error('Missing '+kind);}};p.send(message);return p;}
 return {peer,server};
}
test('create/join, third player, tokens, relay directions, authority, reconnect and leave',async t=>{
 const f=await fixture(t),h=await f.peer({kind:'create'}),hs=await h.next('session');assert.match(hs.code,/^\d{6}$/);
 const g=await f.peer({kind:'join',code:hs.code}),gs=await g.next('session');assert.notEqual(hs.token,gs.token);
 const third=await f.peer({kind:'join',code:hs.code});assert.match((await third.next('error')).error,/P2/);
 const bad=await f.peer({kind:'resume',code:hs.code,token:'invalid'});assert.match((await bad.next('error')).error,/token/);
 const input={x:1,y:0,fire:true,target:null,actions:['bomb','pause','rejoin']};g.send({kind:'input',data:input});assert.deepEqual((await h.next('input')).data,input);
 const state={mode:'paused',score:123,players:[]};h.send({kind:'state',data:state});assert.deepEqual((await g.next('state')).data,state);
 g.ws.close();await new Promise(r=>g.ws.once('close',r));
 const re=await f.peer({kind:'resume',code:gs.code,token:gs.token});assert.equal((await re.next('session')).role,'guest');
 re.send({kind:'state',data:state});assert.match((await re.next('error')).error,/Authority/);
 const again=await f.peer({kind:'resume',code:gs.code,token:gs.token});await again.next('session');again.send({kind:'leave'});await h.next('ended');
 const gone=await f.peer({kind:'resume',code:hs.code,token:hs.token});assert.match((await gone.next('error')).error,/not found/);
});
test('oversized frames, rate limits and host input authority',async t=>{
 const f=await fixture(t),h=await f.peer({kind:'create'});await h.next('session');h.send({kind:'input',data:{}});assert.match((await h.next('error')).error,/Authority/);
 const large=await f.peer({kind:'create'});await large.next('session');const closed=new Promise(r=>large.ws.once('close',r));large.ws.send('x'.repeat(MAX+1));assert.equal(await closed,1009);
 const fast=await f.peer({kind:'create'});await fast.next('session');for(let i=0;i<65;i++)fast.send({kind:'state',data:{}});assert.match((await fast.next('error')).error,/Rate/);
});
test('idle and absolute expiry, no filesystem serving, origin rejection',async t=>{
 let time=1000;const f=await fixture(t,{now:()=>time,idleTTL:100,sessionTTL:500});
 const h=await f.peer({kind:'create'}),s=await h.next('session');time+=101;
 const p=await f.peer({kind:'resume',code:s.code,token:s.token});assert.match((await p.next('error')).error,/not found/);
 const a=await f.peer({kind:'create'});await a.next('session');for(let i=0;i<6;i++){time+=90;a.send({kind:'state',data:{}});await new Promise(r=>setTimeout(r,10));}await a.next('ended');assert.equal(f.server.diagnostics().lifecycle.roomDeletionReasons['session-expiry'],1);
 const url=a.ws.url.replace('ws:','http:').replace('/relay','/tools/relay/server.cjs');assert.equal((await fetch(url)).status,404);
 const rejected=new WebSocket(a.ws.url,{origin:'https://evil.example'});rejected.on('error',()=>{});assert.equal(await new Promise(r=>rejected.on('unexpected-response',(_,res)=>{r(res.statusCode);res.resume();rejected.terminate();})),403);
});

test('diagnostic echo is isolated from gameplay and reports aggregate process counters',async t=>{
 const f=await fixture(t),h=await f.peer({kind:'create'}),hs=await h.next('session');
 const g=await f.peer({kind:'join',code:hs.code});await g.next('session');
 h.send({kind:'diag-ping',id:17});assert.deepEqual(await h.next('diag-pong'),{kind:'diag-pong',id:17});
 h.send({kind:'state',data:{score:7}});assert.equal((await g.next('state')).data.score,7);
 g.send({kind:'input',data:{actions:['bomb','pause','rejoin']}});assert.deepEqual((await h.next('input')).data.actions,['bomb','pause','rejoin']);
 const d=f.server.diagnostics();assert.equal(d.counts.pings,1);assert.equal(d.counts.state,1);assert.equal(d.counts.input,1);assert.equal(d.connections,2);assert.ok(d.memory.rss>0);assert.ok(d.rates.statePerSecond>0);assert.equal(JSON.stringify(d).includes(hs.token),false);
});

test('continuous 20 Hz state/input with diagnostic ping retains presence for 61 seconds', {timeout:70000},async t=>{
 const f=await fixture(t,{idleTTL:2000,sweepMs:100}),h=await f.peer({kind:'create'}),hs=await h.next('session');
 const g=await f.peer({kind:'join',code:hs.code});await g.next('session');
 const losses=[];for(const p of [h,g])p.ws.on('message',b=>{const m=JSON.parse(b);if(m.kind==='ended'||m.kind==='presence'&&(!m.host||!m.guest))losses.push(m);});
 const started=Date.now();let frames=0;
 while(Date.now()-started<61000){
  h.send({kind:'state',data:{frame:frames}});g.send({kind:'input',data:{frame:frames}});
  assert.equal((await g.next('state')).data.frame,frames);assert.equal((await h.next('input')).data.frame,frames);
  if(frames%20===0){for(const p of [h,g]){p.send({kind:'diag-ping',id:frames});assert.equal((await p.next('diag-pong')).id,frames);}}
  frames++;await new Promise(r=>setTimeout(r,Math.max(0,started+frames*50-Date.now())));
 }
 const d=f.server.diagnostics();assert.ok(frames>=1200);assert.equal(d.rooms,1);assert.equal(d.connections,2);assert.equal(d.counts.closes,0);assert.equal(d.counts.rateLimits,0);assert.equal(d.counts.state,frames);assert.equal(d.counts.input,frames);assert.deepEqual(losses,[]);assert.deepEqual(d.lifecycle.roomDeletionReasons,{});
});

test('replacement stale close preserves newer authenticated peer and room',async t=>{
 const f=await fixture(t),h=await f.peer({kind:'create'}),hs=await h.next('session');
 const g=await f.peer({kind:'join',code:hs.code}),gs=await g.next('session');
 // Pause the old TCP reader so its close acknowledgement arrives AFTER authentication.
 g.ws._socket.pause();
 const re=await f.peer({kind:'resume',code:gs.code,token:gs.token});await re.next('session');
 const losses=[];h.ws.on('message',b=>{const m=JSON.parse(b);if(m.kind==='presence'&&!m.guest)losses.push(m);});
 const closed=new Promise(r=>g.ws.once('close',r));g.ws._socket.resume();await closed;
 re.send({kind:'input',data:{fresh:true}});assert.equal((await h.next('input')).data.fresh,true);
 h.send({kind:'state',data:{fresh:true}});assert.equal((await re.next('state')).data.fresh,true);
 assert.deepEqual(losses,[]);const d=f.server.diagnostics();assert.equal(d.rooms,1);assert.equal(d.lifecycle.closeReasons.replaced,1);assert.equal(d.lifecycle.events.find(e=>e.reason==='socket-close').current,false);
 // A current peer loss clears only that peer and keeps the reserved room resumable.
 re.ws.close();await new Promise(r=>re.ws.once('close',r));await new Promise(r=>setTimeout(r,10));
 assert.equal(f.server.diagnostics().rooms,1);assert.equal(h.ws.readyState,1);
 const again=await f.peer({kind:'resume',code:gs.code,token:gs.token});await again.next('session');again.send({kind:'leave'});await h.next('ended');
 assert.equal(f.server.diagnostics().lifecycle.roomDeletionReasons['explicit-leave'],1);
});

test('gameplay from either peer refreshes idle; diagnostic ping does not extend gameplay idle or absolute lifetime',async t=>{
 let time=1000;const f=await fixture(t,{now:()=>time,idleTTL:100,sessionTTL:1000}),h=await f.peer({kind:'create'}),hs=await h.next('session');
 const g=await f.peer({kind:'join',code:hs.code});await g.next('session');
 for(let i=0;i<6;i++){time+=90;const sender=i%2?h:g,receiver=i%2?g:h,kind=i%2?'state':'input';sender.send({kind,data:{}});await receiver.next(kind);assert.equal(f.server.diagnostics().rooms,1);}
 time+=90;h.send({kind:'diag-ping',id:1});await h.next('diag-pong');time+=11;g.send({kind:'diag-ping',id:2});await h.next('ended');
 assert.equal(f.server.diagnostics().lifecycle.roomDeletionReasons['idle-expiry'],1);
});


test('unauthenticated timeout records close reason without affecting an active room',async t=>{
 const f=await fixture(t),h=await f.peer({kind:'create'});await h.next('session');
 const idle=new WebSocket(h.ws.url);idle.on('error',()=>{});
 assert.equal(await new Promise(r=>idle.once('close',r)),1008);
 await new Promise(r=>setTimeout(r,10));const d=f.server.diagnostics();
 assert.equal(d.rooms,1);assert.equal(h.ws.readyState,1);assert.equal(d.lifecycle.closeReasons['authentication-timeout'],1);assert.equal(d.lifecycle.closeCodes['1008'],1);assert.deepEqual(d.lifecycle.roomDeletionReasons,{});
});
