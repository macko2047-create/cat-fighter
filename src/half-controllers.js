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
  const steps = ['向右推搖桿並放開', '向上推搖桿並放開', '按射擊鍵', '按炸彈鍵', '按暫停鍵'];
  let setup = null, releasePending = false;
  const status = text => { $('#half-status').textContent = text; };
  function prompt() {
    status(`P${setup.slot + 1}：${setup.neutral ? '放開所有搖桿及按鍵，稍候。' : steps[setup.step]}`);
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
    if (!candidates.length) { status('未讀到手掣，請先連接並按一下按鍵。'); return; }
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
      if (s.axes.some(a=>a.axis===detected.axis)) { status('上下與左右需使用不同軸；放回中央後向上推。'); return; }
      const other=profiles[1-s.slot];
      if (other && other.id===detected.p.id && other.index===detected.p.index && other.axes.some(a=>a.axis===detected.axis)) {
        status('這是另一位玩家的搖桿，請用另一半 Joy-Con。'); return;
      }
      s.id=detected.p.id; s.index=detected.p.index;
      s.axes.push({axis:detected.axis,rest:detected.rest,sign:detected.sign});
    } else {
      const p=candidates[0];
      const button=p.buttons.findIndex(b=>b.pressed);
      if (button<0) return;
      const other=profiles[1-s.slot];
      if (s.buttons.includes(button) || (other && other.id===p.id && other.index===p.index && other.buttons.includes(button))) {
        status('此按鍵已被使用，請放開後選另一個鍵。'); return;
      }
      s.buttons.push(button);
    }
    s.step++;
    if (s.step===steps.length) {
      profiles[s.slot]={id:s.id,index:s.index,axes:s.axes,buttons:s.buttons};
      assignments[s.slot]=-100-s.slot;
      previous.delete(assignments[s.slot]);
      if (s.slot===1 && mode==='paused' && !players[1]) players.push(pilot(1));
      status(`P${s.slot+1} 半支手掣設定完成。${profiles[1-s.slot] ? '兩位玩家已就緒。' : `請設定 P${2-s.slot}。`}`);
      releasePending=true; setup=null; return;
    }
    s.neutral=true; s.baseline=null; prompt();
  }
  window.halfControllers={
    read(raw) {
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
    setup=null; releasePending=false; profiles.fill(null); assignments.fill(null); previous.clear();
    status('已返回整支手掣模式。各手掣按一下按鈕重新加入。'); renderDevices();
  };
  $('#settings').addEventListener('close',()=>{setup=null;});
  window.addEventListener('gamepaddisconnected',e=>{
    if (profiles.some(p=>p && p.index===e.gamepad.index && p.id===e.gamepad.id)) {
      if (mode==='playing') pause('Joy-Con 已斷線；重新連接後請重新設定半支手掣。');
      status('Joy-Con 已斷線；重新連接後請重新設定半支手掣。');
    }
  });
})();
