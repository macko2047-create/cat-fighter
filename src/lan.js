'use strict';
// P1 simulates; P2 sends controls and renders authoritative snapshots at 20 Hz.
(() => {
  let session=null, stream=null, busy=false, connecting=false, peerConnected=false, presenceReady=false, lastSend=0, lastReceived=0;
  let remote={x:0,y:0,fire:false,target:null}, actions=[], padPrevious=[], applying=false;
  const neutral=()=>({x:0,y:0,fire:false,target:null});
  const status=text=>{ $('#lan-status').textContent=text; $('#lan-bar').textContent=text+' · 連線設定'; };
  // Safari versions before AbortSignal.timeout still support AbortController.
  const timeoutSignal=ms=>{
    if(AbortSignal.timeout)return AbortSignal.timeout(ms);
    const controller=new AbortController();
    setTimeout(()=>controller.abort(),ms);
    return controller.signal;
  };
  let searchVersion=0;
  async function discover() {
    const version=++searchVersion;
    $('#lan-rooms').replaceChildren();
    $('#lan-discovery-status').textContent='正在搜尋可加入的房主…';
    try {
      const [info,list]=await Promise.all(['info','rooms'].map(async route=>{
        const response=await fetch('/lan/'+route,{cache:'no-store',signal:timeoutSignal(3000)});
        if(!response.ok)throw Error('Wi-Fi 服務未啟動或版本不符');
        return response.json();
      }));
      if(version!==searchVersion)return;
      if(!Array.isArray(info.addresses)||!Array.isArray(list.rooms))throw Error('不是 Wi-Fi 遊戲服務');
      $('#lan-addresses').textContent='目前服務：'+location.origin+'　其他裝置請開啟：'+(info.addresses.join('　')||location.origin);
      $('#lan-discovery-status').textContent=list.rooms.length?`找到 ${list.rooms.length} 個可加入的房主`:'未找到空房。請房主建立房間，並確認兩部裝置使用上方同一網址，再按搜尋。';
      for(const room of list.rooms){
        const button=document.createElement('button');
        button.textContent=`房主 ${room.code} · 加入 P2`;
        button.disabled=!!session||connecting;
        button.onclick=()=>{ $('#lan-code').value=room.code;return enter('guest'); };
        $('#lan-rooms').append(button);
      }
    } catch(error) {
      if(version!==searchVersion)return;
      $('#lan-discovery-status').textContent='搜尋失敗：請開啟 host 電腦提供的 http://IP:連接埠 網址。直接開啟檔案或靜態網站無法搜尋房間。';
    }
  }
  async function request(route, data={}, credentials=session) {
    const res=await fetch('/lan/'+route, {method:'POST',headers:{'Content-Type':'application/json',...(credentials?{Authorization:'Bearer '+credentials.token}:{})},
      body:JSON.stringify({...data,...(credentials?{code:credentials.code}:{})}),signal:timeoutSignal(3000)});
    const result=await res.json();
    if(!res.ok) throw new Error(result.error||'連線失敗');
    return result;
  }
  function stopMotion() {remote=neutral();keys.clear();window.flightControls?.reset();}
  function pauseHost(message) {
    stopMotion();
    if(mode==='playing') { applying=true;try{pause(message);}finally{applying=false;} }
  }
  function lost(message) {
    peerConnected=false;
    if(session?.role==='host') pauseHost(message);
    else {stopMotion();if(mode==='playing'){mode='paused';show('連線中斷',message);}}
    status(message);
  }
  function command(action) {
    if(session?.role==='guest' && peerConnected && actions.length<8) actions.push(action);
  }
  function received() {
    lastReceived=performance.now();
    if(presenceReady&&!peerConnected){peerConnected=true;status(`房間 ${session.code} · 已重連，請房主繼續`);refreshButtons();}
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
  function snapshot() {
    return {mode,elapsed,score,players,enemies,shots:shots.map(s=>({...s,owner:{index:s.owner?.index||0}})),hostile,drops,sparks,bossDebris,wave,loop,loopTransition,bossSpawned,bossWreck,flash,ambient,aircraft:[...aircraft]};
  }
  function acceptState(s) {
    const oldMode=mode;
    ({mode,elapsed,score,players,enemies,shots,hostile,drops,sparks,bossDebris,wave,loop,loopTransition,bossSpawned,bossWreck,flash,ambient}=s);
    aircraft.splice(0,2,...s.aircraft);joined.fill(true);
    if(oldMode!==mode){
      if(mode==='playing') $('#overlay').style.display='none';
      else show(mode==='paused'?'PAUSED':mode==='over'?'GAME OVER':'Wi-Fi 雙打',mode==='over'?'等待房主重新開始。':'等待房主開始／繼續。');
    }
    updateHUD();
  }
  function refreshButtons() {
    const active=!!session;
    $('#lan-create').disabled=active||connecting;$('#lan-join').disabled=active||connecting;
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
    show('Wi-Fi 雙打',session.role==='host'?'等 P2 加入後，由你按 START。':'你控制 P2，等待房主開始。');
    $('#lan-code').value=session.code;
    status(`房間 ${session.code} · 你是 ${session.role==='host'?'P1 房主':'P2'}`);
    stream=new EventSource(`/lan/events?code=${session.code}&token=${session.token}`);
    stream.addEventListener('presence',e=>{
      const p=JSON.parse(e.data);presenceReady=p.host&&p.guest;peerConnected=presenceReady;lastReceived=performance.now();
      if(!peerConnected) lost(session.role==='host'?'等待 P2 連線；遊戲已暫停':'等待房主連線；遊戲已暫停');
      else status(`房間 ${session.code} · ${session.role==='host'?'P1 房主':'P2'} · 已連線`);
      refreshButtons();
    });
    stream.addEventListener('input',e=>{
      if(session?.role!=='host')return;
      remote=JSON.parse(e.data);received();
      // Touch targets become direction vectors against the host's current position.
      applying=true;
      try {for(const action of remote.actions||[]){
        if(action==='bomb')bomb(players[1]);
        if(action==='rejoin')tryRejoin(1);
        if(action==='pause'&&mode==='playing')pause('P2 已暫停；由房主按 RESUME 繼續。');
      }} finally {applying=false;}
    });
    stream.addEventListener('state',e=>{if(session?.role==='guest'){received();acceptState(JSON.parse(e.data));}});
    stream.addEventListener('ended',()=>{leave(false);status('房主已結束房間，請重新加入。');});
    stream.onerror=()=>{if(session){lost('連線中斷，正在重連；重連後由房主繼續。');refreshButtons();}};
    refreshButtons();updateHUD();
  }
  async function enter(role) {
    if(session||connecting)return;
    window.arcade?.dismiss();
    if(mode==='playing'||mode==='paused'){status('請先完成目前遊戲，再建立或加入房間。');return;}
    connecting=true;refreshButtons();
    try {
      const credentials=await request(role==='host'?'create':'join',role==='host'?{}:{code:$('#lan-code').value.trim().toUpperCase()},null);
      connect(credentials);
    } catch(error){status('未能連線：'+error.message+'。請用 Wi-Fi 服務提供的網址開啟遊戲。');}
    finally {connecting=false;refreshButtons();await discover();}
  }
  function leave(notify=true) {
    const old=session;session=null;stream?.close();stream=null;peerConnected=false;actions=[];
    if(notify&&old)request('leave',{},old).catch(()=>{});
    stopMotion();mode='ready';players=[];enemies=[];shots=[];hostile=[];drops=[];sparks=[];bossDebris=[];bossWreck=null;loopTransition=0;score=0;joined.fill(false);
    show('CAT FIGHTER','已離開連線房間。');refreshButtons();updateHUD();status('未連線');
  }
  const lan=window.lan={
    get active(){return !!session;},get guest(){return session?.role==='guest';},get applying(){return applying;},
    get ready(){return peerConnected;},
    command,
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
      if(!p){if(padPrevious.length&&mode==='playing'){if(lan.guest)command('pause');else pauseHost('手掣斷線，已暫停。');}padPrevious=[];return;}
      assignments[0]=p.index;assignments[1]=null;
      const pressed=p.buttons.map(b=>b.pressed),c=config(p),edge=i=>pressed[i]&&!padPrevious[i];
      if(edge(c.bomb)){if(lan.guest)command('bomb');else bomb(players[0]);}
      if(edge(c.fire)){if(lan.guest)command('rejoin');else if(mode==='playing')tryRejoin(0);else if(mode==='paused')pause();else start();}
      if(edge(c.pause)){if(lan.guest)command('pause');else if(mode==='playing'||mode==='paused')pause();else start();}
      padPrevious=pressed;
    },
    tick(now){
      if(!session)return;
      if(peerConnected&&now-lastReceived>2000&&mode==='playing'){
        if(lan.guest)command('pause');
        lost('連線延遲過高，已暫停；請確認兩部裝置仍然連線。');refreshButtons();
      }
      if(busy||now-lastSend<50)return;
      busy=true;lastSend=now;const current=session;
      const data=lan.guest?{input:mode==='playing'&&!document.hidden?localInput():neutral(),actions:actions.splice(0)}:{state:snapshot()};
      request(lan.guest?'input':'state',data,current).catch(()=>{if(session===current){lost('連線失敗，請檢查 Wi-Fi 或重新加入房間。');refreshButtons();}}).finally(()=>{busy=false;});
    }
  };
  const openDialog=()=>{if(mode==='playing')pause('連線設定中');$('#lan-dialog').showModal();return discover();};
  $('#lan-search').onclick=discover;
  $('#lan-open-host').onclick=()=>{
    if(session||connecting)return;
    if(mode==='playing'||mode==='paused'){status('請先完成目前遊戲，再切換 host 網址。');return;}
    try {
      const url=new URL($('#lan-host-url').value.trim());
      if(!['http:','https:'].includes(url.protocol)||url.username||url.password)throw Error();
      location.assign(url.origin+'/');
    } catch {status('請輸入完整 host 網址，例如 http://192.168.0.55:8767');}
  };
  $('#lan-open').onclick=openDialog;
  $('#lan-bar').onclick=openDialog;
  $('#lan-close').onclick=()=>$('#lan-dialog').close();
  $('#lan-create').onclick=()=>enter('host');$('#lan-join').onclick=()=>enter('guest');$('#lan-leave').onclick=()=>leave();
  window.addEventListener('pagehide',()=>{if(session)fetch('/lan/leave',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+session.token},body:JSON.stringify({code:session.code}),keepalive:true}).catch(()=>{});});
})();
