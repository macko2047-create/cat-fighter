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
  const status = text => { $('#half-status').textContent = text; };
  function prompt() {
    status(`P${setup.slot + 1}: ${setup.neutral ? 'Release all sticks and buttons, then wait.' : steps[setup.step]}`);
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
      previous.delete(-100-s.slot);
      status(`P${s.slot+1} half-controller configured. ${profiles[1-s.slot] ? 'Both players are ready.' : `Set up P${2-s.slot} next.`}`);
      releasePending=true; setup=null; return;
    }
    s.neutral=true; s.baseline=null; prompt();
  }
  window.halfControllers={
    snapshot() {
      return JSON.parse(JSON.stringify({
        profiles,
        calibration: setup ? {slot:setup.slot,step:setup.step,waitingForNeutral:setup.neutral} : null,
        releasePending,
      }));
    },
    read(raw) {
      if (defaultsEnabled && !setup) {
        const pad=raw.find(p=>p.id==='Joy-Con (L/R) (STANDARD GAMEPAD)' && p.axes.length>=4);
        if (pad) {
          const axes=[[{axis:1,rest:0,sign:1},{axis:0,rest:0,sign:1}],
            [{axis:3,rest:0,sign:-1},{axis:2,rest:0,sign:-1}]];
          profiles.forEach((c,i)=>{
            if (!c) profiles[i]={id:pad.id,index:pad.index,axes:axes[i],buttons:i?[2,0,3]:[13,14,15]};
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
      const result=raw.filter(p=>!profiles.some(c=>c && c.id===p.id && c.index===p.index));
      profiles.forEach((c,slot)=>{
        if (!c) return;
        const p=raw.find(p=>p.id===c.id && p.index===c.index);
        if (!p) return;
        const axes=c.axes.map(a=>clamp(((p.axes[a.axis] ?? a.rest)-a.rest)*a.sign,-1,1));
        const buttons=Array.from({length:16},()=>({pressed:false,value:0}));
        [1,0,9].forEach((mapped,i)=>{buttons[mapped]=p.buttons[c.buttons[i]] || {pressed:false,value:0};});
        result.push({id:`Half Joy-Con P${slot+1}`,index:-100-slot,axes:[axes[0],-axes[1]],buttons,mapping:'standard'});
      });
      return result;
    },
  };
  $('#half-p1').onclick=()=>begin(0);
  $('#half-p2').onclick=()=>begin(1);
  $('#half-reset').onclick=()=>{
    setup=null; releasePending=false; defaultsEnabled=false; profiles.fill(null); assignments.fill(null); previous.clear();
    status('Full-controller mode restored. Press a button on each controller to rejoin.'); renderDevices();
  };
  $('#half-default').onclick=()=>{
    setup=null; releasePending=true; defaultsEnabled=true; profiles.fill(null); previous.clear();
    status('Joy-Con defaults restored. Press fire to join, bomb to choose an aircraft, then fire again to start.');
  };
  $('#settings').addEventListener('close',()=>{setup=null;});
  window.addEventListener('gamepaddisconnected',e=>{
    if (profiles.some(p=>p && p.index===e.gamepad.index && p.id===e.gamepad.id)) {
      if (mode==='playing') pause('Joy-Con disconnected. Reconnect and press a button to recover, or recalibrate if needed.');
      status('Joy-Con disconnected. Reconnect and press a button to recover, or recalibrate if needed.');
    }
  });
})();
