'use strict';
(() => {
  const MAX=512*1024;
  // Browser close() accepts 1000 or application codes, not RFC 1008/1009.
  const INVALID=4008, OVERSIZED=4009;
  // Bounded recent samples; lifetime counts/maxima survive reconnects. No payloads/credentials.
  function meter(){
    const values=[];let count=0,total=0,max=0,last=null;
    const gaps=Object.fromEntries([100,250,500,1000,2000].map(n=>[n,{count:0,consecutive:0,maxConsecutive:0}]));
    return {add(v){count++;total+=v;max=Math.max(max,v);values.push(v);if(values.length>4096)values.shift();
      for(const [n,g]of Object.entries(gaps)){if(v>Number(n)){g.count++;g.consecutive++;g.maxConsecutive=Math.max(g.maxConsecutive,g.consecutive);}else g.consecutive=0;}},
      arrival(t){if(last!==null)this.add(t-last);last=t;},
      report(){const a=[...values].sort((a,b)=>a-b);return {count,averageMs:count?total/count:null,p95Ms:a.length?a[Math.ceil(a.length*.95)-1]:null,p99Ms:a.length?a[Math.ceil(a.length*.99)-1]:null,maxMs:count?max:null,percentileWindow:a.length,gaps:JSON.parse(JSON.stringify(gaps))};}};
  }
  function endpoint(){
    const value=document.querySelector('meta[name="cat-fighter-relay-origin"]')?.content.trim();
    if(!value)throw Error('Internet relay is not configured. Set cat-fighter-relay-origin to the Pi HTTPS origin.');
    const url=new URL(value);
    if((url.protocol!=='https:'&&!(url.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(url.hostname)))||url.username||url.password||url.pathname!=='/'||url.search||url.hash)throw Error('Invalid relay origin');
    url.protocol=url.protocol==='https:'?'wss:':'ws:';url.pathname='/relay';return url.href;
  }
  function open(message){
    return new Promise((resolve,reject)=>{
      const ws=new WebSocket(endpoint());
      const timer=setTimeout(()=>fail('Relay connection timed out'),10000);
      function fail(text){clearTimeout(timer);ws.onclose=null;ws.close();reject(Error(text));}
      ws.onopen=()=>ws.send(JSON.stringify(message));
      ws.onerror=()=>fail('Relay unavailable');ws.onclose=()=>fail('Relay connection closed');
      ws.onmessage=e=>{try{const m=JSON.parse(e.data);if(m.kind==='error')return fail(m.error);if(m.kind!=='session'||!/^\d{6}$/.test(m.code)||!/^[a-f0-9]{48}$/.test(m.token)||!['host','guest'].includes(m.role))throw Error();clearTimeout(timer);ws.pending=[];ws.onmessage=e=>ws.pending.push(e);ws.onerror=ws.onclose=null;resolve({...m,ws});}catch{fail('Invalid relay response');}};
    });
  }
  async function request(kind,data={}){return open({kind,...data});}
  function create(session,hooks){
    let ws=null,closed=false,timer=null,connecting=false,paired=false;
    const clock=()=>performance.now(), stats={ws:meter(),state:meter(),input:meter(),rtt:meter(),parse:meter(),handler:meter(),serialize:meter(),sendInterval:meter(),timerDelay:meter(),snapshotBuild:meter(),presentation:meter()};
    const counters={sendFailures:0,queueDrops:0,skippedState:0,skippedInput:0,sentState:0,sentInput:0,sentBytes:0,receivedBytes:0,closes:0,errors:0,presenceMissing:0,watchdog:0,reconnects:0,invalidMessages:0,oversizedMessages:0,serverErrors:0,pingTimeouts:0};
    const events=[];let probe=null,pingEnabled=false,peak=0,ping=null,sequence=0,lastProbe=clock();
    function event(reason,extra={}){events.push({atMs:clock(),reason,hidden:!!document.hidden,bufferedAmount:ws?.bufferedAmount||0,...extra});if(events.length>64)events.shift();}
    function sample(){peak=Math.max(peak,ws?.bufferedAmount||0);}
    function lost(){paired=false;hooks.lost('Relay disconnected. Game paused; reconnecting. P1 must resume.');}
    function attach(socket){
      ws=socket;
      ws.onmessage=e=>{if(ws!==socket||closed)return;let stage='frame';const arrival=clock();stats.ws.arrival(arrival);sample();try{
        if(typeof e.data!=='string')throw Error();
        if(new TextEncoder().encode(e.data).length>MAX){counters.oversizedMessages++;event('oversized-message',{direction:'receive'});socket.close(OVERSIZED,'Relay data too large');return;}
        stage='json';
        counters.receivedBytes+=new TextEncoder().encode(e.data).length;
        const parseStart=clock(),m=JSON.parse(e.data);stats.parse.add(clock()-parseStart);
        stage='envelope';
        if(!m||typeof m!=='object'||Array.isArray(m))throw Error();
        if(m.kind==='error'&&typeof m.error==='string'){
          counters.serverErrors++;event('server-error',{category:['Authority violation','Rate limit','Invalid payload','Session ended'].includes(m.error)?m.error:'other',probePending:!!ping});
          // A legacy relay rejects diagnostic probes. Do not repeat them after reconnect.
          if(ping){pingEnabled=false;ping=null;}
          return; // The server owns its RFC policy close.
        }
        if(m.kind==='diag-pong'){if(!Number.isSafeInteger(m.id)||m.id<0)throw Error();if(ping&&m.id===ping.id){stats.rtt.add(clock()-ping.at);ping=null;}return;}
        if(m.kind==='presence'){if(typeof m.host!=='boolean'||typeof m.guest!=='boolean')throw Error();stage='presence-handler';if(!m.host||!m.guest){counters.presenceMissing++;event('presence-missing',{host:m.host,guest:m.guest});}paired=m.host&&m.guest;if(paired)hooks.ready();else lost();return;}
        if(m.kind==='ended'){stage='ended-handler';closed=true;clearInterval(probe);hooks.ended();return;}
        if(m.kind!==(session.role==='host'?'input':'state'))throw Error();
        stage='gameplay-handler';stats[m.kind].arrival(arrival);
        const handlerStart=clock();hooks.payload?.(m.kind,e.data);hooks.message(m.kind,m.data);stats.handler.add(clock()-handlerStart);
      }catch{counters.invalidMessages++;event('invalid-message',{stage});socket.close(INVALID,'Invalid relay data');}};
      for(const e of socket.pending||[])ws.onmessage(e);delete socket.pending;
      ws.onerror=()=>{if(ws!==socket||closed)return;counters.errors++;event('socket-error');socket.close();};
      ws.onclose=e=>{if(ws!==socket||closed)return;counters.closes++;event('socket-close',{code:e.code});lost();clearTimeout(timer);timer=setTimeout(reconnect,1000);};
    }
    async function reconnect(){
      if(closed||connecting)return;counters.reconnects++;event('reconnect');connecting=true;clearTimeout(timer);
      if(ws){ws.onclose=null;ws.close();}lost();
      try{const next=await open({kind:'resume',code:session.code,token:session.token});if(closed)next.ws.close();else attach(next.ws);}
      catch(e){if(!closed){hooks.lost(e.message+' Use Reconnect or leave the room.');timer=setTimeout(reconnect,3000);}}
      finally{connecting=false;}
    }
    attach(session.ws);delete session.ws;
    probe=setInterval(()=>{
      const t=clock();stats.timerDelay.add(Math.max(0,t-lastProbe-1000));lastProbe=t;sample();
      if(closed)return;
      if(ping&&t-ping.at>5000){counters.pingTimeouts++;ping=null;}
      if(pingEnabled&&!ping&&paired&&ws?.readyState===1&&ws.bufferedAmount===0){
        ping={id:++sequence,at:t};try{ws.send(JSON.stringify({kind:'diag-ping',id:ping.id}));}catch{ping=null;counters.sendFailures++;}
      }
    },1000);
    return {
      get bufferedAmount(){return ws?.bufferedAmount||0;},
      measure(name,ms){stats[name]?.add(ms);},
      enablePing(enabled=true){pingEnabled=enabled;},
      diagnostics(){sample();return {role:session.role,pingEnabled,hidden:!!document.hidden,readyState:ws?.readyState,bufferedAmount:ws?.bufferedAmount||0,bufferedAmountPeak:peak,queueThreshold:256*1024,counters:{...counters},intervals:Object.fromEntries(Object.entries(stats).map(([k,v])=>[k,v.report()])),events:[...events]};},
      note(reason,extra){if(reason==='watchdog')counters.watchdog++;event(reason,extra);},
      send(kind,data){sample();stats.sendInterval.arrival(clock());
        if(closed||!paired||ws?.readyState!==1||ws.bufferedAmount>256*1024){counters.sendFailures++;counters[kind==='state'?'skippedState':'skippedInput']++;if(ws?.bufferedAmount>256*1024)counters.queueDrops++;return false;}
        const start=clock(),json=JSON.stringify({kind,data});stats.serialize.add(clock()-start);const bytes=new TextEncoder().encode(json).length;
        if(bytes>MAX){counters.sendFailures++;counters.oversizedMessages++;event('oversized-message',{direction:'send'});ws.close(OVERSIZED,'Message too large');return false;}
        try{ws.send(json);}catch(error){counters.sendFailures++;throw error;}
        counters[kind==='state'?'sentState':'sentInput']++;counters.sentBytes+=bytes;sample();hooks.payload?.(kind,json);return true;},
      disconnect(){ws?.close();lost();},reconnect,
      close(notify=true){closed=true;clearInterval(probe);clearTimeout(timer);if(notify&&ws?.readyState===1)ws.send(JSON.stringify({kind:'leave'}));ws?.close(1000,'Normal close');},
    };
  }
  window.CatRelay={request,create};
})();
