'use strict';
(() => {
  let pairing = null, last = new Map();
  // The touch-first shell must allow the existing pad pipeline when hardware
  // becomes visible. Keep a running game's input mode stable on disconnect.
  function detectControllers() {
    if (window.lan?.active) return;
    const connected = Array.from(navigator.getGamepads?.() || []).some(p=>p && p.connected !== false);
    if (connected) document.body.dataset.inputMode = 'controller';
    else if (!['playing','paused'].includes(mode)) document.body.dataset.inputMode = 'touch';
  }
  function readiness(list) {
    for (const slot of [0,1]) {
      const p = list.find(p=>p.index===-100-slot);
      const assigned = p ? assignments.indexOf(p.index) : -1;
      const target = p ? (assigned < 0 ? availableControllerSlot(p) : assigned) : slot;
      const association = target < 0 ? 'Player slots occupied · Use pairing to reassign' : `P${target+1}${assigned < 0 ? ' · Press a button to join' : ' · Joined'}`;
      const message = `${slot ? 'RIGHT' : 'LEFT'} JOY-CON · ${p ? `READY · ${association}` : 'NOT DETECTED · Connect and press a button'}`;
      const element = $('#joycon-ready-'+slot);
      // Avoid announcing identical live-region text on every animation frame.
      if (element.textContent !== message) element.textContent = message;
    }
  }
  $('#demo-controllers').onclick = () => $('#test').click();
  $('#test').addEventListener('click',()=>{ detectControllers(); renderDevices(); readiness(pads()); });
  window.addEventListener('gamepadconnected',detectControllers);
  detectControllers();
  const preferences = {};
  try {
    const saved=JSON.parse(localStorage.getItem('catfighter-player-controllers')||'{}');
    for (const [id,slot] of Object.entries(saved)) if (slot===0 || slot===1) preferences[id]=slot;
  } catch {}
  function remember(list) {
    for (const p of list) {
      // Same-name full controllers cannot be distinguished across reconnects.
      if (list.filter(other=>other.id===p.id).length!==1) continue;
      const slot=assignments.indexOf(p.index);
      if (slot>=0) preferences[p.id]=slot;
    }
    try {localStorage.setItem('catfighter-player-controllers',JSON.stringify(preferences));} catch {}
  }
  const status = text => { $('#controller-pair-status').textContent = text; };
  const editable = () => !window.lan?.active && !['playing','paused'].includes(mode);
  function cancel() { pairing = null; $('#controller-pair-cancel').hidden = true; }
  for (const slot of [0,1]) $('#controller-pair-'+slot).onclick = () => {
    if (!editable()) return;
    capture = null;
    pairing = slot;
    last = new Map(pads().map(p=>[p.index,p.buttons.map(b=>b.pressed)]));
    $('#controller-pair-cancel').hidden = false;
    status(`P${slot+1}: release buttons, then press a button on the controller you want to use.`);
  };
  $('#controller-pair-cancel').onclick = () => { cancel();status('Pairing cancelled. Your controllers are unchanged.'); };
  $('#settings').addEventListener('close',cancel);
  window.controllerSetup = {
    preferredSlot(p) { return preferences[p.id]; },
    resetHalfPreferences() {
      for (const id of Object.keys(preferences)) {
        if (/^Half Joy-Con P[12]$/.test(id) || /^Joy-Con \([LR]\)(?: |$)/.test(id)) delete preferences[id];
      }
      try {localStorage.setItem('catfighter-player-controllers',JSON.stringify(preferences));} catch {}
    },
    snapshot() {
      // Diagnostic metadata only; no calibration reads or state changes.
      const profiles=window.halfControllers.snapshot().profiles;
      return assignments.map((index,slot)=>({player:slot+1,index,half:index===-100||index===-101 ? profiles[-100-index]?.side || (profiles[-100-index] ? `calibrated-${-99-index}` : index===-100 ? 'left' : 'right') : null}));
    },
    poll() {
      detectControllers();
      if (!$('#settings').open) return false;
      for (const slot of [0,1]) $('#controller-pair-'+slot).disabled = !editable();
      if (pairing !== null && !editable()) cancel();
      const list=pads();
      readiness(list);
      for (const p of list) {
        const pressed=p.buttons.map(b=>b.pressed), prev=last.get(p.index)||[];
        if (pairing !== null && pressed.some((v,i)=>v&&!prev[i])) {
          const target=pairing, former=assignments.indexOf(p.index), displaced=assignments[target];
          assignments[target]=p.index;
          if (former>=0 && former!==target) assignments[former]=displaced;
          remember(list);
          cancel();
          previous.set(p.index,pressed);
          status(`P${target+1} now uses ${controllerName(p)}. Ready — return to aircraft selection.`);
          renderDevices();
          last.set(p.index,pressed);
          return true;
        }
        last.set(p.index,pressed);
        const card=$(`[data-pad="${p.index}"]`);
        if (card) {
          const moving=p.axes.some(v=>Math.abs(v)>deadzone), pressing=pressed.some(Boolean);
          card.classList.toggle('controller-active',moving||pressing);
          card.querySelector('.device-feedback').textContent= moving||pressing ? 'INPUT DETECTED · This is the controller in your hands' : 'CONNECTED · Move stick / press button to identify';
        }
      }
      return pairing !== null;
    },
  };
})();
