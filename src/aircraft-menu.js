'use strict';
// Compatibility facade for the former aircraft-selection step. Aircraft are
// fixed by player identity; LAN snapshots keep the legacy fields so mixed
// cached clients can still parse the existing protocol envelope.
(() => {
  const fixed = () => aircraft.splice(0, 2, ...FIXED_AIRCRAFT);
  const eligible = () => ['ready','over','win'].includes(mode) &&
    (!window.arcade || ['demo','game'].includes(window.arcade.phase));

  function open() {
    if (!eligible()) return false;
    fixed();
    mode = 'ready';
    window.arcade?.dismiss();
    if (window.lan?.active) {
      joined[0] = true;
      joined[1] = !!window.lan.ready;
      $('#start').disabled = !window.lan.ready || !!window.lan.guest;
      show('READY FOR TAKEOFF', window.lan.ready ? 'Both Wi-Fi players are ready.' : 'Waiting for P2 to connect.');
    } else {
      joined[0] = true;
      $('#start').disabled = false;
      show('READY FOR TAKEOFF', 'P1 is ready. Start solo, or press a second controller to join P2.');
    }
    updateHUD();
    return true;
  }

  window.aircraftMenu = {
    open,
    snapshot: () => window.lan?.active ? [true, !!window.lan.ready] : [true, !!joined[1]],
    networkState: () => undefined,
    localSelection: () => undefined,
    acceptRemote() { fixed(); },
    remoteAction() {},
    acceptNetwork() { fixed(); updateHUD(); },
    peerLost() { fixed(); if (mode === 'ready') { joined[1] = false; updateHUD(); } },
    canStart: () => !window.lan?.active || !!window.lan.ready,
    beforeStart() {
      fixed();
      if (!eligible()) return true;
      if (window.arcade?.phase === 'demo') { open(); return false; }
      return !window.lan?.active || (!window.lan.guest && window.lan.ready);
    },
    reset() { fixed(); if (!window.lan?.active) $('#start').disabled = false; },
    resetNetwork() { fixed(); },
    key() { return false; },
    poll() { return false; },
  };
  $('#demo-options').onclick = open;
})();
