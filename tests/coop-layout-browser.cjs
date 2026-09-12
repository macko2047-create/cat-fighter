const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const path=require('node:path');
(async()=>{
 const browser=await chromium.launch({headless:true});
 try {
  const page=await browser.newPage({viewport:{width:320,height:568},hasTouch:true});
  page.setDefaultTimeout(10000);
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{window.requestAnimationFrame=()=>0;window.setInterval=()=>0;});
  await page.goto('file://'+path.resolve('index.html'));
  await page.evaluate(()=>{
   document.documentElement.requestFullscreen=()=>Promise.resolve();
   window.calls=[];
   window.fetch=async (url,options)=>{
    const route=String(url).split('/').pop();calls.push({route,body:options?.body});
    const data=route==='info'?{addresses:['http://192.168.1.5:8767']}:route==='rooms'?{rooms:[]}:
     {role:route==='create'?'host':'guest',code:'654321',token:'lan-test'};
    return new Response(JSON.stringify(data),{headers:{'content-type':'application/json'}});
   };
   window.EventSource=class {
    constructor(){window.testEvents=this;this.listeners={};}
    addEventListener(name,cb){this.listeners[name]=cb;}
    close(){}
   };
  });
  await page.locator('#boot').click();await page.evaluate(()=>arcade.frame(3));
  await page.locator('#demo-lan').click();await page.evaluate(()=>poll());
  async function inspect(name){
   for(const [width,height] of [[320,568],[320,320],[740,320],[768,1024],[1024,768],[1440,900]]){
    await page.setViewportSize({width,height});await page.evaluate(()=>document.fonts.ready);
    const layout=await page.locator('#lan-dialog').evaluate(d=>{
     const r=d.getBoundingClientRect();
     const visible=[...d.querySelectorAll('button,input')].filter(e=>e.getClientRects().length);
     return {overflow:d.scrollHeight>d.clientHeight+1||d.scrollWidth>d.clientWidth+1,page:document.documentElement.scrollWidth>innerWidth,
      count:visible.length,small:visible.filter(e=>e.getBoundingClientRect().height<44).map(e=>e.id),
      clipped:visible.filter(e=>{const b=e.getBoundingClientRect();return b.top<r.top||b.bottom>r.bottom||b.left<r.left||b.right>r.right;}).map(e=>e.id)};
    });
    assert.equal(layout.overflow,false,`${name} ${width}x${height}: scrolling`);
    assert.equal(layout.page,false);assert.ok(layout.count<=4,`${name}: ${layout.count} controls`);
    assert.deepEqual(layout.small,[]);assert.deepEqual(layout.clipped,[]);
    if(width===740&&height===320)await page.screenshot({path:`/private/tmp/cf-simple-${name}-short.png`});
    if(width===320&&height===568)await page.screenshot({path:`/private/tmp/cf-simple-${name}.png`});
   }
   await page.setViewportSize({width:320,height:568});
  }
  await inspect('modes');
  await page.locator('#coop-advanced').click();
  assert.equal(await page.locator('#lan-host-url').isVisible(),true);
  await page.locator('#coop-back').click();
  await page.locator('#coop-wifi').click();await inspect('wifi-roles');
  await page.locator('#coop-guest').click();await inspect('wifi-code');
  await page.locator('#lan-code').fill('654321');await page.locator('#lan-join').click();
  await page.waitForFunction(()=>lan.active,null,{polling:50});await page.evaluate(()=>poll());await inspect('wifi-waiting');
  assert.equal(await page.evaluate(()=>lan.menuState.transport),'lan');
  assert.equal(await page.evaluate(()=>JSON.parse(calls.find(c=>c.route==='join').body).code),'654321');
  await page.evaluate(()=>{testEvents.listeners.presence({data:JSON.stringify({host:true,guest:true})});poll();});
  await inspect('wifi-connected');assert.equal(await page.locator('#coop-start').isVisible(),true);
  await page.locator('#lan-leave').click();await page.evaluate(()=>poll());
  await page.locator('#coop-wifi').click();await page.locator('#coop-host').click();
  await page.waitForFunction(()=>lan.active,null,{polling:50});await page.evaluate(()=>poll());
  assert.equal(await page.evaluate(()=>lan.guest),false);await inspect('wifi-host-code');
  await page.locator('#lan-leave').click();await page.evaluate(()=>poll());
  await page.locator('#coop-advanced').click();await page.evaluate(()=>poll());
  assert.equal(await page.locator('#lan-leave').isVisible(),false);
  await page.locator('#coop-back').click();assert.equal(await page.locator('#coop-options').isVisible(),true);
  assert.deepEqual(errors,[]);
  console.log('PASS: LAN-only Wi-Fi create/join, connected state, diagnostics/back; six viewport sizes, <=4 controls, >=44px targets, no normal-flow scrolling or clipped controls.');
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
