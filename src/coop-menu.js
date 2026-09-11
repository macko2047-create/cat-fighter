'use strict';
(() => {
  const nav = window.menuNavigation;
  const dialog = $('#lan-dialog');
  let stage = 'options', signature = '', wasOpen = false;
  const previousPads = new Map(), directions = new Map();
  const keypad = $('#coop-keypad');
  for (const digit of ['1','2','3','4','5','6','7','8','9','DELETE','0','CLEAR']) {
    const button = document.createElement('button');
    button.textContent = digit; button.type = 'button';
    button.onclick = () => {
      const input = $('#p2p-code');
      input.value = digit === 'CLEAR' ? '' : digit === 'DELETE' ? input.value.slice(0,-1) : (input.value+digit).slice(0,6);
      sync();
    };
    keypad.append(button);
  }
  const controls = () => Array.from(dialog.querySelectorAll('button,input,summary')).filter(el => !el.disabled && el.getClientRects().length);
  function move(direction) {
    nav.focus(nav.next(controls(), document.activeElement, direction));
  }
  function selectStage(value) {
    stage = value; signature = ''; sync();
    const target = value === 'host' ? $('#p2p-create') : value === 'guest' ? $('#p2p-code') : $('#coop-host');
    nav.focus(target);
  }
  function back() {
    if (window.lan.menuState.connecting) return;
    if (!window.lan.active && stage !== 'options') selectStage('options');
    else dialog.close();
  }
  function sync() {
    const state = window.lan.menuState;
    // The network layer also refreshes these controls after async requests.
    $('#p2p-create').disabled = state.active || state.connecting;
    $('#p2p-join').disabled = state.active || state.connecting || !/^\d{6}$/.test($('#p2p-code').value);
    for (const id of ['#coop-local','#coop-host','#coop-guest']) $(id).disabled = mode === 'playing' || mode === 'paused';
    const key = JSON.stringify([stage,state,mode,$('#p2p-code').value]);
    if (key === signature) return;
    signature = key;
    $('#coop-options').hidden = state.active || stage !== 'options';
    $('#coop-host-panel').hidden = state.active || stage !== 'host';
    $('#coop-guest-panel').hidden = state.active || stage !== 'guest';
    $('#coop-connected').hidden = !state.active;
    $('#coop-back').hidden = state.active || stage === 'options';
    $('#coop-back').disabled = state.connecting;
    $('#p2p-code').disabled = state.connecting || state.active;
    for (const button of keypad.querySelectorAll('button')) button.disabled = state.connecting;
    $('#coop-step').textContent = state.connecting ? 'Connecting… Please wait' : state.active ? '3 · Connect & play' : ['playing','paused'].includes(mode) ? 'Finish this run before choosing a new game.' : stage === 'options' ? '1 · Choose how to play' : '2 · Confirm your role';
    $('#coop-role').textContent = state.guest ? 'YOU ARE P2 · GUEST' : 'YOU ARE P1 · HOST';
    $('#coop-room-code').textContent = 'ROOM CODE · '+state.code;
    $('#coop-next').textContent = !state.ready ? (state.guest ? 'Connecting to P1…' : 'Share the code with P2. Waiting for your teammate…') : state.guest ? 'CONNECTED · Choose your aircraft, then wait for P1 to start.' : mode === 'playing' ? 'CONNECTED · Return to your game.' : 'BOTH CONNECTED · Choose your aircraft on each device.';
    $('#coop-start').hidden = !state.active || (state.guest && mode === 'paused') || mode === 'playing';
    $('#coop-start').disabled = !state.ready;
    $('#coop-start').textContent = mode === 'paused' ? 'RESUME ▶' : 'CHOOSE AIRCRAFT';
    $('#coop-start').classList.toggle('start-ready', state.active && state.ready && !state.guest && mode !== 'playing');
    $('#p2p-reconnect').hidden = !state.active || state.transport !== 'p2p' || state.ready;
    if (!controls().includes(document.activeElement) && dialog.open) controls()[0]?.focus();
  }
  $('#coop-local').onclick = () => {
    dialog.close();
    window.aircraftMenu.open();
  };
  $('#coop-host').onclick = () => selectStage('host');
  $('#coop-guest').onclick = () => selectStage('guest');
  $('#coop-back').onclick = back;
  $('#p2p-code').addEventListener('input', () => { $('#p2p-code').value = $('#p2p-code').value.replace(/\D/g,'').slice(0,6); signature='';sync(); });
  $('#coop-start').onclick = () => {
    if (!window.lan.ready) return;
    if (mode === 'paused') {
      if (!window.lan.canStart()) return;
      dialog.close(); pause();
    } else { dialog.close(); window.aircraftMenu.open(); }
  };
  dialog.addEventListener('close', () => { wasOpen=false; stage='options';signature='';nav.focus(null); });
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
