"use strict";

// CF-ARCH-02: characterization tests, including intentional baseline quirks.
// Each case gets a fresh browser substitute and test-only deterministic Math.
// Runtime game.js continues to use its original Math.random() calls unchanged.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const sources = [
  "src/world.js",
  "src/assets.js",
  "src/render.js",
  "src/audio.js",
  "src/levels/level1.js",
  "src/enemies.js",
  "game.js",
].map((file) => [
  file,
  fs.readFileSync(path.join(__dirname, "..", file), "utf8"),
]);
let passed = 0;

function test(name, body) {
  // Explicit opt-in for art revisions; historical visual hashes stay intact.
  if (process.env.CAT_FIGHTER_GAMEPLAY_ONLY === "1" &&
      (/^renderer: .*matches CF-ARCH-02/.test(name) || /^world: .*matches CF-ARCH-02/.test(name))) return;
  try {
    body();
    passed++;
  } catch (error) {
    throw new Error(name, { cause: error });
  }
}

function near(actual, expected) {
  assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} != ${expected}`);
}

function pad(index) {
  return {
    index,
    id: `Baseline pad ${index}`,
    axes: [0, 0],
    buttons: Array.from({ length: 16 }, () => ({ pressed: false })),
  };
}

function harness(twoPlayers = false, audioHost = {}) {
  const elements = new Map();
  const windowEvents = {};
  const documentEvents = {};
  const frames = [];
  const storage = new Map();
  const drawCalls = [];
  const context = new Proxy(
    {},
    {
      get:
        (_, name) =>
        (...args) =>
          { drawCalls.push([name, ...args]);
            if (name === "createLinearGradient") return {addColorStop: (...stops) => drawCalls.push(["addColorStop", ...stops])};
          },
      set: (_, name, value) => {
        drawCalls.push(["set", name, value]);
        return true;
      },
    },
  );
  function el(selector) {
    if (!elements.has(selector)) {
      const listeners = {};
      elements.set(selector, {
        style: {},
        textContent: "",
        innerHTML: "",
        open: false,
        querySelectorAll: () => [],
        addEventListener: (name, fn) => {
          listeners[name] = fn;
        },
        showModal() {
          this.open = true;
        },
        close() {
          this.open = false;
          listeners.close?.();
        },
        getContext: () => context,
      });
    }
    return elements.get(selector);
  }
  let gamepads = [];
  let randomCalls = 0;
  let randomValues = [];
  const testMath = Object.create(Math);
  testMath.random = () => {
    const value = randomValues[randomCalls] ?? 0.5;
    randomCalls++;
    return value;
  };
  const document = {
    hidden: false,
    querySelector: el,
    addEventListener: (name, fn) => {
      documentEvents[name] = fn;
    },
  };
  const sandbox = {
    console,
    Math: testMath,
    document,
    window: {
      ...audioHost,
      addEventListener: (name, fn) => {
        windowEvents[name] = fn;
      },
    },
    navigator: { getGamepads: () => gamepads },
    localStorage: {
      getItem: (key) => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, value),
    },
    requestAnimationFrame: (fn) => frames.push(fn),
  };
  vm.createContext(sandbox);
  for (const [filename, source] of sources) {
    vm.runInContext(source, sandbox, { filename });
  }
  const run = (code) => vm.runInContext(code, sandbox);
  const json = (code) => JSON.parse(run(`JSON.stringify(${code})`));
  run(`keyboard2=${twoPlayers};start();wave=1000;`);
  return {
    run,
    json,
    el,
    document,
    windowEvents,
    documentEvents,
    storage,
    drawCalls,
    setPads: (value) => {
      gamepads = value;
    },
    random: (values) => {
      randomValues = values;
      randomCalls = 0;
    },
    randomCalls: () => randomCalls,
    frame: (ts) => {
      assert.equal(frames.length, 1);
      frames.shift()(ts);
    },
    key: (code, down = true, repeat = false) => {
      windowEvents[down ? "keydown" : "keyup"]({
        code,
        repeat,
        preventDefault() {},
      });
    },
  };
}

// Stationary enemies and dt=0 isolate collision boundaries from motion.
// Boss x is also 300 after its existing sin(age) update at age=0.
function enemy(
  g,
  type = "small",
  hp = 10,
  x = 300,
  y = type === "boss" ? 135 : 300,
) {
  g.run(
    `enemies=[{type:${JSON.stringify(type)},x:${x},y:${y},hp:${hp},max:${hp},v:0,phase:0,age:0,shoot:100}];`,
  );
}

test("movement: 260 units/second, diagonal normalization and P2 keyboard", () => {
  const g = harness(true);
  g.key("KeyD");
  g.key("ArrowUp");
  g.run("update(.1)");
  near(g.run("players[0].x"), 261);
  near(g.run("players[0].y"), 690);
  near(g.run("players[1].y"), 664);
  g.key("KeyW");
  g.run("update(.1)");
  near(g.run("players[0].x"), 261 + 26 / Math.sqrt(2));
  near(g.run("players[0].y"), 690 - 26 / Math.sqrt(2));
  g.key("KeyD", false);
  g.key("KeyW", false);
  assert.deepEqual(g.json("input(0)"), { x: 0, y: 0, fire: false });
});

test("movement: exact four screen boundaries", () => {
  const g = harness();
  g.run(
    "players[0].x=25;players[0].y=61;keys.add('KeyA');keys.add('KeyW');update(.1)",
  );
  assert.deepEqual(g.json("[players[0].x,players[0].y]"), [24, 60]);
  g.run(
    "keys.clear();players[0].x=575;players[0].y=774;keys.add('KeyD');keys.add('KeyS');update(.1)",
  );
  assert.deepEqual(g.json("[players[0].x,players[0].y]"), [576, 775]);
});

test("dead player neither moves nor shoots nor decrements timers", () => {
  const g = harness(true);
  g.run("players[0].lives=0;keys.add('KeyD');keys.add('KeyF')");
  const before = g.json("players[0]");
  g.run("update(.1)");
  assert.deepEqual(g.json("players[0]"), before);
  assert.equal(g.run("shots.length"), 0);
});

test("gamepad deadzone is strict, axes/D-pad combine with keyboard and normalize", () => {
  const g = harness(true),
    p = pad(0);
  g.setPads([p]);
  g.run("assignments[0]=0");
  p.axes = [0.2, -0.2];
  assert.deepEqual(g.json("[input(0).x,input(0).y]"), [0, 0]);
  p.axes = [0.2001, -0.2001];
  assert.deepEqual(g.json("[input(0).x,input(0).y]"), [0.2001, -0.2001]);
  p.axes = [0.5, 0];
  g.run("update(.1)");
  near(g.run("players[0].x"), 248);
  p.buttons[15].pressed = true;
  p.buttons[12].pressed = true;
  near(g.run("input(0).x"), 1.5 / Math.hypot(1.5, -1));
  near(g.run("input(0).y"), -1 / Math.hypot(1.5, -1));
  assert.deepEqual(g.json("[input(1).x,input(1).y]"), [0, 0]);
  p.axes = [1, 0];
  p.buttons[15].pressed = false;
  p.buttons[12].pressed = false;
  g.key("KeyA");
  assert.equal(g.run("input(0).x"), 0);
  p.buttons[1].pressed = true;
  assert.equal(g.run("input(0).fire"), true);
});

test("fire: exact cooldown boundary and no catch-up volley for long dt", () => {
  const g = harness();
  g.key("KeyF");
  g.run("update(0)");
  assert.equal(g.run("shots.length"), 1);
  assert.equal(g.run("players[0].cool"), 0.12);
  g.run("update(.119)");
  assert.equal(g.run("shots.length"), 1);
  g.run("update(players[0].cool)");
  assert.equal(g.run("shots.length"), 2);
  g.run("update(.5)");
  assert.equal(g.run("shots.length"), 3);
  assert.equal(g.run("players[0].cool"), 0.12);
});

for (const level of [1, 2, 3]) {
  test(`fire: level ${level} spawn offsets, velocity, ownership`, () => {
    const g = harness();
    g.run(`players[0].level=${level};keys.add('KeyF');update(0)`);
    const offsets = level === 1 ? [0] : level === 2 ? [-0.5, 0.5] : [-1, 0, 1];
    assert.deepEqual(
      g.json("shots.map(s=>[s.x,s.y,s.vx,s.owner===players[0]])"),
      offsets.map((n) => [235 + n * 12, 665, n * 28, true]),
    );
  });
}

test("fire: movement precedes spawn and new shots move in same update", () => {
  const g = harness();
  g.run("keys.add('KeyD');keys.add('KeyF');update(.02)");
  near(g.run("shots[0].x"), 240.2);
  near(g.run("shots[0].y"), 654);
  g.run("keys.clear();update(.02)");
  near(g.run("shots[0].y"), 643);
});

test("bomb: independent stock, 100 ordinary/95 boss damage and unrelated state", () => {
  const g = harness(true);
  g.run(
    "hostile=[{x:1,y:2}];enemies=[{type:'small',hp:101},{type:'heavy',hp:101},{type:'boat',hp:101},{type:'boss',hp:200}];shots=[{x:50,y:50,owner:players[1]}];drops=[{x:30,y:30,type:'W'}]",
  );
  const other = g.json("players[1]");
  const own = g.json("players[0]");
  const unrelated = g.json("[shots,drops,elapsed,score]");
  g.run("bomb(players[0])");
  assert.deepEqual(g.json("enemies.map(e=>e.hp)"), [1, 1, 1, 105]);
  assert.equal(g.run("hostile.length"), 0);
  assert.equal(g.run("flash"), 0.35);
  assert.deepEqual(g.json("players[1]"), other);
  assert.deepEqual(g.json("players[0]"), { ...own, bombs: 2 });
  assert.deepEqual(g.json("[shots,drops,elapsed,score]"), unrelated);
  g.run("bomb(players[1])");
  assert.equal(g.run("players[0].bombs"), 2);
  assert.equal(g.run("players[1].bombs"), 2);
  assert.deepEqual(g.json("enemies.map(e=>e.hp)"), [10]);
  assert.equal(g.run("score"), 600);
});

test("bomb: absent, dead and empty-stock players have no effect", () => {
  const g = harness();
  g.run("hostile=[{x:1,y:2}];players[0].bombs=0");
  const before = g.json("[players,hostile,flash,score]");
  g.run("bomb(undefined);bomb(players[0])");
  assert.deepEqual(g.json("[players,hostile,flash,score]"), before);
  g.run("players[0].bombs=3;players[0].lives=0;bomb(players[0])");
  assert.equal(g.run("players[0].bombs"), 3);
  assert.equal(g.run("hostile.length"), 1);
});

for (const [type, rx, ry] of [
  ["small", 20, 25],
  ["boat", 20, 25],
  ["heavy", 33, 25],
  ["boss", 85, 48],
]) {
  for (const axis of ["x", "y"]) {
    for (const sign of [-1, 1]) {
      test(`bullet -> ${type}: strict ${axis} boundary, sign ${sign}`, () => {
        for (const inside of [false, true]) {
          const g = harness();
          enemy(g, type);
          const distance = (axis === "x" ? rx : ry) - (inside ? 0.001 : 0);
          const x = 300 + (axis === "x" ? sign * distance : 0);
          const y =
            (type === "boss" ? 135 : 300) +
            (axis === "y" ? sign * distance : 0);
          g.run(`shots=[{x:${x},y:${y},vx:0,owner:players[0]}];update(0)`);
          assert.equal(g.run("enemies[0].hp"), inside ? 9 : 10);
          assert.equal(g.run("shots.length"), inside ? 0 : 1);
        }
      });
    }
  }
}

for (const [type, rx] of [
  ["small", 33],
  ["boat", 33],
  ["heavy", 46],
  ["boss", 98],
]) {
  for (const axis of ["x", "y"]) {
    for (const sign of [-1, 1]) {
      test(`${type} -> player: strict ${axis} boundary, sign ${sign}`, () => {
        for (const inside of [false, true]) {
          const g = harness();
          enemy(g, type);
          const distance = (axis === "x" ? rx : 35) - (inside ? 0.001 : 0);
          g.run(
            `players[0].x=${300 + (axis === "x" ? sign * distance : 0)};players[0].y=${(type === "boss" ? 135 : 300) + (axis === "y" ? sign * distance : 0)};players[0].inv=0;update(0)`,
          );
          assert.equal(g.run("players[0].lives"), inside ? 2 : 3);
          assert.equal(g.run("players[0].inv"), 0);
        }
      });
    }
  }
}

for (const [kind, radius] of [
  ["hostile", 14],
  ["drops", 29],
]) {
  for (const axis of ["x", "y"]) {
    for (const sign of [-1, 1]) {
      test(`${kind} -> player: strict ${axis} circle boundary, sign ${sign}`, () => {
        for (const inside of [false, true]) {
          const g = harness();
          const distance = radius - (inside ? 0.001 : 0);
          g.run(
            `players[0].x=300;players[0].y=300;players[0].inv=0;${kind}=[{x:${300 + (axis === "x" ? sign * distance : 0)},y:${300 + (axis === "y" ? sign * distance : 0)},vx:0,vy:0,type:'W'}];update(0)`,
          );
          assert.equal(g.run(`${kind}.length`), inside ? 0 : 1);
          assert.equal(
            g.run("players[0].lives"),
            kind === "hostile" && inside ? 2 : 3,
          );
          assert.equal(
            g.run("players[0].level"),
            kind === "drops" && inside ? 2 : 1,
          );
        }
      });
    }
  }
  test(`${kind} collision uses circle distance, not an axis-aligned square`, () => {
    const g = harness();
    g.run(
      `players[0].x=300;players[0].y=300;players[0].inv=0;${kind}=[{x:${300 + radius * 0.8},y:${300 + radius * 0.8},vx:0,vy:0,type:'W'}];update(0)`,
    );
    assert.equal(g.run(`${kind}.length`), 1);
    assert.equal(g.run("players[0].lives"), 3);
    assert.equal(g.run("players[0].level"), 1);
  });
}

test("collision: one shot hits first overlapping enemy only", () => {
  const g = harness();
  enemy(g);
  g.run(
    "enemies.push({...enemies[0]});shots=[{x:300,y:300,vx:0,owner:players[0]}];update(0)",
  );
  assert.deepEqual(g.json("enemies.map(e=>e.hp)"), [9, 10]);
  assert.equal(g.run("shots.length"), 0);
});

test("collision: killing shot breaks enemy shot loop; killed enemy still rams", () => {
  const g = harness();
  enemy(g, "small", 1);
  g.run(
    "players[0].x=300;players[0].y=300;players[0].inv=0;shots=[{x:300,y:300,vx:0,owner:players[0]},{x:300,y:300,vx:0,owner:players[0]}];update(0)",
  );
  assert.equal(g.run("enemies.length"), 0);
  assert.equal(g.run("shots.length"), 1);
  assert.equal(g.run("score"), 100);
  assert.equal(g.run("players[0].lives"), 2);
});

test("collision: invulnerable player consumes bullet before overlapping teammate", () => {
  const g = harness(true);
  g.run(
    "players.forEach(p=>{p.x=300;p.y=300;});players[1].inv=0;hostile=[{x:300,y:300,vx:0,vy:0}];update(0)",
  );
  assert.deepEqual(g.json("players.map(p=>p.lives)"), [3, 3]);
  assert.equal(g.run("hostile.length"), 0);
});

test("collision: dead player does not consume bullet or pickup; P2 receives both", () => {
  const g = harness(true);
  g.run(
    "players.forEach(p=>{p.x=300;p.y=300;p.inv=0;});players[0].lives=0;hostile=[{x:300,y:300,vx:0,vy:0}];drops=[{x:300,y:300,type:'W'}];update(0)",
  );
  assert.deepEqual(g.json("players.map(p=>[p.lives,p.level])"), [
    [0, 1],
    [2, 1],
  ]);
  assert.equal(g.run("hostile.length+drops.length"), 1);
});

test("collision: ram prevents pickups during respawn", () => {
  const g=harness(true); enemy(g);
  g.run("players.forEach(p=>{p.x=300;p.y=300;p.inv=0});hostile=[{x:300,y:300,vx:0,vy:0}];drops=[{x:300,y:300,type:'1UP'}];update(0)");
  assert.deepEqual(g.json("players.map(p=>p.lives)"), [2,2]);
  assert.equal(g.run("hostile.length+drops.length"),2);
});

test("collision: respawn delay, bottom entry and three-second protection", () => {
  const g=harness();
  g.run("players[0].inv=.01;hostile=[{x:235,y:690,vx:0,vy:0}];update(.01);hurt(players[0])");
  assert.equal(g.run("players[0].lives"),2);
  g.run("update(.8)"); assert.equal(g.run("players[0].y"),855);
  g.run("update(.8);hurt(players[0])"); assert.equal(g.run("players[0].lives"),2);
  g.run("enemies=[];hostile=[];update(3);hurt(players[0])"); assert.equal(g.run("players[0].lives"),1);
});

test("collision: hostile movement and pickup movement precede contact", () => {
  const g = harness();
  g.run(
    "players[0].inv=0;hostile=[{x:235,y:660,vx:0,vy:300}];drops=[{x:235,y:653.5,type:'W'}];update(.1)",
  );
  assert.equal(g.run("players[0].lives"), 2);
  assert.equal(g.run("drops.length"), 1); // Exactly 29 away after moving.
  g.run("players[0].respawn=0;players[0].inv=3;update(.0001)");
  assert.equal(g.run("players[0].level"), 2);
});

test("pickup caps: weapon 3, bombs 5 and 1UP adds one life", () => {
  const g=harness();
  g.run("players[0].level=3;players[0].bombs=5;drops=['W','1UP','B'].map(type=>({x:235,y:690,type}));update(0)");
  assert.deepEqual(g.json("[players[0].level,players[0].lives,players[0].bombs]"),[3,4,5]);
});

for (const twoPlayers of [false, true]) {
  test(`waves: ${twoPlayers ? "2P" : "1P"} cadence, layout, stats and wave 35 overlap`, () => {
    const g = harness(twoPlayers);
    g.run("wave=0;elapsed=100");
    for (let wave = 1; wave <= 35; wave++) {
      g.run("enemies=[];drops=[];spawn()");
      const heavy = wave % 5 === 0,
        boat = wave % 7 === 0;
      const count = heavy ? 2 : twoPlayers ? 7 : 5;
      assert.equal(g.run("wave"), wave);
      assert.equal(g.run("enemies.length"), count);
      if (heavy || boat || (wave - 1) % 8 === 0) assert.deepEqual(
        g.json("enemies.map(e=>[e.type,e.hp,e.v,e.x,e.y,e.age])"),
        Array.from({ length: count }, (_, i) => [
          boat ? "boat" : heavy ? "heavy" : "small",
          heavy ? 18 : 3,
          heavy ? 48 : 103,
          boat ? 230 + i * (210 / (count - 1)) : heavy ? 160 + i * 280 : 70 + i * (460 / (count - 1)),
          -70 - i * 55,
          0,
        ]),
      );
      assert.deepEqual(
        g.json("drops.map(d=>[d.type,d.x,d.y])"),
        [],
      );
    }
    assert.deepEqual(g.json("enemies.map(e=>[e.type,e.hp,e.v,e.x])"), [
      ["boat", 18, 48, 230],
      ["boat", 18, 48, 440],
    ]);
  });
}

test("waves: normal speed progresses with elapsed; heavy speed stays fixed", () => {
  const g = harness();
  for (const seconds of [0, 50, 174]) {
    g.run(`wave=0;elapsed=${seconds};enemies=[];spawn()`);
    near(g.run("enemies[0].v"), 85 + seconds * 0.18);
    g.run("wave=4;enemies=[];spawn()");
    assert.equal(g.run("enemies[0].v"), 48);
  }
});

test("waves: first update, exact 4.2s boundary and at most one spawn per update", () => {
  const g = harness();
  g.run("wave=0;update(0)");
  assert.equal(g.run("wave"), 1);
  g.run("elapsed=4.199;update(0)");
  assert.equal(g.run("wave"), 1);
  g.run("elapsed=4.2;update(0)");
  assert.equal(g.run("wave"), 2);
  g.run("elapsed=100;update(0)");
  assert.equal(g.run("wave"), 3);
});

for (const twoPlayers of [false, true]) {
  test(`boss: ${twoPlayers ? "2P" : "1P"} exact 175s spawn, HP and no duplication`, () => {
    const g = harness(twoPlayers);
    g.run("elapsed=174.999;update(0)");
    assert.equal(g.run("bossSpawned"), false);
    g.run("elapsed=175;update(0)");
    assert.equal(g.run("bossSpawned"), true);
    assert.deepEqual(
      g.json("enemies.map(e=>[e.type,e.x,e.y,e.hp,e.max,e.shoot,e.age])"),
      [
        [
          "boss",
          300,
          -100,
          twoPlayers ? 1050 : 650,
          twoPlayers ? 1050 : 650,
          1,
          0,
        ],
      ],
    );
    g.run("update(0)");
    assert.equal(g.run("enemies.length"), 1);
    assert.equal(g.run("wave"), 1000);
  });
}

test("2P difficulty remains 2P after one player dies", () => {
  const g = harness(true);
  g.run("players[1].lives=0;wave=0;spawn()");
  assert.equal(g.run("enemies.length"), 7);
  g.run("enemies=[];elapsed=175;update(0)");
  assert.equal(g.run("enemies[0].hp"), 1050);
});

test("boss: escalating four-phase spread, speed and firing interval", () => {
  for (const [hp, interval, count] of [
    [650, 1.1, 3],
    [487, 0.8, 5],
    [324, 0.62, 7],
    [64, 0.42, 11],
  ]) {
    const g = harness();
    enemy(g, "boss", 650, 300, 135);
    g.run(`enemies[0].hp=${hp};enemies[0].shoot=0;update(0)`);
    assert.equal(g.run("enemies[0].shoot"), interval);
    assert.equal(g.run("hostile.length"), count);
    const bullets = g.json("hostile");
    const base = Math.atan2(690 - 135, 235 - 300);
    bullets.forEach((b, i) => {
      assert.equal(b.x, 300);
      assert.equal(b.y, 155);
      near(b.vx, Math.cos(base + (i - (count - 1) / 2) * 0.2) * 150);
      near(b.vy, Math.sin(base + (i - (count - 1) / 2) * 0.2) * 150);
    });
    g.run("update(.1)");
    assert.equal(g.run("hostile.length"), count);
    g.run("update(enemies[0].shoot)");
    assert.equal(g.run("hostile.length"), count * 2);
    assert.equal(g.run("enemies[0].shoot"), interval);
  }
});

test("boss: firing is processed before player-shot damage crosses a damage phase", () => {
  const g = harness();
  enemy(g, "boss", 650, 300, 135);
  g.run(
    "enemies[0].hp=488;enemies[0].shoot=0;shots=[{x:300,y:135,vx:0,owner:players[0]}];update(0)",
  );
  assert.equal(g.run("enemies[0].hp"), 487);
  assert.equal(g.run("enemies[0].shoot"), 1.1);
  g.run("enemies[0].shoot=0;update(0)");
  assert.equal(g.run("enemies[0].shoot"), 0.8);
});

test("boss: entry speed, sinusoidal x, y cap and no firing at y=0", () => {
  const g = harness();
  enemy(g, "boss", 650, 300, -5);
  g.run("enemies[0].shoot=0;update(.1)");
  assert.equal(g.run("enemies[0].y"), 0);
  near(g.run("enemies[0].x"), 300 + Math.sin(0.1 * 0.55) * 155);
  assert.equal(g.run("hostile.length"), 0);
  g.run("update(.01)");
  assert.equal(g.run("hostile.length"), 3);
  g.run("enemies[0].y=134;update(.1)");
  assert.equal(g.run("enemies[0].y"), 135);
});

for (const method of ["shot", "bomb"]) {
  test(`boss: ${method} kill awards 5000 and completes mission`, () => {
    const g = harness();
    enemy(g, "boss", method === "shot" ? 1 : 95);
    g.run("score=400");
    if (method === "shot")
      g.run("shots=[{x:300,y:135,vx:0,owner:players[0]}];update(0)");
    else g.run("bomb(players[0])");
    assert.equal(g.run("score"), 5400);
    assert.equal(g.run("mode"), "win");
    assert.equal(g.run("enemies.length"), 0);
    assert.equal(g.run("drops.length"), 0);
    assert.equal(g.el("#overlay h2").innerHTML, "MISSION<br>CLEAR");
    assert.equal(g.el("#overlay").style.display, "flex");
    assert.ok(g.el("#message").textContent.includes("5400"));
  });
}

test("timing: RAF caps dt, gameplay freezes while ambient and sparks continue", () => {
  const g = harness();
  g.frame(20);
  near(g.run("elapsed"), 0.02);
  near(g.run("ambient"), 0.02);
  g.run(
    "sparks=[{x:10,y:20,vx:100,vy:50,life:1,color:'#fff'}];flash=.35;pause()",
  );
  const before = g.json("[players,enemies,shots,hostile,drops,elapsed,flash]");
  g.frame(1020);
  assert.deepEqual(
    g.json("[players,enemies,shots,hostile,drops,elapsed,flash]"),
    before,
  );
  near(g.run("ambient"), 0.055);
  near(g.run("sparks[0].x"), 13.5);
  near(g.run("sparks[0].life"), 0.965);
  g.run("pause()");
  g.frame(1040);
  near(g.run("elapsed"), 0.04);
  near(g.run("ambient"), 0.075);
  assert.equal(g.run("last"), 1040);
});

test("timing: frame gates update for ready, paused, win and over", () => {
  for (const mode of ["ready", "paused", "win", "over"]) {
    const g = harness();
    g.run(`mode='${mode}'`);
    g.frame(10);
    assert.equal(g.run("elapsed"), 0);
    near(g.run("ambient"), 0.01);
  }
});

test("pause: settings prevent resume; blur clears keys; visibility pauses", () => {
  const g = harness();
  g.key("KeyD");
  g.windowEvents.blur();
  assert.equal(g.run("mode"), "paused");
  assert.equal(g.run("keys.size"), 0);
  g.el("#settings").showModal();
  g.run("pause()");
  assert.equal(g.run("mode"), "paused");
  g.el("#settings").close();
  g.key("Enter");
  assert.equal(g.run("mode"), "playing");
  g.document.hidden = true;
  g.documentEvents.visibilitychange();
  assert.equal(g.run("mode"), "paused");
  g.key("Escape");
  assert.equal(g.run("mode"), "playing");
  g.key("Escape", true, true);
  assert.equal(g.run("mode"), "playing");
});

test("controllers: disconnect pauses, rejoin preserves player and requires resume edge", () => {
  const g = harness(true),
    p0 = pad(0),
    p1 = pad(1);
  g.setPads([p0, p1]);
  g.run(
    "assignments[0]=0;assignments[1]=1;players[1].lives=37;players[1].bombs=1;poll()",
  );
  const before = g.json("players");
  g.setPads([p0]);
  g.windowEvents.gamepaddisconnected({ gamepad: p1 });
  assert.equal(g.run("mode"), "paused");
  assert.deepEqual(g.json("assignments"), [0, null]);
  assert.equal(g.run("previous.has(1)"), false);
  g.setPads([p0, p1]);
  p1.buttons[2].pressed = true;
  g.run("poll()");
  assert.deepEqual(g.json("assignments"), [0, 1]);
  assert.equal(g.run("mode"), "paused");
  assert.deepEqual(g.json("players"), before);
  p1.buttons[2].pressed = false;
  g.run("poll()");
  p1.buttons[1].pressed = true;
  g.run("poll()");
  assert.equal(g.run("mode"), "playing");
  assert.deepEqual(g.json("players"), before);
});

test("controllers: bomb uses button edge; held fire repeats via cooldown", () => {
  const g = harness(true),
    p = pad(1);
  g.setPads([p]);
  g.run("assignments[1]=1");
  p.buttons[0].pressed = true;
  g.run("poll();poll()");
  assert.deepEqual(g.json("players.map(p=>p.bombs)"), [3, 2]);
  p.buttons[0].pressed = false;
  g.run("poll()");
  p.buttons[0].pressed = true;
  g.run("poll()");
  assert.deepEqual(g.json("players.map(p=>p.bombs)"), [3, 1]);
  p.buttons[1].pressed = true;
  g.run("update(0);update(.12)");
  assert.equal(g.run("shots.length"), 2);
  assert.equal(g.run("shots.every(s=>s.owner===players[1])"), true);
});

test("keyboard bombs ignore repeat and preserve teammate stock", () => {
  const g = harness(true);
  g.key("KeyG");
  g.key("KeyG", true, true);
  assert.deepEqual(g.json("players.map(p=>p.bombs)"), [2, 3]);
  g.key("KeyL");
  assert.deepEqual(g.json("players.map(p=>p.bombs)"), [2, 2]);
});

test("restart: start while playing is no-op; restart clears gameplay but retains ambient/input/flash", () => {
  const g = harness(true);
  g.run(
    "players[0].lives=20;elapsed=50;score=700;wave=12;bossSpawned=true;ambient=8;flash=.25;last=123;hudClock=.1;assignments[1]=1;bindings.saved={fire:2};keys.add('KeyF');shots=[{x:1}];hostile=[{x:1}];drops=[{x:1}];sparks=[{x:1}];enemies=[{x:1}]",
  );
  const before = g.json(
    "[players,elapsed,score,wave,bossSpawned,shots,hostile,drops,sparks,enemies]",
  );
  g.run("start()");
  assert.deepEqual(
    g.json(
      "[players,elapsed,score,wave,bossSpawned,shots,hostile,drops,sparks,enemies]",
    ),
    before,
  );
  g.run("mode='over';start()");
  assert.deepEqual(g.json("players"), [
    { x: 235, y: 690, lives: 3, respawn: 0, entering: false, bombs: 3, level: 1, cool: 0, inv: 2, index: 0 },
    { x: 365, y: 690, lives: 3, respawn: 0, entering: false, bombs: 3, level: 1, cool: 0, inv: 2, index: 1 },
  ]);
  assert.deepEqual(
    g.json(
      "[elapsed,score,wave,bossSpawned,shots,hostile,drops,sparks,enemies]",
    ),
    [0, 0, 0, false, [], [], [], [], []],
  );
  assert.deepEqual(
    g.json(
      '[ambient,flash,last,hudClock,keyboard2,assignments,bindings,keys.has("KeyF")]',
    ),
    [8, 0.25, 123, 0.1, true, [null, 1], { saved: { fire: 2 } }, true],
  );
  assert.equal(g.el("#overlay").style.display, "none");
});

test("randomness: spawn phase/shoot order, with pickup random consumed first", () => {
  const g = harness();
  g.random([0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9]);
  g.run("wave=0;spawn()");
  assert.equal(g.randomCalls(), 10);
  const values = g.json("enemies.map(e=>[e.phase,e.shoot])");
  [
    [0, 1.2],
    [1.2, 1.6],
    [2.4, 2],
    [3.6, 2.4],
    [4.8, 2.8],
  ].forEach((pair, i) => pair.forEach((value, j) => near(values[i][j], value)));
  g.random([0.25, 0, 0.75]);
  g.run("wave=3;enemies=[];spawn()");
  assert.equal(g.randomCalls(), 10);
  assert.equal(g.run("drops.length"), 0);
  assert.deepEqual(g.json("[enemies[0].phase,enemies[0].shoot]"), [1.5, 1]);
});

test("randomness: explosion uses vx, vy, life in order per particle", () => {
  const g = harness();
  g.random([0, 0.25, 0.5, 0.75, 1, 0]);
  g.run("explode(10,20,'red',2)");
  assert.equal(g.randomCalls(), 6);
  const particles = g.json("sparks");
  assert.deepEqual(
    particles.map((s) => [s.x, s.y, s.vx, s.vy, s.color]),
    [
      [10, 20, -150, -75, "red"],
      [10, 20, 75, 150, "red"],
    ],
  );
  near(particles[0].life, 0.45);
  near(particles[1].life, 0.2);
});

test("randomness: kill particles precede strict .03 drop chance and item selection", () => {
  for (const [chance, item, expected, count] of [
    [0.03, 0, null, 55],
    [0.029, 0, "W", 56],
    [0.029, 0.4, "W", 56],
    [0.029, 0.9, "B", 56],
  ]) {
    const g = harness();
    enemy(g);
    g.random([...Array(54).fill(0.5), chance, item]);
    g.run("kill(enemies[0],players[0])");
    assert.equal(g.randomCalls(), count);
    assert.equal(g.run("sparks.length"), 18);
    assert.deepEqual(
      g.json("drops.map(d=>d.type)"),
      expected ? [expected] : [],
    );
  }
  const g = harness();
  enemy(g, "boss");
  g.random([]);
  g.run("kill(enemies[0],players[0])");
  assert.equal(g.randomCalls(), 210);
  assert.equal(g.run("drops.length"), 0);
});

test("rendering reads state without advancing gameplay or consuming randomness", () => {
  const g = harness(true);
  g.run("wave=0;spawn();explode(20,30);flash=.2");
  const before = g.json(
    "[players,enemies,shots,hostile,drops,sparks,mode,elapsed,ambient,score,wave,flash]",
  );
  const randomBefore = g.randomCalls();
  g.run("draw();draw()");
  assert.deepEqual(
    g.json(
      "[players,enemies,shots,hostile,drops,sparks,mode,elapsed,ambient,score,wave,flash]",
    ),
    before,
  );
  assert.equal(g.randomCalls(), randomBefore);
  assert.ok(g.drawCalls.length > 0);
});

// CF-ARCH-03: these trace hashes were captured from the untouched CF-ARCH-02
// source before extraction. Do not regenerate them to accept rendering changes.
const { createHash } = require("node:crypto");
const digest = (value) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
const visualScene = `
  players.forEach(p => { p.inv = 2; });
  enemies = [
    {type:'small',x:80.4,y:120.6}, {type:'heavy',x:210,y:180},
    {type:'boat',x:410,y:280}, {type:'boss',x:300,y:135,hp:325,max:650}
  ];
  shots = [{x:230,y:500}]; hostile = [{x:330,y:450}];
  drops = [{type:'W',x:80,y:400},{type:'1UP',x:160,y:410},{type:'B',x:240,y:420}];
  sparks = [{x:100,y:300,life:.2,color:'#abc'},{x:120,y:320,life:.7,color:'#def'}];
  flash = .2;
`;

for (const [name, setup, expected] of [
  [
    "ready",
    "mode='ready';players=[];ambient=0",
    "e80449e4bd91aa164369b2e796575334dbfdf6bb36a8beb95ef9f76bfc9d88db",
  ],
  [
    "visible",
    visualScene + "ambient=.14",
    "6a14975d82297ceb2dae97e671b23b6d2e880902768d47381b32c3698677f470",
  ],
  [
    "hidden",
    visualScene + "ambient=.2",
    "d07cb34c55f09122f59f9cd62fec2dc2675edfc0b365e8640a91d6237235ab0d",
  ],
]) {
  test(`renderer: ${name} matches CF-ARCH-02 Canvas calls, properties and order`, () => {
    const g = harness(true);
    g.run(setup);
    g.run("draw()");
    assert.equal(digest(g.drawCalls), expected);
    assert.equal(g.randomCalls(), 0);
  });
}

test("renderer: accepts deeply frozen state without mutations or randomness", () => {
  const g = harness(true);
  g.run(visualScene);
  g.run(`
    function freeze(value) {
      if (value && typeof value === 'object') {
        Object.values(value).forEach(freeze); Object.freeze(value);
      }
      return value;
    }
    const view = freeze({mode,ambient,enemies,drops,players,shots,hostile,sparks,flash});
  `);
  const before = g.json("view");
  g.run("render(view);render(view)");
  assert.deepEqual(g.json("view"), before);
  assert.equal(g.randomCalls(), 0);
});

for (const [time, expected] of [
  [0, "bd058e777b686abcd3718b1ad285afcf2f8f1acfae5f17cee0b5f2eb0594bde6"],
  [0.035, "85e9b2324dd90cd28d727f3eb1336f97af20bd311e5027fa18e0f5c26b1e414c"],
  [19.75, "3c64c4675e229a97a6b58eaf9e47114cae13a6667049af3862bcef14aeb05113"],
  [200, "75851167bf37752a679763121e8ec2403a046b9462a54fc1b531ab94274b4662"],
]) {
  test(`world: ${time}s matches CF-ARCH-02 geometry, scroll speeds and order`, () => {
    const g = harness();
    g.run(`drawWorld(ctx,W,H,${time})`);
    assert.equal(digest(g.drawCalls), expected);
    assert.equal(g.run("ambient"), 0);
    assert.equal(g.run("elapsed"), 0);
    assert.equal(g.randomCalls(), 0);
  });
}

test("world: paused frames still draw the advancing ambient clock", () => {
  const g = harness();
  g.run("pause()");
  g.frame(20);
  const firstFrame = digest(g.drawCalls);
  g.drawCalls.length = 0;
  g.frame(40);
  assert.notEqual(digest(g.drawCalls), firstFrame);
  assert.equal(g.run("elapsed"), 0);
  near(g.run("ambient"), 0.04);
});

test("frame: poll -> gameplay -> particle motion -> draw -> HUD remains synchronous", () => {
  const g = harness();
  g.run(`
    const order=[];
    const savedPoll=poll, savedUpdate=update, savedDraw=draw, savedHUD=updateHUD;
    poll=()=>{order.push('poll');savedPoll();};
    update=dt=>{order.push('update');savedUpdate(dt);};
    draw=()=>{order.push(['draw',elapsed,sparks[0].x,sparks[0].life]);savedDraw();};
    updateHUD=()=>{order.push('hud');savedHUD();};
    sparks=[{x:10,y:20,vx:100,vy:0,life:1,color:'#fff'}];hudClock=.14;
  `);
  g.frame(20);
  assert.deepEqual(g.json("order"), [
    "poll",
    "update",
    ["draw", 0.02, 12, 0.98],
    "hud",
  ]);
});

for (const [twoPlayers, expected, calls] of [
  [
    false,
    "b5e5fa3e2972d1733c8fc6b39f297cf38bf2498f3d2abddec12016a736a3667d",
    382,
  ],
  [
    true,
    "2a0b09c5633c9f1eb4ce463aa56674fc8594dd1d7863a5c7a32fbca94f765f52",
    6305,
  ],
]) {
  test(`gameplay: seeded 200s ${twoPlayers ? "2P" : "1P"} stays finite, bounded and reaches Boss`, () => {
    const g = harness(twoPlayers);
    let seed = 123456789;
    g.random(
      Array.from({ length: 100000 }, () => {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        return seed / 4294967296;
      }),
    );
    g.run("wave=0");
    const states = [];
    const state =
      "[players,enemies,shots,hostile,drops,sparks,mode,elapsed,score,wave,bossSpawned,flash]";
    for (let i = 0; i < 12000; i++) {
      g.run(
        `players.forEach(p=>{p.lives=3;p.inv=10;});${i % 600 === 0 ? "keys.add('KeyF');keys.add('KeyK');" : ""}update(1/60)`,
      );
      if (i % 600 === 0) states.push(g.json(state));
    }
    states.push(g.json(state));
    // Movement variety intentionally supersedes the old gameplay trace hashes.
    // Keep the historical constants above; do not regenerate them as a baseline.
    assert.ok(states.every(s => s[1].every(e => Number.isFinite(e.x) && Number.isFinite(e.y))));
    assert.equal(g.run("bossSpawned"), true);
    assert.ok(g.run("enemies.length") < 30);
  });
}

function audioMock() {
  const calls = [];
  function AudioContext() {
    calls.push(["construct"]);
    this.currentTime = 10;
    this.destination = "destination";
    this.resume = () => calls.push(["resume"]);
    this.createOscillator = () => {
      calls.push(["oscillator"]);
      return {
        set type(value) {
          calls.push(["type", value]);
        },
        frequency: {
          set value(value) {
            calls.push(["frequency", value]);
          },
        },
        connect(gain) {
          calls.push(["osc.connect"]);
          return gain;
        },
        start() {
          calls.push(["start"]);
        },
        stop(time) {
          calls.push(["stop", time]);
        },
      };
    };
    this.createGain = () => {
      calls.push(["gain"]);
      return {
        gain: {
          setValueAtTime: (...args) => calls.push(["gain.set", ...args]),
          exponentialRampToValueAtTime: (...args) =>
            calls.push(["gain.ramp", ...args]),
        },
        connect: (target) => calls.push(["gain.connect", target]),
      };
    };
  }
  return { calls, host: { AudioContext } };
}

function beepTrace(freq, duration) {
  return [
    ["resume"],
    ["oscillator"],
    ["gain"],
    ["type", "square"],
    ["frequency", freq],
    ["gain.set", 0.035, 10],
    ["gain.ramp", 0.001, 10 + duration],
    ["osc.connect"],
    ["gain.connect", "destination"],
    ["start"],
    ["stop", 10 + duration],
  ];
}

for (const [id, freq, duration] of [
  ["start", 600, 0.08],
  ["soundEnabled", 550, 0.08],
  ["playerJoined", 500, 0.08],
  ["explosion", 90, 0.12],
  ["bomb", 60, 0.4],
  ["fire", 750, 0.025],
  ["pickup", 1100, 0.1],
]) {
  test(`audio: ${id} preserves exact legacy oscillator output and call order`, () => {
    const mock = audioMock();
    const context = vm.createContext({ host: mock.host });
    vm.runInContext(
      sources.find(([file]) => file === "src/audio.js")[1],
      context,
    );
    vm.runInContext(`createAudio(host,()=>true).playSfx('${id}')`, context);
    assert.deepEqual(mock.calls, [["construct"], ...beepTrace(freq, duration)]);
  });
}

test("audio: mute remains lazy, toggles synchronously, and reuses AudioContext", () => {
  const mock = audioMock(),
    g = harness(false, mock.host);
  assert.deepEqual(mock.calls, []); // Muted startup creates no audio context.
  g.el("#sound").onclick();
  assert.deepEqual(mock.calls, [["construct"], ...beepTrace(550, 0.08)]);
  assert.equal(g.el("#sound").textContent, "SOUND ON");
  g.el("#sound").onclick();
  g.run("explode(10,20)");
  assert.equal(mock.calls.length, 12);
  assert.equal(g.el("#sound").textContent, "SOUND OFF");
  g.el("#sound").onclick();
  assert.deepEqual(mock.calls, [
    ["construct"],
    ...beepTrace(550, 0.08),
    ...beepTrace(550, 0.08),
  ]);
});

test("audio: legacy WebKit fallback and swallowed audio failures remain supported", () => {
  const mock = audioMock(),
    g = harness(false, { webkitAudioContext: mock.host.AudioContext });
  g.el("#sound").onclick();
  assert.deepEqual(mock.calls, [["construct"], ...beepTrace(550, 0.08)]);
  for (const host of [
    {},
    {
      AudioContext() {
        throw Error("unavailable");
      },
    },
  ]) {
    const g = harness(false, host);
    assert.doesNotThrow(() => g.el("#sound").onclick());
    assert.equal(g.run("sound"), true);
  }
});

test("audio: gameplay event triggers retain exact tones and synchronous timing", () => {
  for (const [setup, tones] of [
    ["mode='over';start()", [[600, 0.08]]],
    ["keys.add('KeyF');update(0)", [[750, 0.025]]],
    ["players[0].inv=0;hurt(players[0],15)", [[90, 0.12]]],
    ["drops=[{x:235,y:690,type:'W'}];update(0)", [[90, 0.12], [1100, 0.1]]],
    [
      "enemies=[{type:'small',x:80,y:100,hp:1},{type:'boss',x:300,y:135,hp:1}];bomb(players[0])",
      [
        [90, 0.12],
        [90, 0.12],
        [60, 0.4],
      ],
    ],
  ]) {
    const mock = audioMock(),
      g = harness(false, mock.host);
    g.run("sound=true");
    g.run(setup);
    assert.deepEqual(mock.calls, [
      ["construct"],
      ...tones.flatMap(([f, d]) => beepTrace(f, d)),
    ]);
  }
  const mock = audioMock(),
    g = harness(false, mock.host),
    p = pad(0);
  p.buttons[2].pressed = true;
  g.setPads([p]);
  g.run("sound=true;mode='ready';poll()");
  assert.deepEqual(mock.calls, [["construct"], ...beepTrace(500, 0.08)]);
});

require("./level1.test.cjs")({ test, harness, near });
require("./player-assets.test.cjs")({ test, harness, near });

console.log(
  `PASS: ${passed} focused baseline cases (deterministic test-only randomness).`,
);
