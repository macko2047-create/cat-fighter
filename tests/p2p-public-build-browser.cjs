'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright');
const {createLanServer}=require('../tools/lan-server.cjs');
(async()=>{
 const root=path.resolve('_site'),html=fs.readFileSync(path.join(root,'index.html'),'utf8');
 assert.ok(fs.existsSync(path.join(root,'src/p2p-transport.js')));
 assert.ok(!fs.existsSync(path.join(root,'src/relay-transport.js')));
 assert.ok(html.indexOf('src/p2p-transport.js')<html.indexOf('src/lan.js'));
 assert.match(html,/name="cat-fighter-transport" content="p2p"/);
 assert.match(html,/name="cat-fighter-signaling-origin" content=""/);
 const server=createLanServer({root});let browser;
 try {
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  browser=await chromium.launch({headless:true});
  for(const origin of ['', 'https://invalid.example/path']){
   const page=await browser.newPage(),requests=[];
   page.on('request',r=>{if(/\/(lan|p2p)\//.test(r.url()))requests.push(r.url());});
   await page.route('**/',async route=>{const response=await route.fetch();await route.fulfill({response,body:(await response.text()).replace('name="cat-fighter-signaling-origin" content=""',`name="cat-fighter-signaling-origin" content="${origin}"`)});});
   await page.goto(`http://127.0.0.1:${server.address().port}/`);
   await page.evaluate(async()=>{document.documentElement.requestFullscreen=()=>Promise.resolve();$('#boot').onclick();arcade.frame(3);await $('#lan-open').onclick();await $('#lan-create').onclick();});
   assert.match(await page.locator('#lan-status').textContent(),/signaling origin configuration/);
   await page.evaluate(async()=>{$('#lan-code').value='123456';await $('#lan-join').onclick();});
   assert.equal(await page.evaluate(()=>lan.active),false);
   assert.deepEqual(requests,[],'missing/invalid public config sends neither signaling nor LAN traffic');
   assert.equal(await page.locator('#coop-advanced').isVisible(),false);
   assert.equal(await page.locator('#lan-status').isVisible(),true);
   await page.close();
  }
  console.log('PASS: generated public P2P script order/configuration, relay exclusion, fail-closed CREATE/JOIN, visible error and no LAN requests.');
 }finally{await browser?.close();server.dispose();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
