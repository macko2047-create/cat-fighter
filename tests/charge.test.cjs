"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const test = require("node:test");
const api = vm.createContext({ Math });
vm.runInContext(fs.readFileSync(path.join(__dirname, "../src/enemies.js"), "utf8"), api);

function enemy(wave = 4, i = 4, count = 5, phase = 1) {
  const e = { type: "small", x: 70 + i * 100, y: -70 - i * 55,
    v: 85, age: 0, phase };
  api.configureSmallFlight(e, wave, i, count);
  return e;
}
function inView() {
  const e = enemy();
  Object.assign(e, { x: 300, y: 120, startX: 300, startY: 120, visibleAge: .5 });
  return e;
}
function pilot(extra = {}) {
  return { x: 300, y: 690, lives: 3, respawn: 0, entering: false, ...extra };
}
function step(e, dt, players = []) {
  e.age += dt;
  api.moveSmallFlight(e, dt, players);
}
function near(a, b, tolerance = 1e-8) {
  assert.ok(Math.abs(a - b) < tolerance, `${a} != ${b}`);
}

test("charge selection: at most one candidate per wave, occasional roll, safe opening", () => {
  for (const count of [1, 5, 7]) {
    for (let wave = 1; wave <= 40; wave++) {
      const fleet = Array.from({ length: count }, (_, i) => enemy(wave, i, count));
      const expected = wave >= 4 && (wave - 1) % 8 !== 0 ? 1 : 0;
      assert.equal(fleet.filter(e => e.chargeState === "ready").length, expected);
      for (const e of fleet) {
        if (e.chargeState) assert.equal(JSON.stringify(e.reward),'{"type":"W","weapon":"rapid"}');
        else assert.equal(e.reward,undefined);
      }
      assert.ok(fleet.every(e => Number.isFinite(e.x) && Number.isFinite(e.y)));
      const ordinary = Array.from({ length: count }, (_, i) => enemy(wave, i, count, 2.4));
      assert.ok(ordinary.every(e => !e.chargeState));
    }
  }
});

test("charge windup: stop for 650ms, then snapshot latest position and fly straight through", () => {
  const e = inView(), p = pilot();
  step(e, 0, [p]);
  assert.equal(e.chargeState, "windup");
  assert.equal(e.chargeDuration, .65);
  step(e, .3, [p]);
  step(e, .34, [p]);
  assert.equal(e.chargeState, "windup");
  assert.deepEqual([e.x, e.y], [300, 120]);
  assert.equal(e.chargeTargetX, undefined);
  p.x = 440; p.y = 640;
  step(e, .02, [p]);
  assert.equal(e.chargeState, "charging");
  assert.deepEqual([e.chargeTargetX, e.chargeTargetY], [440, 640]);
  const vx = e.chargeVX, vy = e.chargeVY, x = e.x, y = e.y;
  near(Math.hypot(vx, vy), 500);
  p.x = 10; p.y = 100;
  step(e, .4, [p]);
  near(e.x, x + vx * .4); near(e.y, y + vy * .4);
  assert.deepEqual([e.chargeTargetX, e.chargeTargetY, e.chargeVX, e.chargeVY], [440, 640, vx, vy]);
  step(e, 1.6, [p]);
  assert.ok(e.y > e.chargeTargetY);
  assert.equal(e.exited, true);
});

test("charge target: skip dead, respawning and entering pilots; avoid close surprise", () => {
  const e = inView();
  const players = [pilot({ y: 121, lives: 0 }), pilot({ y: 122, respawn: .3 }),
    pilot({ y: 123, entering: true }), pilot({ x: 280, y: 650 }), pilot({ x: 400, y: 730 })];
  step(e, 0, players);
  step(e, .65, players);
  assert.equal(e.chargeState, "charging");
  assert.deepEqual([e.chargeTargetX, e.chargeTargetY], [280, 650]);
  const close = inView();
  step(close, 0, [pilot({ x: 300, y: 150 })]);
  assert.equal(close.chargeState, "ready");
});

test("charge cancellation: no active pilot resumes the route without a jump or camping", () => {
  const e = inView(), p = pilot();
  step(e, 0, [p]);
  const route = { ...e, chargeState: "spent" };
  step(e, .2, [p]);
  p.respawn = .8;
  step(e, .1, [p]);
  assert.equal(e.chargeState, "spent");
  assert.deepEqual([e.x, e.y], [300, 120]);
  step(e, .01, []);
  step(route, .01, []);
  near(e.x, route.x); near(e.y, route.y);
  for (let frame = 0; frame < 1800; frame++) step(e, 1 / 60, []);
  assert.ok(e.exited || e.y >= 870);
  const waiting = inView();
  for (let frame = 0; frame < 1800; frame++) step(waiting, 1 / 60, []);
  assert.ok(waiting.exited || waiting.y >= 870);
  assert.equal(waiting.chargeState, "ready");
});

test("charge safety: upward, horizontal and coincident targets leave within a bounded time", () => {
  for (const target of [{ x: 300, y: 0 }, { x: 500, y: 120 }, { x: 300, y: 120 }]) {
    const e = inView(), p = pilot();
    step(e, 0, [p]);
    Object.assign(p, target);
    step(e, .65, [p]);
    assert.equal(e.chargeState, "charging");
    assert.ok(Number.isFinite(e.chargeVX) && Number.isFinite(e.chargeVY));
    for (let frame = 0; frame < 181; frame++) step(e, 1 / 60, []);
    assert.equal(e.exited, true);
  }
});

test("charge difficulty: speed increases with loop difficulty, warning time stays readable", () => {
  const e = inView(), p = pilot();
  e.difficulty = 1.12;
  step(e, 0, [p]);
  step(e, .64, [p]);
  assert.equal(e.chargeState, "windup");
  step(e, .02, [p]);
  near(Math.hypot(e.chargeVX, e.chargeVY), 560);
  assert.equal(e.chargeDuration, .65);
});
