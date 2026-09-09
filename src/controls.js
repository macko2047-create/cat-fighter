"use strict";
// Keep the control surface outside the unchanged 600 × 800 simulation.
(() => {
  const screen = $(".screen"), canvas = $("#game");
  // Screen pixels keep the finger behind the tail on phones and large displays.
  const FINGER_CLEARANCE_PX = 72;
  let pointer = null, target = null, lastTap = null, ignoreDblclickUntil = 0, healthMarkup = null;
  let secondPointer=null, secondTarget=null, secondTap=0;
  const controls = window.flightControls = {
    active: false, x: 0, y: 0, target: null,
    targetFor(i) { return i===0 ? controls.active && controls.target : secondTarget; },
    reset() {
      const held = pointer;
      const secondHeld=secondPointer; secondPointer=null; secondTarget=null;
      if(secondHeld!==null && screen.hasPointerCapture(secondHeld)) screen.releasePointerCapture(secondHeld);
      pointer = null;
      target = null;
      controls.target = null;
      controls.active = false;
      controls.x = controls.y = 0;
      if (held !== null && screen.hasPointerCapture(held)) screen.releasePointerCapture(held);
    },
    sync() {
      document.body.classList.toggle("in-flight", !!window.arcade || mode !== "ready");
      document.body.dataset.mode = mode;
      const health = $("#flight-health");
      // Counts stay readable as extra lives accumulate over an endless run.
      const hud = players.length ? players.map(p => {
        if (p.lives === 0 && players.length === 2 && mode !== 'over') {
          const seconds = Math.ceil(p.rejoinRemaining || 0);
          const ready = seconds === 0 && mode === 'playing' && loopTransition <= 0;
          const hint = seconds ? 'WAIT' : loopTransition > 0 ? 'NEXT LOOP' : `FIRE / ${(p.controlSlot ?? p.index) ? 'K' : 'F'}`;
          return `<button class="pilot-hud pilot-rejoin p${(p.controlSlot ?? p.index) + 1}" data-rejoin="${p.index}" ${ready ? '' : 'disabled'} aria-label="P${(p.controlSlot ?? p.index) + 1}：${seconds ? `${seconds} 秒後可重新加入` : '按射擊鍵或點此重新加入'}"><span>P${(p.controlSlot ?? p.index) + 1} ${seconds ? String(seconds).padStart(2, '0') : 'JOIN'}</span><span class="pilot-bombs">${hint}</span></button>`;
        }
        return `<span class="pilot-hud p${(p.controlSlot ?? p.index) + 1}" aria-label="P${(p.controlSlot ?? p.index) + 1}：生命 ${p.lives}，炸彈 ${p.bombs}"><span class="pilot-lives"><b>P${(p.controlSlot ?? p.index) + 1}</b><svg class="life-icon" viewBox="0 0 16 14" aria-hidden="true"><path fill="currentColor" d="M0 0h3v2h2v2h6V2h2V0h3v11h-2v2H2v-2H0Z"/><path fill="#112b31" d="M3 6h2v2H3zm8 0h2v2h-2zM7 9h2v2H7z"/></svg><span>${p.lives > 0 ? `×${p.lives}` : 'OUT'}</span></span><span class="pilot-bombs">BOMB <b>${p.bombs}</b></span></span>`;
      }).join('') : '<span class="pilot-ready">P1 · READY</span>';
      if (healthMarkup !== hud) { health.innerHTML = hud; healthMarkup = hud; }
      if ((mode !== "playing" || loopTransition > 0) && (controls.active || secondTarget)) controls.reset();
    },
  };
  $('#flight-health').addEventListener('click', e => {
    const button = e.target.closest('[data-rejoin]');
    if (button && !button.disabled) tryRejoin(Number(button.dataset.rejoin));
  });
  function setTarget(e) {
    const rect = canvas.getBoundingClientRect();
    target = {
      x: clamp((e.clientX - rect.left) * W / rect.width, 24, W - 24),
      y: clamp((e.clientY - rect.top - FINGER_CLEARANCE_PX) * H / rect.height, 60, H - 25),
    };
    controls.target = target;
  }
  function useBomb() {
    if (mode === "playing" && loopTransition <= 0 && players[0]?.bombs > 0) {
      bomb(players[0]);
      controls.sync();
    }
  }
  screen.addEventListener("pointerdown", e => {
    if(window.lan?.guest) return;
    if(!window.lan?.active && players.length===2 && e.clientX>=canvas.getBoundingClientRect().left+canvas.getBoundingClientRect().width/2) return;
    if (e.pointerType === "mouse" || mode !== "playing" || loopTransition > 0 || !players[0]?.lives || players[0].respawn > 0 || players[0].entering || pointer !== null) return;
    e.preventDefault();
    const now = performance.now();
    if (lastTap && now - lastTap.time < 350 && Math.hypot(e.clientX - lastTap.x, e.clientY - lastTap.y) < 32) {
      useBomb();
      ignoreDblclickUntil = now + 450;
      lastTap = null;
    } else {
      lastTap = { time: now, x: e.clientX, y: e.clientY };
    }
    // A double-tap bomb can defeat the boss and reset controls during this event.
    if (mode !== "playing" || loopTransition > 0) return;
    pointer = e.pointerId;
    setTarget(e);
    controls.active = true;
    screen.setPointerCapture(pointer);
  });
  function moveSecond(e) {
    const rect=canvas.getBoundingClientRect();
    secondTarget={x:clamp((e.clientX-rect.left)*W/rect.width,24,W-24),
      y:clamp((e.clientY-rect.top-FINGER_CLEARANCE_PX)*H/rect.height,60,H-25)};
  }
  screen.addEventListener("pointerdown",e=>{
    if(window.lan?.active && !window.lan.guest) return;
    const rect=canvas.getBoundingClientRect(), p=players[1];
    if(e.pointerType==="mouse" || mode!=="playing" || loopTransition>0 || !p?.lives || p.respawn>0 || p.entering ||
      secondPointer!==null || (!window.lan?.guest && e.clientX<rect.left+rect.width/2)) return;
    e.preventDefault();
    const now=performance.now();
    if(secondTap && now-secondTap<350) { bomb(p); secondTap=0; ignoreDblclickUntil=now+450; } else secondTap=now;
    if(loopTransition>0) return;
    secondPointer=e.pointerId; moveSecond(e); screen.setPointerCapture(secondPointer);
  });
  screen.addEventListener("pointermove",e=>{if(e.pointerId===secondPointer){e.preventDefault();moveSecond(e);}});
  for(const name of ["pointerup","pointercancel","lostpointercapture"])
    screen.addEventListener(name,e=>{if(e.pointerId===secondPointer){secondPointer=null;secondTarget=null;}});
  screen.addEventListener("pointermove", e => {
    if (e.pointerId !== pointer) return;
    e.preventDefault();
    setTarget(e);
  });
  for (const name of ["pointerup", "pointercancel", "lostpointercapture"])
    screen.addEventListener(name, e => { if (e.pointerId === pointer) {
      pointer=null;target=null;controls.target=null;controls.active=false;
    } });
  canvas.addEventListener("dblclick", e => {
    if (mode !== "playing") return;
    e.preventDefault();
    if (performance.now() < ignoreDblclickUntil) return;
    if(window.lan?.guest) bomb(players[1]); else useBomb();
  });
  async function fullscreen() {
    if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
      try { await document.documentElement.requestFullscreen(); } catch { /* viewport fallback */ }
    }
  }
  $("#fullscreen").onclick = fullscreen;
  $("#start").addEventListener("click", fullscreen);
  window.addEventListener("keydown", e => {
    if (e.code === "Enter" && !$("#settings").open) fullscreen();
  });
  window.addEventListener("blur", controls.reset);
  // iPad browser chrome can shrink the visible viewport independently of dvh.
  function fitViewport() {
    const viewport = window.visualViewport;
    const style = document.documentElement.style;
    style.setProperty('--play-height', `${viewport?.height ?? window.innerHeight}px`);
    style.setProperty('--play-width', `${viewport?.width ?? window.innerWidth}px`);
    style.setProperty('--play-top', `${viewport?.offsetTop ?? 0}px`);
    style.setProperty('--play-left', `${viewport?.offsetLeft ?? 0}px`);
    controls.reset();
  }
  window.addEventListener("resize", fitViewport);
  window.visualViewport?.addEventListener("resize", fitViewport);
  window.visualViewport?.addEventListener("scroll", fitViewport);
  fitViewport();
  document.addEventListener("visibilitychange", () => { if (document.hidden) controls.reset(); });
  document.addEventListener("fullscreenchange", () => {
    controls.reset();
    if (!document.fullscreenElement && mode === "playing") pause("已離開全螢幕，按 RESUME 繼續。");
  });
  controls.sync();
})();
