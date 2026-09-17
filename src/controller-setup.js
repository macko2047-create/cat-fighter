'use strict';
(() => {
  let pairing = null, last = new Map(), testing = null, testBack = 0;
  // The touch-first shell must allow the existing pad pipeline when hardware
  // becomes visible. Keep a running game's input mode stable on disconnect.
  function detectControllers() {
    if (window.lan?.active) return;
    const connected = Array.from(navigator.getGamepads?.() || []).some(p=>p && p.connected !== false);
    if (connected) document.body.dataset.inputMode = 'controller';
    else if (!['playing','paused'].includes(mode)) document.body.dataset.inputMode = 'touch';
  }
  const activated = new Set(), physicalActivated = new Set();
  // Preview unassigned devices once each, without changing gameplay assignments.
  function displaySlots(list) {
    const slots=assignments.map(index=>list.find(p=>p.index===index));
    for(const p of list) {
      if(assignments.includes(p.index)) continue;
      const preferred=preferences[p.id] ?? p.preferredSlot;
      const free=i=>assignments[i]===null && !slots[i];
      const slot=Number.isInteger(preferred) && free(preferred) ? preferred : [0,1].find(free);
      if(slot!==undefined) slots[slot]=p;
    }
    return slots;
  }
  function readiness(list) {
    const physical = Array.from(navigator.getGamepads?.() || []).filter(p=>p && p.connected !== false);
    $('#controller-physical').textContent = physical.length
      ? `PHYSICAL CONNECTED · ${physical.map(p=>p.id).join(' / ')}${list.some(p=>p.index<0) ? ' · Logical halves shown separately below' : ''}`
      : 'NO PHYSICAL CONTROLLER DETECTED';
    const slots=displaySlots(list);
    for (const slot of [0,1]) {
      const p=slots[slot];
      const ready = p && activated.has(p.id+':'+p.index);
      const message = `P${slot+1} · ${p ? controllerName(p) : 'NO CONTROLLER'} · ${ready ? 'READY' : p ? 'CONNECTED · PRESS ANY BUTTON' : 'WAITING'} · ${p && assignments[slot]===p.index ? 'ASSIGNED' : 'NOT ASSIGNED'}`;
      const element = $('#joycon-ready-'+slot);
      if (element.textContent !== message) element.textContent = message;
    }
  }
  function activation(list) {
    const raw=Array.from(navigator.getGamepads?.() || []).filter(p=>p && p.connected!==false);
    const physicalIds=new Set(raw.map(p=>p.id+':'+p.index));
    for(const id of physicalActivated) if(!physicalIds.has(id)) physicalActivated.delete(id);
    for(const p of raw) if(p.buttons.some(b=>b.pressed)) physicalActivated.add(p.id+':'+p.index);
    const slots=displaySlots(list);
    const live = new Set(list.map(p=>p.id+':'+p.index));
    for (const id of activated) if (!live.has(id)) activated.delete(id);
    for (const p of list) {
      const id=p.id+':'+p.index;
      if (!p.buttons.some(b=>b.pressed) || activated.has(id)) continue;
      activated.add(id);
      if ($('#settings').open && !capture && pairing===null && testing===null) previous.set(p.index,p.buttons.map(b=>b.pressed));
      const slot=slots.indexOf(p);
      const text=slot<0 ? 'CONTROLLER READY' : `P${slot+1} CONTROLLER READY`;
      const banner=$('#controller-activation');
      $('#controller-activation-text').textContent=text+' ✓';
      banner.classList.remove('ready-pulse'); void banner.offsetWidth; banner.classList.add('ready-pulse');
    }
    const deviceReady=list.filter(p=>activated.has(p.id+':'+p.index)).map(p=>{
      const slot=slots.indexOf(p);
      return `${slot<0 ? 'CONTROLLER' : 'P'+(slot+1)+' CONTROLLER'} READY ✓`;
    }).join(' · ') || (physicalActivated.size ? 'CONTROLLER CONNECTED ✓ · PRESS PRIMARY ON EACH HALF' : 'PRESS ANY BUTTON TO ACTIVATE CONTROLLER');
    const ready=mode==='ready' && window.arcade?.phase==='game' && !window.lan?.active
      ? joined[1] ? 'P2 JOINED ✓'
      : assignments[0]===null ? 'PRESS START / PRIMARY TO USE A CONTROLLER' : 'P2 PRESS START / PRIMARY TO JOIN'
      : deviceReady;
    if ($('#controller-activation-text').textContent!==ready) $('#controller-activation-text').textContent=ready;
    $('#controller-activation').hidden=['playing','paused'].includes(mode);
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
    capture = null;testing=null;
    pairing = slot;
    last = new Map(pads().map(p=>[p.index,p.buttons.map(b=>b.pressed)]));
    $('#controller-pair-cancel').hidden = false;
    status(`P${slot+1}: release buttons, then press a button on the controller you want to use.`);
  };
  $('#controller-pair-cancel').onclick = () => { cancel();status('Pairing cancelled. Your controllers are unchanged.'); };
  $('#settings').addEventListener('close',()=>{
    cancel();testing=null;
    for (const p of pads()) {previous.set(p.index,p.buttons.map(b=>b.pressed));window.lan?.consumeMenuPad?.(p);}
  });
  window.controllerSetup = {
    cancelInteraction() {cancel();testing=null;},
    beginTest(index) {
      if(testing===index) {testing=null;status('LIVE TEST COMPLETE ✓');return;}
      cancel();capture=null;testing=index;testBack=0;
      last=new Map(pads().map(p=>[p.index,p.buttons.map(b=>b.pressed)]));
      status('LIVE TEST · Move and press any action. Press BACK twice to exit, or select LIVE INPUT TEST again.');
    },
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
      const list=pads();
      activation(list);
      if (!$('#settings').open) return false;
      for (const slot of [0,1]) $('#controller-pair-'+slot).disabled = !editable();
      if (pairing !== null && !editable()) cancel();
      if (testing!==null && !list.some(p=>p.index===testing)) testing=null;
      readiness(list);
      const signature=list.map(p=>`${p.id}:${p.index}:${assignments.indexOf(p.index)}`).join();
      if (signature!==deviceSignature) {deviceSignature=signature;renderDevices();}
      for (const p of list) {
        const pressed=p.buttons.map(b=>b.pressed), prev=last.get(p.index)||[];
        if (pairing !== null && pressed.some((v,i)=>v&&!prev[i])) {
          const target=pairing, former=assignments.indexOf(p.index), displaced=assignments[target];
          assignments[target]=p.index;
          if (former>=0 && former!==target) assignments[former]=displaced;
          remember(list);
          cancel();
          previous.set(p.index,pressed);
          status(`P${target+1} now uses ${controllerName(p)}. Ready — return to the ready screen.`);
          renderDevices();
          last.set(p.index,pressed);
          return true;
        }
        if (testing!==null) {
          previous.set(p.index,pressed);
          if (p.index===testing && pressed[config(p).back] && !prev[config(p).back]) {
            testBack++;
            status(testBack===1 ? 'BACK ✓ · Press BACK again to exit live test.' : 'LIVE TEST COMPLETE ✓');
            if(testBack===2) { testing=null; last.set(p.index,pressed); return true; }
          }
        }
        last.set(p.index,pressed);
        const card=$(`[data-pad="${p.index}"]`);
        if (card) {
          const moving=p.axes.some(v=>Math.abs(v)>deadzone), pressing=pressed.some(Boolean);
          card.classList.toggle('controller-active',moving||pressing);
          card.querySelector('.device-feedback').textContent= testing===p.index ? 'LIVE TEST · BACK TWICE TO EXIT' : activated.has(p.id+':'+p.index) ? 'READY · LIVE INPUT TEST' : 'CONNECTED · PRESS ANY BUTTON';
          const stick=card.querySelector('.test-stick i');
          stick.style.transform=`translate(${(p.axes[0]||0)*16}px, ${(p.axes[1]||0)*16}px)`;
          for (const action of ['fire','bomb','pause','confirm','back']) card.querySelector(`[data-test="${action}"]`).classList.toggle('lit',!!pressed[config(p)[action]]);
        }
      }
      return pairing !== null || testing !== null;
    },
  };
})();
