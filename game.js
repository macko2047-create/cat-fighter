"use strict";
const $ = (s) => document.querySelector(s),
  canvas = $("#game"),
  ctx = canvas.getContext("2d"),
  W = 600,
  H = 800;
let mode = "ready",
  elapsed = 0,
  score = 0,
  players = [],
  enemies = [],
  shots = [],
  hostile = [],
  drops = [],
  sparks = [],
  bossDebris = [],
  wave = 0,
  loop = 1,
  loopTransition = 0,
  bossSpawned = false,
  bossWreck = null,
  nextSupply = 50,
  extraLifeSpawned = false,
  recoveryRewardPending = false,
  flash = 0,
  last = 0,
  ambient = 0,
  sound = false;
const keys = new Set(),
  assignments = [null, null],
  previous = new Map(),
  bindings = {};
let deadzone = 0.08;
const joined = [false, false], aircraft = [0, 1];
function joinPilot(slot) {
  if (window.lan?.active) return;
  if (mode==="playing" || mode==="paused") return;
  joined[slot] = !joined[slot];
  updateHUD();
}
let keyboard2 = false,
  capture = null;
try {
  Object.assign(
    bindings,
    JSON.parse(localStorage.getItem("catfighter-bindings") || "{}"),
  );
} catch {}
try {
  const saved = localStorage.getItem('catfighter-deadzone');
  if (saved !== null && Number.isFinite(Number(saved)))
    deadzone = Math.max(0, Math.min(.5, Number(saved)));
} catch {}
const clamp = (n, a, b) => Math.max(a, Math.min(b, n)),
  rnd = (a, b) => a + Math.random() * (b - a);
const playerAssets = createPlayerAssetLoader(window);
const enemyAssets = createPlayerAssetLoader(window, ENEMY_ASSETS);
const render = createRenderer(ctx, W, H, (t) => drawWorld(ctx, W, H, t), clamp, playerAssets, enemyAssets);
const sfx = createAudio(window, () => sound);
const pads = () => {
  const raw = Array.from(navigator.getGamepads?.() || []).filter(Boolean);
  return window.halfControllers ? window.halfControllers.read(raw) : raw;
};
const config = (p) => bindings[p.id] || { fire: 1, bomb: 0, pause: 9 };
function pilot(i) {
  return {
    x: i ? 365 : 235,
    y: 690,
    lives: 3,
    rejoinRemaining: 0,
    respawn: 0,
    entering: false,
    bombs: 3,
    level: 1,
    rapid: false,
    cool: 0,
    inv: 2,
    index: i,
  };
}
function start() {
  if (window.arcade && !window.arcade.beforeStart()) return;
  if (window.lan?.active) {
    if (!window.lan.canStart()) return;
    joined.fill(true);
  }
  if (mode === "playing") return;
  if (!joined.some(Boolean)) joined[0] = true;
  players = joined.flatMap((active, slot) => active ? [{...pilot(0), controlSlot:slot, aircraft:aircraft[slot]}] : []);
  players.forEach((p,i) => { p.index=i; p.x=players.length===1?300:i?365:235; });
  elapsed = score = wave = 0;
  loop = 1;
  loopTransition = 0;
  bossSpawned = false;
  bossWreck = null;
  nextSupply = LEVEL1.pickupInterval;
  extraLifeSpawned = false;
  recoveryRewardPending = false;
  enemies = [];
  shots = [];
  hostile = [];
  drops = [];
  sparks = [];
  bossDebris = [];
  flash = 0;
  mode = "playing";
  $("#overlay").style.display = "none";
  window.flightControls?.sync();
  sfx.playSfx("start");
}
function tryRejoin(index) {
  if (window.lan?.active && !window.lan.applying) {
    if (window.lan.guest) { if (index === 1) window.lan.command('rejoin'); return false; }
    if (!window.lan.owns(index)) return false;
  }
  const p = players[index];
  if (mode !== "playing" || loopTransition > 0 || $("#settings").open || players.length !== 2 ||
    !p || p.lives > 0 || p.rejoinRemaining > 0 || !players.some(other => other !== p && other.lives > 0)) return false;
  // A fresh sortie for this pilot; the teammate and shared score keep going.
  Object.assign(p, pilot(index), { y: H + 55, entering: true, inv: 3, rapid: false, notice: '', noticeUntil: 0 });
  recoveryRewardPending = true;
  if (index === 0) window.flightControls?.reset();
  sfx.playSfx("playerJoined");
  updateHUD();
  return true;
}
function loopDifficulty() {
  // Add a small fraction of the original difficulty each clear, not compounding.
  return 1 + (loop - 1) * LEVEL1.loopDifficultyStep;
}
function completeLoop() {
  loopTransition = LEVEL1.loopClearDelay;
  enemies = [];
  hostile = [];
  shots = [];
  drops = [];
  window.flightControls?.reset();
  for (const p of players) p.noticeUntil = 0;
  sfx.playSfx("start");
  updateHUD();
}
function nextLoop() {
  loop++;
  loopTransition = 0;
  elapsed = wave = 0;
  bossSpawned = false;
  bossWreck = null;
  nextSupply = LEVEL1.pickupInterval;
  extraLifeSpawned = false;
  enemies = [];
  hostile = [];
  shots = [];
  drops = [];
  sparks = [];
  bossDebris = [];
  flash = 0;
  window.flightControls?.reset();
  for (const p of players) {
    if (p.lives <= 0) continue;
    p.x = p.index ? 365 : 235;
    p.y = H + 55;
    p.respawn = 0;
    p.entering = true;
    p.inv = 3;
    p.cool = 0;
    p.noticeUntil = 0;
  }
  updateHUD();
}
function show(title, message) {
  window.flightControls?.reset();
  window.flightControls?.sync();
  $("#overlay").style.display = "flex";
  $("#overlay h2").innerHTML = title;
  $("#message").textContent = message;
  $("#start").textContent = mode === "paused" ? "RESUME ▶" : mode === "over" ? "RETRY ▶" : "START ▶";
  $("#join").style.display =
    mode === "ready" || mode === "over" || mode === "win" ? "block" : "none";
}
function pause(reason = "休息一下，貓貓。") {
  if (window.lan?.active && !window.lan.applying) {
    if (window.lan.guest) { window.lan.command('pause'); return; }
    if (mode === 'paused' && !window.lan.ready) return;
  }
  if (mode === "playing") {
    mode = "paused";
    show("PAUSED", reason);
  } else if (mode === "paused" && !$("#settings").open) {
    mode = "playing";
    $("#overlay").style.display = "none";
    window.flightControls?.sync();
  }
}
$("#start").onclick = () => (mode === "paused" ? pause() : start());
$("#pause").onclick = () => pause();
$("#join").onclick = () => {
  joinPilot(1);
  updateHUD();
};
$("#join-p1").onclick = () => joinPilot(0);
[0,1].forEach(i => { $("#aircraft-"+i).onchange = e => { aircraft[i]=Number(e.target.value); updateHUD(); }; });
$("#sound").onclick = () => {
  sound = !sound;
  $("#sound").textContent = "聲音 " + (sound ? "ON" : "OFF");
  sfx.playSfx("soundEnabled");
};
$("#test").onclick = () => {
  if (mode === "playing") pause("手掣設定中");
  $("#settings").showModal();
  renderDevices();
};
$("#close").onclick = () => $("#settings").close();
$("#settings").addEventListener("close", () => {
  capture = null;
});
window.addEventListener("keydown", (e) => {
  if (window.arcade?.key(e)) return;
  if (window.lan?.key(e)) return;
  if (
    [
      "ArrowUp",
      "ArrowDown",
      "ArrowLeft",
      "ArrowRight",
      "Space",
      "Enter",
      "Escape",
    ].includes(e.code)
  )
    e.preventDefault();
  if (!e.repeat) {
    if (e.code === "Escape") {
      if ($("#settings").open) $("#settings").close();
      else pause();
    }
    if (e.code === "Enter" && !$("#settings").open) {
      if (mode === "paused") pause();
      else if (mode !== "playing") start();
    }
    if (mode === "playing" && (e.code === "KeyG" || e.code === "KeyL")) {
      const p = players.find(p => (p.controlSlot ?? p.index) === (e.code === "KeyL" ? 1 : 0));
      if (p) bomb(p);
    }
    if (e.code === "KeyF" || e.code === "KeyK") {
      const index = players.findIndex(p => (p.controlSlot ?? p.index) === (e.code === "KeyK" ? 1 : 0));
      if (index >= 0) tryRejoin(index);
    }
    if (mode === "ready" && (e.code === "KeyF" || e.code === "KeyK")) {
      joined[e.code === "KeyK" ? 1 : 0] = true; updateHUD();
    }
  }
  keys.add(e.code);
});
window.addEventListener("keyup", (e) => keys.delete(e.code));
window.addEventListener("blur", () => {
  keys.clear();
  if (mode === "playing") pause("視窗離開焦點，已暫停");
});
document.addEventListener("visibilitychange", () => {
  if (document.hidden && mode === "playing") pause("遊戲已暫停");
});
window.addEventListener("gamepaddisconnected", (e) => {
  if (assignments.includes(e.gamepad.index) && mode === "playing")
    pause("手掣已斷線。重新連接或使用鍵盤繼續。");
  for (let i = 0; i < 2; i++)
    if (assignments[i] === e.gamepad.index) assignments[i] = null;
  previous.delete(e.gamepad.index);
  renderDevices();
});
function renderDevices() {
  const list = pads();
  $("#devices").innerHTML = list.length
    ? list
        .map(
          (p) =>
            `<div class="device" data-pad="${p.index}"><b></b><pre></pre><button data-action="fire">設定射擊</button><button data-action="bomb">設定炸彈</button><button data-action="pause">設定暫停</button></div>`,
        )
        .join("")
    : "<p>未偵測到手掣。請在已連接嘅手掣按一下按鈕。</p>";
  list.forEach((p) => {
    $(`[data-pad="${p.index}"] b`).textContent =
      `${assignments.indexOf(p.index) >= 0 ? "P" + (assignments.indexOf(p.index) + 1) : "未加入"} · ${p.id}`;
  });
  $("#devices")
    .querySelectorAll("button")
    .forEach(
      (b) =>
        (b.onclick = () => {
          capture = {
            index: Number(b.parentElement.dataset.pad),
            action: b.dataset.action,
          };
          $("#mapping").textContent =
            "請按想用作「" + b.textContent.replace("設定", "") + "」嘅按鈕…";
        }),
    );
}
let deviceSignature = "";
function poll() {
  if (window.lan?.active) { window.lan.poll(); return; }
  for (const p of pads()) {
    const c = config(p),
      prev = previous.get(p.index) || [],
      pressed = p.buttons.map((b) => b.pressed),
      edge = (i) => pressed[i] && !prev[i];
    const fresh = pressed.findIndex((v, i) => v && !prev[i]);
    if (capture && capture.index === p.index && fresh >= 0) {
      const next = { ...c };
      for (const action of ["fire", "bomb", "pause"])
        if (action !== capture.action && next[action] === fresh)
          next[action] = c[capture.action];
      next[capture.action] = fresh;
      bindings[p.id] = next;
      try {
        localStorage.setItem("catfighter-bindings", JSON.stringify(bindings));
      } catch {}
      capture = null;
      $("#mapping").textContent = "已儲存按鍵設定。";
    } else if ($("#settings").open && edge(c.bomb)) {
      $("#settings").close();
    } else if (!$("#settings").open) {
      if (!assignments.includes(p.index) && fresh >= 0) {
        const slot = assignments.indexOf(null);
        if (
          slot >= 0 &&
          (mode === "ready" ||
            mode === "over" ||
            mode === "win" ||
            mode === "paused")
        ) {
          if (mode !== "paused" || players.some(p=>(p.controlSlot ?? p.index)===slot)) {
            assignments[slot] = p.index;
            joined[slot] = true;
            sfx.playSfx("playerJoined");
          }
        }
      } else if (assignments.includes(p.index)) {
        const slot=assignments.indexOf(p.index);
        const playerIndex=players.findIndex(p=>(p.controlSlot ?? p.index)===slot);
        if (mode === "ready" && !joined[slot] && fresh>=0) {
          joined[slot]=true; previous.set(p.index,pressed); updateHUD(); continue;
        }
        if (mode === "ready" && (edge(14)||edge(15)||edge(0))) {
          aircraft[slot]=1-aircraft[slot]; $("#aircraft-"+slot).value=aircraft[slot];
          previous.set(p.index,pressed); updateHUD(); continue;
        }
        if (edge(c.fire) && mode === "playing" && playerIndex >= 0 && tryRejoin(playerIndex)) {
          previous.set(p.index, pressed);
          continue;
        }
        if (edge(c.pause)) {
          if (mode === "playing" || mode === "paused") pause();
          else start();
        } else if (edge(c.fire) && mode !== "playing") {
          if (mode === "paused") pause();
          else start();
        }
        if (edge(c.bomb) && mode === "playing" && playerIndex >= 0)
          bomb(players[playerIndex]);
      }
    }
    previous.set(p.index, pressed);
  }
  if ($("#settings").open) {
    const sig = pads()
      .map((p) => p.index + ":" + assignments.indexOf(p.index))
      .join(",");
    if (sig !== deviceSignature) {
      deviceSignature = sig;
      renderDevices();
    }
    pads().forEach((p) => {
      const el = $(`[data-pad="${p.index}"] pre`);
      if (el)
        el.textContent = `Axes: ${p.axes.map((x) => x.toFixed(2)).join(" / ")}\nButtons: ${
          p.buttons
            .map((b, i) => (b.pressed ? i : null))
            .filter((x) => x !== null)
            .join(", ") || "—"
        }\n射擊 ${config(p).fire} · 炸彈 ${config(p).bomb} · 暫停 ${config(p).pause}`;
    });
  }
}
function input(i) {
  const networkInput = window.lan?.active && window.lan.inputFor(i);
  if (networkInput) return networkInput;
  const playerIndex = i;
  i = players[i]?.controlSlot ?? i;
  const p = pads().find((p) => p.index === assignments[i]);
  const k = i
    ? ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "KeyK"]
    : ["KeyA", "KeyD", "KeyW", "KeyS", "KeyF"];
  let x = Number(keys.has(k[1])) - Number(keys.has(k[0])),
    y = Number(keys.has(k[3])) - Number(keys.has(k[2])),
    fire = keys.has(k[4]);
  if (p) {
    const dz = (v) => (Math.abs(v || 0) > deadzone ? v : 0);
    x +=
      dz(p.axes[0]) +
      Number(p.buttons[15]?.pressed || false) -
      Number(p.buttons[14]?.pressed || false);
    y +=
      dz(p.axes[1]) +
      Number(p.buttons[13]?.pressed || false) -
      Number(p.buttons[12]?.pressed || false);
    fire ||= p.buttons[config(p).fire]?.pressed;
  }
  // Touch owns P1 while held; controls.js places its target ahead of the finger.
  if (window.flightControls?.targetFor(playerIndex)) {
    const target = window.flightControls.targetFor(playerIndex);
    if (target) {
      x = target.x - players[playerIndex].x;
      y = target.y - players[playerIndex].y;
    }
    fire = true;
  }
  const n = Math.hypot(x, y);
  if (n > 1) {
    x /= n;
    y /= n;
  }
  return { x, y, fire };
}
function explode(x, y, color = "#f5c879", n = 16) {
  for (let i = 0; i < n; i++)
    sparks.push({
      x,
      y,
      vx: rnd(-150, 150),
      vy: rnd(-150, 150),
      life: rnd(0.2, 0.7),
      color,
    });
  sfx.playSfx("explosion");
}
function burstBossDebris(e, stage) {
  // Large, escalating armour failures: the last threshold becomes a true
  // screen-filling breakup while staying presentation-only.
  const count = 22 + stage * 14;
  // Authored variation leaves the gameplay random sequence untouched.
  for (let i = 0; i < count; i++) {
    const angle = i * Math.PI * 2 / count + stage * .71;
    const speed = 170 + stage * 32 + (i % 5) * 29;
    const duration = 1.7 + (i % 6) * .16;
    bossDebris.push({
      x: e.x + Math.cos(angle) * (44 + (i % 4) * 24),
      y: e.y + Math.sin(angle) * 28 + 5,
      vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed * .72 - 58,
      angle, spin: (i % 2 ? -1 : 1) * (6 + i % 7),
      width: 13 + stage * 2 + (i % 4) * 5, height: 6 + stage + i % 5,
      life: duration, duration,
      color: ['#d6b270', '#91a7a7', '#947553', '#c6854b'][i % 4],
    });
  }
  if (bossDebris.length > 240) bossDebris.splice(0, bossDebris.length - 240);
}
function updateBossDebris(dt) {
  if (mode !== 'playing') return;
  const drag = Math.exp(-1.1 * dt);
  for (const piece of bossDebris) {
    piece.x += piece.vx * dt;
    piece.y += piece.vy * dt;
    piece.vx *= drag;
    piece.vy = piece.vy * drag + 95 * dt;
    piece.angle += piece.spin * dt;
    piece.life -= dt;
  }
  bossDebris = bossDebris.filter(piece => piece.life > 0);
}
function damageEnemy(e, amount) {
  const before = e.type === "boss" ? bossDamageStage(e) : 0;
  if (e.type === "boss" && e.max > 0 && e.hp > 0) {
    // Split crossing hits so bombs and volleys cannot bypass rage resistance.
    const normalDamage = Math.min(amount, Math.max(0, e.hp - e.max * .10));
    amount = normalDamage + (amount - normalDamage) * LEVEL1.bossRageDamageMultiplier;
  }
  e.hp -= amount;
  if (e.hp < 1e-9) e.hp = 0;
  if (e.type === "boss" && bossDamageStage(e) > before) {
    const raging = e.hp > 0 && bossDamageStage(e) === 4;
    if (!raging) hostile = [];
    e.revealUntil = raging ? 0 : elapsed + 1.5;
    e.shoot = raging ? 0 : 0.35 / loopDifficulty();
    e.damageReactUntil = elapsed + .8;
    for (let stage = before + 1; stage <= bossDamageStage(e); stage++) burstBossDebris(e, stage);
  }
}
function bomb(p) {
  if (window.lan?.active && !window.lan.applying) {
    if (window.lan.guest) { if (p?.index === 1) window.lan.command('bomb'); return; }
    if (p && !window.lan.owns(p.index)) return;
  }
  if (mode !== "playing" || loopTransition > 0 || !p || p.lives <= 0 || p.respawn > 0 || p.entering || p.bombs <= 0) return;
  p.bombs--;
  flash = 0.35;
  hostile = [];
  for (const e of enemies) {
    damageEnemy(e, e.type === "boss" ? 95 : 100);
    if (e.hp <= 0) kill(e, p);
    if (loopTransition > 0) break;
  }
  enemies = enemies.filter((e) => e.hp > 0);
  sfx.playSfx("bomb");
}
function kill(e, p) {
  if (e.killed) return;
  e.killed = true;
  score += ENEMY_DEFINITIONS[e.type].score;
  explode(
    e.x,
    e.y,
    e.type === "boss" ? "#ffb772" : "#e7b861",
    e.type === "boss" ? 70 : 18,
  );
  if (e.type === "boss") {
    bossWreck = { ...e, hp: 0, damageReactUntil: 0 };
    completeLoop();
  } else if (e.reward) supply(e.x, e.y, e.reward.type, e.reward.weapon);
}
function rewardCarrier(x, type, weapon) {
  enemies.push({type:"heavy",x,y:-80,hp:ENEMY_DEFINITIONS.heavy.baseHP,
    v:ENEMY_DEFINITIONS.heavy.speed*loopDifficulty(),phase:0,shoot:2,age:0,
    reward:{type,weapon}});
}
function rewardActive() {
  return enemies.some(e => e.reward && !e.killed && e.hp > 0 && e.y < H + 70) ||
    drops.some(d => !d.dead && d.y < H + 20);
}
function supply(x, y, type, weaponType) {
  const weapon = type === "W" ? weaponType || ["rapid", "double", "spread"][Math.floor(Math.random() * 3)] : null;
  drops.push({ x, y, type, ...(type === "W" ? { weapon } : {}) });
}
function hurt(p) {
  if (p.inv > 0 || p.lives <= 0 || p.respawn > 0 || p.entering) return;
  p.lives--;
  const initial = pilot(p.index);
  p.level = initial.level;
  p.rapid = initial.rapid;
  p.cool = initial.cool;
  p.notice = '';
  p.noticeUntil = 0;
  p.respawn = p.lives > 0 ? 0.8 : 0;
  if (p.lives === 0 && players.length === 2) p.rejoinRemaining = 10;
  if (p.index === 0) window.flightControls?.reset();
  explode(p.x, p.y, "#b7e2d6", 24);
  if (!players.some((a) => a.lives > 0)) {
    mode = "over";
    show("GAME OVER", `第 ${loop} 輪 · 得分 ${score} · 再次出擊！`);
  }
}
function spawn() {
  wave++;
  const count = players.length === 2 ? LEVEL1.formationCount2P : LEVEL1.formationCount1P;
  // Keep heavy attributes even when the boat type wins (e.g. wave 35).
  const heavy = wave % LEVEL1.heavyWaveCadence === 0;
  const boat = wave % LEVEL1.boatWaveCadence === 0;
  for (let i = 0; i < (heavy ? LEVEL1.heavyWaveCount : count); i++) {
    const enemy = {
      type: boat ? "boat" : heavy ? "heavy" : "small",
      x: boat ? 230 + i * (210 / ((heavy ? LEVEL1.heavyWaveCount : count) - 1)) : heavy ? 160 + i * 280 : 70 + i * (460 / (count - 1)),
      y: -70 - i * 55,
      hp: heavy ? ENEMY_DEFINITIONS.heavy.baseHP : ENEMY_DEFINITIONS.small.baseHP,
      v: heavy ? ENEMY_DEFINITIONS.heavy.speed : LEVEL1.enemySpeedBase + elapsed * LEVEL1.enemySpeedPerSecond,
      phase: rnd(0, 6),
      shoot: rnd(1, 3),
      age: 0,
      difficulty: loopDifficulty(),
    };
    enemy.v *= enemy.difficulty;
    if (!heavy && !boat) configureSmallFlight(enemy, wave, i, count);
    // A single BOMB carrier appears only every third heavy formation (waves
    // 15, 30, ...), so the two-plane medium-boss wave is no longer a bonus farm.
    if (enemy.type === "heavy" && i === 0 && !rewardActive() && (wave / LEVEL1.heavyWaveCadence) % LEVEL1.heavyBombCadence === 0)
      enemy.reward={type:"B"};
    enemies.push(enemy);
  }
}
function update(dt) {
  if (mode !== "playing") return;
  if (loopTransition > 0) {
    loopTransition = Math.max(0, loopTransition - dt);
    flash = Math.max(0, flash - dt);
    if (loopTransition === 0) nextLoop();
    return;
  }
  elapsed += dt;
  // Queue one recovery carrier; existing rewards must leave the field first.
  if (recoveryRewardPending && !rewardActive()) {
    rewardCarrier(rnd(80, 520), "W", ["rapid", "double", "spread"][Math.floor(Math.random() * 3)]);
    recoveryRewardPending = false;
  }
  if (elapsed >= nextSupply && nextSupply < LEVEL1.preBossDuration && !rewardActive()) {
    const supplyX = rnd(80, 520);
    // Defer each reward until the previous carrier/drop is gone.
    rewardCarrier(supplyX, "W", ["rapid", "double", "spread"][Math.round(nextSupply / LEVEL1.pickupInterval) - 1]);
    nextSupply += LEVEL1.pickupInterval;
  }
  if (!extraLifeSpawned && elapsed >= LEVEL1.extraLifeTime && !rewardActive()) {
    extraLifeSpawned = true;
    rewardCarrier(300, "1UP");
  }
  flash = Math.max(0, flash - dt);
  if (elapsed < LEVEL1.preBossDuration && elapsed >= wave * LEVEL1.waveInterval) spawn();
  if (elapsed >= LEVEL1.bossSpawnTime && !bossSpawned) {
    bossSpawned = true;
    enemies.push({
      type: "boss",
      x: 300,
      y: -100,
      hp: Math.round((players.length === 2 ? LEVEL1.bossHP2P : LEVEL1.bossHP1P) * loopDifficulty()),
      max: Math.round((players.length === 2 ? LEVEL1.bossHP2P : LEVEL1.bossHP1P) * loopDifficulty()),
      age: 0,
      shoot: 1,
    });
  }
  for (const p of players) {
    if (p.lives <= 0) {
      p.rejoinRemaining = Math.max(0, (p.rejoinRemaining || 0) - dt);
      continue;
    }
    if (p.respawn > 0) {
      p.respawn = Math.max(0, p.respawn - dt);
      if (p.respawn === 0) {
        p.x = p.index ? 365 : 235;
        p.y = H + 55;
        p.entering = true;
        recoveryRewardPending = true;
        p.inv = 3;
        p.cool = 0;
      }
      continue;
    }
    if (p.entering) {
      p.y = Math.max(690, p.y - 220 * dt);
      if (p.y === 690) { p.entering = false; p.inv = 3; }
      continue;
    }
    p.inv -= dt;
    p.cool -= dt;
    const a = input(p.index);
    const touchTarget = window.lan?.active && p.index === 1
      ? window.lan.targetFor(1) : window.flightControls?.targetFor(p.index);
    // Stop exactly at a nearby touch target instead of overshooting every frame.
    const arrived = touchTarget && Math.hypot(touchTarget.x - p.x, touchTarget.y - p.y) <= 260 * dt;
    p.x = clamp(arrived ? touchTarget.x : p.x + a.x * 260 * dt, 24, W - 24);
    p.y = clamp(arrived ? touchTarget.y : p.y + a.y * 260 * dt, 60, H - 25);
    if (a.fire && p.cool <= 0) {
      p.cool = p.rapid ? 0.06 : 0.12;
      for (let j = 0; j < p.level; j++) {
        const angle = p.level === 3 ? (j - 1) * LEVEL1.spreadShotAngle * Math.PI / 180 : 0;
        shots.push({
          x: p.x + (j - (p.level - 1) / 2) * 12,
          y: p.y - 25,
          vx: Math.sin(angle) * 550,
          vy: -Math.cos(angle) * 550,
          owner: p,
        });
      }
      sfx.playSfx("fire");
    }
  }
  for (const s of shots) {
    s.y += (s.vy ?? -550) * dt;
    s.x += s.vx * dt;
  }
  for (const e of enemies) {
    e.age += dt;
    if (e.type === "boss") {
      e.y = Math.min(135, e.y + 50 * dt);
      e.x = 300 + Math.sin(e.age * 0.55 * loopDifficulty()) * 155;
    } else if (e.type === "small" && e.flight) {
      moveSmallFlight(e, dt, players);
    } else {
      e.y += e.v * dt;
      e.x += Math.sin(e.age * 2 + e.phase) * 25 * dt;
      // Painted islands occupy the margins; keep the entire hull offshore.
      if (e.type === "boat") e.x = clamp(e.x, 230, 440);
    }
    const revealing = enemies.some(enemy => enemy.type === "boss" && elapsed < (enemy.revealUntil || 0));
    const bossPhase = e.type === "boss" ? bossDamageStage(e) : 0;
    if (!revealing) e.shoot -= dt;
    if (!revealing && e.chargeState !== "windup" && e.chargeState !== "charging" && e.shoot <= 0 && e.y > 0 && (!e.flight ||
        (e.visibleAge >= .75 && e.x > 20 && e.x < W - 20 && e.y < H - 140))) {
      e.shoot =
        e.type === "boss"
          ? LEVEL1.bossAttackIntervals[bossPhase]
          : e.type === "heavy"
            ? 1.5
            : 3.2;
      e.shoot /= loopDifficulty();
      const target = players
        .filter((p) => p.lives > 0 && p.respawn === 0 && !p.entering)
        .sort((a, b) => Math.abs(a.x - e.x) - Math.abs(b.x - e.x))[0];
      if (target) {
        const base = Math.atan2(target.y - e.y, target.x - e.x)
          + (e.type === "boss" && bossPhase === 2 ? Math.sin(e.age * 2) * .3 : 0);
        const n = e.type === "boss" ? LEVEL1.bossAttackCounts[bossPhase] : e.type === "heavy" ? 3 : 1;
        const bulletSpeed = e.type === "boss" && bossPhase === 4 ? LEVEL1.bossRageBulletSpeed : 150;
        for (let j = 0; j < n; j++) {
          const ang =
            base + (j - (n - 1) / 2) * (e.type === "boss" ? 0.2 : 0.18);
          hostile.push({
            x: e.x,
            y: e.y + 20,
            vx: Math.cos(ang) * bulletSpeed * loopDifficulty(),
            vy: Math.sin(ang) * bulletSpeed * loopDifficulty(),
          });
        }
      }
    }
    const radius = ENEMY_DEFINITIONS[e.type].hitHalfWidth;
    for (const s of shots) {
      if (
        !s.dead &&
        Math.abs(s.x - e.x) < radius &&
        Math.abs(s.y - e.y) < ENEMY_DEFINITIONS[e.type].hitHalfHeight
      ) {
        s.dead = true;
        damageEnemy(e, 1);
        if (e.hp <= 0) {
          kill(e, s.owner);
          if (loopTransition > 0) return;
          break;
        }
      }
    }
    for (const p of players)
      if (Math.abs(p.x - e.x) < ENEMY_DEFINITIONS[e.type].contactHalfWidth + 13 && Math.abs(p.y - e.y) < 35)
        hurt(p, 30);
    if (mode === "over") return;
  }
  for (const b of hostile) {
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    for (const p of players)
      if (!b.dead && Math.hypot(p.x - b.x, p.y - b.y) < 14 && p.lives > 0 && p.respawn === 0) {
        hurt(p, 15);
        b.dead = true;
      }
    if (mode === "over") return;
  }
  for (const d of drops) {
    d.y += 75 * dt;
    for (const p of players)
      if (p.lives > 0 && p.respawn === 0 && !p.entering && !d.dead && Math.hypot(d.x - p.x, d.y - p.y) < 29) {
        d.dead = true;
        if (d.type === "W") {
          if (d.weapon === "rapid") p.rapid = true;
          else {
            // Only a different firing pattern removes the current speed bonus.
            // Unspecified legacy W drops still advance the pattern by one level.
            const nextLevel = d.weapon ? (d.weapon === "double" ? 2 : 3) : Math.min(3, p.level + 1);
            if (nextLevel !== p.level) p.rapid = false;
            p.level = nextLevel;
          }
        }
        if (d.type === "1UP") p.lives++;
        if (d.type === "B") p.bombs = Math.min(5, p.bombs + 1);
        p.notice = d.type === "1UP" ? "1UP" : d.type === "W"
          ? d.weapon === "rapid" ? "RAPID FIRE" : d.weapon === "double" ? "2-WAY" : d.weapon === "spread" ? "3-WAY" : `POWER ${p.level}`
          : `BOMB ×${p.bombs}`;
        p.noticeUntil = elapsed + 1.5;
        explode(d.x, d.y, d.type === "1UP" ? "#91e3bd" : "#efd58d", 12);
        sfx.playSfx("pickup");
      }
  }
  shots = shots.filter((s) => !s.dead && s.y > -20 && s.x > -20 && s.x < W + 20);
  hostile = hostile.filter(
    (b) => !b.dead && b.y < H + 20 && b.x > -20 && b.x < W + 20 && b.y > -100,
  );
  enemies = enemies.filter((e) => e.hp > 0 && !e.exited && e.y < H + 70);
  drops = drops.filter((d) => !d.dead && d.y < H + 20);
}
// Snapshot scalar values and pass the current arrays without copying entities.
function draw() {
  render({
    mode,
    ambient,
    elapsed,
    loop,
    loopTransition,
    bossWreck,
    score,
    enemies,
    drops,
    players,
    shots,
    hostile,
    sparks,
    bossDebris,
    flash,
    playerVisuals: players.map((p) => ({
      id: playerAssetId(p.aircraft ?? p.index),
      state: selectPlayerVisualState(p, input(p.index)),
    })),
  });
}
function updateHUD() {
  $("#join-p1").textContent = joined[0] ? "P1 已加入 · 點此退出" : "P1 加入";
  $("#join").textContent = joined[1] ? "P2 已加入 · 點此退出" : "P2 加入";
  $("#lobby-status").textContent = joined.filter(Boolean).length + " 位已加入 · " + (joined.every(Boolean) ? "雙人" : "單人") + " · 選機後按 START";
  window.flightControls?.sync();
  $("#score").textContent = String(score).padStart(6, "0");
  $("#status").textContent =
    mode === "playing"
      ? loopTransition > 0 ? `LOOP ${loop} CLEAR`
      : `L${loop} · ` + (elapsed < LEVEL1.preBossDuration
        ? "WAVE " + String(wave).padStart(2, "0")
        : "BOSS")
      : mode.toUpperCase();
  $("#pilots").innerHTML = [0, 1]
    .map((i) => {
      const p = players.find(p=>(p.controlSlot ?? p.index)===i), active=joined[i];
      return `<div class="pilot ${i ? "p2" : ""}"><b>P${i + 1} · ${aircraft[i] ? "MINT" : "GINGER"}</b><span>${active ? "已加入" : "等待加入"}</span>${p ? `<span>生命 ${p.lives} · 炸彈 ${p.bombs}</span>` : ""}</div>`;
    })
    .join("");
}
let hudClock = 0;
function frame(ts) {
  const dt = Math.min((ts - last) / 1000 || 0, 0.035);
  last = ts;
  if (window.arcade?.frame(dt)) {
    requestAnimationFrame(frame);
    return;
  }
  if (window.lan?.guest) {
    poll();
    window.lan.tick(ts);
    draw();
    requestAnimationFrame(frame);
    return;
  }
  ambient += dt;
  poll();
  if (mode === "playing") update(dt);
  updateBossDebris(dt);
  for (const s of sparks) {
    s.x += s.vx * dt;
    s.y += s.vy * dt;
    s.life -= dt;
  }
  sparks = sparks.filter((s) => s.life > 0);
  draw();
  window.lan?.tick(ts);
  hudClock += dt;
  if (hudClock > 0.15) {
    updateHUD();
    hudClock = 0;
  }
  requestAnimationFrame(frame);
}
updateHUD();
requestAnimationFrame(frame);
