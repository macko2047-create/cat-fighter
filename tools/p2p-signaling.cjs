'use strict';
// Signaling only: room credentials and bounded SDP exchange, never game state.
const {randomBytes,randomInt}=require('node:crypto');
function createSignaling({origin,iceServers=[{urls:'stun:stun.l.google.com:19302'}],now=Date.now,joinTTL=10*60*1000,idleTTL=2*60*1000,rooms=new Map(),attempts=new Map()}={}) {
  if(!Array.isArray(iceServers)||iceServers.some(s=>!s||Object.keys(s).some(k=>k!=='urls')||![s.urls].flat().every(u=>typeof u==='string'&&/^stuns?:[^\s]+$/.test(u))))throw Error('Phase 1 requires STUN-only ICE servers');
  const token=()=>randomBytes(24).toString('hex');
  const reply=(res,status,data)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(data));};
  const prune=()=>{for(const [code,r] of rooms)if(now()-r.updated>idleTTL||now()>r.ends)rooms.delete(code);for(const [ip,a]of attempts)if(now()-a.start>60000)attempts.delete(ip);};
  async function handle(req,res) {
    const url=new URL(req.url,'http://localhost');
    if(!url.pathname.startsWith('/p2p/'))return false;
    try {
      prune();
      if(req.headers.origin&&req.headers.origin!==(origin||`http://${req.headers.host}`)){reply(res,403,{error:'Origin mismatch'});return true;}
      if(req.method!=='POST'||!req.headers['content-type']?.startsWith('application/json')){reply(res,405,{error:'JSON POST required'});return true;}
      let size=0;const chunks=[];
      for await(const chunk of req){size+=chunk.length;if(size>48*1024){reply(res,413,{error:'Signaling message too large'});return true;}chunks.push(chunk);}
      const body=JSON.parse(Buffer.concat(chunks).toString('utf8'));
      if(!body||typeof body!=='object'||Array.isArray(body))throw Error('Invalid request');
      const route=url.pathname.slice(5);
      if(['create','join'].includes(route)){
        const ip=req.socket.remoteAddress;let a=attempts.get(ip);
        if(!a){if(attempts.size>=4096){reply(res,429,{error:'Try again later'});return true;}attempts.set(ip,a={start:now(),count:0});}
        if(++a.count>30){reply(res,429,{error:'Too many room attempts. Wait a minute.'});return true;}
      }
      const peer=()=>({token:token(),queue:[],rateAt:now(),signals:0});
      if(route==='create') {
        if(rooms.size>=256){reply(res,429,{error:'Signaling service full'});return true;}
        let code;do{code=String(randomInt(1000000)).padStart(6,'0');}while(rooms.has(code));
        const host=peer(),expiresAt=now()+joinTTL;
        rooms.set(code,{host,guest:null,expiresAt,updated:now(),ends:now()+12*60*60*1000});
        reply(res,200,{code,token:host.token,role:'host',expiresAt,iceServers});return true;
      }
      const room=typeof body.code==='string'&&/^\d{6}$/.test(body.code)?rooms.get(body.code):null;
      if(!room){reply(res,404,{error:'Room unavailable or expired'});return true;}
      if(route==='join') {
        if(now()>=room.expiresAt){reply(res,410,{error:'Room code expired. Ask P1 to create a new game.'});return true;}
        if(room.guest){reply(res,409,{error:'This game already has a P2'});return true;}
        room.guest=peer();room.updated=now();
        reply(res,200,{code:body.code,token:room.guest.token,role:'guest',expiresAt:room.expiresAt,iceServers});return true;
      }
      const secret=req.headers.authorization?.replace(/^Bearer /,'');
      const role=secret===room.host.token?'host':secret&&secret===room.guest?.token?'guest':null;
      if(!role){reply(res,403,{error:'Invalid session secret'});return true;}
      room.updated=now();const self=room[role],other=room[role==='host'?'guest':'host'];
      if(route==='poll'){reply(res,200,{paired:!!room.guest,signals:self.queue.splice(0)});return true;}
      if(route==='leave'){
        // Guest departure closes the reservation too; it cannot be stolen by a third player.
        rooms.delete(body.code);reply(res,200,{});return true;
      }
      if(route==='signal') {
        if(now()-self.rateAt>=60000){self.rateAt=now();self.signals=0;}
        if(++self.signals>40){reply(res,429,{error:'Too many signals'});return true;}
        const s=body.signal;
        if(!s||typeof s!=='object'||!['offer','answer','restart'].includes(s.type)||
          (s.type==='offer'&&role!=='host')||(s.type!=='offer'&&role!=='guest')||
          typeof s.id!=='string'||! /^[a-f0-9]{24}$/.test(s.id)||
          (s.type!=='restart'&&(typeof s.sdp!=='string'||s.sdp.length>32768||!s.sdp.startsWith('v=0')))||
          Object.keys(s).some(k=>!['type','id','sdp'].includes(k))) {reply(res,400,{error:'Invalid signaling message'});return true;}
        if(!other){reply(res,409,{error:'Waiting for P2'});return true;}
        if(other.queue.length>=16){reply(res,429,{error:'Peer is not receiving signals'});return true;}
        other.queue.push({type:s.type,id:s.id,...(s.type==='restart'?{}:{sdp:s.sdp})});reply(res,200,{});return true;
      }
      reply(res,405,{error:'Signaling operation not allowed'});return true;
    } catch {if(!res.headersSent)reply(res,400,{error:'Invalid signaling request'});else res.destroy();return true;}
  }
  return {handle};
}
module.exports={createSignaling};
