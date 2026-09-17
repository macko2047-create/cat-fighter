'use strict';
// Opaque relay only: no game modules, simulation, snapshots, or filesystem serving.
const http=require('node:http');
const {monitorEventLoopDelay}=require('node:perf_hooks');
const {randomBytes,randomInt}=require('node:crypto');
const {WebSocketServer,WebSocket}=require('ws');
const MAX=512*1024;
function createRelayServer({origins=[],now=Date.now,idleTTL=120000,sessionTTL=6*60*60*1000,sweepMs=5000,maxRooms=32}={}) {
  for(const value of [idleTTL,sessionTTL,sweepMs,maxRooms])if(!Number.isSafeInteger(value)||value<=0)throw Error('Invalid relay limits');
  const rooms=new Map(),attempts=new Map();
  const delay=monitorEventLoopDelay({resolution:20});delay.enable();
  const started=now(),counts={state:0,input:0,ingressBytes:0,egressBytes:0,slowReceivers:0,sendFailures:0,noReceiver:0,rateLimits:0,closes:0,pings:0};
  const lifecycle={closeReasons:{},closeCodes:{},roomDeletionReasons:{},events:[]};
  let socketSequence=0,roomSequence=0;
  const bump=(map,key)=>{map[key]=(map[key]||0)+1;};
  const record=(reason,ws,r,extra={})=>{lifecycle.events.push({atMs:now()-started,reason,socketId:ws?.diagnosticId,roomId:r?.diagnosticId,...extra});if(lifecycle.events.length>128)lifecycle.events.shift();};
  const closeSocket=(ws,reason,code=1000,text='Room closed',terminate=false)=>{if(!ws)return;ws.closeReason??=reason;if(terminate)ws.terminate();else ws.close(code,text);};
  let peakQueue=0,lastReport=now(),previous={...counts};
  function diagnostics(){
    let queue=0;for(const ws of wss.clients)queue=Math.max(queue,ws.bufferedAmount);peakQueue=Math.max(peakQueue,queue);
    const seconds=Math.max(.001,(now()-lastReport)/1000),rates={};
    for(const k of ['state','input','ingressBytes','egressBytes'])rates[k+'PerSecond']=(counts[k]-previous[k])/seconds;
    previous={...counts};lastReport=now();
    const loop={meanMs:Number.isFinite(delay.mean)?delay.mean/1e6:null,p95Ms:delay.percentile(95)/1e6,p99Ms:delay.percentile(99)/1e6,maxMs:delay.max/1e6};delay.reset();
    return {uptimeMs:now()-started,connections:wss.clients.size,rooms:rooms.size,memory:process.memoryUsage(),eventLoop:loop,queueCurrentMax:queue,queuePeak:peakQueue,queueThreshold:MAX,counts:{...counts},rates,limits:{idleTTL,sessionTTL,sweepMs},lifecycle:JSON.parse(JSON.stringify(lifecycle))};
  }
  const server=http.createServer((req,res)=>{res.writeHead(req.url==='/health'?200:404,{'Content-Type':'application/json'});res.end(req.url==='/health'?'{"ok":true}':'{}');});
  const wss=new WebSocketServer({noServer:true,maxPayload:MAX,perMessageDeflate:false});
  const send=(ws,value)=>{if(ws?.readyState===WebSocket.OPEN){peakQueue=Math.max(peakQueue,ws.bufferedAmount);if(ws.bufferedAmount>MAX){counts.slowReceivers++;closeSocket(ws,'slow-receiver',1000,'',true);return;}const text=typeof value==='string'?value:JSON.stringify(value);ws.send(text,error=>{if(error)counts.sendFailures++;});counts.egressBytes+=Buffer.byteLength(text);peakQueue=Math.max(peakQueue,ws.bufferedAmount);}};
  const presence=(r,reason)=>{const p={kind:'presence',host:r.host.ws?.readyState===1,guest:r.guest?.ws?.readyState===1};record('presence',null,r,{trigger:reason,...p});send(r.host.ws,p);send(r.guest?.ws,p);};
  const end=(code,r,reason)=>{if(rooms.get(code)!==r)return;rooms.delete(code);bump(lifecycle.roomDeletionReasons,reason);record('room-deleted',null,r,{trigger:reason,idleMs:now()-r.updated,ageMs:now()-r.created});for(const peer of [r.host,r.guest]){send(peer?.ws,{kind:'ended'});closeSocket(peer?.ws,reason);}};
  const sweep=()=>{const t=now();for(const [code,r]of rooms)if(t-r.updated>idleTTL||t-r.created>sessionTTL)end(code,r,t-r.created>sessionTTL?'session-expiry':'idle-expiry');for(const [ip,a]of attempts)if(t-a.at>60000)attempts.delete(ip);};
  server.on('upgrade',(req,socket,head)=>{
    const ip=req.socket.remoteAddress,t=now();let a=attempts.get(ip);
    if(!a||t-a.at>60000){a={at:t,count:0};attempts.set(ip,a);}
    if(req.url!=='/relay'||(req.headers.origin&&!origins.includes(req.headers.origin))||++a.count>60||attempts.size>4096||wss.clients.size>=128){socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');return;}
    wss.handleUpgrade(req,socket,head,ws=>wss.emit('connection',ws));
  });
  wss.on('connection',ws=>{
    ws.diagnosticId=++socketSequence;record('connected',ws);
    let room=null,role=null,at=now(),count=0,bytes=0;
    const authTimer=setTimeout(()=>{if(!room)closeSocket(ws,'authentication-timeout',1008,'Authentication timeout');},5000);authTimer.unref();
    ws.on('error',error=>{ws.closeReason??=error.code==='WS_ERR_UNSUPPORTED_MESSAGE_LENGTH'?'max-payload':'socket-error';record('socket-error',ws,room);});
    ws.on('message',(raw,binary)=>{
      try {
        if(now()-at>=1000){at=now();count=bytes=0;}
        counts.ingressBytes+=raw.length;
        if(++count>60||(bytes+=raw.length)>2*1024*1024){counts.rateLimits++;throw Error('Rate limit');}
        if(binary)throw Error('Text JSON required');
        const m=JSON.parse(raw.toString());
        if(!m||typeof m!=='object')throw Error('Invalid message');
        sweep();
        if(!room){
          if(raw.length>1024)throw Error('Invalid handshake');
          let code=m.code;
          if(m.kind==='create'){
            if(rooms.size>=maxRooms)throw Error('Server full');
            do{code=String(randomInt(1000000)).padStart(6,'0');}while(rooms.has(code));
            room={code,diagnosticId:++roomSequence,host:{token:randomBytes(24).toString('hex'),ws:null},guest:null,created:now(),updated:now()};rooms.set(code,room);role='host';
          }else{
            room=rooms.get(code);if(!room)throw Error('Room not found');
            if(m.kind==='join'){
              if(room.guest){room=null;throw Error('Room already has a P2');}
              room.guest={token:randomBytes(24).toString('hex'),ws:null};role='guest';
            }else if(m.kind==='resume'){
              role=typeof m.token==='string'&&/^[a-f0-9]{48}$/.test(m.token)?(m.token===room.host.token?'host':m.token===room.guest?.token?'guest':null):null;
              if(!role){room=null;throw Error('Invalid token');}
            }else{room=null;throw Error('Invalid handshake');}
          }
          // Notify loss before replacing a live socket: replacement must pause P1.
          const old=room[role].ws;if(old){room[role].ws=null;presence(room,'replacement');closeSocket(old,'replaced',1000,'Replaced');}
          room[role].ws=ws;room.updated=now();clearTimeout(authTimer);
          send(ws,{kind:'session',code:room.code,role,token:room[role].token});record('authenticated',ws,room,{role});presence(room,'authenticated');return;
        }
        if(!rooms.has(room.code)||room[role].ws!==ws)throw Error('Session ended');
        if(m.kind==='diag-ping'&&Number.isSafeInteger(m.id)&&m.id>=0){counts.pings++;send(ws,{kind:'diag-pong',id:m.id});return;}
        if(m.kind==='leave'){end(room.code,room,'explicit-leave');return;}
        if(m.kind!==(role==='host'?'state':'input'))throw Error('Authority violation');
        if(!m.data||typeof m.data!=='object')throw Error('Invalid payload');
        counts[m.kind]++;if(room[role==='host'?'guest':'host']?.ws?.readyState!==1)counts.noReceiver++;
        room.updated=now();send(room[role==='host'?'guest':'host']?.ws,raw.toString());
      }catch(e){send(ws,{kind:'error',error:e.message});closeSocket(ws,e.message==='Rate limit'?'rate-or-byte-limit':'invalid-request',1008,'Invalid request');record('request-rejected',ws,room,{category:['Rate limit','Text JSON required','Invalid message','Invalid handshake','Server full','Room not found','Room already has a P2','Invalid token','Session ended','Authority violation','Invalid payload'].includes(e.message)?e.message:'invalid-json-or-internal'});}
    });
    ws.on('close',code=>{counts.closes++;bump(lifecycle.closeReasons,ws.closeReason||'peer-or-network');bump(lifecycle.closeCodes,String(code));record('socket-close',ws,room,{role,code,trigger:ws.closeReason||'peer-or-network',current:!!(room&&role&&room[role]?.ws===ws)});clearTimeout(authTimer);if(room&&role&&room[role]?.ws===ws){room[role].ws=null;if(rooms.get(room.code)===room)presence(room,'socket-close');}});
  });
  const timer=setInterval(sweep,sweepMs);timer.unref();
  server.diagnostics=diagnostics;
  server.on('close',()=>{clearInterval(timer);delay.disable();});
  server.dispose=()=>{delay.disable();clearInterval(timer);for(const [code,r]of rooms)end(code,r,'server-dispose');for(const ws of wss.clients)closeSocket(ws,'server-dispose',1000,'',true);wss.close();server.closeAllConnections();};
  return server;
}
if(require.main===module){
  const server=createRelayServer({origins:(process.env.RELAY_ORIGINS||'').split(',').map(s=>s.trim()).filter(Boolean),idleTTL:Number(process.env.RELAY_IDLE_MS||120000),sessionTTL:Number(process.env.RELAY_SESSION_MS||21600000)});
  server.listen(Number(process.env.PORT||8788),process.env.HOST||'127.0.0.1',()=>console.log('Cat Fighter relay listening'));
  const diagnosticTimer=process.env.RELAY_DIAGNOSTICS==='1'?setInterval(()=>console.log(JSON.stringify({relayDiagnostics:server.diagnostics()})),5000):null;diagnosticTimer?.unref();
  for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>{server.dispose();server.close();});
}
module.exports={createRelayServer,MAX};
