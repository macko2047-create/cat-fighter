"use strict";
// Collision extents are the existing shot-hit thresholds, not visual sizes.
// Boat HP/speed are intentionally absent: the heavy-wave branch supplies them
// on overlapping waves (35). Boss HP belongs to Level 1's player-count config.
const ENEMY_DEFINITIONS = Object.freeze({
  small: Object.freeze({ baseHP: 3, hitHalfWidth: 20, hitHalfHeight: 25, score: 100 }),
  heavy: Object.freeze({ baseHP: 18, speed: 48, hitHalfWidth: 33, hitHalfHeight: 25, score: 400 }),
  boat: Object.freeze({ hitHalfWidth: 20, hitHalfHeight: 25, score: 100 }),
  boss: Object.freeze({ hitHalfWidth: 85, hitHalfHeight: 48, score: 5000 }),
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
    e.startX = 110 + i * 380 / (count - 1);
  }
  e.x = e.startX;
  e.y = e.startY;
  e.visibleAge = 0;
}

function moveSmallFlight(e, dt) {
  const distance = e.v * e.age;
  if (e.flight === 1 || e.flight === 2 || e.flight === 5) {
    e.x = e.startX + e.direction * distance * .88;
    e.y = e.startY + distance * .48;
  } else if (e.flight === 4 || e.flight === 6) {
    e.x = e.startX + e.direction * distance * .38;
    e.y = e.startY + distance * .925;
  } else if (e.flight === 3) {
    e.x = e.startX + 65 * Math.sin(e.age * 1.4);
    e.y = e.startY + distance;
  } else {
    // Smoothly accelerate after entering; the route never chases the player.
    e.x = e.startX + 45 * Math.sin(e.age * 1.1);
    e.y = e.startY + distance * .7 + 22 * Math.pow(Math.max(0, e.age - 1.8), 2);
  }
  if (e.x > 20 && e.x < 580 && e.y > 20 && e.y < 760)
    e.visibleAge += dt;
  if (e.visibleAge > 0 && (e.x < -80 || e.x > 680)) e.exited = true;
}
