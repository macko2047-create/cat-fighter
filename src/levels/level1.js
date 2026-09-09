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
  // A BOMB carrier is an occasional heavy formation, never every heavy plane.
  heavyBombCadence: 3,
  boatWaveCadence: 7,
  pickupInterval: 50,
  dropChance: 0.015,
  extraLifeTime: 100,
  enemySpeedBase: 85,
  enemySpeedPerSecond: 0.18,
  bossSpawnTime: 175,
  bossHP1P: 650,
  bossHP2P: 1050,
  bossFireInterval: 1.1,
  bossHalfHPFireInterval: 0.42,
  // Indexed by visual damage phase: intact through critical damage.
  bossAttackIntervals: Object.freeze([1.1, 0.8, 0.62, 0.42, 0.32]),
  bossAttackCounts: Object.freeze([3, 5, 7, 11, 11]),
  bossRageDamageMultiplier: 0.2,
  bossRageBulletSpeed: 210,
  loopClearDelay: 2.6,
  loopDifficultyStep: 0.05,
  spreadShotAngle: 30,
});
