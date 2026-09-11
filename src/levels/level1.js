"use strict";
// Configuration only. Scheduling, adaptive difficulty and spawning
// remain in game.js. Times are seconds; speed progression uses elapsed time.
const LEVEL1 = Object.freeze({
  waveInterval: 4.2,
  preBossDuration: 175,
  formationCount1P: 5,
  formationCount2P: 7,
  adaptive: Object.freeze({
    weaponScores: Object.freeze([0, 1, 1.7, 2.1]),
    rapidWeight: 1.5,
    firepowerWeight: 0.2,
    maxPressure: 1.35,
    riseSeconds: 12,
    playerFallSeconds: 5,
    pressureFallSeconds: 4,
  }),
  heavyWaveCadence: 5,
  heavyWaveCount: 2,
  // One mutually exclusive roll for one carrier in each heavy formation.
  heavyBombChance: 0.5,
  heavyLifeChance: 0.1,
  boatWaveCadence: 7,
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
  bossRageBulletSpeed: 120,
  loopClearDelay: 2.6,
  loopDifficultyStep: 0.05,
  spreadShotAngle: 30,
});
