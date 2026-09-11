"use strict";
const assert = require("node:assert/strict");
module.exports = ({ test, harness, near }) => {
  test("boats: ordinary and heavy overlap fleets stay inside open water", () => {
    for (const two of [false,true]) for (const wave of [7,14,35]) {
      const g=harness(two);
      g.run(`wave=${wave-1};spawn();`);
      for(let i=0;i<1100;i++) {
        assert.ok(g.run("enemies.filter(e=>e.type==='boat').every(e=>e.x>=230 && e.x<=440)"));
        g.run("players.forEach(p=>{p.lives=3;p.inv=10});update(1/60)");
      }
    }
  });
  test("small flights: every route enters and exits in 1P/2P, with distinct tempos", () => {
    for (const two of [false, true]) {
      const g = harness(two);
      const speeds = new Set();
      for (const wave of [1, 2, 3, 4, 13, 6, 23, 8]) {
        g.run(`enemies=[];wave=${wave - 1};elapsed=0;spawn()`);
        speeds.add(g.run("enemies[0].v"));
        const result = g.json(`(() => {
          const fleet = enemies.slice();
          const seen = new Set();
          for (let step=0;step<1800;step++) {
            for (const e of fleet) {
              e.age += 1/60;
              if (e.flight) moveSmallFlight(e,1/60);
              else e.y += e.v/60;
              if (e.x>0 && e.x<600 && e.y>0 && e.y<800) seen.add(e);
            }
          }
          return [seen.size, fleet.every(e=>e.exited || e.y>=870)];
        })()`);
        assert.deepEqual(result, [two ? 7 : 5, true]);
      }
      assert.ok(speeds.size >= 6);
    }
  });
  test("small flights: offscreen entry cannot shoot and visible entry has reaction time", () => {
    const g = harness();
    g.run("wave=1;spawn();enemies=[enemies[0]];enemies[0].shoot=0;elapsed=170;update(.1)");
    assert.equal(g.run("hostile.length"), 0);
    g.run("for(let i=0;i<120;i++)update(1/60)");
    assert.ok(g.run("hostile.length") > 0);
  });
  test("level1: wave interval retains one-wave-per-update and immediate first wave", () => {
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
  for (const two of [false, true]) {
    test(`level1: ${two ? '2P' : '1P'} counts, cadence, speed and wave 35 overlap`, () => {
      const g = harness(two);
      for (const wave of [1, 5, 7, 10, 14, 35]) {
        g.run(`enemies=[];wave=${wave - 1};elapsed=123;spawn()`);
        const heavy = wave % 5 === 0, boat = wave % 7 === 0;
        const count = heavy ? 2 : two ? 7 : 5;
        assert.deepEqual(g.json("enemies.map(e=>[e.type,e.hp,e.v,e.x,e.y])"),
          Array.from({length: count}, (_, i) => [boat ? 'boat' : heavy ? 'heavy' : 'small',
            heavy ? 18 : 3, heavy ? 48 : 85 + 123 * .18,
            boat ? 230 + i * (210 / (count - 1)) : heavy ? 160 + i * 280 : 70 + i * (460 / (count - 1)), -70 - i * 55]));
      }
      for (const elapsed of [0, 80, 174]) {
        g.run(`enemies=[];wave=0;elapsed=${elapsed};spawn()`);
        near(g.run("enemies[0].v"), 85 + elapsed * .18);
      }
    });
    test(`level1: ${two ? '2P' : '1P'} Boss timing, HP and escalating phase firing`, () => {
      const g = harness(two), hp = two ? 1050 : 650;
      g.run("elapsed=174.999;update(0)");
      assert.equal(g.run("bossSpawned"), false);
      g.run("enemies=[];elapsed=175;update(0)");
      assert.deepEqual(g.json("enemies.map(e=>[e.type,e.hp,e.max])"), [['boss',hp,hp]]);
      for (const [health, interval] of [[hp,1.1],[hp * .75,.8],[hp * .5,.62],[hp * .1,.42]]) {
        g.run(`enemies[0].y=135;enemies[0].hp=${health};enemies[0].shoot=0;update(0)`);
        assert.equal(g.run("enemies[0].shoot"), interval);
      }
      g.run("update(0)");
      assert.equal(g.run("enemies.length"), 1);
    });
  }
  test("level1: formations do not generate extra periodic pickups", () => {
    const g = harness();
    g.run("wave=0");
    for (let wave = 1; wave <= 24; wave++) {
      g.run("enemies=[];spawn()");
      assert.equal(g.run("drops.length"), 0);
    }
    assert.equal(g.randomCalls(), (20 * 5 + 4 * 2) * 2 + 4);
  });
  test("level1: heavy formation has one reward carrier from its probability roll", () => {
    const g = harness();
    for (const wave of [5, 10, 15, 20, 30]) {
      g.run(`enemies=[];wave=${wave - 1};spawn()`);
      const rewards = g.json("enemies.filter(e=>e.reward?.type==='1UP').map(e=>e.x)");
      assert.deepEqual(rewards, [160]);
    }
  });
  test("level1: dead teammate retains original 2P formation and Boss HP", () => {
    const g = harness(true);
    g.run("players[1].lives=0;wave=0;spawn()");
    assert.equal(g.run("enemies.length"), 7);
    g.run("enemies=[];elapsed=175;update(0)");
    assert.deepEqual(g.json("[enemies[0].hp,enemies[0].max]"), [1050,1050]);
  });
  test("enemy data: exact existing HP, speed, score and collision extents", () => {
    const g = harness();
    assert.deepEqual(g.json("ENEMY_DEFINITIONS"), {
      small: {baseHP:3,hitHalfWidth:25,hitHalfHeight:31.25,contactHalfWidth:20,score:100},
      heavy: {baseHP:18,speed:48,hitHalfWidth:41.25,hitHalfHeight:31.25,contactHalfWidth:33,score:400},
      boat: {hitHalfWidth:25,hitHalfHeight:31.25,contactHalfWidth:20,score:100},
      boss: {hitHalfWidth:106.25,hitHalfHeight:60,contactHalfWidth:85,score:5000},
    });
  });
};
