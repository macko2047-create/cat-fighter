"use strict";
// Keep the control surface outside the unchanged 600 × 800 simulation.
(() => {
  const screen = $(".screen"), canvas = $("#game");
  let pointer = null, target = null, lastTap = null, ignoreDblclickUntil = 0;
  const controls = window.flightControls = {
    active: false, x: 0, y: 0, target: null,
    reset() {
      const held = pointer;
      pointer = null;
      target = null;
      controls.target = null;
      controls.active = false;
      controls.x = controls.y = 0;
      if (held !== null && screen.hasPointerCapture(held)) screen.releasePointerCapture(held);
    },
    sync() {
      document.body.classList.toggle("in-flight", mode !== "ready");
      document.body.dataset.mode = mode;
      const p = players[0];
      $("#flight-health").textContent = players.length
        ? players.map(p => `P${p.index + 1} ${"🐱".repeat(p.lives) || "OUT"} · B ${p.bombs}`).join(" / ") : "P1 · READY";
      if (mode !== "playing" && controls.active) controls.reset();
    },
  };
  function setTarget(e) {
    const rect = canvas.getBoundingClientRect();
    target = {
      x: (e.clientX - rect.left) * 600 / rect.width,
      y: (e.clientY - rect.top) * 800 / rect.height,
    };
    controls.target = target;
  }
  function useBomb() {
    if (mode === "playing" && players[0]?.bombs > 0) {
      bomb(players[0]);
      controls.sync();
    }
  }
  screen.addEventListener("pointerdown", e => {
    if (e.pointerType === "mouse" || mode !== "playing" || !players[0]?.lives || players[0].respawn > 0 || players[0].entering || pointer !== null) return;
    e.preventDefault();
    const now = performance.now();
    if (lastTap && now - lastTap.time < 350 && Math.hypot(e.clientX - lastTap.x, e.clientY - lastTap.y) < 32) {
      useBomb();
      ignoreDblclickUntil = now + 450;
      lastTap = null;
    } else {
      lastTap = { time: now, x: e.clientX, y: e.clientY };
    }
    pointer = e.pointerId;
    setTarget(e);
    controls.active = true;
    screen.setPointerCapture(pointer);
  });
  screen.addEventListener("pointermove", e => {
    if (e.pointerId !== pointer) return;
    e.preventDefault();
    setTarget(e);
  });
  for (const name of ["pointerup", "pointercancel", "lostpointercapture"])
    screen.addEventListener(name, e => { if (e.pointerId === pointer) controls.reset(); });
  canvas.addEventListener("dblclick", e => {
    if (mode !== "playing") return;
    e.preventDefault();
    if (performance.now() < ignoreDblclickUntil) return;
    useBomb();
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
  window.addEventListener("resize", controls.reset);
  document.addEventListener("visibilitychange", () => { if (document.hidden) controls.reset(); });
  document.addEventListener("fullscreenchange", () => {
    controls.reset();
    if (!document.fullscreenElement && mode === "playing") pause("已離開全螢幕，按 RESUME 繼續。");
  });
  controls.sync();
})();
