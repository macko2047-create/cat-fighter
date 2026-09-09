const {chromium} = require('playwright');
const assert = require('node:assert/strict');
const path = require('node:path');

(async () => {
  const browser = await chromium.launch({headless:true, executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
  try {
    const page = await browser.newPage({viewport:{width:390,height:844},hasTouch:true,isMobile:true});
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.addInitScript(() => { window.requestAnimationFrame = () => 0; });
    const url = process.env.CAT_URL || 'file://' + path.resolve(process.env.CAT_ROOT || '.', 'index.html');
    await page.goto(url);
    // Exercise the viewport fallback independently of fullscreen support.
    await page.evaluate(() => { document.documentElement.requestFullscreen = () => Promise.reject(new Error('unsupported')); });
    await page.locator('#boot').click();
    await page.evaluate(() => window.arcade.frame(3));
    await page.locator('#demo-start').click();
    assert.equal(await page.evaluate(() => mode), 'playing');
    const session = await page.context().newCDPSession(page);
    const touch = (type, point) => session.send('Input.dispatchTouchEvent', {type, touchPoints:point ? [point] : []});
    const close = (actual, expected, message) => assert.ok(Math.abs(actual - expected) < .01, `${message}: ${actual} versus ${expected}`);

    for (const [width,height] of [[390,844],[360,640],[430,932],[844,390],[1440,900]]) {
      await page.setViewportSize({width,height});
      // visualViewport delivers a later resize that intentionally resets held input.
      await page.waitForFunction(() =>
        parseFloat(document.documentElement.style.getPropertyValue('--play-width')) === window.visualViewport.width &&
        parseFloat(document.documentElement.style.getPropertyValue('--play-height')) === window.visualViewport.height);
      await page.waitForTimeout(100);
      const boxes = await page.evaluate(() => {
        const rect = s => { const r = document.querySelector(s).getBoundingClientRect(); return {x:r.x,y:r.y,w:r.width,h:r.height,right:r.right,bottom:r.bottom}; };
        return {game:rect('#game'),bottom:rect('.bottomline'),body:document.documentElement.scrollWidth,header:getComputedStyle(document.querySelector('header')).display};
      });
      close(boxes.game.w / boxes.game.h, .75, 'fixed battlefield aspect ratio');
      assert.ok(boxes.bottom.y >= boxes.game.bottom - .1);
      assert.ok(boxes.bottom.bottom <= height + 1 && boxes.bottom.right <= width + 1);
      assert.ok(boxes.body <= width);
      assert.equal(boxes.header, 'none');
      const g = boxes.game;
      const point = {x:g.x + g.w * 235 / 600, y:g.y + g.h * 650 / 800, id:1};
      const targetY = 650 - 72 * 800 / g.h;
      await page.evaluate(y => {
        Object.assign(players[0], {x:235,y,inv:10,bombs:3});
        wave=999; elapsed=0; enemies=[]; hostile=[]; shots=[]; drops=[];
      }, targetY);
      await touch('touchStart', point);
      let state = await page.evaluate(() => ({target:flightControls.target,input:input(0),p2:input(1)}));
      close(point.y - (g.y + state.target.y * g.h / 800), 72, `finger remains 72 screen pixels behind fighter at ${width}x${height}: ${JSON.stringify(await page.locator('#game').boundingBox())}`);
      close(state.input.x, 0, 'no lateral movement at touch anchor');
      close(state.input.y, 0, 'no vertical movement at touch anchor');
      assert.equal(state.input.fire, true);
      assert.deepEqual(state.p2, {x:0,y:0,fire:false});
      await touch('touchMove', {...point,x:point.x + 50});
      await page.waitForFunction(() => flightControls.target?.x > 235, null, {polling:20});
      state = await page.evaluate(() => ({target:flightControls.target,input:input(0)}));
      assert.ok(state.input.x > .99);
      close(state.input.y, 0, 'horizontal drag stays horizontal');
      const settled = await page.evaluate(() => {
        for (let i=0; i<180; i++) update(1/60);
        const first={x:players[0].x,y:players[0].y};
        for (let i=0; i<20; i++) update(1/60);
        return {first,last:{x:players[0].x,y:players[0].y},target:flightControls.target};
      });
      close(settled.first.x, state.target.x, 'fighter reaches touch target');
      close(settled.last.x, settled.first.x, 'held target does not jitter');
      close(settled.last.y, targetY, 'fighter keeps finger clearance');
      await touch('touchMove', {...point,x:g.x + 1,y:g.y + 1});
      await page.waitForFunction(() => flightControls.target?.x === 24, null, {polling:20});
      assert.deepEqual(await page.evaluate(() => flightControls.target), {x:24,y:60});
      await page.evaluate(() => { players[0].x=24; players[0].y=60; });
      state = await page.evaluate(() => input(0));
      assert.deepEqual(state, {x:0,y:0,fire:true});
      await touch('touchMove', {...point,x:g.right - 1,y:point.y});
      await page.waitForFunction(() => flightControls.target?.x === 576, null, {polling:20});
      assert.equal(await page.evaluate(() => flightControls.target.x), 576);
      await touch('touchEnd');
      assert.deepEqual(await page.evaluate(() => ({active:flightControls.active,target:flightControls.target,input:input(0)})), {active:false,target:null,input:{x:0,y:0,fire:false}});
      await page.evaluate(() => { draw(); updateHUD(); });
      await page.screenshot({path:`artifacts/touch-ui/${width}x${height}.png`});
    }

    await page.setViewportSize({width:390,height:844});
    const g = await page.locator('#game').boundingBox();
    const point = {x:g.x+g.width/2,y:g.y+g.height*650/800,id:1};
    await page.waitForTimeout(400);
    await page.evaluate(() => { players[0].bombs=3; });
    // A real double tap consumes one bomb, including the browser's follow-up dblclick.
    for (let i=0; i<2; i++) { await touch('touchStart', point); await touch('touchEnd'); }
    assert.equal(await page.evaluate(() => players[0].bombs), 2);
    await page.locator('#game').dblclick({position:{x:g.width/2,y:g.height*650/800}});
    assert.equal(await page.evaluate(() => players[0].bombs), 2);
    await page.waitForTimeout(500);
    await page.locator('#game').dblclick({position:{x:g.width/2,y:g.height*650/800}});
    assert.equal(await page.evaluate(() => players[0].bombs), 1);
    // Cancellation and resizing must not leave movement or firing held.
    await touch('touchStart', point);
    await touch('touchCancel');
    assert.equal(await page.evaluate(() => flightControls.active), false);
    await touch('touchStart', point);
    await page.setViewportSize({width:391,height:844});
    await page.waitForFunction(() => !flightControls.active, null, {polling:20});
    await touch('touchEnd');
    assert.deepEqual(await page.evaluate(() => input(0)), {x:0,y:0,fire:false});
    await page.waitForTimeout(400);
    await page.evaluate(() => { players[0].bombs=0; });
    for (let i=0; i<2; i++) { await touch('touchStart', point); await touch('touchEnd'); }
    assert.equal(await page.evaluate(() => players[0].bombs), 0);
    await page.evaluate(() => { loopTransition=1; players[0].bombs=3; });
    await touch('touchStart', point);
    assert.equal(await page.evaluate(() => flightControls.active), false);
    await touch('touchEnd');
    await page.locator('#game').dblclick({position:{x:g.width/2,y:g.height*650/800}});
    assert.equal(await page.evaluate(() => players[0].bombs), 3);
    await page.evaluate(() => { loopTransition=0; });
    await touch('touchStart', point);
    assert.equal(await page.evaluate(() => flightControls.active), true);
    await page.evaluate(() => { loopTransition=1; flightControls.sync(); });
    assert.equal(await page.evaluate(() => flightControls.active), false);
    await touch('touchEnd');
    await page.evaluate(() => { loopTransition=0; });

    // The second pointerdown can clear the level before it acquires controls.
    await page.waitForTimeout(400);
    await page.evaluate(() => {
      players[0].bombs=3;
      enemies=[{type:'boss',x:300,y:130,hp:1}];
    });
    await touch('touchStart', point);
    await touch('touchEnd');
    await page.evaluate(() => {
      document.querySelector('.screen').addEventListener('pointerdown', e => {
        window.lethalTouchPointerId=e.pointerId;
      }, {capture:true,once:true});
    });
    await touch('touchStart', point);
    assert.deepEqual(await page.evaluate(() => ({
      cleared:loopTransition>0,
      bombs:players[0].bombs,
      active:flightControls.active,
      target:flightControls.target,
      captured:document.querySelector('.screen').hasPointerCapture(window.lethalTouchPointerId),
      input:input(0),
    })), {cleared:true,bombs:2,active:false,target:null,captured:false,input:{x:0,y:0,fire:false}});
    await touch('touchEnd');
    await page.evaluate(() => { loopTransition=0; });

    await page.locator('#pause').click();
    assert.equal(await page.evaluate(() => mode), 'paused');
    assert.equal(await page.locator('#start').textContent(), 'RESUME ▶');
    assert.equal(await page.locator('#test').isVisible(), false, 'controller setup is hidden from touch menu');
    assert.equal(await page.evaluate(() => mode), 'paused');
    await page.screenshot({path:'artifacts/touch-ui/menu.png'});
    await page.locator('#start').click();
    assert.equal(await page.evaluate(() => mode), 'playing');
    const padInput = await page.evaluate(() => {
      const pad={index:0,id:'QA pad',axes:[1,1],buttons:Array.from({length:16},()=>({pressed:false}))};
      navigator.getGamepads=()=>[pad]; assignments[0]=0;
      return input(0);
    });
    close(padInput.x, Math.SQRT1_2, 'gamepad diagonal x remains normalized');
    close(padInput.y, Math.SQRT1_2, 'gamepad diagonal y remains normalized');
    const desktop = await browser.newPage({viewport:{width:1280,height:900}});
    await desktop.goto(url);
    await desktop.locator('#boot').click();
    await desktop.locator('#demo-start').click();
    await desktop.waitForFunction(() => !!document.fullscreenElement);
    await desktop.evaluate(() => document.exitFullscreen());
    await desktop.waitForFunction(() => mode==='paused');
    await desktop.close();
    assert.deepEqual(errors, []);
    console.log('PASS: five touch layouts, 72 px finger clearance, exact arrival without jitter, edge clamp, release/cancel/resize, double-tap bomb and lethal boss clear, loop intermission, pause/resume, hidden controller menu, gamepad parity, fullscreen exit, no browser errors');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode=1; });
