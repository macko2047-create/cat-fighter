"use strict";
// Configuration only. Scheduling, original-player-count selection and spawning
// remain in game.js. Times are seconds; speed progression uses elapsed time.
const LEVEL1 = Object.freeze({
  waveInterval: 4.2,
  preBossDuration: 175,
  formationCount1P: 5,
  formationCount2P: 7,
  heavyWaveCadence: 5,
  heavyWaveCount: 2,
  boatWaveCadence: 7,
  pickupInterval: 60,
  dropChance: 0.015,
  extraLifeTime: 100,
  enemySpeedBase: 85,
  enemySpeedPerSecond: 0.18,
  bossSpawnTime: 175,
  bossHP1P: 650,
  bossHP2P: 1050,
  bossFireInterval: 0.9,
  bossHalfHPFireInterval: 0.55,
  loopClearDelay: 2.6,
  loopDifficultyStep: 0.05,
  spreadShotSpeed: 70,
});
