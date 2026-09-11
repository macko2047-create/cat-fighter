const vm = require("node:vm"),
  fs = require("node:fs"),
  assert = require("node:assert/strict");
const elements = new Map(),
  events = {};
const context = new Proxy({}, { get: (_, name) => name === "createLinearGradient" ? () => ({addColorStop() {}}) : () => {} });
const el = (s) => {
  if (!elements.has(s))
    elements.set(s, {
      style: {},
      textContent: "",
      innerHTML: "",
      open: false,
      querySelectorAll: () => [],
      addEventListener() {},
      showModal() {
        this.open = true;
      },
      close() {
        this.open = false;
      },
      getContext: () => context,
    });
  return elements.get(s);
};
let gamepads = [];
const sandbox = {
  console,
  Math,
  document: { querySelector: el, addEventListener() {} },
  window: { addEventListener: (n, fn) => (events[n] = fn) },
  navigator: { getGamepads: () => gamepads },
  localStorage: { getItem: () => null, setItem() {} },
  requestAnimationFrame() {},
};
vm.createContext(sandbox);
for (const file of [
  "src/world.js",
  "src/assets.js",
  "src/render.js",
  "src/audio.js",
  "src/levels/level1.js",
  "src/enemies.js",
  "game.js",
]) {
  vm.runInContext(fs.readFileSync(file, "utf8"), sandbox, { filename: file });
}
const run = (s) => vm.runInContext(s, sandbox);
// Each death removes weapon upgrades; protected hits and teammates keep theirs.
for (const level of [1, 2, 3]) {
  for (const rapid of [false, true]) {
    run(`mode='over';joined.fill(true);start();
      Object.assign(players[0], {level:${level},rapid:${rapid},cool:.04,notice:'POWER',noticeUntil:99,bombs:1});
      Object.assign(players[1], {level:3,rapid:true});hurt(players[0]);`);
    assert.equal(run('players[0].level'), level, 'invulnerability prevents penalty');
    assert.equal(run('players[0].rapid'), rapid);
    run('players[0].inv=0;hurt(players[0])');
    assert.equal(run('JSON.stringify([players[0].level,players[0].rapid,players[0].cool,players[0].noticeUntil,players[0].lives,players[0].bombs])'), '[1,false,0,0,2,1]');
    assert.equal(run('JSON.stringify([players[1].level,players[1].rapid,players[1].lives])'), '[3,true,3]');
    run("update(.8);update(.8);shots=[];keys.add('KeyF');update(0);keys.clear()");
    assert.equal(run('shots.length'), 1, 'respawn fires one straight shot');
    assert.equal(run('shots[0].vx'), 0);
    assert.equal(run('players[0].cool'), .12, 'respawn uses normal fire rate');
    run('Object.assign(players[0],{lives:1,inv:0,level:3,rapid:true});hurt(players[0])');
    assert.equal(run('JSON.stringify([players[0].lives,players[0].level,players[0].rapid])'), '[0,1,false]', 'last life also resets weapons');
  }
}
run("mode='over'");
run("joined.fill(true);start()");
assert.equal(run("players.length"), 2);
run("keys.add('KeyF');update(.016)");
assert.ok(run("shots.length") > 0);
run("keys.clear()");
run("hostile=[{x:100,y:100}];bomb(players[0])");
assert.equal(run("hostile.length"), 0);
assert.equal(run("players[0].bombs"), 2);
assert.equal(run("players[1].bombs"), 3);
run("for(let i=0;i<3;i++){players[0].inv=0;hurt(players[0]);if(i<2){update(.8);update(.8)}}");
assert.equal(run("mode"), "playing");
run("for(let i=0;i<3;i++){players[1].inv=0;hurt(players[1]);if(i<2){update(.8);update(.8)}}");
assert.equal(run("mode"), "over");
run("start();elapsed=175;update(.016)");
assert.equal(run("enemies.filter(e=>e.type==='boss').length"), 1);
run("enemies[0].hp=1;bomb(players[0])");
assert.equal(run("mode"), "playing");
assert.ok(run("loopTransition") > 0);
run("update(LEVEL1.loopClearDelay)");
assert.equal(run("loop"), 2);
assert.equal(run("elapsed"), 0);

// A killing shot wins the encounter before same-frame contact/hostile damage.
run(`mode='over';joined.fill(true);start();
  Object.assign(players[0], {lives:2,level:3,bombs:4,inv:0,x:300,y:135});
  players[1].lives=0;score=1234;elapsed=175;update(0);
  const clearedBoss=enemies.find(e=>e.type==='boss');
  clearedBoss.y=135;clearedBoss.hp=.2;
  shots=[{x:300,y:135,vx:0,owner:players[0]}];
  hostile=[{x:300,y:135,vx:0,vy:0}];update(0);`);
assert.equal(run("mode"), "playing");
assert.equal(run("score"), 6234);
assert.equal(run("loopTransition"), 2.6);
assert.equal(run("players[0].lives"), 2);
assert.equal(run("enemies.length+hostile.length+shots.length+drops.length"), 0);
run("kill(clearedBoss,players[0]);bomb(players[0])");
assert.equal(run("score"), 6234, 'boss cannot award twice');
assert.equal(run("players[0].bombs"), 4, 'transition cannot consume bombs');
run("pause();update(1)");
assert.equal(run("loopTransition"), 2.6, 'pause freezes intermission');
run("pause();update(2.6)");
assert.equal(run("loop"), 2);
assert.equal(run("elapsed"), 0);
assert.equal(run("wave"), 0);
assert.equal(run("players.map(p=>p.lives).join()"), '2,0');
assert.equal(run("players[0].level"), 3);
assert.equal(run("players[0].bombs"), 4);
assert.equal(run("players[0].entering"), true);
assert.equal(run("players[0].y"), 855);
run("update(0)");
assert.ok(Math.abs(run("enemies[0].v") - 85 * 1.05) < 1e-9);
run("update(.8)");
assert.equal(run("players[0].entering"), false);
assert.equal(run("players[0].inv"), 3);
run("wave=999;enemies=[];elapsed=150;update(0)");
assert.equal(run("enemies.length+drops.length"),0,'no timed reward carriers');
run("updateAdaptiveDifficulty(12);enemies=[];elapsed=175;update(0);enemies[0].y=135;enemies[0].shoot=0;update(0)");
assert.equal(run("enemies[0].max"), 833, 'surviving solo three-way firepower and 5% loop scaling set Boss health');
assert.ok(Math.abs(run("enemies[0].shoot") - 1.1 / 1.05) < 1e-9);
assert.ok(Math.abs(run("Math.hypot(hostile[0].vx,hostile[0].vy)") - 150 * 1.05) < 1e-9);
run("enemies[0].hp=1;bomb(players[0]);update(2.6)");
assert.equal(run("loop"), 3);
assert.equal(run("score"), 11234);
assert.equal(run("players[0].bombs"), 3);
assert.equal(run("loopDifficulty()"), 1.1, 'difficulty grows linearly');
run("players[0].entering=false;players[0].respawn=0;players[0].lives=1;players[0].inv=0;hurt(players[0])");
assert.equal(run("mode"), 'over');
assert.equal(elements.get('#overlay h2').innerHTML, 'GAME OVER');
run("joined[0]=true;joined[1]=false;start();elapsed=175;enemies=[];update(0)");
assert.equal(run("loop"), 1);
assert.equal(run("score"), 0);
assert.equal(run("enemies[0].max"), 650, 'retry resets difficulty and 1P boss health');

const pad = (i) => ({
  index: i,
  id: "Test " + i,
  axes: [0, 0],
  buttons: Array.from({ length: 16 }, () => ({ pressed: false })),
});
gamepads = [pad(0), pad(1)];
gamepads.forEach((p) => (p.buttons[2].pressed = true));
run("mode='ready';assignments.fill(null);poll()");
assert.equal(run("assignments.join()"), "0,1");
gamepads.forEach((p) => (p.buttons[2].pressed = false));
run("poll();start()");
gamepads[1].axes[0] = 1;
assert.equal(run("input(0).x"), 0);
assert.equal(run("input(1).x"), 1);
gamepads[0].buttons[0].pressed = true;
run("poll()");
assert.equal(run("players[0].bombs"), 2);
assert.equal(run("players[1].bombs"), 3);
events.gamepaddisconnected({ gamepad: gamepads[1] });
assert.equal(run("mode"), "paused");
gamepads[1].buttons[2].pressed = true;
run("poll()");
assert.equal(run("assignments[1]"), 1);
run(
  "start();for(let i=0;i<12000;i++){players.forEach(p=>{p.lives=3;p.inv=10;});update(1/60);draw();}",
);
assert.equal(run("bossSpawned"), true);
assert.ok(run("hostile.length") < 500);
console.log(
  "PASS: co-op, firing, bombs, defeat, boss clear/next loop, independent controllers, reconnect, 200-second simulation.",
);

for (const [hp, count] of [[100,3],[75,5],[50,7],[25,11],[10,11]]) {
  run("start();elapsed=180;wave=999;bossSpawned=true;players[0].entering=false;players[0].respawn=0;players[0].inv=99;shots=[];hostile=[]");
  run(`enemies=[{type:'boss',x:300,y:135,hp:${hp},max:100,age:0,shoot:0}];update(0)`);
  assert.equal(run("hostile.length"),count);
}
for (const hp of [75,50,25]) {
  run(`enemies[0].hp=${hp+1};hostile=[{x:0,y:0,vx:0,vy:1}];damageEnemy(enemies[0],1)`);
  assert.equal(run("hostile.length"),0);
  run("update(1)");
  assert.equal(run("hostile.length"),0,"Boss must pause during damage reveal");
  run("update(.9)");
  assert.ok(run("hostile.length")>0,"Boss resumes after reveal");
}
assert.equal(run("PLAYER_ASSETS['player.p1'].displayScale * 256"),90);
assert.equal(run("ENEMY_ASSETS.boss.displayScale * 256"),300);
console.log("PASS: Boss attack patterns, three bullet clears and reveal pauses, enlarged sprites.");

// Rage keeps existing danger and cancels any previous reveal pause.
run(`enemies[0].hp=11;enemies[0].revealUntil=elapsed+1.5;
  hostile=[{x:0,y:0,vx:0,vy:1}];damageEnemy(enemies[0],1);`);
assert.equal(run('enemies[0].hp'),10);
assert.equal(run('hostile.length'),1);
run('update(0)');
assert.equal(run('hostile.length'),12);
assert.equal(run('enemies[0].shoot'),.32);
assert.ok(Math.abs(run('Math.hypot(hostile[1].vx,hostile[1].vy)')-120)<1e-8);

for (const max of [650,1050,1102]) {
  run(`var rageProbe={type:'boss',x:300,y:135,hp:${max}*.1+5,max:${max}};
    damageEnemy(rageProbe,95);`);
  assert.ok(Math.abs(run('rageProbe.hp')-(max*.1-18))<1e-8,'bomb crossing only reduces damage below 10%');
  run(`rageProbe.hp=${max}*.1;var rageHits=0;
    while(rageProbe.hp>0 && rageHits<1000){damageEnemy(rageProbe,1);rageHits++;}`);
  assert.equal(run('rageHits'),Math.ceil(max*.5),'last 10% takes five times as many shots');
}

// Simulate rage volleys travelling to a stationary player, without invulnerability.
run(`mode='over';joined[0]=true;joined[1]=false;start();elapsed=180;wave=999;bossSpawned=true;
  keys.clear();
  Object.assign(players[0],{entering:false,respawn:0,inv:0,x:300,y:690});
  enemies=[{type:'boss',x:300,y:135,hp:65,max:650,age:0,shoot:0}];
  for(var tick=0;tick<420;tick++)update(1/60);`);
assert.ok(run('players[0].lives')<3,'rage bullets reach and hurt a stationary player');
console.log('PASS: rage resistance, crossing bombs, immediate fire, slower bullets and stationary-player danger.');

// Check call arguments, since bomb/tryRejoin also tolerate missing players internally.
run(`var savedBomb = bomb, savedRejoin = tryRejoin, inputCalls = [];
  bomb = p => inputCalls.push(['bomb', p?.controlSlot]);
  tryRejoin = index => { inputCalls.push(['rejoin', index]); return false; };`);
for (const slot of [0, 1]) {
  run(`mode='ready';joined.fill(false);joined[${slot}]=true;start();inputCalls=[];`);
  for (const code of ['KeyG', 'KeyL', 'KeyF', 'KeyK'])
    events.keydown({code, repeat:false, preventDefault() {}});
  assert.equal(run('JSON.stringify(inputCalls)'), JSON.stringify([['bomb', slot], ['rejoin', 0]]));
  gamepads = [0, 1].map(index => ({id:'Guard test '+index, index, axes:[0,0,0,0],
    buttons:Array.from({length:17}, () => ({pressed:false, value:0}))}));
  run('assignments[0]=0;assignments[1]=1;previous.clear();inputCalls=[];poll()');
  for (const pad of gamepads) {
    const fire = run(`config(navigator.getGamepads()[${pad.index}]).fire`);
    const bombButton = run(`config(navigator.getGamepads()[${pad.index}]).bomb`);
    pad.buttons[fire].pressed = true;
    pad.buttons[bombButton].pressed = true;
  }
  run('poll()');
  assert.equal(run('JSON.stringify(inputCalls)'), JSON.stringify([['rejoin', 0], ['bomb', slot]]));
}
run('bomb=savedBomb;tryRejoin=savedRejoin');
assert.equal(run('ENEMY_ASSETS.bossDamage.cell.width * ENEMY_ASSETS.bossDamage.displayScale'), 300);
console.log('PASS: P1-only/P2-only keyboard and gamepad calls skip absent slots; Boss damage matches 300px body.');

// Exercise the enlarged edges through the actual collision loop.
for (const [type, width, height, contact] of [
  ['small',25,31.25,20], ['heavy',41.25,31.25,33],
  ['boat',25,31.25,20], ['boss',106.25,60,85],
]) {
  for (const [dx,dy,hit] of [[width-.01,0,true],[0,height-.01,true],
    [width,0,false],[0,height,false]]) {
    run(`mode='over';joined.fill(false);joined[0]=true;start();wave=999;
      enemies=[{type:'${type}',x:300,y:135,hp:3,v:0,phase:0,age:0,shoot:999}];
      shots=[{x:300+${dx},y:135+${dy},vx:0,owner:players[0]}];update(0);`);
    assert.equal(run('enemies[0].hp'),hit?2:3, `${type} hitbox at ${dx},${dy}`);
  }
  run(`players[0].inv=0;players[0].x=300+${contact}+13;players[0].y=135;
    shots=[];update(0);`);
  assert.equal(run('players[0].lives'),3, `${type} body-contact boundary stays unchanged`);
}
run(`enemies=[{type:'small',x:300,y:135,hp:3,v:0,phase:0,age:0,shoot:999}];
  players[0].y=690;
  shots=Array.from({length:3},()=>({x:324,y:135,vx:0,owner:players[0]}));update(0);`);
assert.equal(run('enemies.length'),0,'small enemy still takes three one-damage hits');
console.log('PASS: 1.25x enemy bullet hitboxes, exact boundaries, unchanged contact range and three-hit small enemies.');

// Collect real drops and fire to verify both the bonus and resulting cooldown.
gamepads = [];
for (const level of [1, 2, 3]) {
  for (const rapid of [false, true]) {
    for (const weapon of ['rapid', 'double', 'spread', null]) {
      run(`mode='over';joined.fill(true);start();wave=999;enemies=[];keys.clear();
        players[0].level=${level};players[0].rapid=${rapid};
        players[1].level=2;players[1].rapid=true;
        supply(players[0].x,players[0].y,'W','double');
        drops[0].weapon=${JSON.stringify(weapon)};update(0);`);
      const nextLevel = weapon === 'rapid' ? level : weapon === 'double' ? 2 : weapon === 'spread' ? 3 : Math.min(3, level + 1);
      const nextRapid = weapon === 'rapid' || (nextLevel === level && rapid);
      assert.equal(run('players[0].level'), nextLevel);
      assert.equal(run('players[0].rapid'), nextRapid, `${level}/${rapid} picks ${weapon}`);
      assert.equal(run('players[1].rapid'), true, 'teammate bonus is independent');
      run("players[0].cool=0;keys.add('KeyF');update(0);keys.clear()");
      assert.equal(run('players[0].cool'), nextRapid ? .06 : .12);
      assert.equal(run('shots.length'), nextLevel);
    }
  }
}
console.log('PASS: 24 reward combinations, pattern-change speed reset, same-pattern retention, Rapid reacquisition and actual firing cadence.');

// No bonus carriers are injected by timers, death or co-op rejoin.
run(`mode='over';joined.fill(true);start();wave=999;elapsed=180;bossSpawned=true;
  players.forEach(p=>{p.inv=0;hurt(p)});update(.8);update(0);`);
assert.equal(run('enemies.length'),0);
run(`Object.assign(players[0],{lives:0,rejoinRemaining:0});tryRejoin(0);update(0)`);
assert.equal(run('enemies.length'),0);
for (const time of [50,100,150]) {
  run(`elapsed=${time};update(0)`);
  assert.equal(run('enemies.length+drops.length'),0,'no legacy timed supplies');
}

// Formation rewards use actual spawning, killing and deterministic rolls.
const originalRandom = sandbox.Math.random;
try {
  for (const two of [false,true]) {
    run(`mode='over';joined[0]=true;joined[1]=${two};start()`);
    // Existing uncollected rewards must never suppress the next carrier.
    run("supply(300,300,'B')");
    for (const n of [7,14,21,28,35,42]) {
      run(`enemies=[];wave=${n-1};spawn()`);
      const weapon = (n/7)%2 ? 'double' : 'spread';
      assert.equal(run('enemies.filter(e=>e.reward).length'),1);
      assert.equal(run('enemies[0].type'),'boat');
      assert.equal(run('enemies[0].reward.weapon'),weapon);
      run('kill(enemies[0],players[0]);kill(enemies[0],players[0])');
      assert.equal(run('drops.at(-1).weapon'),weapon);
    }
    run('nextLoop();enemies=[];wave=6;spawn()');
    assert.equal(run('enemies[0].reward.weapon'),'double','boat cycle restarts each loop');
    for (const [roll,type] of [[0,'B'],[.499999,'B'],[.5,'1UP'],[.599999,'1UP'],[.6,null],[.999999,null]]) {
      sandbox.Math.random=()=>roll;
      for (const n of [5,10,15,20,30,40]) {
        run(`enemies=[];wave=${n-1};spawn()`);
        assert.equal(run('enemies.filter(e=>e.reward).length'),type ? 1 : 0);
        if (type) {
          assert.equal(run('enemies[0].reward.type'),type);
          const before=run('drops.length');
          run('kill(enemies[0],players[0]);kill(enemies[0],players[0])');
          assert.equal(run('drops.length'),before+1,'carrier drops only once');
          assert.equal(run('drops.at(-1).type'),type);
        }
      }
    }
    sandbox.Math.random=()=>.1;
    for (const n of [4,6,8,12]) {
      run(`enemies=[];wave=${n-1};spawn()`);
      assert.equal(run('enemies.filter(e=>e.chargeState).length'),1);
      assert.equal(run('JSON.stringify(enemies.find(e=>e.chargeState).reward)'),'{"type":"W","weapon":"rapid"}');
      run('kill(enemies.find(e=>e.chargeState),players[0])');
      assert.equal(run('drops.at(-1).weapon'),'rapid');
    }
  }
  for (const cycle of [1,2,3,5]) {
    run(`mode='over';joined[0]=true;joined[1]=false;start();loop=${cycle};spawn()`);
    const factor=1+(cycle-1)*.05;
    assert.ok(Math.abs(run('enemies[0].v')-85*factor)<1e-8);
    run('enemies=[];elapsed=175;wave=999;update(0);enemies[0].y=135;enemies[0].hp=1;enemies[0].shoot=0;update(0)');
    assert.equal(run('enemies[0].max'),Math.round(650*factor));
    assert.ok(Math.abs(run('Math.hypot(hostile[0].vx,hostile[0].vy)')-120*factor)<1e-8);
    assert.ok(Math.abs(run('enemies[0].shoot')-.32/factor)<1e-8);
  }
} finally {sandbox.Math.random=originalRandom;}
console.log('PASS: kamikaze Rapid, alternating boat upgrades, exclusive 50% Bomb / 10% 1UP rolls, no legacy supplies, slower final-phase bullets and per-loop scaling.');

// Adaptive difficulty keeps upgrades rewarding and only affects future spawns.
run("mode='over';joined.fill(true);start();spawn()");
assert.equal(run('enemies.length'),7);
assert.equal(run('difficultyTarget().pressure'),1);
run('players.forEach(p=>Object.assign(p,{level:2}));updateAdaptiveDifficulty(12)');
assert.ok(Math.abs(run('adaptiveDifficulty.pressure')-1.14)<1e-9);
run('players.forEach(p=>Object.assign(p,{level:3,rapid:true}));updateAdaptiveDifficulty(1)');
assert.ok(run('adaptiveDifficulty.pressure < 1.35'),'upgrades do not instantly raise pressure');
run('updateAdaptiveDifficulty(12);enemies=[];spawn()');
assert.equal(run('adaptiveDifficulty.pressure'),1.35);
assert.equal(run('enemies.length'),9,'max-power coop adds two enemies');
assert.equal(run('enemies[0].hp'),3,'small enemies retain their hit count');
run('enemies=[];wave=4;spawn()');
assert.equal(run('enemies.length'),2,'heavy formations retain their authored count');
run('enemies=[];wave=6;spawn()');
assert.equal(run('enemies.length'),9);
assert.equal(run('enemies.filter(e=>e.reward).length'),1,'more boats do not multiply rewards');
run('players[0].inv=0;hurt(players[0]);updateAdaptiveDifficulty(.8)');
assert.equal(run('adaptiveDifficulty.count'),2,'respawning player still counts');
run('players[0].lives=0;players[1].level=1;players[1].rapid=false;updateAdaptiveDifficulty(1)');
assert.ok(Math.abs(run('adaptiveDifficulty.count')-1.8)<1e-9);
run('updateAdaptiveDifficulty(4);enemies=[];wave=0;spawn()');
assert.equal(run('adaptiveDifficulty.count'),1);
assert.equal(run('adaptiveDifficulty.pressure'),1);
assert.equal(run('enemies.length'),5,'eliminated teammate no longer forces coop formations');
run('players[0].rejoinRemaining=0;tryRejoin(0);updateAdaptiveDifficulty(1)');
assert.ok(run('adaptiveDifficulty.count > 1 && adaptiveDifficulty.count < 2'),'rejoin increases pressure gradually');
run('updateAdaptiveDifficulty(12)');
assert.equal(run('adaptiveDifficulty.count'),2);
run("mode='over';joined[0]=true;joined[1]=false;start();players[0].level=3;players[0].rapid=true;updateAdaptiveDifficulty(12);elapsed=175;wave=999;update(0)");
assert.equal(run('enemies[0].max'),878,'solo max-power boss has capped bonus HP');
run('players[0].level=1;players[0].rapid=false;updateAdaptiveDifficulty(12);update(0)');
assert.equal(run('enemies[0].max'),878,'existing boss HP stays fixed when weapons change');
run("mode='over';joined.fill(true);start();players[0].lives=0;updateAdaptiveDifficulty(5);elapsed=175;wave=999;update(0)");
assert.equal(run('enemies[0].max'),650,'boss uses surviving team size');
run("mode='over';start();players.forEach(p=>{p.level=3;p.rapid=true});updateAdaptiveDifficulty(12)");
run(`const adaptiveLive = adaptiveDifficulty;
  const adaptiveScene = {mode,elapsed,score,players:[pilot(0)],enemies:[],shots:[],hostile:[],drops:[],sparks:[],bossDebris:[],
    wave:0,loop:1,loopTransition:0,bossSpawned:false,bossWreck:null,flash:0,ambient:0};
  runGamePreview(adaptiveScene,()=>{updateAdaptiveDifficulty(12);spawn()});`);
assert.equal(run('adaptiveScene.enemies.length'),5,'preview starts with its own team difficulty');
assert.equal(run('adaptiveDifficulty === adaptiveLive'),true,'preview restores live difficulty');
run("mode='over';joined[1]=false;start()");
assert.equal(run('adaptiveDifficulty.pressure'),1,'new game clears prior pressure');
assert.equal(run('adaptiveDifficulty.count'),1);
run('players[0].level=3;players[0].rapid=true;mode="paused";update(12)');
assert.equal(run('adaptiveDifficulty.pressure'),1,'pause freezes adaptation');
run('mode="playing";loopTransition=2;update(.5)');
assert.equal(run('adaptiveDifficulty.pressure'),1,'loop transition freezes adaptation');
console.log('PASS: adaptive team/firepower scaling, smoothing, death/rejoin, fixed Boss HP, rewards and preview isolation.');

// The historical characterization suite remains available without --current.
// It records superseded gameplay (one-shot victory, old drop rates) and art hashes.
if (!process.argv.includes("--current")) require("./baseline.test.cjs");
