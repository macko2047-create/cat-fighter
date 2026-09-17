const {chromium} = require('playwright');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const {pathToFileURL} = require('node:url');

(async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  });
  try {
    const page = await browser.newPage({viewport: {width: 390, height: 844}, hasTouch: true, isMobile: true});
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    // Drive simulation time explicitly so countdown and button edges are deterministic.
    await page.addInitScript(() => { window.requestAnimationFrame = () => 0; });
    await page.goto(process.env.CAT_URL || pathToFileURL(path.resolve(__dirname, '../index.html')).href);
    await page.evaluate(() => document.fonts.ready);
    await page.waitForFunction(() => Object.keys(PLAYER_ASSETS).every(id => playerAssets.isReady(id)) &&
      Object.keys(ENEMY_ASSETS).every(id => enemyAssets.isReady(id)));
    await page.locator('#boot').click();
    await page.evaluate(() => arcade.frame(3));
    await page.locator('#demo-start').click();
    await page.evaluate(() => {
      window.rejoinTest = {
        reset(two = true) {
          document.body.dataset.inputMode = 'controller';
          mode = 'ready'; keyboard2 = two; joined[0] = true; joined[1] = two; assignments.fill(null); previous.clear(); keys.clear();
          navigator.getGamepads = () => [];
          start(); wave = 999; nextSupply = Infinity; extraLifeSpawned = true;
          players.forEach(p => { p.inv = 1000; });
          updateHUD();
        },
        exhaust(index) {
          const p = players[index];
          while (p.lives > 0) {
            p.inv = 0; p.respawn = 0; p.entering = false; hurt(p);
          }
          updateHUD();
        },
        tick(dt) { update(dt); updateHUD(); },
      };
    });
    const run = fn => page.evaluate(fn);
    const artifactDir = path.resolve(__dirname, '../artifacts/arcade-ui');
    fs.mkdirSync(artifactDir, {recursive: true});
    async function verifyLayoutAndCapture(state) {
      for (const [width, height, suffix] of [[390, 844, ''], [844, 390, '-landscape']]) {
        await page.setViewportSize({width, height});
        await page.evaluate(() => window.dispatchEvent(new Event('resize')));
        const layout = await run(() => {
          updateHUD(); draw();
          const rect = selector => {
            const r = $(selector).getBoundingClientRect();
            return {left: r.left, right: r.right, top: r.top, bottom: r.bottom};
          };
          return {p1: rect('#flight-health .p1'), p2: rect('#flight-health .p2'),
            pause: rect('#pause'), bar: rect('.bottomline'), height: innerHeight};
        });
        assert.ok(layout.p1.right <= layout.p2.left, `${state} ${width}: pilot HUDs must not overlap`);
        assert.ok(layout.p2.right <= layout.pause.left, `${state} ${width}: rejoin and pause must not overlap`);
        assert.ok(layout.bar.bottom <= layout.height + 1, `${state} ${width}: bottom HUD stays on screen`);
        for (const item of [layout.p1, layout.p2, layout.pause]) {
          assert.ok(item.top >= layout.bar.top && item.bottom <= layout.bar.bottom + 1,
            `${state} ${width}: controls fit inside bottom HUD`);
        }
        await page.screenshot({path: path.join(artifactDir, `rejoin-${state}${suffix}.png`)});
      }
      await page.setViewportSize({width: 390, height: 844});
    }

    await run(() => {
      rejoinTest.reset();
      players[0].level = 3; players[0].bombs = 1; players[0].rapid = true;
      players[0].notice = 'RAPID'; players[0].noticeUntil = 99;
      score = 12345;
      rejoinTest.exhaust(0);
    });
    assert.deepEqual(await run(() => [players[0].lives, players[0].rejoinRemaining, mode]), [0, 10, 'playing']);
    assert.match(await page.locator('#flight-health .p1').innerText(), /P1 10\s+WAIT/);
    assert.equal(await page.locator('[data-rejoin="0"]').isDisabled(), true);
    await verifyLayoutAndCapture('countdown');
    await page.keyboard.down('KeyF');
    assert.equal(await run(() => players[0].lives), 0, 'early fire must not rejoin');
    await run(() => rejoinTest.tick(2.25));
    assert.match(await page.locator('#flight-health .p1').innerText(), /P1 08/);
    assert.deepEqual(await run(() => {
      pause(); rejoinTest.tick(50);
      return [mode, players[0].rejoinRemaining];
    }), ['paused', 7.75], 'pause must freeze countdown');
    await run(() => { pause(); rejoinTest.tick(7.75); });
    assert.deepEqual(await run(() => [players[0].lives, players[0].rejoinRemaining]), [0, 0]);
    assert.match(await page.locator('#flight-health .p1').innerText(), /JOIN\s+FIRE \/ F/);
    assert.equal(await page.locator('[data-rejoin="0"]').isEnabled(), true);
    await verifyLayoutAndCapture('ready');
    await page.keyboard.down('KeyF');
    assert.equal(await run(() => players[0].lives), 0, 'held key repeat must not auto-rejoin after countdown');
    const teammate = await run(() => ({...players[1]}));
    await page.keyboard.up('KeyF');
    await page.keyboard.press('KeyF');
    assert.deepEqual(await run(() => {
      const p = players[0];
      return [p.lives, p.bombs, p.level, p.y, p.entering, p.inv, p.rapid, p.noticeUntil, score, mode];
    }), [3, 3, 1, 855, true, 3, false, 0, 12345, 'playing']);
    assert.deepEqual(await run(() => ({...players[1]})), teammate, 'rejoin must preserve teammate');
    assert.equal(await page.locator('[data-rejoin="0"]').count(), 0);
    assert.deepEqual(await run(() => {
      rejoinTest.tick(.75);
      return [players[0].y, players[0].entering, players[0].inv];
    }), [690, false, 3], 'rejoin uses protected bottom fly-in');
    assert.equal(await run(() => { players[0].bombs = 1; return tryRejoin(0); }), false);
    assert.equal(await run(() => players[0].bombs), 1, 'live pilot cannot refill equipment by rejoining');

    // P2 gets its own keyboard action and mobile HUD button.
    await run(() => { rejoinTest.reset(); rejoinTest.exhaust(1); rejoinTest.tick(10); });
    await page.keyboard.press('KeyK');
    assert.deepEqual(await run(() => players.map(p => p.lives)), [3, 3]);
    await run(() => { rejoinTest.exhaust(1); rejoinTest.tick(10); });
    assert.match(await page.locator('#flight-health .p2').innerText(), /JOIN\s+FIRE \/ K/);
    await page.locator('[data-rejoin="1"]').tap();
    assert.deepEqual(await run(() => [players[1].lives, players[1].entering, players[0].lives]), [3, true, 3]);

    // Controller fire also requires a fresh press after the full wait.
    const gamepadResult = await run(() => {
      rejoinTest.reset();
      const pad = {id: 'Rejoin test controller', index: 0, mapping: 'standard', axes: [0, 0, 0, 0],
        buttons: Array.from({length: 17}, () => ({pressed: false, value: 0}))};
      navigator.getGamepads = () => [pad]; assignments[0] = pad.index;
      const fire = config(pad).fire;
      rejoinTest.exhaust(0);
      pad.buttons[fire].pressed = true; poll();
      const early = players[0].lives;
      rejoinTest.tick(10); poll();
      const held = players[0].lives;
      pad.buttons[fire].pressed = false; poll();
      pad.buttons[fire].pressed = true; poll();
      return {early, held, joined: players[0].lives, teammate: players[1].lives};
    });
    assert.deepEqual(gamepadResult, {early: 0, held: 0, joined: 3, teammate: 3});

    const acrossLoops = await run(() => {
      rejoinTest.reset(); rejoinTest.exhaust(0); rejoinTest.tick(3);
      completeLoop();
      rejoinTest.tick(LEVEL1.loopClearDelay / 2);
      const during = [players[0].rejoinRemaining, tryRejoin(0)];
      rejoinTest.tick(LEVEL1.loopClearDelay / 2);
      const next = [loop, players[0].lives, players[0].rejoinRemaining];
      rejoinTest.tick(7);
      return {during, next, ready: [players[0].lives, players[0].rejoinRemaining]};
    });
    assert.deepEqual(acrossLoops, {during: [7, false], next: [2, 0, 7], ready: [0, 0]});
    await page.keyboard.press('KeyF');
    assert.equal(await run(() => players[0].lives), 3);

    const defeat = await run(() => {
      rejoinTest.reset(); rejoinTest.exhaust(0); rejoinTest.tick(10);
      rejoinTest.exhaust(1); rejoinTest.tick(20);
      return [mode, players.map(p => p.lives), players[1].rejoinRemaining, tryRejoin(0), tryRejoin(1)];
    });
    assert.deepEqual(defeat, ['over', [0, 0], 10, false, false]);
    await page.keyboard.press('KeyF'); await page.keyboard.press('KeyK');
    assert.deepEqual(await run(() => [mode, players.map(p => p.lives)]), ['over', [0, 0]]);
    assert.equal(await page.locator('[data-rejoin]').count(), 0, 'team defeat removes join prompts');

    assert.deepEqual(await run(() => {
      rejoinTest.reset(false); rejoinTest.exhaust(0); rejoinTest.tick(10);
      return [mode, players.length, players[0].rejoinRemaining, tryRejoin(0)];
    }), ['over', 1, 0, false], 'single-player defeat does not offer co-op rejoin');
    assert.equal(await page.locator('[data-rejoin]').count(), 0);
    assert.deepEqual(errors, []);
    console.log('PASS: 2P ten-second rejoin, paused and intermission clocks, keyboard/gamepad fresh presses, mobile HUD join, protected equipment reset, teammate/score preservation, loop carryover and team/1P defeat');
  } finally {
    await browser.close();
  }
})().catch(e => { console.error(e); process.exitCode = 1; });
