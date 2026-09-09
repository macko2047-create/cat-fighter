"use strict";
// Bullet hitboxes follow the 1.25x enemy artwork enlargement.
// Keep body-contact widths unchanged so aiming assistance does not increase ram danger.
// Boat HP/speed are intentionally absent: the heavy-wave branch supplies them
// on overlapping waves (35). Boss HP belongs to Level 1's player-count config.
const ENEMY_DEFINITIONS = Object.freeze({
  small: Object.freeze({ baseHP: 3, hitHalfWidth: 25, hitHalfHeight: 31.25, contactHalfWidth: 20, score: 100 }),
  heavy: Object.freeze({ baseHP: 18, speed: 48, hitHalfWidth: 41.25, hitHalfHeight: 31.25, contactHalfWidth: 33, score: 400 }),
  boat: Object.freeze({ hitHalfWidth: 25, hitHalfHeight: 31.25, contactHalfWidth: 20, score: 100 }),
  boss: Object.freeze({ hitHalfWidth: 106.25, hitHalfHeight: 60, contactHalfWidth: 85, score: 5000 }),
});

// Authored wave routes: predictable formations, with a different tempo per wave.
function configureSmallFlight(e, wave, i, count) {
  const route = (wave - 1) % 8;
  if (route === 0) return; // Gentle opening / recovery wave.
  e.flight = route;
  e.v *= [1, 1.15, 1.45, .82, 1.3, 1.05, 1.65, .95][route];
  e.startX = e.x;
  e.startY = e.y;
  if (route === 1 || route === 2 || route === 5) {
    const left = route === 1 || (route === 5 && i % 2 === 0);
    e.direction = left ? 1 : -1;
    e.startX = left ? -60 - i * 48 : 660 + i * 48;
    e.startY = 90 + i * 24;
  } else if (route === 4 || route === 6) {
    e.direction = route === 4 ? 1 : -1;
    e.startX = route === 4 ? 45 + i * 42 : 555 - i * 42;
  } else {
    e.startX = 110 + i * 380 / Math.max(1, count - 1);
  }
  e.x = e.startX;
  e.y = e.startY;
  e.visibleAge = 0;
  // One candidate per wave, with a 40% chance from its existing random phase.
  // Opening/recovery waves keep their original route and never charge.
  if (wave >= 4 && i === wave % count && e.phase < 2.4) {
    e.chargeState = "ready";
    e.chargeDuration = .65;
  }
}

function chargeTarget(e, players) {
  let nearest = null, distance = Infinity;
  for (const p of players) {
    if (p.lives <= 0 || p.respawn > 0 || p.entering) continue;
    const d = Math.hypot(p.x - e.x, p.y - e.y);
    if (d < distance) { nearest = p; distance = d; }
  }
  return nearest;
}

function advanceSmallCharge(e, dt) {
  e.x += e.chargeVX * dt;
  e.y += e.chargeVY * dt;
  e.chargeAge += dt;
  // A dash flies through the stored point and leaves; it never parks or homes.
  if (e.x < -80 || e.x > 680 || e.y < -80 || e.y > 870 || e.chargeAge > 3)
    e.exited = true;
}

function moveSmallFlight(e, dt, players = []) {
  if (e.chargeState === "charging") {
    advanceSmallCharge(e, dt);
    return;
  }
  if (e.chargeState === "windup") {
    const target = chargeTarget(e, players);
    if (!target) {
      // Resume at this point on the authored route after a canceled stop.
      e.flightDelay = (e.flightDelay || 0) + dt;
      e.chargeState = "spent";
      return;
    }
    const stopped = Math.min(dt, e.chargeTimer);
    e.flightDelay = (e.flightDelay || 0) + stopped;
    e.chargeTimer = Math.max(0, e.chargeTimer - dt);
    if (e.chargeTimer === 0) {
      e.chargeTargetX = target.x;
      e.chargeTargetY = target.y;
      const dx = target.x - e.x, dy = target.y - e.y;
      const length = Math.hypot(dx, dy);
      const speed = 500 * (e.difficulty || 1);
      e.chargeVX = length > 0 ? dx / length * speed : 0;
      e.chargeVY = length > 0 ? dy / length * speed : speed;
      e.chargeAge = 0;
      e.chargeState = "charging";
      advanceSmallCharge(e, dt - stopped);
    }
    return;
  }
  const routeAge = e.age - (e.flightDelay || 0);
  const distance = e.v * routeAge;
  if (e.flight === 1 || e.flight === 2 || e.flight === 5) {
    e.x = e.startX + e.direction * distance * .88;
    e.y = e.startY + distance * .48;
  } else if (e.flight === 4 || e.flight === 6) {
    e.x = e.startX + e.direction * distance * .38;
    e.y = e.startY + distance * .925;
  } else if (e.flight === 3) {
    e.x = e.startX + 65 * Math.sin(routeAge * 1.4);
    e.y = e.startY + distance;
  } else {
    // Smoothly accelerate after entering along the authored route.
    e.x = e.startX + 45 * Math.sin(routeAge * 1.1);
    e.y = e.startY + distance * .7 + 22 * Math.pow(Math.max(0, routeAge - 1.8), 2);
  }
  if (e.x > 20 && e.x < 580 && e.y > 20 && e.y < 760)
    e.visibleAge += dt;
  if (e.visibleAge > 0 && (e.x < -80 || e.x > 680)) e.exited = true;
  if (e.chargeState === "ready" && e.visibleAge >= .5 &&
      e.x > 50 && e.x < 550 && e.y >= 105 && e.y < 360) {
    const target = chargeTarget(e, players);
    // Leave space to read the tell; avoid initiating beside the fighter.
    if (target && Math.hypot(target.x - e.x, target.y - e.y) >= 160) {
      e.chargeState = "windup";
      e.chargeTimer = e.chargeDuration;
    }
  }
}
