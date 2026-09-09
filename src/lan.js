'use strict';
// P1 simulates; P2 sends controls and renders authoritative snapshots at 20 Hz.
(() => {
  let session=null, stream=null, busy=false, connecting=false, peerConnected=false, presenceReady=false, resumeAfterDialog=false, lastSend=0, lastReceived=0;
  let transport=null, watchdog=null;
  let remote={x:0,y:0,fire:false,target:null}, actions=[], padPrevious=[], applying=false;
  const neutral=()=>({x:0,y:0,fire:false,target:null});
  const status=text=>{ $('#lan-status').textContent=text; $('#lan-bar').textContent=text+' · Connection settings'; };
  const serverRequired='Wi-Fi co-op needs the local game server. On the host computer, run node tools/lan-server.cjs, then open the URL shown in the terminal.';
  // Safari versions before AbortSignal.timeout still support AbortController.
  const timeoutSignal=ms=>{
    if(AbortSignal.timeout)return AbortSignal.timeout(ms);
    const controller=new AbortController();
    setTimeout(()=>controller.abort(),ms);
    return controller.signal;
  };
  let searchVersion=0;
  async function jsonResponse(response) {
    // Static hosts return index.html for /lan/* routes. Detect that response
    // before JSON parsing so the player sees the setup step that is missing.
    if (!response.headers.get('content-type')?.includes('application/json')) throw Error(serverRequired);
    return response.json();
  }
  async function discover() {
    const version=++searchVersion;
    $('#lan-rooms').replaceChildren();
    $('#lan-discovery-status').textContent='Searching for available hosts…';
    try {
      const [info,list]=await Promise.all(['info','rooms'].map(async route=>{
        const response=await fetch('/lan/'+route,{cache:'no-store',signal:timeoutSignal(3000)});
        if(!response.ok)throw Error('Wi-Fi server unavailable or incompatible');
        return jsonResponse(response);
      }));
      if(version!==searchVersion)return;
      if(!Array.isArray(info.addresses)||!Array.isArray(list.rooms))throw Error('Not a Wi-Fi game server');
      $('#lan-addresses').textContent='Current server: '+location.origin+' · Open on other devices: '+(info.addresses.join('　')||location.origin);
      $('#lan-discovery-status').textContent=list.rooms.length?`Found ${list.rooms.length} available hosts`:'No available rooms. Ask the host to create one, check both devices use the URL above, then search again.';
      for(const room of list.rooms){
        const button=document.createElement('button');
        button.textContent=`Host ${room.code} · Join as P2`;
        button.disabled=!!session||connecting;
        button.onclick=()=>{ $('#lan-code').value=room.code;return enter('guest'); };
        $('#lan-rooms').append(button);
      }
    } catch(error) {
      if(version!==searchVersion)return;
      $('#lan-discovery-status').textContent=error.message===serverRequired ? serverRequired : 'Search failed. Open the host computer URL (http://IP:port). Room discovery is unavailable from local files or static websites.';
    }
  }
  async function request(route, data={}, credentials=session) {
    const res=await fetch('/lan/'+route, {method:'POST',headers:{'Content-Type':'application/json',...(credentials?{Authorization:'Bearer '+credentials.token}:{})},
      body:JSON.stringify({...data,...(credentials?{code:credentials.code}:{})}),signal:timeoutSignal(3000)});
    const result=await jsonResponse(res);
    if(!res.ok) throw new Error(result.error||'Connection failed');
    return result;
  }
  const snapshotTimes=[];
  const presentation=window.CatPresentation?.create();
  function stopMotion() {presentation?.reset();remote=neutral();keys.clear();window.flightControls?.reset();}
  function pauseHost(message) {
    stopMotion();
    if(mode==='playing') { applying=true;try{pause(message);}finally{applying=false;} }
  }
  function lost(message) {
    peerConnected=false;actions=[];
    if(session?.role==='host') pauseHost(message);
    else {stopMotion();if(mode==='playing'){mode='paused';show('Connection lost',message);}}
    status(message);
  }
  function command(action) {
    if(session?.role==='guest' && peerConnected && actions.length<8) actions.push(action);
  }
  function received() {
    lastReceived=performance.now();
    if(presenceReady&&!peerConnected){peerConnected=true;status(`Room ${session.code} · Reconnected. Host can resume`);refreshButtons();}
  }
  function localInput() {
    if($('#settings').open||$('#lan-dialog').open) return neutral();
    const p=pads().find(p=>p.index===assignments[0])||pads()[0];
    let x=Number(keys.has('KeyD')||keys.has('ArrowRight'))-Number(keys.has('KeyA')||keys.has('ArrowLeft'));
    let y=Number(keys.has('KeyS')||keys.has('ArrowDown'))-Number(keys.has('KeyW')||keys.has('ArrowUp'));
    let fire=keys.has('KeyF')||keys.has('KeyK');
    if(p){
      const dz=v=>Math.abs(v||0)>deadzone?v:0;
      x+=dz(p.axes[0])+Number(!!p.buttons[15]?.pressed)-Number(!!p.buttons[14]?.pressed);
      y+=dz(p.axes[1])+Number(!!p.buttons[13]?.pressed)-Number(!!p.buttons[12]?.pressed);
      fire ||= !!p.buttons[config(p).fire]?.pressed;
    }
    const target=window.flightControls?.targetFor(session?.role==='guest'?1:0)||null;
    if(target){
      const player=players[session?.role==='guest'?1:0];
      if(player){x=target.x-player.x;y=target.y-player.y;}
      fire=true;
    }
    const n=Math.hypot(x,y);if(n>1){x/=n;y/=n;}
    return {x,y,fire:!!fire,target};
  }
  const visualIds=new WeakMap();let visualSerial=0;
  const identify=o=>{if(!visualIds.has(o))visualIds.set(o,++visualSerial);return {...o,netId:visualIds.get(o)};};
  function snapshot() {
    return {mode,elapsed,score,players:players.map(identify),enemies:enemies.map(identify),shots:shots.map(s=>({...identify(s),owner:{index:s.owner?.index||0}})),hostile:hostile.map(identify),drops:drops.map(identify),sparks:sparks.map(identify),bossDebris:bossDebris.map(identify),wave,loop,loopTransition,bossSpawned,bossWreck,flash,ambient,aircraft:[...aircraft]};
  }
  function acceptState(s) {
    const oldMode=mode;
    const arrival=performance.now();snapshotTimes.push(arrival);if(snapshotTimes.length>240)snapshotTimes.shift();
    presentation?.accept(s,arrival);
    ({mode,elapsed,score,players,enemies,shots,hostile,drops,sparks,bossDebris,wave,loop,loopTransition,bossSpawned,bossWreck,flash,ambient}=s);
    aircraft.splice(0,2,...s.aircraft);joined.fill(true);
    if(oldMode!==mode){
      if(mode==='playing') $('#overlay').style.display='none';
      else show(mode==='paused'?'PAUSED':mode==='over'?'GAME OVER':'Wi-Fi CO-OP',mode==='over'?'Waiting for the host to restart.':'Waiting for the host to start or resume.');
    }
    updateHUD();
  }
  function acceptInput(data) {
    remote=data;received();
    applying=true;
    try {for(const action of remote.actions||[]){
      if(action==='bomb')bomb(players[1]);
      if(action==='rejoin')tryRejoin(1);
      if(action==='pause'&&mode==='playing')pause('P2 paused the game. Host: press RESUME to continue.');
    }} finally {applying=false;}
  }
  function refreshButtons() {
    const active=!!session;
    $('#lan-create').disabled=active||connecting;$('#lan-join').disabled=active||connecting;
    for(const id of ['#p2p-create','#p2p-join'])if($(id))$(id).disabled=active||connecting;
    if($('#p2p-reconnect'))$('#p2p-reconnect').hidden=session?.transport!=='p2p';
    $('#lan-leave').hidden=!active;$('#lan-bar').hidden=!active;
    $('#join-p1').disabled=active;$('#join').disabled=active;
    $('#aircraft-1').disabled=active;$('#aircraft-0').disabled=session?.role==='guest';
    $('#start').disabled=active&&(session.role==='guest'||!peerConnected);
    $('#lan-open-host').disabled=active||connecting;
    for(const button of $('#lan-rooms').querySelectorAll('button'))button.disabled=active||connecting;
  }
  function connect(credentials) {
    session=credentials;lastReceived=performance.now();lastSend=0;peerConnected=false;presenceReady=false;actions=[];padPrevious=[];
    stopMotion();joined.fill(true);mode='ready';players=[];$('#overlay').style.display='flex';
    show(session.transport==='p2p'?'P2P CO-OP':'Wi-Fi CO-OP',session.role==='host'?'Wait for P2 to join, then press START.':'You control P2. Wait for the host to start.');
    $('#lan-code').value=session.code;
    status(`Room ${session.code} · You are ${session.role==='host'?'P1 Host':'P2'}`);
    if(session.transport==='p2p') {
      $('#p2p-code').value=session.code;
      const current=session;
      transport=window.CatP2P.create(session,{
        ready(){if(session!==current)return;presenceReady=peerConnected=true;lastReceived=performance.now();status(`Room ${session.code} · Direct connection ready. Host: press START / RESUME`);refreshButtons();},
        lost(message){if(session!==current)return;presenceReady=false;lost(message);refreshButtons();},
        message(kind,data){
          if(session!==current)return;
          if(kind==='input')acceptInput(window.CatNetProtocol.input(data));
          else {const state=window.CatNetProtocol.state(data);received();acceptState(state);}
        },
        ended(){if(session===current){leave(false);status('The other player left the game. Create or join a new game.');}}
      });
      // RAF may stop in background tabs. Detect stalled traffic independently.
      watchdog=setInterval(()=>checkTimeout(performance.now()),100);
      refreshButtons();updateHUD();return;
    }
    stream=new EventSource(`/lan/events?code=${session.code}&token=${session.token}`);
    stream.addEventListener('presence',e=>{
      const p=JSON.parse(e.data);presenceReady=p.host&&p.guest;peerConnected=presenceReady;lastReceived=performance.now();
      if(!peerConnected) lost(session.role==='host'?'Waiting for P2. Game paused.':'Waiting for the host. Game paused.');
      else status(`Room ${session.code} · ${session.role==='host'?'P1 Host':'P2'} · Connected`);
      refreshButtons();
    });
    stream.addEventListener('input',e=>{
      if(session?.role!=='host')return;
      acceptInput(JSON.parse(e.data));
    });
    stream.addEventListener('state',e=>{if(session?.role==='guest'){received();acceptState(JSON.parse(e.data));}});
    stream.addEventListener('ended',()=>{leave(false);status('The host closed the room. Please join again.');});
    stream.onerror=()=>{if(session){lost('Connection lost. Reconnecting; the host can resume once connected.');refreshButtons();}};
    refreshButtons();updateHUD();
  }
  async function enter(role,kind='lan') {
    if(session||connecting)return;
    if(mode==='playing'||mode==='paused'){status('Finish the current run before creating or joining a room.');return;}
    connecting=true;refreshButtons();
    try {
      if(kind==='p2p'&&!window.RTCPeerConnection)throw Error('This browser does not support WebRTC data channels');
      const code=$(kind==='p2p'?'#p2p-code':'#lan-code').value.trim().toUpperCase();
      if(kind==='p2p'&&role==='guest'&&!/^\d{6}$/.test(code))throw Error('Enter the six-digit room code');
      const credentials=await (kind==='p2p'?window.CatP2P.request:request)(role==='host'?'create':'join',role==='host'?{}:{code},null);
      if(kind==='p2p'&&(!/^\d{6}$/.test(credentials.code)||! /^[a-f0-9]{48}$/.test(credentials.token)||credentials.role!==role))throw Error('Invalid room response');
      // Keep the current menu/demo intact when room creation or joining fails.
      window.arcade?.dismiss();
      connect({...credentials,transport:kind});
    } catch(error){status('Unable to connect: '+error.message+(kind==='lan'?'. Open the game using the Wi-Fi server URL.':''));}
    finally {connecting=false;refreshButtons();if(kind==='lan')await discover();}
  }
  function leave(notify=true) {
    const old=session;session=null;transport?.close(notify);transport=null;if(watchdog)clearInterval(watchdog);watchdog=null;stream?.close();stream=null;peerConnected=false;actions=[];
    if(notify&&old&&old.transport!=='p2p')request('leave',{},old).catch(()=>{});
    stopMotion();mode='ready';players=[];enemies=[];shots=[];hostile=[];drops=[];sparks=[];bossDebris=[];bossWreck=null;loopTransition=0;score=0;joined.fill(false);
    show('CAT FIGHTER','You left the room.');refreshButtons();updateHUD();status('Not connected');
  }
  function checkTimeout(now) {
    if(session&&peerConnected&&now-lastReceived>2000&&(mode==='playing'||transport)){
      // Close the stale channel: P1's existing close/input watchdog pauses it.
      // A queued pause can be erased by lost() or blocked behind backpressure.
      // Reconnection preserves the paused host state and requires host RESUME.
      if(lan.guest&&transport){transport.disconnect();return;}
      if(lan.guest)command('pause');
      lost('Connection timed out. Game paused; check both devices are still connected.');refreshButtons();
    }
  }
  const lan=window.lan={
    get active(){return !!session;},get guest(){return session?.role==='guest';},get applying(){return applying;},
    get ready(){return peerConnected;},
    command,
    diagnostics(){return {snapshotTimes:[...snapshotTimes],bufferedAmount:transport?.bufferedAmount??null};},
    present(state){const result=presentation?presentation.render(state,performance.now(),localInput(),peerConnected&&!document.hidden):state;lan.lastVisual=result;return result;},
    canStart(){return session?.role==='host'&&peerConnected;},
    owns(i){return !session||applying||i===(session.role==='host'?0:1);},
    targetFor(i){return session?.role==='host'&&i===1?remote.target:null;},
    inputFor(i){
      if(session?.role==='host'&&i===1){
        if(!peerConnected)return neutral();
        let {x,y,fire,target}=remote;
        if(target&&players[1]){x=target.x-players[1].x;y=target.y-players[1].y;const n=Math.hypot(x,y);if(n>1){x/=n;y/=n;}}
        return {x,y,fire};
      }
      if(session?.role==='host'&&i===0)return localInput();
      if(session?.role==='guest')return i===1?localInput():neutral();
      return null;
    },
    key(e){
      if(!session)return false;
      if(/^(INPUT|TEXTAREA|SELECT)$/.test(e.target?.tagName))return true;
      if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space','Enter','Escape'].includes(e.code))e.preventDefault();
      keys.add(e.code);
      if(!e.repeat && !$('#lan-dialog').open && !$('#settings').open){
        if(['KeyG','KeyL'].includes(e.code)){if(lan.guest)command('bomb');else bomb(players[0]);}
        if(['KeyF','KeyK'].includes(e.code)){if(lan.guest)command('rejoin');else tryRejoin(0);}
        if(e.code==='Escape'){if(lan.guest)command('pause');else pause();}
        if(e.code==='Enter'&&!lan.guest){if(mode==='paused')pause();else start();}
      }
      return true;
    },
    poll(){
      if($('#settings').open||$('#lan-dialog').open)return;
      const p=pads().find(p=>p.index===assignments[0])||pads()[0];
      if(!p){if(padPrevious.length&&mode==='playing'){if(lan.guest)command('pause');else pauseHost('Controller disconnected. Game paused.');}padPrevious=[];return;}
      assignments[0]=p.index;assignments[1]=null;
      const pressed=p.buttons.map(b=>b.pressed),c=config(p),edge=i=>pressed[i]&&!padPrevious[i];
      if(edge(c.bomb)){if(lan.guest)command('bomb');else bomb(players[0]);}
      if(edge(c.fire)){if(lan.guest)command('rejoin');else if(mode==='playing')tryRejoin(0);else if(mode==='paused')pause();else start();}
      if(edge(c.pause)){if(lan.guest)command('pause');else if(mode==='playing'||mode==='paused')pause();else start();}
      padPrevious=pressed;
    },
    tick(now){
      if(!session)return;
      checkTimeout(now);
      if(busy||now-lastSend<50)return;
      if(transport){
        lastSend=now;
        const data=lan.guest?{...(mode==='playing'&&!document.hidden?localInput():neutral()),actions:[...actions]}:snapshot();
        if(transport.send(lan.guest?'input':'state',data)&&lan.guest)actions=[];
        return;
      }
      busy=true;lastSend=now;const current=session;
      const data=lan.guest?{input:mode==='playing'&&!document.hidden?localInput():neutral(),actions:actions.splice(0)}:{state:snapshot()};
      request(lan.guest?'input':'state',data,current).catch(()=>{if(session===current){lost('Connection failed. Check Wi-Fi or rejoin the room.');refreshButtons();}}).finally(()=>{busy=false;});
    }
  };
  const openDialog=()=>{
    resumeAfterDialog=mode==='playing';
    if(resumeAfterDialog)pause('Configuring connection');
    $('#lan-dialog').showModal();return discover();
  };
  $('#lan-search').onclick=discover;
  $('#lan-open-host').onclick=()=>{
    if(session||connecting)return;
    if(mode==='playing'||mode==='paused'){status('Finish the current run before switching host URLs.');return;}
    try {
      const url=new URL($('#lan-host-url').value.trim());
      if(!['http:','https:'].includes(url.protocol)||url.username||url.password)throw Error();
      location.assign(url.origin+'/');
    } catch {status('Enter a full host URL, such as http://192.168.0.55:8767');}
  };
  $('#lan-open').onclick=openDialog;
  $('#lan-bar').onclick=openDialog;
  $('#lan-close').onclick=()=>$('#lan-dialog').close();
  $('#lan-dialog').addEventListener('close',()=>{
    if(resumeAfterDialog&&!session&&mode==='paused')pause();
    resumeAfterDialog=false;
  });
  $('#lan-create').onclick=()=>enter('host');$('#lan-join').onclick=()=>enter('guest');$('#lan-leave').onclick=()=>leave();
  if($('#p2p-create'))$('#p2p-create').onclick=()=>enter('host','p2p');
  if($('#p2p-join'))$('#p2p-join').onclick=()=>enter('guest','p2p');
  if($('#p2p-reconnect'))$('#p2p-reconnect').onclick=()=>transport?.reconnect();
  const suspend=()=>{
    if(!transport)return;
    stopMotion();actions=[];
    if(lan.guest)transport.send('input',{...neutral(),actions:['pause']});
    else {pauseHost('Player left the game window. Host: resume when ready.');transport.send('state',snapshot());}
  };
  window.addEventListener('blur',suspend);
  document.addEventListener('visibilitychange',()=>{if(document.hidden)suspend();});
  window.addEventListener('pagehide',()=>{if(transport){suspend();leave();return;}if(session)fetch('/lan/leave',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+session.token},body:JSON.stringify({code:session.code}),keepalive:true}).catch(()=>{});});
})();
