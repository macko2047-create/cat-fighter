"use strict";
const assert = require("node:assert/strict");

module.exports = ({ test, harness }) => {
  test("boss damage: four thresholds scale with max HP and survive missing metadata", () => {
    const g = harness();
    for (const max of [650, 1050, 1102.5]) {
      for (const [ratio, stage] of [[1,0],[.751,0],[.75,1],[.501,1],[.5,2],[.251,2],[.25,3],[.101,3],[.1,4],[0,4]])
        assert.equal(g.run(`bossDamageStage({hp:${max * ratio},max:${max}})`), stage);
    }
    assert.equal(g.run('bossDamageStage({hp:1})'), 0);
  });
  test("boss damage: shots and bombs react on crossings, wreck is harmless and resets", () => {
    const g = harness();
    g.run("enemies=[{type:'boss',x:300,y:135,hp:76,max:100}];elapsed=180;damageEnemy(enemies[0],1)");
    assert.equal(g.run('enemies[0].damageReactUntil'), 180.8);
    g.run('elapsed=180.1;damageEnemy(enemies[0],1)');
    assert.equal(g.run('enemies[0].damageReactUntil'), 180.8);
    g.run('bomb(players[0])');
    assert.equal(g.run('bossDamageStage(bossWreck)'), 4);
    assert.equal(g.run('bossWreck.damageReactUntil'), 0);
    assert.equal(g.run('enemies.length'), 0);
    assert.equal(g.run('score'), 5000);
    g.run('kill(bossWreck,players[0])');
    assert.equal(g.run('score'), 5000);
    g.run('update(LEVEL1.loopClearDelay)');
    assert.equal(g.run('bossWreck'), null);
  });
  test("level1 art: delivered PNGs have RGBA headers and exact manifest dimensions", () => {
    const fs = require('node:fs');
    const path = require('node:path');
    const g=harness();
    for(const definition of g.json('[...Object.values(PLAYER_ASSETS),...Object.values(ENEMY_ASSETS)]')){
      const png=fs.readFileSync(path.join(__dirname,'..',definition.sheet));
      assert.equal(png.toString('hex',0,8),'89504e470d0a1a0a');
      assert.equal(png.readUInt32BE(16),definition.cell.width*definition.grid.columns);
      assert.equal(png.readUInt32BE(20),definition.cell.height*definition.grid.rows);
      assert.equal(png[25],6,'RGBA PNG required');
    }
  });
  test("level1 art: enemies render independently, preserve heading and Boss HUD", () => {
    const g=harness();
    g.run(`
      const EnemyImage=function(){this.naturalWidth=256;this.naturalHeight=256};
      Object.defineProperty(EnemyImage.prototype,'src',{set(){this.onload()}});
      const loadedEnemies=createPlayerAssetLoader({Image:EnemyImage},ENEMY_ASSETS);
      const enemyRender=createRenderer(ctx,W,H,()=>{},clamp,null,loadedEnemies);
      const reviewEnemies=['small','heavy','boat','boss'].map(type=>({type,x:300,y:150,hp:100,max:200}));
      const beforeEnemies=JSON.stringify(reviewEnemies);
      enemyRender({mode:'playing',ambient:0,enemies:reviewEnemies,players:[],drops:[],shots:[],hostile:[],sparks:[],flash:0});
    `);
    assert.equal(g.drawCalls.filter(c=>c[0]==='drawImage').length,4);
    assert.equal(g.drawCalls.some(c=>c[0]==='rotate'),false);
    assert.ok(g.drawCalls.some(c=>c[0]==='fillText'&&c[1].includes('IRON WHISKER')));
    assert.equal(g.run('JSON.stringify(reviewEnemies)'),g.run('beforeEnemies'));
  });
  test("player assets: P1/P2 resolve independently with the shared logical grid", () => {
    const g = harness();
    assert.notEqual(g.run('PLAYER_ASSETS["player.p1"].sheet'), g.run('PLAYER_ASSETS["player.p2"].sheet'));
    assert.deepEqual(g.json('PLAYER_ASSETS["player.p1"].cell'), { width: 256, height: 256 });
    assert.deepEqual(g.json('PLAYER_ASSETS["player.p2"].cell'), { width: 256, height: 256 });
    assert.equal(g.run('PLAYER_ASSETS["player.p1"].cell.width * PLAYER_ASSETS["player.p1"].displayScale'), 72);
  });

  test("player assets: every visual state resolves to a valid logical frame", () => {
    const g = harness();
    assert.deepEqual(g.json("PLAYER_VISUAL_STATES"), ["normal", "left", "right", "up", "down", "special", "hit", "crash"]);
    for (const id of ["player.p1", "player.p2"])
      for (const state of g.json("PLAYER_VISUAL_STATES")) {
        const frame = g.json(`PLAYER_ASSETS[${JSON.stringify(id)}].states[${JSON.stringify(state)}]`);
        assert.ok(Number.isInteger(frame.row) && Number.isInteger(frame.column));
        assert.ok(frame.row >= 0 && frame.row < 2 && frame.column >= 0 && frame.column < 4);
      }
  });

  test("player assets: selector is read-only and maps all eight presentation states", () => {
    const g = harness();
    const before = g.json("players[0]");
    const selectors = [
      ["{}", "normal"], ["{x:-1}", "left"], ["{x:1}", "right"],
      ["{y:-1}", "up"], ["{y:1}", "down"],
    ];
    for (const [movement, state] of selectors)
      assert.equal(g.run(`selectPlayerVisualState(players[0],${movement})`), state);
    assert.equal(g.run("selectPlayerVisualState(players[0],{}, {special:true})"), "special");
    assert.equal(g.run("selectPlayerVisualState(players[0],{}, {hit:true})"), "hit");
    assert.equal(g.run("selectPlayerVisualState({...players[0],lives:0})"), "crash");
    assert.deepEqual(g.json("players[0]"), before);
  });

  test("player assets: missing, loading and failed sheets preserve geometry fallback", () => {
    const g = harness();
    g.run("draw()");
    assert.equal(g.drawCalls.some((call) => call[0] === "drawImage"), false);
    assert.equal(g.run('playerAssets.record("player.p1").status'), "missing");
    g.run(`
      const PendingImage = function() { this.naturalWidth=96; this.naturalHeight=96; };
      const pendingAssets = createPlayerAssetLoader({Image: PendingImage});
    `);
    assert.equal(g.run('pendingAssets.record("player.p1").status'), "loading");
    g.run(`
      const FailedImage = function() { this.naturalWidth=0; this.naturalHeight=0; };
      Object.defineProperty(FailedImage.prototype, "src", {set() { this.onerror(); }});
      const failedAssets = createPlayerAssetLoader({Image: FailedImage});
    `);
    assert.equal(g.run('failedAssets.record("player.p1").status'), "failed");
    g.run(`
      let imageConstructed = 0;
      const ValidImage = function() { imageConstructed++; this.naturalWidth=1024; this.naturalHeight=512; };
      Object.defineProperty(ValidImage.prototype, "src", {set() { this.onload(); }});
      const shared = {one:{...PLAYER_ASSETS['player.p1'],sheet:'shared.png'}, two:{...PLAYER_ASSETS['player.p2'],sheet:'shared.png'}};
      const sharedAssets = createPlayerAssetLoader({Image: ValidImage}, shared);
    `);
    assert.equal(g.run("imageConstructed"), 1);
    assert.equal(g.run('sharedAssets.isReady("one") && sharedAssets.isReady("two")'), true);
  });

  test("player assets: ready sheets draw cells without changing gameplay or collision", () => {
    const g = harness();
    g.run(`
      const ReadyImage = function() { this.naturalWidth=1024; this.naturalHeight=512; };
      Object.defineProperty(ReadyImage.prototype, "src", {set() { this.onload(); }});
      const readyAssets = createPlayerAssetLoader({Image: ReadyImage});
      const spriteRender = createRenderer(ctx,W,H,()=>{},clamp,readyAssets);
      const beforePlayer = JSON.stringify(players[0]);
      const beforeRandom = Math.random;
      spriteRender({mode:'playing',ambient:0,enemies:[],drops:[],players,shots:[],hostile:[],sparks:[],flash:0,
        playerVisuals:[{id:'player.p1',state:'left'}]});
    `);
    assert.ok(g.drawCalls.some((call) => call[0] === "drawImage"));
    assert.equal(g.run("JSON.stringify(players[0])"), g.run("beforePlayer"));
    assert.equal(g.run("Math.random===beforeRandom"), true);
    assert.equal(g.run("ENEMY_DEFINITIONS.small.hitHalfWidth"), 25);
  });
};
