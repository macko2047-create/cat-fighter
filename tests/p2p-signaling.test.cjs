'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {Readable}=require('node:stream');
const {createSignaling}=require('../tools/p2p-signaling.cjs');
function fixture(options={}) {
  let time=1000;const service=createSignaling({now:()=>time,iceServers:[],...options});
  return {advance:ms=>time+=ms,async post(route,body={},secret,extra={}){
    const req=Readable.from([Buffer.from(typeof body==='string'?body:JSON.stringify(body))]);
    Object.assign(req,{url:'/p2p/'+route,method:'POST',headers:{host:'example.test','content-type':'application/json',...(secret?{authorization:'Bearer '+secret}:{}),...extra},socket:{remoteAddress:'127.0.0.1'}});
    let status,data;const res={writeHead(s){status=s;},end(v){data=JSON.parse(v);}};
    assert.equal(await service.handle(req,res),true);return {status,...data};
  }};
}
test('six digits, separate secrets, two peers, credentials, role boundaries and SDP-only service',async()=>{
  const f=fixture(),h=await f.post('create'),g=await f.post('join',{code:h.code});
  assert.match(h.code,/^\d{6}$/);assert.match(h.token,/^[a-f0-9]{48}$/);assert.notEqual(g.token,h.token);
  assert.equal((await f.post('join',{code:h.code})).status,409);
  assert.equal((await f.post('poll',{code:h.code},h.code)).status,403);
  assert.equal((await f.post('state',{code:h.code,state:{players:[]}},h.token)).status,405);
  assert.equal((await f.post('input',{code:h.code,input:{}},g.token)).status,405);
  const offer={type:'offer',id:'a'.repeat(24),sdp:'v=0\r\n'};
  assert.equal((await f.post('signal',{code:h.code,signal:offer},g.token)).status,400);
  assert.equal((await f.post('signal',{code:h.code,signal:{...offer,state:{}}},h.token)).status,400);
  assert.equal((await f.post('signal',{code:h.code,signal:offer},h.token)).status,200);
  assert.deepEqual((await f.post('poll',{code:h.code},g.token)).signals,[offer]);
  assert.deepEqual((await f.post('poll',{code:h.code},g.token)).signals,[]);
  assert.equal((await f.post('leave',{code:h.code},g.token)).status,200);
  assert.equal((await f.post('join',{code:h.code})).status,404);
});
test('absolute room code expiry, session lifetime, idle cleanup and attempts are bounded',async()=>{
  const f=fixture({joinTTL:100,idleTTL:1000}),h=await f.post('create');
  f.advance(101);assert.equal((await f.post('join',{code:h.code})).status,410);
  assert.equal((await f.post('poll',{code:h.code},h.token)).status,200);
  f.advance(1001);assert.equal((await f.post('poll',{code:h.code},h.token)).status,404);
  const limited=fixture();for(let i=0;i<30;i++)await limited.post('join',{code:'999999'});
  assert.equal((await limited.post('create')).status,429);
  limited.advance(60001);assert.equal((await limited.post('create')).status,200);
});
test('origin checks, malformed JSON, byte bounds, signal queue and rate bounds',async()=>{
  const f=fixture({origin:'https://game.example'});
  assert.equal((await f.post('create',{},null,{origin:'https://evil.example'})).status,403);
  assert.equal((await f.post('create','{')).status,400);
  assert.equal((await f.post('create',' '.repeat(49153))).status,413);
  const h=await f.post('create',{},null,{origin:'https://game.example'}),g=await f.post('join',{code:h.code});
  assert.equal(h.status,200);
  assert.equal((await f.post('signal',{code:h.code,signal:{type:'offer',id:'a'.repeat(24),sdp:'v=0'+'x'.repeat(32768)}},h.token)).status,400);
  for(let i=0;i<16;i++)assert.equal((await f.post('signal',{code:h.code,signal:{type:'offer',id:'a'.repeat(24),sdp:'v=0'}},h.token)).status,200);
  assert.equal((await f.post('signal',{code:h.code,signal:{type:'offer',id:'a'.repeat(24),sdp:'v=0'}},h.token)).status,429);
  assert.equal((await f.post('poll',{code:h.code},g.token)).signals.length,16);
});
