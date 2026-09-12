'use strict';
// Each device owns its selection; the host mirrors P2 for start validation.
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
  let active = false, network = false, signature = '';
  const revisions = [0,0];
  let remoteRevision = -1, restored = false;
  function change(slot, model, confirmed, source, revision) {
    const previous = {aircraft:aircraft[slot], ready:locked[slot]};
    if (revision !== undefined) revisions[slot] = revision;
    if (previous.aircraft === model && previous.ready === confirmed) return false;
    aircraft[slot] = model; locked[slot] = confirmed;
    if (revision === undefined) revisions[slot]++;
    else revisions[slot] = revision;
    console.debug('[aircraft-selection]', {localPlayer:localSlot()+1, player:slot+1,
      previous, next:{aircraft:model,ready:confirmed}, source,
      ownership:slot===localSlot()?'local':'remote', revision:revisions[slot]});
    return true;
  }
  const localSlot = () => window.lan?.guest ? 1 : 0;
  const eligible = () => ['ready','over','win'].includes(mode) &&
    (!window.arcade || ['demo','game'].includes(window.arcade.phase));
  const ready = () => window.lan?.active ? window.lan.ready && locked.every(Boolean) && aircraft[0] !== aircraft[1] : locked[0];
  function renderMenu() {
    const next = JSON.stringify([active,window.lan?.ready,window.lan?.active,localSlot(),aircraft,locked]);
    if (signature === next) return;
    signature = next;
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
      $(`#pilot-confirm-${slot}`).disabled = !own || locked[slot] || (dual && locked[other] && aircraft[other] === aircraft[slot]);
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
      mode = 'ready'; network = isNetwork;
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
    let selected = aircraft[slot], confirmed = locked[slot];
    if (action === 'cancel') confirmed = false;
    else if (!confirmed) {
      if (action === 'choose') {
        if (![0,1].includes(model) || (network && locked[1-slot] && aircraft[1-slot] === model)) return;
        selected = model;
      } else if (action === 'confirm') {
        // Never resolve a collision by moving either player's cursor.
        if (network && locked[1-slot] && aircraft[1-slot] === selected) return;
        confirmed = true;
      }
    }
    change(slot, selected, confirmed, window.lan?.applying ? 'remote-command' : action);
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
    peerLost() { if (eligible()) { change(1,aircraft[1],false,'disconnect',window.lan?.guest ? undefined : revisions[1]); renderMenu(); } },
    resetNetwork() { revisions.fill(0); remoteRevision=-1; restored=false; },
    networkState: () => ({revisions:[...revisions]}),
    localSelection: () => active && (!window.lan?.guest || restored || revisions[1] > 0) ? {model:aircraft[localSlot()],ready:locked[localSlot()],revision:revisions[localSlot()]} : undefined,
    acceptRemote(value) {
      if (!value || window.lan?.guest || !eligible() || value.revision <= remoteRevision) return;
      if (!active) open();
      remoteRevision=value.revision;
      change(1,value.model,value.ready,'remote-selection',value.revision);
      revisions[1]=value.revision;
      renderMenu();
    },
    canStart: ready,
    acceptNetwork(value, models, metadata) {
      if (!eligible()) { active = false; renderMenu(); return; }
      if (!active) open();
      const revision=metadata?.revisions?.[0];
      if (revision === undefined || revision > remoteRevision) {
        change(0,models[0],!!value?.[0],'snapshot',revision);
        if (revision !== undefined) remoteRevision=revision;
      }
      // Restore once on joining, before local input; never replay a stale local choice.
      if (!restored) {
        if (revisions[1] === 0) change(1,models[1],!!value?.[1],'initial-sync',metadata?.revisions?.[1]);
        restored=true;
      } else if (metadata?.revisions?.[1] === revisions[1] && locked[1] && value?.[1] === false) {
        change(1,aircraft[1],false,'reconnect-confirmation');
      }
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
    reset() { if (active) $('#start').disabled = false; active = false; for (const slot of [0,1]) change(slot,aircraft[slot],false,'reset'); renderMenu(); },
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
