'use strict';
// Two independent cached clients, same server URL, rebuild in a disposable copy.
const {chromium}=require('playwright'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {build}=require('../tools/build-pages.cjs');
const {createLanServer}=require('../tools/lan-server.cjs');
const {execFileSync}=require('node:child_process');
(async()=>{
 const repo=path.resolve(__dirname,'..'),root=fs.mkdtempSync(path.join(os.tmpdir(),'cat-build-browser-'));
 let browser,server;
 try{
  for(const name of ['index.html','style.css','game.js','src','assets','CNAME','.nojekyll'])fs.cpSync(path.join(repo,name),path.join(root,name),{recursive:true,filter:p=>!p.endsWith('.DS_Store')});
  const gitDir=execFileSync('git',['rev-parse','--absolute-git-dir'],{cwd:repo,encoding:'utf8'}).trim();fs.writeFileSync(path.join(root,'.git'),`gitdir: ${gitDir}\n`);
  const first=build(root);server=createLanServer({root:first.output});await new Promise(r=>server.listen(0,'127.0.0.1',r));const url=`http://127.0.0.1:${server.address().port}`;
  browser=await chromium.launch({headless:true});const pages=[],errors=[],logs=[[],[]];
  for(let i=0;i<2;i++){const context=await browser.newContext({viewport:i?{width:390,height:844}:{width:1280,height:800}});const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.text().startsWith('Cat Fighter build:'))logs[i].push(m.text());});await page.goto(url);pages.push(page);}
  async function check(expected){for(const page of pages){await page.waitForFunction(()=>window.CatBuildInfo?.build);assert.equal(await page.locator('#rom-version').textContent(),'ROM Ver. 0.9.12 · dev');assert.equal(await page.locator('#build-version').textContent(),'BUILD '+expected);
    const info=await page.evaluate(async()=>{const r=await fetch('version.json?verify='+Date.now(),{cache:'no-store'});return r.json();});assert.equal(info.build,expected);
    const urls=await page.evaluate(()=>[...document.querySelectorAll('script[src],link[rel=stylesheet]')].map(el=>el.getAttribute('src')||el.getAttribute('href')));assert.ok(urls.every(u=>/\?v=[a-f0-9]{12}$/.test(u)));
    const bounds=await page.locator('#boot').boundingBox();assert.ok(bounds.x>=0&&bounds.width<=page.viewportSize().width,'boot fits viewport');
  }}
  await check(first.info.build);for(const p of pages)await p.reload();await check(first.info.build);
  fs.appendFileSync(path.join(root,'game.js'),'\nwindow.__buildCacheProbe = 2; // Disposable fixture only.\n');
  fs.appendFileSync(path.join(root,'style.css'),'\n:root { --build-cache-probe: second; }\n');
  const second=build(root);assert.notEqual(first.info.build,second.info.build);for(const p of pages)await p.reload();await check(second.info.build);
  for(const p of pages){assert.equal(await p.evaluate(()=>window.__buildCacheProbe),2);assert.equal(await p.evaluate(()=>getComputedStyle(document.documentElement).getPropertyValue('--build-cache-probe').trim()),'second');}
  for(const entries of logs)assert.deepEqual(entries,[first.info.build,first.info.build,second.info.build].map(b=>'Cat Fighter build: '+b));assert.deepEqual(errors,[]);
  await pages[1].screenshot({path:'/tmp/cat-build-id-mobile.png'});
  fs.writeFileSync('/tmp/cat-build-id-browser.json',JSON.stringify({first:first.info,final:second.info},null,2));console.log('PASS: two cached Chromium clients agree; reload retains same build; same-minute code change/rebuild updates both; ROM unchanged; all JS/CSS versioned; one startup log per navigation.');
  console.log('Final test BUILD '+second.info.build);
 }finally{await browser?.close();if(server){server.dispose();await new Promise(r=>server.close(r));}fs.rmSync(root,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1});
