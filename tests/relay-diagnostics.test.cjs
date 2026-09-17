'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
test('client diagnostics record burst gaps, queue skips, RTT and watchdog without exposing payloads',()=>{
 let time=0,probe;const sent=[],ws={readyState:1,bufferedAmount:0,send:s=>sent.push(JSON.parse(s)),close(){}};
 const sandbox={window:{},document:{hidden:false},performance:{now:()=>time},TextEncoder,setTimeout,clearTimeout,setInterval:f=>(probe=f,1),clearInterval(){}};
 vm.runInNewContext(fs.readFileSync('src/relay-transport.js','utf8'),sandbox);
 const c=sandbox.window.CatRelay.create({ws,role:'guest'},{ready(){},lost(){},message(){},ended(){}});
 const arrive=m=>ws.onmessage({data:JSON.stringify(m)});
 arrive({kind:'presence',host:true,guest:true});
 for(const t of [50,100,450,800,850]){time=t;arrive({kind:'state',data:{secret:'payload-must-not-appear'}});}
 let d=c.diagnostics();assert.equal(d.intervals.state.averageMs,200);assert.equal(d.intervals.state.maxMs,350);assert.equal(d.intervals.state.gaps[250].maxConsecutive,2);
 ws.bufferedAmount=300000;assert.equal(c.send('input',{actions:['bomb']}),false);assert.equal(c.diagnostics().counters.queueDrops,1);
 ws.bufferedAmount=0;assert.equal(c.send('input',{actions:['bomb']}),true);
 time=1000;probe();assert.equal(sent.some(m=>m.kind==='diag-ping'),false);
 c.enablePing();time=2000;probe();const ping=sent.find(m=>m.kind==='diag-ping');time=2080;arrive({kind:'diag-pong',id:ping.id});
 c.note('watchdog',{silenceMs:2100});d=c.diagnostics();assert.equal(d.intervals.rtt.averageMs,80);assert.equal(d.counters.watchdog,1);assert.equal(d.bufferedAmountPeak,300000);assert.equal(JSON.stringify(d).includes('payload-must-not-appear'),false);c.close(false);
});
