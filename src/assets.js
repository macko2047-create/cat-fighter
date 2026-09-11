"use strict";

// Visual metadata only. Gameplay coordinates and collision dimensions never
// appear here. Source cell size is independent of the 108px display size.
const PLAYER_VISUAL_STATES = Object.freeze([
  "normal",
  "left",
  "right",
  "up",
  "down",
  "special",
  "hit",
  "crash",
]);

function playerFrame(row, column, animation = null) {
  const frame = Object.freeze({ row, column });
  return Object.freeze({
    row,
    column,
    frames: Object.freeze([frame]),
    ...(animation || {}),
  });
}

const playerFrames = Object.freeze({
  normal: playerFrame(0, 0),
  left: playerFrame(0, 1),
  right: playerFrame(0, 2),
  up: playerFrame(0, 3),
  down: playerFrame(1, 0),
  special: playerFrame(1, 1, { fps: 12, loop: false }),
  hit: playerFrame(1, 2, { fps: 12, loop: false }),
  crash: playerFrame(1, 3, { fps: 12, loop: false }),
});

function playerDefinition(sheet) {
  return Object.freeze({
    sheet,
    cell: Object.freeze({ width: 256, height: 256 }),
    grid: Object.freeze({ columns: 4, rows: 2 }),
    pivot: Object.freeze({ x: 0.5, y: 0.5 }),
    displayScale: 108 / 256,
    states: playerFrames,
  });
}

const PLAYER_ASSETS = Object.freeze({
  "player.p1": playerDefinition("assets/players/p1/sheet.png"),
  "player.p2": playerDefinition("assets/players/p2/sheet.png"),
});

// Enemy art follows its authored heading (nose down); never rotate the mouse
// faces or global lighting along with the old geometry fallback.
const ENEMY_ASSETS = Object.freeze({ ...Object.fromEntries(
  Object.entries({ small: 72, heavy: 120, boat: 104, boss: 240 }).map(([id, size]) => [id,
    Object.freeze({ sheet: `assets/enemies/${id}.png`,
      cell: Object.freeze({ width: 256, height: 256 }),
      grid: Object.freeze({ columns: 1, rows: 1 }),
      pivot: Object.freeze({ x: 0.5, y: 0.5 }), displayScale: size * 1.25 / 256,
    }),
  ]),
), bossDamage: Object.freeze({
  sheet: "assets/enemies/boss-damage-sheet.png",
  cell: Object.freeze({ width: 512, height: 512 }),
  grid: Object.freeze({ columns: 2, rows: 2 }),
  pivot: Object.freeze({ x: .5, y: .5 }), displayScale: 300 / 512,
}) });

// Four damage appearances in addition to the intact entry sprite.
function bossDamageStage(enemy) {
  if (enemy.hp <= 0) return 4;
  if (!(enemy.max > 0)) return 0;
  const ratio = enemy.hp / enemy.max;
  return ratio <= .10 ? 4 : ratio <= .25 ? 3 : ratio <= .50 ? 2 : ratio <= .75 ? 1 : 0;
}

function playerAssetId(index) {
  return index === 1 ? "player.p2" : "player.p1";
}

// Presentation hints are optional and read-only. Current gameplay has no
// persistent special/hit animation timer, so it supplies directional input.
function selectPlayerVisualState(player, movement = {}, presentation = {}) {
  if (presentation.crash || player.lives <= 0 || player.respawn > 0) return "crash";
  if (presentation.special) return "special";
  if (presentation.hit) return "hit";
  if (movement.x < 0) return "left";
  if (movement.x > 0) return "right";
  if (movement.y < 0) return "up";
  if (movement.y > 0) return "down";
  return "normal";
}

function createPlayerAssetLoader(host = window, manifest = PLAYER_ASSETS) {
  const records = new Map();
  const byPath = new Map();
  for (const [id, definition] of Object.entries(manifest)) {
    let record = byPath.get(definition.sheet);
    if (!record) {
      record = { status: "missing", image: null };
      byPath.set(definition.sheet, record);
      if (typeof host.Image === "function") {
        try {
          const image = new host.Image();
          record = { status: "loading", image };
          byPath.set(definition.sheet, record);
          image.onload = () => {
            record.status =
              image.naturalWidth >= definition.cell.width * definition.grid.columns &&
              image.naturalHeight >= definition.cell.height * definition.grid.rows
                ? "ready"
                : "failed";
          };
          image.onerror = () => {
            record.status = "failed";
          };
          image.src = definition.sheet;
        } catch {}
      }
    }
    records.set(id, record);
  }
  return Object.freeze({
    definition: (id) => manifest[id] || null,
    record: (id) => records.get(id) || null,
    isReady: (id) => records.get(id)?.status === "ready",
    image: (id) => (records.get(id)?.status === "ready" ? records.get(id).image : null),
  });
}
