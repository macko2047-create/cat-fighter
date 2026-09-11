'use strict';
// One touch pilot per device. The host owns the shared network lobby state.
(() => {
  const panel = document.createElement('section');
  panel.id = 'aircraft-menu'; panel.hidden = true;
  panel.setAttribute('aria-label', 'Choose aircraft');
  panel.innerHTML = [0,1].map(slot => `<section class="pilot-choice p${slot+1}">
    <h3 id="pilot-state-${slot}"></h3>
    <div class="aircraft-cards">${['GINGER','MINT'].map((name, model) => `<button type="button" data-slot="${slot}" data-model="${model}" aria-label="P${slot+1} select ${name}"><span class="aircraft-art model-${model}" aria-hidden="true"></span><strong>${name}</strong><span class="aircraft-owner"></span></button>`).join('')}</div>
    <div class="pilot-actions"><button id="pilot-confirm-${slot}">CONFIRM</button><button id="pilot-cancel-${slot}">CHANGE AIRCRAFT</button></div>
    <p id="pilot-help-${slot}" class="pilot-help"></p>
  </section>`).join('') + '<p id="selection-status" role="status" aria-live="polite"></p>';
  $('#overlay').insertBefore(panel, $('#start'));
  const locked = [false,false];
  let active = false, network = false;
  const localSlot = () => window.lan?.guest ? 1 : 0;
  const eligible = () => ['ready','over','win'].includes(mode) &&
    (!window.arcade || ['demo','game'].includes(window.arcade.phase));
  const ready = () => window.lan?.active ? window.lan.ready && locked.every(Boolean) : locked[0];
  function renderMenu() {
    panel.hidden = !active;
    $('#overlay').classList.toggle('selecting-aircraft', active);
    $('#start').classList.toggle('start-ready', active && ready() && !window.lan?.guest);
    if (!active) return;
    const dual = !!window.lan?.ready, local = localSlot();
    panel.classList.toggle('solo', !dual);
    $('#start').disabled = !ready() || !!window.lan?.guest;
    $('#start').textContent = window.lan?.guest ? 'WAIT FOR HOST' : 'START ▶';
    $('#selection-status').textContent = window.lan?.active && !dual ? 'Waiting for the other device…' :
      ready() ? (window.lan?.guest ? 'BOTH READY · Waiting for host' : 'READY · Press START to fly') :
      dual ? 'Each player chooses and confirms on their own device' : 'Choose your aircraft → CONFIRM → START';
    for (const slot of [0,1]) {
      const own = slot === local, other = 1-slot;
      panel.querySelector(`.p${slot+1}`).hidden = !dual && !own;
      $(`#pilot-state-${slot}`).textContent = `${dual ? `P${slot+1} · ${own ? 'YOU' : 'TEAMMATE'}` : 'YOUR AIRCRAFT'} · ${locked[slot] ? 'READY' : 'CHOOSE'}`;
      $(`#pilot-confirm-${slot}`).textContent = locked[slot] ? 'READY ✓' : 'CONFIRM';
      $(`#pilot-confirm-${slot}`).disabled = !own || locked[slot];
      $(`#pilot-cancel-${slot}`).disabled = !own || !locked[slot];
      $(`#pilot-help-${slot}`).textContent = own ? 'Touch to choose · Both aircraft have the same abilities' : 'Selected on your teammate’s device';
      panel.querySelectorAll(`[data-slot="${slot}"]`).forEach(button => {
        const model = Number(button.dataset.model), taken = dual && locked[other] && aircraft[other] === model;
        button.disabled = !own || locked[slot] || taken;
        button.setAttribute('aria-pressed', String(aircraft[slot] === model));
        button.querySelector('.aircraft-owner').textContent = taken ? `P${other+1} · TAKEN` : aircraft[slot] === model ? (locked[slot] ? 'READY' : 'SELECTED') : 'AVAILABLE';
      });
    }
  }
  function open() {
    if (!eligible()) return false;
    const isNetwork = !!window.lan?.active;
    if (!active || network !== isNetwork) {
      mode = 'ready'; locked.fill(false); network = isNetwork;
      window.arcade?.dismiss();
      show('CHOOSE YOUR AIRCRAFT', 'Hold & drag to move/fire · Double-tap for bomb');
      active = true;
      updateHUD();
    }
    joined[0] = true; joined[1] = isNetwork && !!window.lan.ready;
    renderMenu(); return true;
  }
  function act(slot, action, model) {
    if (!active || !eligible()) return;
    if (slot !== localSlot() && !(window.lan?.active && window.lan.applying && slot === 1)) return;
    if (window.lan?.guest) {
      window.lan.command(action === 'choose' ? `aircraft-${model}` : `${action}-aircraft`);
      return;
    }
    if (action === 'cancel') locked[slot] = false;
    else if (!locked[slot]) {
      if (action === 'choose') {
        if (![0,1].includes(model) || (network && locked[1-slot] && aircraft[1-slot] === model)) return;
        aircraft[slot] = model;
      } else if (action === 'confirm') {
        if (network && locked[1-slot] && aircraft[1-slot] === aircraft[slot]) aircraft[slot] = 1-aircraft[1-slot];
        locked[slot] = true;
        if (network && !locked[1-slot]) aircraft[1-slot] = 1-aircraft[slot];
      }
    }
    renderMenu();
  }
  panel.querySelectorAll('[data-model]').forEach(button => button.onclick = () => act(Number(button.dataset.slot), 'choose', Number(button.dataset.model)));
  for (const slot of [0,1]) {
    $(`#pilot-confirm-${slot}`).onclick = () => act(slot, 'confirm');
    $(`#pilot-cancel-${slot}`).onclick = () => act(slot, 'cancel');
  }
  window.aircraftMenu = {
    open,
    snapshot: () => [...locked],
    peerLost() { if (eligible()) { locked[1] = false; renderMenu(); } },
    canStart: ready,
    acceptNetwork(value) {
      if (!eligible()) { active = false; renderMenu(); return; }
      open();
      locked.splice(0,2,...(value || [false,false]));
      renderMenu();
    },
    remoteAction(action) {
      if (!window.lan?.applying || window.lan.guest || !eligible()) return;
      open();
      if (action.startsWith('aircraft-')) act(1,'choose',Number(action.slice(-1)));
      else if (action === 'confirm-aircraft') act(1,'confirm');
      else if (action === 'cancel-aircraft') act(1,'cancel');
    },
    beforeStart() {
      if (!eligible()) return true;
      if (!active) { open(); return false; }
      if (!ready() || window.lan?.guest) return false;
      active = false; $('#start').disabled = false; renderMenu(); return true;
    },
    reset() { if (active) $('#start').disabled = false; active = false; locked.fill(false); renderMenu(); },
    key(e) {
      if (!active || !eligible() || $('#settings').open || $('#lan-dialog').open ||
          /^(INPUT|TEXTAREA|SELECT)$/.test(e.target?.tagName) || e.ctrlKey || e.metaKey || e.altKey) return false;
      if (['Enter','Space'].includes(e.code) && e.target?.tagName === 'BUTTON') {
        e.preventDefault(); if (!e.repeat) e.target.click(); return true;
      }
      if (!['KeyA','KeyD','ArrowLeft','ArrowRight','KeyF','KeyK','KeyG','KeyL','Enter'].includes(e.code)) return false;
      e.preventDefault();
      if (!e.repeat) {
        if (e.code === 'Enter') start();
        else if (['KeyF','KeyK'].includes(e.code)) act(localSlot(),'confirm');
        else if (['KeyG','KeyL'].includes(e.code)) act(localSlot(),'cancel');
        else act(localSlot(),'choose',1-aircraft[localSlot()]);
      }
      return true;
    },
    poll() {
      if (!eligible() || $('#settings').open || $('#lan-dialog').open) return false;
      if (active) renderMenu();
      return true;
    },
  };
  $('#demo-options').onclick = open;
})();
