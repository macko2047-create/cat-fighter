const {chromium} = require('playwright');
const assert = require('node:assert/strict');
const path = require('node:path');

const sizes = [
  [360,640],
  [390,844],
  [844,390],
  [768,1024],
  [1024,768],
  [1440,900],
];

(async () => {
  const browser = await chromium.launch({headless:true, executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
  const url = process.env.CAT_URL || 'file://' + path.resolve(process.env.CAT_ROOT || '.', 'index.html');
  try {
    const page = await browser.newPage({viewport:{width:390,height:844}, hasTouch:true, isMobile:true});
    const errors=[];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => { window.requestAnimationFrame=()=>0; });
    await page.goto(url);
    await page.evaluate(() => { document.documentElement.requestFullscreen=()=>Promise.reject(new Error('unsupported')); });
    await page.locator('#boot').click();
    await page.evaluate(() => window.arcade.frame(3));
    await page.locator('#demo-start').click();
    await page.locator('#start').click();
    assert.equal(await page.evaluate(() => mode),'playing');

    for (const [width,height] of sizes) {
      await page.setViewportSize({width,height});
      await page.waitForTimeout(100);
      const viewportSizing = await page.evaluate(() => ({
        cssWidth:parseFloat(document.documentElement.style.getPropertyValue('--play-width')),
        cssHeight:parseFloat(document.documentElement.style.getPropertyValue('--play-height')),
        visualWidth:window.visualViewport.width,
        visualHeight:window.visualViewport.height,
      }));
      assert.ok(Math.abs(viewportSizing.cssWidth-viewportSizing.visualWidth)<1,`visualViewport width applied at ${width}x${height}`);
      assert.ok(Math.abs(viewportSizing.cssHeight-viewportSizing.visualHeight)<1,`visualViewport height applied at ${width}x${height}`);
      await page.locator('#pause').click();
      assert.equal(await page.evaluate(() => mode), 'paused');
      const layout = await page.evaluate(() => {
        const visible = selector => {
          const element=document.querySelector(selector), rect=element.getBoundingClientRect();
          const style=getComputedStyle(element);
          return style.display!=='none' && style.visibility!=='hidden' && rect.width>0 && rect.height>0 &&
            rect.left>=-1 && rect.top>=-1 && rect.right<=window.visualViewport.width+1 && rect.bottom<=window.visualViewport.height+1;
        };
        const unrelated=['#player-status','#lan-open','#sound','#test','#fullscreen','#watch-demo'];
        const overlay=document.querySelector('#overlay');
        return {
          actions:['#start','#pause-settings','#pause-main-menu'].every(visible),
          exitHidden:document.querySelector('#pause-exit-fullscreen').hidden,
          unrelatedHidden:unrelated.every(selector=>!visible(selector)),
          overflow:getComputedStyle(overlay).overflowY,
          pageFits:document.documentElement.scrollWidth<=window.visualViewport.width+1 && document.documentElement.scrollHeight<=window.visualViewport.height+1,
          overlayFits:overlay.scrollWidth<=overlay.clientWidth+1 && overlay.scrollHeight<=overlay.clientHeight+1,
        };
      });
      assert.equal(layout.actions,true,`pause actions fit at ${width}x${height}`);
      assert.equal(layout.exitHidden,true,`fullscreen exit is irrelevant at ${width}x${height}`);
      assert.equal(layout.unrelatedHidden,true,`ready-state controls hidden at ${width}x${height}`);
      assert.equal(layout.overflow,'hidden',`pause overlay does not scroll at ${width}x${height}`);
      assert.equal(layout.pageFits,true,`page fits at ${width}x${height}`);
      assert.equal(layout.overlayFits,true,`pause content fits at ${width}x${height}`);
      await page.locator('#start').click();
      assert.equal(await page.evaluate(() => mode),'playing',`Resume works at ${width}x${height}`);
    }

    await page.locator('#pause').click();
    await page.locator('#pause-settings').click();
    assert.equal(await page.locator('#settings').evaluate(dialog=>dialog.open),true,'Settings opens from pause');
    await page.locator('#close').click();
    assert.equal(await page.locator('#settings').evaluate(dialog=>dialog.open),false,'Settings closes');
    assert.equal(await page.evaluate(() => mode),'paused','closing Settings does not resume');
    await page.evaluate(() => { window.confirm=()=>false; });
    await page.locator('#pause-main-menu').click();
    assert.equal(await page.evaluate(() => mode),'paused','cancelled return preserves the run');
    await page.evaluate(() => { window.confirm=()=>true; });
    await page.locator('#pause-main-menu').click();
    assert.deepEqual(await page.evaluate(() => ({mode,phase:window.arcade.phase})),{mode:'ready',phase:'demo'},'confirmed return ends the run');
    assert.deepEqual(errors,[]);

    const desktop = await browser.newPage({viewport:{width:1280,height:900}});
    await desktop.addInitScript(() => { window.requestAnimationFrame=()=>0; });
    await desktop.goto(url);
    await desktop.locator('#boot').click();
    await desktop.evaluate(() => window.arcade.frame(3));
    await desktop.locator('#demo-start').click();
    await desktop.locator('#start').click();
    assert.equal(await desktop.evaluate(() => mode),'playing','desktop run starts');
    await desktop.waitForFunction(() => !!document.fullscreenElement);
    await desktop.evaluate(() => document.exitFullscreen());
    await desktop.waitForTimeout(300);
    assert.equal(await desktop.evaluate(() => mode),'paused','fullscreen exit remains paused');
    assert.equal(await desktop.locator('#start').isVisible(),true,'pause remains usable after fullscreen exit');
    await desktop.locator('#start').click();
    assert.deepEqual(await desktop.evaluate(() => ({mode,fullscreen:!!document.fullscreenElement})),{mode:'playing',fullscreen:false},'Resume does not force fullscreen');

    await desktop.keyboard.press('Enter');
    await desktop.waitForFunction(() => !!document.fullscreenElement);
    await desktop.locator('#pause').click();
    assert.equal(await desktop.locator('#pause-exit-fullscreen').isVisible(),true,'Exit Fullscreen appears only while relevant');
    await desktop.locator('#pause-exit-fullscreen').click();
    await desktop.waitForFunction(() => !document.fullscreenElement);
    assert.equal(await desktop.evaluate(() => mode),'paused','Exit Fullscreen does not resume');
    assert.equal(await desktop.locator('#pause-exit-fullscreen').isVisible(),false,'Exit Fullscreen hides after exit');
    await desktop.close();

    console.log(`PASS: pause actions fit without scrolling at ${sizes.map(size=>size.join('x')).join(', ')}; Settings, Resume, confirmed return, fullscreen-exit pause, and no forced fullscreen re-entry verified.`);
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode=1; });
