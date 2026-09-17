'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
function fixture(role='guest',override={}){
 let probe;const closes=[],sent=[],messages=[];
 const ws={readyState:1,bufferedAmount:0,send:s=>sent.push(JSON.parse(s)),close(code,reason){
  if(code!==undefined&&code!==1000&&!(code>=3000&&code<=4999))throw new DOMException('Invalid browser close code','InvalidAccessError');
  closes.push({code,reason});
 }};
 const sandbox={window:{},document:{hidden:false},performance:{now:()=>1000},TextEncoder,setTimeout:()=>1,clearTimeout(){},setInterval:f=>(probe=f,1),clearInterval(){}};
 vm.runInNewContext(fs.readFileSync('src/relay-transport.js','utf8'),sandbox);
 const c=sandbox.window.CatRelay.create({ws,role},{ready(){},lost(){},ended(){},message:(...m)=>messages.push(m),...override});
 return {c,ws,closes,sent,messages,probe:()=>probe(),arrive:m=>ws.onmessage({data:JSON.stringify(m)}),raw:data=>ws.onmessage({data})};
}
test('browser close contract rejects the original RFC codes',()=>{
 const f=fixture();for(const code of [1008,1009])assert.throws(()=>f.ws.close(code),{name:'InvalidAccessError'});
});
test('invalid frames close with 4008 without InvalidAccessError',()=>{
 for(const data of ['{','null','[]',JSON.stringify({kind:'input',data:{}}),new Uint8Array(1),JSON.stringify({kind:'diag-pong',id:-1})]){
  const f=fixture();assert.doesNotThrow(()=>f.raw(data));assert.equal(f.closes[0].code,4008);assert.equal(f.c.diagnostics().counters.invalidMessages,1);
 }
});
test('oversized incoming and outgoing UTF-8 messages close with 4009',()=>{
 const f=fixture();assert.doesNotThrow(()=>f.raw('貓'.repeat(180000)));assert.equal(f.closes[0].code,4009);assert.equal(f.c.diagnostics().counters.invalidMessages,0);
 const g=fixture();g.arrive({kind:'presence',host:true,guest:true});assert.doesNotThrow(()=>assert.equal(g.c.send('input',{text:'貓'.repeat(180000)}),false));assert.equal(g.closes[0].code,4009);
});
test('ping pong, late/duplicate pong and presence never reach gameplay validation for either role',()=>{
 for(const role of ['host','guest']){
  const f=fixture(role);f.arrive({kind:'presence',host:true,guest:true});f.c.enablePing(true);f.probe();const ping=f.sent[0];assert.equal(ping.kind,'diag-ping');
  for(const id of [ping.id,ping.id,999])assert.doesNotThrow(()=>f.arrive({kind:'diag-pong',id}));
  f.arrive({kind:'presence',host:true,guest:false});assert.equal(f.messages.length,0);assert.equal(f.closes.length,0);assert.equal(f.c.diagnostics().counters.invalidMessages,0);
 }
});
test('legacy server error to diagnostic ping is control traffic and suppresses repeat probes',()=>{
 const f=fixture();f.arrive({kind:'presence',host:true,guest:true});f.c.enablePing();f.probe();f.arrive({kind:'error',error:'Authority violation'});
 assert.equal(f.c.diagnostics().counters.serverErrors,1);assert.equal(f.c.diagnostics().counters.invalidMessages,0);assert.equal(f.c.diagnostics().pingEnabled,false);assert.equal(f.closes.length,0);f.probe();assert.equal(f.sent.length,1);
 f.ws.onclose({code:1008});assert.equal(f.c.diagnostics().events.at(-1).code,1008);
});
test('normal close and genuine network loss remain distinct',()=>{
 const f=fixture();f.c.close(false);assert.equal(f.closes[0].code,1000);
 const g=fixture();g.ws.onclose({code:1006});assert.equal(g.c.diagnostics().events.at(-1).code,1006);assert.equal(g.c.diagnostics().counters.invalidMessages,0);
});
test('payload validator failures retain a diagnostic stage',()=>{
 const f=fixture('guest',{message(){throw Error('Invalid state');}});assert.doesNotThrow(()=>f.arrive({kind:'state',data:{}}));assert.equal(f.closes[0].code,4008);assert.equal(f.c.diagnostics().events.at(-1).stage,'gameplay-handler');
});

test('late old-socket presence, ended, payload and error cannot affect replacement client',async()=>{
 let next;const sockets=[];
 class WS {constructor(){this.readyState=1;this.bufferedAmount=0;sockets.push(this);next=this;}send(){}close(){}}
 const sandbox={window:{},document:{hidden:false,querySelector:()=>({content:'http://127.0.0.1'})},URL,WebSocket:WS,performance:{now:()=>1000},TextEncoder,setTimeout:()=>1,clearTimeout(){},setInterval:()=>1,clearInterval(){}};
 vm.runInNewContext(fs.readFileSync('src/relay-transport.js','utf8'),sandbox);
 const old=new WS();let lost=0,ended=0,messages=0;
 const c=sandbox.window.CatRelay.create({ws:old,role:'host',code:'123456',token:'a'.repeat(48)},{ready(){},lost(){lost++;},ended(){ended++;},message(){messages++;}});
 const staleMessage=old.onmessage,staleError=old.onerror;
 const connecting=c.reconnect();next.onopen();next.onmessage({data:JSON.stringify({kind:'session',role:'host',code:'123456',token:'a'.repeat(48)})});await connecting;
 next.onmessage({data:JSON.stringify({kind:'presence',host:true,guest:true})});const before=lost;
 for(const m of [{kind:'presence',host:true,guest:false},{kind:'ended'},{kind:'input',data:{}}])staleMessage({data:JSON.stringify(m)});staleError();
 assert.equal(lost,before);assert.equal(ended,0);assert.equal(messages,0);assert.equal(c.diagnostics().counters.errors,0);assert.equal(c.send('state',{}),true);c.close(false);
});
