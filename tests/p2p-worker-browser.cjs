'use strict';
// Focused cross-origin integration: real Chromium, production bundle, real DataChannels.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {createRequire}=require('node:module'),{execFileSync}=require('node:child_process');
const deps=createRequire(path.resolve(__dirname,'../tools/cloudflare/package.json'));
const {Miniflare,convertV4MiniflareOptions}=deps('miniflare');
const {chromium}=deps('playwright');
(async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'cat-worker-browser-'));
  let mf,browser,signalOrigin;
  const server=require('node:http').createServer((req,res)=>{
    if(req.url==='/transport.js'){res.setHeader('Content-Type','text/javascript');return res.end(fs.readFileSync(path.resolve(__dirname,'../src/p2p-transport.js')));}
    res.setHeader('Content-Type','text/html');res.end(`<meta name="cat-fighter-signaling-origin" content="${signalOrigin}"><script src="/transport.js"></script>`);
  });
  try{
    await new Promise(r=>server.listen(0,'127.0.0.1',r));
    const origin=`http://127.0.0.1:${server.address().port}`;
    execFileSync(process.execPath,[path.join(path.dirname(deps.resolve('wrangler/package.json')),'bin/wrangler.js'),
      'deploy','--dry-run','--config',path.resolve(__dirname,'../tools/cloudflare/wrangler.jsonc'),'--outdir',dir],
      {env:{...process.env,WRANGLER_SEND_METRICS:'false'},stdio:'pipe'});
    mf=new Miniflare(convertV4MiniflareOptions({cf:false,modules:true,script:fs.readFileSync(path.join(dir,'signaling-worker.js'),'utf8'),
      compatibilityDate:'2026-09-11',compatibilityFlags:['nodejs_compat'],bindings:{PUBLIC_ORIGIN:origin},
      durableObjects:{SIGNALING:{className:'SignalingRooms',useSQLite:true}}}));
    signalOrigin=(await mf.ready).origin;
    browser=await chromium.launch({headless:true});
    const pages=[]; const sent=[];
    for(let i=0;i<2;i++){
      const context=await browser.newContext();const page=await context.newPage();
      page.on('request',r=>{if(r.url().startsWith(signalOrigin))sent.push(r.postData());});
      await page.goto(origin);pages.push(page);
    }
    const [h,g]=pages;
    const host=await h.evaluate(async()=>window.session=await CatP2P.request('create'));
    await g.evaluate(async code=>window.session=await CatP2P.request('join',{code}),host.code);
    const connect=page=>page.evaluate(()=>{
      window.ready=false;window.received=[];
      // No STUN is needed for two local contexts; production server still returns STUN-only.
      session.iceServers=[];
      window.transport=CatP2P.create(session,{ready(){window.ready=true;},lost(){window.ready=false;},
        message(kind,data){received.push({kind,data});},ended(){window.ended=true;}});
    });
    for(const page of pages)await connect(page);
    for(const page of pages)await page.waitForFunction(()=>window.ready);
    await g.evaluate(()=>transport.send('input',{x:1}));
    await h.waitForFunction(()=>received.some(m=>m.kind==='input'&&m.data.x===1));
    await h.evaluate(()=>transport.send('state',{score:123}));
    await g.waitForFunction(()=>received.some(m=>m.kind==='state'&&m.data.score===123));
    await g.evaluate(()=>transport.disconnect());
    await h.waitForFunction(()=>!window.ready);
    await g.evaluate(()=>transport.reconnect());
    for(const page of pages)await page.waitForFunction(()=>window.ready);
    // Disabling signaling cannot interrupt connected gameplay traffic.
    await mf.dispose();mf=null;
    await h.evaluate(()=>transport.send('state',{score:456}));
    await g.waitForFunction(()=>received.some(m=>m.kind==='state'&&m.data.score===456));
    await g.evaluate(()=>transport.send('input',{x:-1}));
    await h.waitForFunction(()=>received.some(m=>m.kind==='input'&&m.data.x===-1));
    assert.ok(sent.every(body=>!body||(!body.includes('"state"')&&!body.includes('"input"'))));
    for(const page of pages)await page.evaluate(()=>transport.close(false));
    console.log('PASS: real cross-origin create/join, CORS preflight + bearer authorization, direct input/state, reconnect, and gameplay traffic after Worker shutdown; no signaling gameplay relay.');
  }finally{
    await browser?.close();await mf?.dispose();server.closeAllConnections();await new Promise(r=>server.close(r));fs.rmSync(dir,{recursive:true,force:true});
  }
})().catch(e=>{console.error(e);process.exitCode=1;});
