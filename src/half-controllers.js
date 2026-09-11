"use strict";
// Calibrate against actual browser input, including a combined Joy-Con pair.
// Logical pads keep the existing joining, normalization and action mapping.
(() => {
  const deadzoneInput = $('#deadzone');
  function showDeadzone() {
    deadzoneInput.value = Math.round(deadzone * 100);
    $('#deadzone-value').textContent = `${deadzoneInput.value}%`;
  }
  deadzoneInput.addEventListener('input', () => {
    deadzone = clamp(Number(deadzoneInput.value) / 100, 0, .5);
    try { localStorage.setItem('catfighter-deadzone', String(deadzone)); } catch {}
    showDeadzone();
  });
  showDeadzone();
  const profiles = [null, null];
  const steps = ['Move the stick right, then release', 'Move the stick up, then release', 'Press the fire button', 'Press the bomb button', 'Press the pause button'];
  let setup = null, releasePending = false, defaultsEnabled = true;
  const storageKey = 'catfighter-half-controllers-v1';
  const valid = c => c === null || (typeof c.id === 'string' && c.axes?.length === 2 && c.buttons?.length === 3 &&
    c.axes.every(a => Number.isInteger(a.axis) && a.axis >= 0 && Number.isFinite(a.rest) && [-1,1].includes(a.sign)) &&
    c.buttons.every(b => Number.isInteger(b) && b >= 0));
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) || 'null');
    if (saved?.profiles?.length === 2 && saved.profiles.every(valid)) {
      profiles.splice(0,2,...saved.profiles); defaultsEnabled = saved.defaultsEnabled !== false;
    }
  } catch {}
  function save() {
    try { localStorage.setItem(storageKey, JSON.stringify({profiles,defaultsEnabled})); } catch {}
  }
  const status = text => { $('#half-status').textContent = text; };
  function prompt() {
    status(`${setup.slot === 0 ? 'First / left half' : 'Second / right half'}: ${setup.neutral ? 'Release all sticks and buttons, then wait.' : steps[setup.step]}`);
  }
  function begin(slot) {
    capture = null;
    setup = {slot, step:0, neutral:true, baseline:null, stable:0, axes:[], buttons:[]};
    prompt();
  }
  function calibrate(raw) {
    if (!setup || !$('#settings').open) return;
    const s = setup;
    const candidates = s.id === undefined ? raw : raw.filter(p=>p.id===s.id && p.index===s.index);
    if (!candidates.length) { status('No controller detected. Connect one and press a button.'); return; }
    if (s.neutral) {
      // Capture a stable resting value: non-standard pads may have idle axes at -1.
      const values = candidates.map(p=>({id:p.id,index:p.index,axes:[...p.axes]}));
      const stable = s.baseline && JSON.stringify(values.map(p=>[p.id,p.index])) === JSON.stringify(s.baseline.map(p=>[p.id,p.index])) &&
        values.every((p,i)=>p.axes.every((v,j)=>Math.abs(v-s.baseline[i].axes[j])<.04));
      if (candidates.some(p=>p.buttons.some(b=>b.pressed)) || !stable) s.stable=performance.now();
      s.baseline=values;
      if (performance.now()-s.stable<500) return;
      s.neutral=false; prompt(); return;
    }
    let detected;
    if (s.step<2) {
      for (const p of candidates) {
        const base=s.baseline.find(b=>b.id===p.id && b.index===p.index);
        if (!base) continue;
        p.axes.forEach((value,axis)=>{
          const delta=value-base.axes[axis];
          if (Math.abs(delta)>.6 && (!detected || Math.abs(delta)>detected.strength))
            detected={p,axis,rest:base.axes[axis],sign:Math.sign(delta),strength:Math.abs(delta)};
        });
      }
      if (!detected) return;
      if (s.axes.some(a=>a.axis===detected.axis)) { status('Vertical and horizontal movement need different axes. Center the stick, then move it up.'); return; }
      const other=profiles[1-s.slot];
      if (other && other.id===detected.p.id && other.index===detected.p.index && other.axes.some(a=>a.axis===detected.axis)) {
        status('That stick belongs to the other player. Use the other Joy-Con.'); return;
      }
      s.id=detected.p.id; s.index=detected.p.index;
      s.axes.push({axis:detected.axis,rest:detected.rest,sign:detected.sign});
    } else {
      const p=candidates[0];
      const button=p.buttons.findIndex(b=>b.pressed);
      if (button<0) return;
      const other=profiles[1-s.slot];
      if (s.buttons.includes(button) || (other && other.id===p.id && other.index===p.index && other.buttons.includes(button))) {
        status('That button is already assigned. Release it and choose another.'); return;
      }
      s.buttons.push(button);
    }
    s.step++;
    if (s.step===steps.length) {
      profiles[s.slot]={id:s.id,index:s.index,axes:s.axes,buttons:s.buttons};
      save();
      previous.delete(-100-s.slot);
      status(`Half-controller calibration saved. ${profiles[1-s.slot] ? 'Both halves are ready.' : 'Calibrate the other half if needed.'} Use the pairing buttons above to choose its player.`);
      releasePending=true; setup=null; return;
    }
    s.neutral=true; s.baseline=null; prompt();
  }
  // Chrome remaps a standalone Joy-Con for horizontal use. Preserve the
  // physical buttons used by the combined preset and the same logical identity.
  // Source: chromium device/gamepad/nintendo_controller.cc UpdateButtonFor*Side.
  function singleSlot(p) {
    if (p.mapping !== 'standard' || p.axes.length < 2) return -1;
    if (/^Joy-Con \(L\)(?: |$)/.test(p.id)) return 0;
    if (/^Joy-Con \(R\)(?: |$)/.test(p.id)) return 1;
    return -1;
  }
  const pendingDisconnects = new Map();
  window.halfControllers={
    snapshot() {
      return JSON.parse(JSON.stringify({
        profiles,
        calibration: setup ? {slot:setup.slot,step:setup.step,waitingForNeutral:setup.neutral} : null,
        releasePending,
        defaultsEnabled,
      }));
    },
    read(raw) {
      // Browser indices may change after reconnect/reload; only rebind a unique match.
      for (const c of profiles) {
        if (!c || raw.some(p=>p.id===c.id && p.index===c.index)) continue;
        const matches=raw.filter(p=>p.id===c.id);
        if (matches.length===1) c.index=matches[0].index;
      }
      if (defaultsEnabled && !setup) {
        const pad=raw.find(p=>p.id==='Joy-Con (L/R) (STANDARD GAMEPAD)' && p.axes.length>=4);
        if (pad) {
          const axes=[[{axis:1,rest:0,sign:1},{axis:0,rest:0,sign:1}],
            [{axis:3,rest:0,sign:-1},{axis:2,rest:0,sign:-1}]];
          profiles.forEach((c,i)=>{
            if (!c) profiles[i]={id:pad.id,index:pad.index,axes:axes[i],buttons:i?[2,0,3]:[13,14,15],side:i?'right':'left'};
            else if(c.id===pad.id) c.index=pad.index;
          });
        }
      }
      calibrate(raw);
      // Suppress gameplay/old menu shortcuts while learning physical buttons.
      if (setup) return [];
      if (releasePending) {
        if (raw.some(p=>profiles.some(c=>c && c.id===p.id && c.index===p.index && c.buttons.some(i=>p.buttons[i]?.pressed)))) return [];
        releasePending=false;
      }
      const singles = defaultsEnabled ? raw.filter(p=>singleSlot(p)>=0 && !profiles.some(c=>c && c.id===p.id && c.index===p.index)) : [];
      const result=raw.filter(p=>!singles.includes(p) && !profiles.some(c=>c && c.id===p.id && c.index===p.index));
      for (const p of singles) {
        const slot=singleSlot(p), physical=slot ? [3,2,1] : [1,0,3];
        const buttons=Array.from({length:16},()=>({pressed:false,value:0}));
        [1,0,9].forEach((logical,i)=>{buttons[logical]=p.buttons[physical[i]] || {pressed:false,value:0};});
        result.push({id:`Half Joy-Con P${slot+1}`,displayName:`Joy-Con · ${slot ? 'Right' : 'Left'} half (single)`,preferredSlot:slot,index:-100-slot,axes:[p.axes[0],p.axes[1]],buttons,mapping:'standard'});
      }
      profiles.forEach((c,slot)=>{
        if (!c || result.some(p=>p.index===-100-slot)) return;
        const p=raw.find(p=>p.id===c.id && p.index===c.index);
        if (!p) return;
        const axes=c.axes.map(a=>clamp(((p.axes[a.axis] ?? a.rest)-a.rest)*a.sign,-1,1));
        const buttons=Array.from({length:16},()=>({pressed:false,value:0}));
        [1,0,9].forEach((mapped,i)=>{buttons[mapped]=p.buttons[c.buttons[i]] || {pressed:false,value:0};});
        result.push({id:`Half Joy-Con P${slot+1}`,displayName:c.side ? `Joy-Con · ${c.side === 'left' ? 'Left' : 'Right'} half` : `Calibrated half-controller ${slot+1}`,preferredSlot:slot,index:-100-slot,axes:[axes[0],-axes[1]],buttons,mapping:'standard'});
      });
      for (const [index,deadline] of pendingDisconnects) {
        if (result.some(p=>p.index===index)) pendingDisconnects.delete(index);
        else if (performance.now()>=deadline) {
          pendingDisconnects.delete(index);
          if (mode==='playing' && controllerInUse(index)) pause('Your active controller disconnected. Reconnect it or use the keyboard to resume.');
        }
      }
      return result;
    },
  };
  $('#half-p1').onclick=()=>begin(0);
  $('#half-p2').onclick=()=>begin(1);
  $('#half-reset').onclick=()=>{
    setup=null; releasePending=false; defaultsEnabled=false; profiles.fill(null); assignments.fill(null); previous.clear();
    save();
    status('Full-controller mode restored. Press a button on each controller to rejoin.'); renderDevices();
  };
  $('#half-default').onclick=()=>{
    window.controllerSetup?.resetHalfPreferences();
    setup=null; releasePending=true; defaultsEnabled=true; profiles.fill(null); assignments.fill(null); previous.clear(); save();
    status('Automatic Joy-Con mode restored. Left half: P1 · Right half: P2. Select a fighter to join.');
  };
  $('#settings').addEventListener('close',()=>{setup=null;});
  window.addEventListener('gamepaddisconnected',e=>{
    const affected = profiles.flatMap((p,slot)=>p && p.index===e.gamepad.index && p.id===e.gamepad.id ? [-100-slot] : []);
    const slot=singleSlot(e.gamepad);
    if (defaultsEnabled && slot>=0) affected.push(-100-slot);
    for (const index of new Set(affected)) {
      previous.delete(index);
      // Allow Chrome's combined↔single handover without interrupting a run.
      if (controllerInUse(index)) pendingDisconnects.set(index,performance.now()+500);
    }
  });
})();
