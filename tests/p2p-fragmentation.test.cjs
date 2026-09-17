'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
async function fixture(){
 const packets=[],losses=[],window={};
 const channel={label:'cat-fighter-v1',ordered:true,maxRetransmits:null,maxPacketLifeTime:null,readyState:'open',bufferedAmount:0,send:p=>packets.push(p),close(){this.readyState='closed';}};
 class RTC {constructor(){this.iceGatheringState='complete';}createDataChannel(){return channel;}async createOffer(){return {type:'offer',sdp:'test'};}async setLocalDescription(d){this.localDescription=d;}close(){}}
 vm.runInNewContext(fs.readFileSync('src/p2p-transport.js','utf8'),{window,document:{querySelector:()=>({content:'http://127.0.0.1:8767'})},URL,AbortSignal,TextEncoder,performance,crypto,Uint8Array,RTCPeerConnection:RTC,setTimeout:()=>1,clearTimeout(){},fetch:async()=>new Response('{}',{headers:{'content-type':'application/json'}})});
 const transport=window.CatP2P.create({role:'host',code:'123456',token:'test'},{ready(){},lost:m=>losses.push(m)});
 await transport.reconnect();packets.length=0;losses.length=0;
 return {transport,packets,losses,channel};
}
test('large current-sized envelope fragments and reconstructs exactly below 512 KiB',async()=>{
 const f=await fixture(),data={sparks:'x'.repeat(500000)};
 assert.equal(f.transport.send('state',data),true);
 const parts=f.packets.map(JSON.parse);assert.ok(parts.length>1&&parts.length<=66);
 assert.ok(parts.every((p,i)=>p.part===i&&p.total===parts.length&&p.data.length<=8000));
 assert.deepEqual(JSON.parse(parts.map(p=>p.data).join('')),{kind:'state',data});
});
test('UTF-8 byte limit rejects oversize before queuing any fragment and closes channel',async()=>{
 const f=await fixture();assert.equal(f.transport.send('state',{sparks:'貓'.repeat(180000)}),false);
 assert.equal(f.packets.length,0);assert.equal(f.channel.readyState,'closed');assert.match(f.losses[0],/transport limit/);
});
test('buffer pressure queues no partial frame and permits retry',async()=>{
 const f=await fixture();f.channel.bufferedAmount=300000;
 assert.equal(f.transport.send('input',{actions:['bomb']}),false);assert.equal(f.packets.length,0);
 f.channel.bufferedAmount=0;assert.equal(f.transport.send('input',{actions:['bomb']}),true);assert.equal(f.packets.length,1);
});
