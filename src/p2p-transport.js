'use strict';
// Reliable ordered data channel; signaling carries SDP only. No media tracks.
(() => {
  const MAX=512*1024, CHUNK=8000;
  async function request(route,data={},session=null,keepalive=false) {
    const response=await fetch('/p2p/'+route,{method:'POST',headers:{'Content-Type':'application/json',...(session?{Authorization:'Bearer '+session.token}:{})},
      body:JSON.stringify({...data,...(session?{code:session.code}:{})}),keepalive,signal:AbortSignal.timeout(12000)});
    if(!response.headers.get('content-type')?.includes('application/json'))throw Error('P2P service unavailable on this website');
    const value=await response.json();
    if(!response.ok)throw Error(value.error||'P2P service unavailable');
    return value;
  }
  function create(session,hooks) {
    let closed=false,pc=null,channel=null,generation='',timer=null,deadline=null,negotiating=false,started=false;
    let incoming=null,serial=0,receiveAt=0,receiveCount=0,signalWork=Promise.resolve(),everReady=false;
    const id=()=>Array.from(crypto.getRandomValues(new Uint8Array(12)),v=>v.toString(16).padStart(2,'0')).join('');
    const lost=message=>{if(!closed)hooks.lost(message);};
    function reset() {
      clearTimeout(deadline);incoming=null;
      if(channel){channel.onclose=channel.onerror=channel.onmessage=channel.onopen=null;channel.close();channel=null;}
      if(pc){pc.onconnectionstatechange=pc.oniceconnectionstatechange=pc.ondatachannel=null;pc.close();pc=null;}
    }
    function fail(message) {reset();negotiating=false;lost(message+' Use Reconnect, then the host can resume.');}
    function ready() {clearTimeout(deadline);negotiating=false;everReady=true;hooks.ready();}
    function attach(dc,current) {
      if(pc!==current||channel||dc.label!=='cat-fighter-v1'||!dc.ordered||dc.maxRetransmits!==null||dc.maxPacketLifeTime!==null){dc.close();return;}
      channel=dc;
      dc.onopen=()=>{if(pc===current)ready();};
      dc.onclose=()=>{if(pc===current)fail('Peer connection closed.');};
      dc.onerror=()=>{if(pc===current)fail('Peer connection failed.');};
      dc.onmessage=e=>{
        if(pc!==current)return;
        try {
          if(typeof e.data!=='string'||e.data.length>CHUNK*6+128)throw Error('Invalid packet');
          const part=JSON.parse(e.data);
          if(!Number.isSafeInteger(part.id)||!Number.isInteger(part.part)||!Number.isInteger(part.total)||part.total<1||part.total>66||
            typeof part.data!=='string'||part.data.length>CHUNK)throw Error('Invalid fragment');
          if(part.part===0){if(incoming)throw Error('Incomplete message');incoming={id:part.id,total:part.total,next:0,size:0,data:[]};}
          if(!incoming||part.id!==incoming.id||part.total!==incoming.total||part.part!==incoming.next++)throw Error('Out-of-order fragment');
          incoming.size+=new TextEncoder().encode(part.data).length;
          if(incoming.size>MAX)throw Error('Message too large');
          incoming.data.push(part.data);
          if(incoming.next===incoming.total){
            const now=performance.now();
            if(now-receiveAt>=1000){receiveAt=now;receiveCount=0;}
            if(++receiveCount>120)throw Error('Peer message rate exceeded');
            const value=JSON.parse(incoming.data.join(''));incoming=null;
            if(value.kind==='bye'){hooks.ended();return;}
            if(value.kind!==(session.role==='host'?'input':'state'))throw Error('Peer authority violation');
            hooks.message(value.kind,value.data);
          }
        }catch{fail('Invalid peer message.');}
      };
      if(dc.readyState==='open')ready();
    }
    function build(next) {
      reset();generation=next;negotiating=true;
      lost('Connecting directly to the other player…');
      const current=pc=new RTCPeerConnection({iceServers:session.iceServers||[]});
      current.ondatachannel=e=>attach(e.channel,current);
      const changed=()=>{
        if(pc!==current)return;
        if(['failed','closed'].includes(current.connectionState)||current.iceConnectionState==='failed')fail('Direct connection failed.');
        else if(current.connectionState==='disconnected'||current.iceConnectionState==='disconnected')lost('Peer disconnected. Game paused.');
        else if(channel?.readyState==='open'&&(current.connectionState==='connected'||['connected','completed'].includes(current.iceConnectionState)))ready();
      };
      current.onconnectionstatechange=current.oniceconnectionstatechange=changed;
      deadline=setTimeout(()=>{if(pc===current)fail('Could not establish a direct connection on these networks.');},25000);
      return current;
    }
    async function description(current,value) {
      await current.setLocalDescription(value);
      // Non-trickle ICE keeps signaling small and avoids candidate/offer races.
      if(current.iceGatheringState!=='complete')await new Promise((resolve,reject)=>{
        const timeout=setTimeout(()=>done(Error('ICE gathering timed out')),10000);
        const check=()=>{if(current.iceGatheringState==='complete')done();};
        function done(error){clearTimeout(timeout);current.removeEventListener('icegatheringstatechange',check);error?reject(error):resolve();}
        current.addEventListener('icegatheringstatechange',check);check();
      });
      if(closed||pc!==current)return;
      await request('signal',{signal:{type:current.localDescription.type,sdp:current.localDescription.sdp,id:generation}},session);
    }
    async function offer() {
      if(closed||negotiating)return;
      const current=build(id());
      try{attach(current.createDataChannel('cat-fighter-v1',{ordered:true}),current);await description(current,await current.createOffer());}
      catch(error){if(pc===current)fail(error.message);}
    }
    async function signal(s) {
      if(closed)return;
      if(!s||typeof s.id!=='string'||!/^[a-f0-9]{24}$/.test(s.id))throw Error('Invalid signal');
      if(s.type==='restart'&&session.role==='host'){await offer();return;}
      if(typeof s.sdp!=='string'||s.sdp.length>32768)throw Error('Invalid SDP');
      if(s.type==='offer'&&session.role==='guest') {
        if(generation===s.id)return;
        const current=build(s.id);
        try{await current.setRemoteDescription({type:'offer',sdp:s.sdp});await description(current,await current.createAnswer());}
        catch(error){if(pc===current)fail(error.message);}
      }else if(s.type==='answer'&&session.role==='host'&&pc&&generation===s.id&&pc.signalingState==='have-local-offer'){
        await pc.setRemoteDescription({type:'answer',sdp:s.sdp});
      }
    }
    async function poll() {
      try {
        const result=await request('poll',{},session);
        if(closed)return;
        if(!Array.isArray(result.signals)||result.signals.length>16)throw Error('Invalid signaling response');
        if(result.paired&&!started){started=true;if(session.role==='host')await offer();}
        for(const s of result.signals){signalWork=signalWork.then(()=>signal(s));await signalWork;}
      }catch(error){signalWork=Promise.resolve();if(!closed&&!everReady)lost(error.message);}
      finally{if(!closed)timer=setTimeout(poll,750);}
    }
    const transport={
      send(kind,data) {
        if(closed||channel?.readyState!=='open')return false;
        const value=JSON.stringify({kind,data});
        if(new TextEncoder().encode(value).length>MAX){fail('Game snapshot exceeds the transport limit.');return false;}
        // Do not enqueue stale frames behind a congested link. Caller retains actions.
        if(channel.bufferedAmount>256*1024)return false;
        const total=Math.ceil(value.length/CHUNK),message=++serial;
        try {for(let part=0;part<total;part++)channel.send(JSON.stringify({id:message,part,total,data:value.slice(part*CHUNK,(part+1)*CHUNK)}));return true;}
        catch{fail('Unable to send peer data.');return false;}
      },
      disconnect(){if(!closed)fail('Authoritative snapshot flow timed out.');},
      reconnect(){if(negotiating||closed)return;return session.role==='host'?offer():request('signal',{signal:{type:'restart',id:id()}},session).catch(e=>lost(e.message));},
      close(notify=true){if(closed)return;if(notify)transport.send('bye',{});closed=true;clearTimeout(timer);reset();if(notify)request('leave',{},session,true).catch(()=>{});},
    };
    timer=setTimeout(poll,0);
    return transport;
  }
  window.CatP2P={request,create};
})();
