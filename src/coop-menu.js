'use strict';
(() => {
  const nav = window.menuNavigation;
  const dialog = $('#lan-dialog');
  let stage = 'options', previousStage = 'options', signature = '', wasOpen = false;
  let attempt = false, failure = false, sawConnecting = false, previouslyActive = false;
  const previousPads = new Map(), directions = new Map();
  const controls = () => Array.from(dialog.querySelectorAll('button,input,summary')).filter(el => !el.disabled && el.getClientRects().length);
  function move(direction) {
    nav.focus(nav.next(controls(), document.activeElement, direction));
  }
  function selectStage(value) {
    stage = value; signature = ''; sync();
    const target = value === 'host' ? $('#lan-create') : value === 'guest' ? $('#lan-code') : value === 'roles' ? $('#coop-host') : value === 'diagnostics' ? $('#coop-back') : $('#coop-wifi');
    nav.focus(target.getClientRects().length ? target : controls()[0]);
  }
  function back() {
    if (window.lan.menuState.connecting) return;
    if (stage === 'diagnostics') selectStage(previousStage);
    else if (!window.lan.active && stage !== 'options') { failure = false; selectStage(stage === 'roles' ? 'options' : 'roles'); }
    else dialog.close();
  }
  function sync() {
    const state = window.lan.menuState;
    if (previouslyActive && !state.active) { stage = 'options'; failure = false; }
    previouslyActive = state.active;
    // The network layer also refreshes these controls after async requests.
    $('#lan-create').disabled = state.active || state.connecting;
    $('#lan-join').disabled = state.active || state.connecting || !/^\d{6}$/.test($('#lan-code').value);
    const locked = mode === 'playing' || mode === 'paused';
    for (const id of ['#coop-local','#coop-host','#coop-guest','#coop-wifi']) $(id).disabled = locked;
    if (attempt && state.connecting) sawConnecting = true;
    if (attempt && !state.connecting && (sawConnecting || /Unable to connect:/.test($('#lan-status').textContent))) {
      failure = !state.active; attempt = false; sawConnecting = false;
    }
    const diagnostics = stage === 'diagnostics';
    const key = JSON.stringify([stage,state,mode,$('#lan-code').value,failure]);
    if (key === signature) return;
    signature = key;
    dialog.dataset.screen = diagnostics ? 'diagnostics' : state.active ? 'connected' : stage;
    $('#coop-options').hidden = state.active || stage !== 'options';
    $('#coop-roles').hidden = state.active || stage !== 'roles';
    $('#coop-host-panel').hidden = state.active || stage !== 'host';
    $('#coop-guest-panel').hidden = state.active || stage !== 'guest';
    $('#coop-connected').hidden = !state.active || diagnostics;
    $('#wifi-controls').hidden = !diagnostics;
    $('#coop-back').hidden = !diagnostics && (state.active || stage === 'options');
    $('#coop-back').disabled = state.connecting;
    $('#lan-close').hidden = diagnostics || (!state.active && stage !== 'options');
    // Network refreshes may unhide Leave; CSS also gates it to the connected screen.
    $('#lan-leave').hidden = !state.active || diagnostics;
    $('#coop-advanced').hidden = diagnostics;
    $('#lan-code').disabled = state.connecting || state.active;
    $('#coop-step').textContent = diagnostics ? 'CONNECTION DETAILS' : state.connecting ? 'CONNECTING…' : failure ? 'CAN’T CONNECT · TRY AGAIN' : state.active ? (state.ready ? 'CONNECTED' : 'WAITING FOR PLAYER') : locked ? 'FINISH THIS GAME FIRST' : stage === 'options' ? 'LOCAL WI-FI / LAN ONLY' : 'WI-FI CO-OP · SAME NETWORK REQUIRED';
    $('#coop-role').textContent = state.guest ? 'P2 · JOIN' : 'P1 · HOST';
    $('#coop-room-code').textContent = state.code;
    $('#coop-next').textContent = !state.ready ? (state.guest ? 'Waiting for P1' : 'Share this code with P2') : state.guest ? 'Choose your aircraft · P1 starts' : 'Choose your aircraft';
    $('#coop-start').hidden = !state.active || !state.ready || (state.guest && mode === 'paused') || mode === 'playing';
    $('#coop-start').disabled = !state.ready;
    $('#coop-start').textContent = mode === 'paused' ? 'RESUME ▶' : 'CHOOSE AIRCRAFT';
    $('#coop-start').classList.toggle('start-ready', state.active && state.ready && !state.guest && mode !== 'playing');
    if (!controls().includes(document.activeElement) && dialog.open) controls()[0]?.focus();
  }
  $('#coop-local').onclick = () => {
    dialog.close();
    window.aircraftMenu.open();
  };
  $('#coop-wifi').onclick = () => { failure = false; selectStage('roles'); };
  $('#coop-advanced').onclick = () => { previousStage = stage; selectStage('diagnostics'); };
  for (const id of ['#lan-create','#lan-join']) {
    // Observe the existing action without replacing any transport handler.
    $(id).addEventListener('click', () => { attempt = true; failure = false; sawConnecting = false; signature = ''; }, true);
  }
  $('#coop-host').onclick = () => {
    selectStage('host');
    $('#lan-create').click();
  };
  $('#coop-guest').onclick = () => selectStage('guest');
  $('#coop-back').onclick = back;
  $('#lan-code').addEventListener('input', () => { $('#lan-code').value = $('#lan-code').value.replace(/\D/g,'').slice(0,6); signature='';sync(); });
  $('#coop-start').onclick = () => {
    if (!window.lan.ready) return;
    if (mode === 'paused') {
      if (!window.lan.canStart()) return;
      dialog.close(); pause();
    } else { dialog.close(); window.aircraftMenu.open(); }
  };
  dialog.addEventListener('close', () => { wasOpen=false; stage='options';failure=false;attempt=false;sawConnecting=false;signature='';nav.focus(null); });
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
        $('#coop-controls').textContent=`Stick / D-pad: move frame · Button ${c.fire}: select highlighted button. To go back, select CANCEL / BACK on screen.`;
        if (!document.activeElement?.classList.contains('menu-focus')) nav.focus(controls().includes(document.activeElement) ? document.activeElement : controls()[0]);
        if(edge(c.fire)) {
          if(document.activeElement?.tagName === 'INPUT')move('down');
          else if(controls().includes(document.activeElement))document.activeElement.click();
          else move('down');
        } else if(direction && direction!==directions.get(p.index))move(direction);
        previousPads.set(p.index,pressed);directions.set(p.index,direction);
        // Suppress the same physical press when returning to the selection/game.
        previous.set(p.index,pressed);
        if (!dialog.open) break;
      }
      return true;
    },
  };
})();
