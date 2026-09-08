"use strict";
// Keep the control surface outside the unchanged 600 × 800 simulation.
(() => {
  const stick = $("#stick"), knob = $("#stick-knob"), bombButton = $("#touch-bomb");
  let pointer = null, origin = null;
  const controls = window.flightControls = {
    active: false, x: 0, y: 0,
    reset() {
      const held = pointer;
      pointer = null;
      controls.active = false;
      controls.x = controls.y = 0;
      knob.style.transform = "translate(0px, 0px)";
      if (held !== null && stick.hasPointerCapture(held)) stick.releasePointerCapture(held);
    },
    sync() {
      document.body.classList.toggle("in-flight", mode !== "ready");
      document.body.dataset.mode = mode;
      const p = players[0];
      bombButton.disabled = mode !== "playing" || !p || p.lives <= 0 || p.respawn > 0 || p.entering || p.bombs <= 0;
      bombButton.textContent = `BOMB ×${p?.bombs ?? 3}`;
      $("#flight-health").textContent = players.length
        ? players.map(p => `P${p.index + 1} ${"🐱".repeat(p.lives) || "OUT"} · B ${p.bombs}`).join(" / ") : "P1 · READY";
      if (mode !== "playing" && controls.active) controls.reset();
    },
  };
  stick.addEventListener("pointerdown", e => {
    if (mode !== "playing" || !players[0]?.lives || players[0].respawn > 0 || players[0].entering || pointer !== null || e.button !== 0) return;
    e.preventDefault();
    pointer = e.pointerId;
    origin = { x: e.clientX, y: e.clientY };
    controls.active = true;
    stick.setPointerCapture(pointer);
  });
  stick.addEventListener("pointermove", e => {
    if (e.pointerId !== pointer) return;
    const dx = (e.clientX - origin.x) / 42, dy = (e.clientY - origin.y) / 42;
    const n = Math.max(1, Math.hypot(dx, dy));
    controls.x = Math.abs(dx / n) > deadzone ? dx / n : 0;
    controls.y = Math.abs(dy / n) > deadzone ? dy / n : 0;
    knob.style.transform = `translate(${dx / n * 30}px, ${dy / n * 30}px)`;
  });
  for (const name of ["pointerup", "pointercancel", "lostpointercapture"])
    stick.addEventListener(name, e => { if (e.pointerId === pointer) controls.reset(); });
  bombButton.addEventListener("pointerdown", e => {
    if (e.button !== 0) return;
    e.preventDefault();
    if (mode === "playing" && !bombButton.disabled) { bomb(players[0]); controls.sync(); }
  });
  // Keyboard/assistive activation; pointer activation already fired on press.
  bombButton.addEventListener("click", e => {
    if (e.detail === 0 && mode === "playing" && !bombButton.disabled) {
      bomb(players[0]); controls.sync();
    }
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
