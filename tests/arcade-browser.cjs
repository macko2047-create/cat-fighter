'use strict';
const {chromium} = require('playwright');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
(async () => {
  const browser = await chromium.launch({headless:true, executablePath:process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
  const out = path.resolve('artifacts/arcade-boot'); fs.mkdirSync(out,{recursive:true});
  try {
    const page = await browser.newPage({viewport:{width:390,height:844},hasTouch:true,isMobile:true});
    const errors=[]; page.on('pageerror', e=>errors.push(e.message));
    await page.addInitScript(()=>{window.requestAnimationFrame=()=>0;});
    await page.goto('file://'+path.resolve('index.html'));
    await page.evaluate(()=>{document.documentElement.requestFullscreen=()=>Promise.resolve();});
    assert.equal(await page.locator('#boot').isVisible(),true);
    assert.equal(await page.locator('#demo-start').isVisible(),false);
    await page.evaluate(()=>start());
    assert.equal(await page.evaluate(()=>mode),'ready','BOOT cannot be bypassed by start');
    await page.screenshot({path:path.join(out,'01-boot.png')});
    await page.locator('#boot').click();
    await page.evaluate(()=>arcade.frame(1.5));
    await page.screenshot({path:path.join(out,'02-booting.png')});
    await page.evaluate(()=>arcade.frame(1.4));
    assert.equal(await page.evaluate(()=>arcade.phase),'demo');
    await page.evaluate(()=>arcade.frame(8));
    assert.match(await page.locator('#demo-title').textContent(),/按住並拖動/);
    await page.screenshot({path:path.join(out,'03-touch-demo.png')});
    const before = await page.evaluate(()=>JSON.stringify({players,score,elapsed,shots,drops,joined}));
    const expected=['放開即可停下','快速輕觸兩下','快射升級','雙線火力','三向散射','炸彈補給','多一次機會','空中堡壘來襲','CAT FIGHTER'];
    for(const [i,seconds] of [6,4,6,6,6,6,5,5,8].entries()) {
      await page.evaluate(dt=>arcade.frame(dt),seconds);
      assert.equal(await page.locator('#demo-title').textContent(),expected[i]);
      if(i===4) await page.screenshot({path:path.join(out,'04-reward-demo.png')});
    }
    assert.equal(await page.evaluate(()=>JSON.stringify({players,score,elapsed,shots,drops,joined})),before,'demo cannot mutate live game');
    for(const [width,height] of [[360,640],[844,390],[1440,900]]) {
      await page.setViewportSize({width,height});
      const rect=await page.locator('#demo-start').boundingBox();
      assert.ok(rect.y>=0&&rect.y+rect.height<=height,'START stays on screen');
      assert.equal(await page.locator('#test').isVisible(),false);
      await page.screenshot({path:path.join(out,`05-demo-${width}.png`)});
    }
    await page.setViewportSize({width:390,height:844});
    await page.locator('#demo-start').click();
    assert.equal(await page.evaluate(()=>mode),'playing');
    assert.equal(await page.evaluate(()=>players[0].bombs),3);
    assert.equal(await page.evaluate(()=>score),0);
    await page.locator('#pause').click();
    await page.locator('#watch-demo').click();
    assert.equal(await page.evaluate(()=>arcade.phase),'demo');
    await page.locator('#demo-options').click();
    await page.locator('#join-p1').click(); await page.locator('#join').click();
    await page.locator('#start').click();
    assert.equal(await page.evaluate(()=>players.length),2);
    assert.deepEqual(errors,[]);
    console.log('PASS: BOOT gate, boot animation, every demo chapter and wrap, live-state isolation, responsive START, touch start, return to demo, local co-op, no browser errors.');
  } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
