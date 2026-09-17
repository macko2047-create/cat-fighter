'use strict';
(() => {
  const nav = window.menuNavigation;
  const dialog = $('#lan-dialog');
  let stage = 'roles', signature = '', wasOpen = false;
  let attempt = false, failure = false, sawConnecting = false, previouslyActive = false;
  const previousPads = new Map(), directions = new Map();
  const controls = () => Array.from(dialog.querySelectorAll('button,input,summary')).filter(el => !el.disabled && el.getClientRects().length);
  function move(direction) {
    nav.focus(nav.next(controls(), document.activeElement, direction));
  }
  function selectStage(value) {
    stage = value; signature = ''; sync();
    const target = value === 'host' ? $('#lan-create') : value === 'guest' ? (window.lan.menuState.transport === 'lan' ? $('#lan-search') : $('#lan-code')) : $('#coop-host');
    nav.focus(target.getClientRects().length ? target : controls()[0]);
  }
  function back() {
    if (window.lan.menuState.connecting) return;
    if (!window.lan.active && stage !== 'roles') { failure = false; selectStage('roles'); }
    else dialog.close();
  }
  function sync() {
    const state = window.lan.menuState;
    if (previouslyActive && !state.active) { stage = 'roles'; failure = false; }
    previouslyActive = state.active;
    // The network layer also refreshes these controls after async requests.
    $('#lan-create').disabled = state.active || state.connecting;
    $('#lan-join').disabled = state.active || state.connecting || !/^\d{6}$/.test($('#lan-code').value);
    const localWifi = state.transport === 'lan';
    const locked = mode === 'playing' || mode === 'paused';
    for (const id of ['#coop-local','#coop-host','#coop-guest','#coop-wifi']) $(id).disabled = locked;
    if (attempt && state.connecting) sawConnecting = true;
    if (attempt && !state.connecting && (sawConnecting || /Unable to connect:/.test($('#lan-status').textContent))) {
      failure = !state.active; attempt = false; sawConnecting = false;
    }
    const key = JSON.stringify([stage,state,mode,$('#lan-code').value,failure]);
    if (key === signature) return;
    signature = key;
    dialog.dataset.screen = state.active ? 'connected' : stage;
    $('#coop-options').hidden = true;
    $('#coop-roles').hidden = state.active || stage !== 'roles';
    $('#coop-host-panel').hidden = state.active || stage !== 'host';
    $('#coop-guest-panel').hidden = state.active || stage !== 'guest';
    $('#coop-connected').hidden = !state.active;
    $('#wifi-controls').hidden = true;
    $('#coop-back').hidden = state.active || stage === 'roles';
    $('#coop-back').disabled = state.connecting;
    $('#lan-close').hidden = !state.active && stage !== 'roles';
    // Network refreshes may unhide Leave; CSS also gates it to the connected screen.
    $('#lan-leave').hidden = !state.active;
    $('#lan-status').hidden = !state.active && !failure;
    $('#coop-advanced').hidden = true;
    $('#coop-code-label').hidden = localWifi;
    $('#lan-code').hidden = localWifi;
    $('#lan-join').hidden = localWifi;
    $('#lan-search').hidden = !localWifi;
    $('#lan-discovery-status').hidden = !localWifi;
    $('#lan-rooms').hidden = !localWifi;
    $('#coop-room-code').hidden = localWifi;
    $('#lan-code').disabled = state.connecting || state.active;
    $('#coop-step').textContent = state.connecting ? 'CONNECTING…' : failure ? 'CAN’T CONNECT · TRY AGAIN' : state.active ? (state.ready ? 'CONNECTED' : 'WAITING FOR PLAYER') : locked ? 'FINISH THIS GAME FIRST' : localWifi ? 'SAME WI-FI REQUIRED' : 'DEVELOPER CONNECTION';
    $('#coop-role').textContent = state.guest ? 'P2 · MINT' : localWifi ? 'P1 · GINGER' : 'P1 · HOST';
    $('#coop-room-code').textContent = state.code;
    $('#coop-next').textContent = !state.ready ? (state.guest ? 'Waiting for P1' : localWifi ? 'Waiting for P2 to find this game' : 'Waiting for P2') : state.guest ? 'P2 · MINT · Waiting for P1 to start' : 'P1 · GINGER · Ready to start';
    $('#coop-start').hidden = !state.active || !state.ready || (state.guest && mode === 'paused') || mode === 'playing';
    $('#coop-start').disabled = !state.ready;
    $('#coop-start').textContent = mode === 'paused' ? 'RESUME ▶' : state.guest ? 'WAIT FOR P1' : 'START ▶';
    $('#coop-start').classList.toggle('start-ready', state.active && state.ready && !state.guest && mode !== 'playing');
    if (!controls().includes(document.activeElement) && dialog.open) controls()[0]?.focus();
  }
  $('#coop-local').onclick = () => {
    dialog.close();
    window.aircraftMenu.open();
  };
  $('#coop-wifi').onclick = () => { failure = false; selectStage('roles'); };
  for (const id of ['#lan-create','#lan-join']) {
    // Observe the existing action without replacing any transport handler.
    $(id).addEventListener('click', () => { attempt = true; failure = false; sawConnecting = false; signature = ''; }, true);
  }
  $('#coop-host').onclick = () => {
    selectStage('host');
    $('#lan-create').click();
  };
  $('#coop-guest').onclick = () => {
    selectStage('guest');
    if (window.lan.menuState.transport === 'lan') window.lan.searchGames();
  };
  $('#coop-back').onclick = back;
  $('#lan-code').addEventListener('input', () => { $('#lan-code').value = $('#lan-code').value.replace(/\D/g,'').slice(0,6); signature='';sync(); });
  $('#coop-start').onclick = () => {
    if (!window.lan.ready) return;
    if (mode === 'paused') {
      if (!window.lan.canStart()) return;
      dialog.close(); pause();
    } else { dialog.close(); window.aircraftMenu.open(); }
  };
  dialog.addEventListener('close', () => { wasOpen=false; stage='roles';failure=false;attempt=false;sawConnecting=false;signature='';nav.focus(null); });
  window.coopMenu = {
    key(e) {
      if (!dialog.open) return false;
      if (['ArrowDown','ArrowUp'].includes(e.code) || (['ArrowLeft','ArrowRight'].includes(e.code) && e.target?.tagName !== 'INPUT')) {
        e.preventDefault(); if(!e.repeat)move(e.code.slice(5).toLowerCase());return true;
      }
      if(e.code==='Escape'){e.preventDefault();if(!e.repeat)back();return true;}
      // Keep native Enter/Space, text entry, and Tab focus behavior inside the dialog.
      return true;
    },
    poll() {
      if (!dialog.open) return false;
      const list = pads();
      if (!wasOpen) {
        previousPads.clear(); directions.clear(); signature='';
        for (const p of list) previousPads.set(p.index,p.buttons.map(b=>b.pressed));
        wasOpen=true;
      }
      sync();
      for(const p of list) {
        const pressed=p.buttons.map(b=>b.pressed), prev=previousPads.get(p.index)||[], c=config(p);
        const edge=i=>pressed[i]&&!prev[i];
        const direction=nav.direction(p);
        $('#coop-controls').textContent=`Stick / D-pad: move frame · CONFIRM: select · BACK: return.`;
        if (!document.activeElement?.classList.contains('menu-focus')) nav.focus(controls().includes(document.activeElement) ? document.activeElement : controls()[0]);
        if(edge(c.back)) back();
        else if(edge(c.confirm)) {
          if(document.activeElement?.tagName === 'INPUT')move('down');
          else if(controls().includes(document.activeElement))document.activeElement.click();
          else move('down');
        } else if(direction && direction!==directions.get(p.index))move(direction);
        previousPads.set(p.index,pressed);directions.set(p.index,direction);
        // Suppress the same physical press when returning to the selection/game.
        previous.set(p.index,pressed);
        window.lan?.consumeMenuPad?.(p);
        if (!dialog.open) break;
      }
      return true;
    },
  };
})();
