'use strict';
// P1 simulates; P2 predicts sequenced movement. Existing 20 Hz snapshots carry ACKs.
(() => {
  let session=null, stream=null, busy=false, connecting=false, peerConnected=false, presenceReady=false, resumeAfterDialog=false, lastSend=0, lastReceived=0;
  let remote={x:0,y:0,fire:false,target:null}, actions=[], padPrevious=[], applying=false;
  let transport=null, sessionVersion=0;
  const transportMode=new URLSearchParams(location.search).get('transport') || document.querySelector('meta[name="cat-fighter-transport"]')?.content || 'lan';
  const neutral=()=>({x:0,y:0,fire:false,target:null});
  const status=text=>{ $('#lan-status').textContent=text; $('#lan-bar').textContent=text+' · WI-FI CO-OP'; };
  const serverRequired='Wi-Fi co-op is not available here. Open the local Cat Fighter setup on both devices.';
  // Safari versions before AbortSignal.timeout still support AbortController.
  const timeoutSignal=ms=>{
    if(AbortSignal.timeout)return AbortSignal.timeout(ms);
    const controller=new AbortController();
    setTimeout(()=>controller.abort(),ms);
    return controller.signal;
  };
  let searchVersion=0, foundRooms=[], roomPage=0;
  async function jsonResponse(response) {
    // Static hosts return index.html for /lan/* routes. Detect that response
    // before JSON parsing so the player sees the setup step that is missing.
    if (!response.headers.get('content-type')?.includes('application/json')) throw Error(serverRequired);
    return response.json();
  }
  async function discover() {
    if(transportMode!=='lan')return;
    const version=++searchVersion;
    foundRooms=[];roomPage=0;
    $('#lan-rooms').replaceChildren();
    $('#lan-search').textContent='SEARCH AGAIN';
    $('#lan-discovery-status').textContent='Searching for games…';
    try {
      const response=await fetch('/lan/rooms',{cache:'no-store',signal:timeoutSignal(3000)});
      if(!response.ok)throw Error('Search unavailable');
      const list=await jsonResponse(response);
      if(version!==searchVersion)return;
      if(!Array.isArray(list.rooms))throw Error('Search unavailable');
      foundRooms=list.rooms;
      renderRooms();
    } catch(error) {
      if(version!==searchVersion)return;
      $('#lan-discovery-status').textContent=error.message===serverRequired ? serverRequired : 'Search is unavailable. Check that both devices opened the same local Cat Fighter setup.';
    }
  }
  function renderRooms() {
      $('#lan-rooms').replaceChildren();
      const offset=roomPage*2, shown=foundRooms.slice(offset,offset+2);
      $('#lan-discovery-status').textContent=foundRooms.length===0 ? 'No games found. Ask P1 to choose CREATE GAME, then search again.'
        : foundRooms.length===1 ? 'One game found.' : `${foundRooms.length} games found · ${offset+1}–${offset+shown.length}`;
      shown.forEach((room,index)=>{
        const button=document.createElement('button');
        button.textContent=foundRooms.length===1 ? 'JOIN GAME' : `JOIN GAME ${offset+index+1}`;
        button.disabled=!!session||connecting;
        button.onclick=()=>{ $('#lan-code').value=room.code;return enter('guest'); };
        $('#lan-rooms').append(button);
      });
      $('#lan-search').textContent=foundRooms.length>(roomPage+1)*2?'MORE GAMES':'SEARCH AGAIN';
  }
  async function request(route, data={}, credentials=session) {
    const body=JSON.stringify({...data,...(credentials?{code:credentials.code}:{})});
    const pending=fetch('/lan/'+route, {method:'POST',headers:{'Content-Type':'application/json',...(credentials?{Authorization:'Bearer '+credentials.token}:{})},
      body,signal:timeoutSignal(3000)});
    bandwidth.record(route,body); // Submitted POST body, including the existing LAN envelope.
    const res=await pending;
    const result=await jsonResponse(res);
    if(!res.ok) throw new Error(result.error||'Connection failed');
    return result;
  }
  const bandwidth=window.CatBandwidth.create();
  const replication=window.CatInputReplication.create();
  let epochSerial=0, visualDt=0, replicationMode=null;
  const snapshotTimes=[];
  const presentation=window.CatPresentation?.create();
  const predictedShots=window.CatPresentation.createShotPrediction(playerProjectiles,playerFireCooldown,()=>sfx.playSfx("fire"));
  function stopMotion() {if(session?.role==='host')replication.reset(++epochSerial);presentation?.reset();predictedShots.reset();remote=neutral();keys.clear();window.flightControls?.reset();}
  function pauseHost(message) {
    stopMotion();
    if(mode==='playing') { applying=true;try{pause(message);}finally{applying=false;} }
  }
  function lost(message) {
    peerConnected=false;actions=[];replication.reset(session?.role==='host'?++epochSerial:null);
    window.aircraftMenu?.peerLost();
    if(session?.role==='host') pauseHost(message);
    else {stopMotion();if(mode==='playing'){mode='paused';show('Connection lost',message);}}
    status(message);
  }
  function command(action) {
    if(session?.role==='guest' && peerConnected && actions.length<8) actions.push(action);
  }
  function received() {
    lastReceived=performance.now();
    if(presenceReady&&!peerConnected){peerConnected=true;status('Reconnected. P1 can resume.');refreshButtons();}
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
  function syncInputMode(){if(session?.role==='host'&&replicationMode!==mode){replicationMode=mode;replication.reset(++epochSerial);}}
  function snapshot() {
    syncInputMode();
    return {inputEpoch:replication.epoch,lastProcessedInput:replication.diagnostics().lastProcessedInput,mode,elapsed,score,players:players.map(identify),enemies:enemies.map(identify),shots:shots.map(s=>({...identify(s),owner:{index:s.owner?.index||0}})),hostile:hostile.map(identify),drops:drops.map(identify),sparks:sparks.map(identify),bossDebris:bossDebris.map(identify),wave,loop,loopTransition,bossSpawned,bossWreck,flash,ambient,aircraft:[...aircraft],aircraftReady:window.aircraftMenu?.snapshot() || [false,false],aircraftSelection:window.aircraftMenu?.networkState()};
  }
  function acceptState(s) {
    const oldMode=mode;
    const arrival=performance.now();snapshotTimes.push(arrival);if(snapshotTimes.length>240)snapshotTimes.shift();
    replication.reconcile(s);
    presentation?.accept(s,arrival);
    predictedShots.accept(s);
    ({mode,elapsed,score,players,enemies,shots,hostile,drops,sparks,bossDebris,wave,loop,loopTransition,bossSpawned,bossWreck,flash,ambient}=s);
    if (!['ready','over','win'].includes(mode)) aircraft.splice(0,2,...s.aircraft);
    joined.fill(true);
    if(oldMode!==mode){
      if(mode==='playing') $('#overlay').style.display='none';
      else show(mode==='paused'?'PAUSED':mode==='over'?'GAME OVER':'Wi-Fi CO-OP',mode==='over'?'Waiting for P1 to retry.':'Waiting for P1 to start or resume.');
    }
    window.aircraftMenu?.acceptNetwork(s.aircraftReady,s.aircraft,s.aircraftSelection);
    updateHUD();
  }
  function acceptInput(data) {
    replication.receive(data);
    remote=data;received();
    window.aircraftMenu?.acceptRemote(data.selection);
    applying=true;
    try {for(const action of remote.actions||[]){
      if (!data.selection) window.aircraftMenu?.remoteAction(action);
      if(action==='bomb')bomb(players[1]);
      if(action==='rejoin')tryRejoin(1);
      if(action==='pause'&&mode==='playing')pause('P2 paused the game. P1: press RESUME to continue.');
    }} finally {applying=false;}
  }
  function refreshButtons() {
    const active=!!session;
    $('#lan-create').disabled=active||connecting;$('#lan-join').disabled=active||connecting;
    $('#p2p-reconnect').hidden=!active||session.transport!=='p2p';
    $('#p2p-reconnect').disabled=peerConnected;
    $('#lan-leave').hidden=!active;$('#lan-bar').hidden=!active;
    if (active && mode === 'ready' && window.aircraftMenu) window.aircraftMenu.open();
    else $('#start').disabled=active&&(session.role==='guest'||!peerConnected);
    $('#lan-open-host').disabled=active||connecting;
    for(const button of $('#lan-rooms').querySelectorAll('button'))button.disabled=active||connecting;
  }
  function connect(credentials) {
    bandwidth.reset();replication.reset();replicationMode=null;
    session=credentials;lastReceived=performance.now();lastSend=0;peerConnected=false;presenceReady=false;actions=[];padPrevious=[];
    window.aircraftMenu?.reset();
    window.aircraftMenu?.resetNetwork();
    stopMotion();joined[0]=true;joined[1]=false;mode='ready';players=[];$('#overlay').style.display='flex';
    show('WI-FI CO-OP',session.role==='host'?'Wait for P2 to join, then press START.':'You control P2. Wait for P1 to start.');
    $('#lan-code').value=session.code;
    status(session.role==='host'?'Game created · You are P1 · GINGER':'Joining game · You are P2 · MINT');
    if(session.transport==='p2p'){attachP2P();refreshButtons();updateHUD();return;}
    const current=session;
    stream=new EventSource(`/lan/events?code=${session.code}&token=${session.token}`);
    stream.addEventListener('presence',e=>{
      if(session!==current)return;
      const p=JSON.parse(e.data);presenceReady=p.host&&p.guest;peerConnected=presenceReady;lastReceived=performance.now();
      if(!peerConnected) lost(session.role==='host'?'Waiting for P2. Game paused.':'Waiting for P1. Game paused.');
      else status(`${session.role==='host'?'P1 · GINGER':'P2 · MINT'} · Connected`);
      refreshButtons();
    });
    stream.addEventListener('input',e=>{
      if(session!==current||session?.role!=='host')return;
      bandwidth.record('input',e.data);
      acceptInput(JSON.parse(e.data));
    });
    stream.addEventListener('state',e=>{if(session===current&&session?.role==='guest'){bandwidth.record('state',e.data);received();acceptState(JSON.parse(e.data));}});
    stream.addEventListener('ended',()=>{if(session!==current)return;leave(false);status('P1 ended the game. Find a game to play again.');});
    stream.onerror=()=>{if(session===current){lost('Connection lost. Reconnecting; the host can resume once connected.');refreshButtons();}};
    refreshButtons();updateHUD();
  }
  function attachP2P() {
    const current=session;
    const active=()=>session===current;
    transport=window.CatP2P.create(current,{
      ready(){if(!active())return;stopMotion();presenceReady=true;received();refreshButtons();},
      lost(message){if(!active())return;presenceReady=false;lost(message);refreshButtons();},
      ended(){if(active())leave(false);},
      payload(kind,payload){if(active())bandwidth.record(kind,payload);},
      message(kind,data){
        if(!active())return;
        // Validate the whole object before any game, ACK or presentation mutation.
        if(kind==='input'&&current.role==='host')acceptInput(window.CatNetProtocol.input(data));
        else if(kind==='state'&&current.role==='guest'){const state=window.CatNetProtocol.state(data);received();acceptState(state);}
        else throw Error('Peer authority violation');
      },
    });
  }
  function reconnect() {
    if(session?.transport!=='p2p'||peerConnected)return;
    actions=[];stopMotion();replication.reset(session.role==='host'?++epochSerial:null);
    transport.reconnect();
  }
  async function enter(role) {
    if(session||connecting)return;
    if(mode==='playing'||mode==='paused'){status('Finish the current run before creating or joining a room.');return;}
    const version=++sessionVersion;
    connecting=true;refreshButtons();
    try {
      const code=$('#lan-code').value.trim();
      if(role==='guest'&&!/^\d{6}$/.test(code))throw Error('Enter the six-digit room code');
      if(!['lan','p2p'].includes(transportMode))throw Error('Invalid transport configuration');
      const credentials=await (transportMode==='p2p'?window.CatP2P.request:request)(role==='host'?'create':'join',role==='host'?{}:{code},null);
      if(version!==sessionVersion){(transportMode==='p2p'?window.CatP2P.request:request)('leave',{},credentials,true).catch(()=>{});return;}
      // Keep the current menu/demo intact when room creation or joining fails.
      window.arcade?.dismiss();
      connect({...credentials,transport:transportMode});
    } catch(error){if(version===sessionVersion)status(transportMode==='lan'
      ? (role==='guest' ? 'That game is no longer available. Search again.' : serverRequired)
      : 'Unable to connect: '+error.message);}
    finally {if(version===sessionVersion){connecting=false;refreshButtons();}}
  }
  function leave(notify=true) {
    ++sessionVersion;connecting=false;++searchVersion;busy=false;
    const old=session;session=null;transport?.close(notify);transport=null;stream?.close();stream=null;peerConnected=false;actions=[];
    if(notify&&old&&old.transport==='lan')request('leave',{},old).catch(()=>{});
    stopMotion();mode='ready';players=[];enemies=[];shots=[];hostile=[];drops=[];sparks=[];bossDebris=[];bossWreck=null;loopTransition=0;score=0;joined.fill(false);
    window.aircraftMenu?.reset();
    show('CAT FIGHTER','You left the room.');refreshButtons();updateHUD();status('Not connected');
  }
  function checkTimeout(now) {
    if(session&&peerConnected&&now-lastReceived>2000&&(mode==='playing'||session.transport==='p2p')){
      // Close the stale channel: P1's existing close/input watchdog pauses it.
      // A queued pause can be erased by lost() or blocked behind backpressure.
      // Reconnection preserves the paused host state and requires host RESUME.
      if(session.transport==='p2p')transport?.disconnect();
      else if(lan.guest)command('pause');
      lost('Connection timed out. Game paused; check both devices are still connected.');refreshButtons();
    }
  }
  const lan=window.lan={
    get menuState(){return {active:!!session,guest:session?.role==='guest',ready:peerConnected,connecting,code:session?.code||'',transport:session?.transport||transportMode};},
    get active(){return !!session;},get guest(){return session?.role==='guest';},get applying(){return applying;},
    get ready(){return peerConnected;},
    searchGames:discover,
    command,
    resetPresentationDiagnostics(){presentation?.resetDiagnostics();},
    diagnostics(){return {bufferedAmount:transport?.bufferedAmount||0,inputReplication:replication.diagnostics(),presentation:presentation?.diagnostics(),bandwidth:bandwidth.diagnostics(),snapshotTimes:[...snapshotTimes]};},
    predict(dt){visualDt=dt;if(peerConnected&&performance.now()-lastReceived<=250&&mode==='playing'&&!document.hidden&&loopTransition===0)replication.capture(localInput(),dt);},
    processMovement(dt,allowed){syncInputMode();if(session?.role==='host'&&peerConnected)replication.process(players[1],dt,allowed);},
    present(state){
      const input=localInput(),now=performance.now();
      const ready=peerConnected&&!document.hidden&&now-lastReceived<=250;
      let result=presentation?presentation.render(state,now,input,peerConnected&&!document.hidden):state;
      if(peerConnected&&now-lastReceived<=250&&state.mode==='playing'){
        const p=replication.visual(visualDt);
        if(p){if(result===state)result={...state,players:[...state.players]};result.players[1]=p;}
      }
      result=predictedShots.render(result,result.players[1],visualDt,input.fire,ready);
      lan.lastVisual=result;return result;
    },
    canStart(){return session?.role==='host'&&peerConnected && (mode==='paused' || !window.aircraftMenu || window.aircraftMenu.canStart());},
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
    consumeMenuPad(p){
      const local=pads().find(p=>p.index===assignments[0])||pads()[0];
      if(local?.index===p.index) padPrevious=p.buttons.map(b=>b.pressed);
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
      // Input latency directly affects the position P1 evaluates for collision.
      // Keep 20 Hz snapshots, but submit movement up to 60 Hz (still one POST
      // in flight, with all unacknowledged commands retained for retransmission).
      if(busy||now-lastSend<(lan.guest?1000/60:50))return;
      if(session.transport==='p2p'){
        if(!peerConnected)return;
        lastSend=now;
        const pending=actions.slice();
        const data=lan.guest?{...(mode==='playing'&&!document.hidden?localInput():neutral()),...replication.packet(),selection:window.aircraftMenu?.localSelection(),actions:pending}:snapshot();
        if(transport.send(lan.guest?'input':'state',data)&&lan.guest)actions.splice(0,pending.length);
        return;
      }
      busy=true;lastSend=now;const current=session;
      const data=lan.guest?{input:{...(mode==='playing'&&!document.hidden?localInput():neutral()),...replication.packet(),selection:window.aircraftMenu?.localSelection()},actions:actions.splice(0)}:{state:snapshot()};
      request(lan.guest?'input':'state',data,current).catch(()=>{if(session===current){lost('Connection failed. Check Wi-Fi and try again.');refreshButtons();}}).finally(()=>{if(session===current)busy=false;});
    }
  };
  const openDialog=()=>{
    resumeAfterDialog=mode==='playing';
    if(resumeAfterDialog)pause('Configuring connection');
    $('#lan-dialog').showModal();
  };
  $('#lan-search').onclick=()=>{
    if(foundRooms.length>(roomPage+1)*2){roomPage++;renderRooms();return;}
    return discover();
  };
  $('#lan-open-host').onclick=()=>{
    if(session||connecting)return;
    if(mode==='playing'||mode==='paused'){status('Finish the current run before switching host URLs.');return;}
    try {
      const url=new URL($('#lan-host-url').value.trim());
      if(!['http:','https:'].includes(url.protocol)||url.username||url.password)throw Error();
      location.assign(url.origin+'/?transport=lan');
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
  $('#p2p-reconnect').onclick=reconnect;
  document.addEventListener('visibilitychange',()=>{if(document.hidden&&session?.transport==='p2p')transport?.disconnect();});
  window.addEventListener('pagehide',()=>{
    if(!session&&!connecting)return;
    if(session?.transport==='lan')fetch('/lan/leave',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+session.token},body:JSON.stringify({code:session.code}),keepalive:true}).catch(()=>{});
    leave(session?.transport==='p2p');
  });
})();
