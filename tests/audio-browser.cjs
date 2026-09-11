// Headless browser audio smoke; local files routed without a development server.
const {chromium}=require('playwright');
const fs=require('node:fs'), path=require('node:path'), assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
function wav() {
  const n=48000, b=Buffer.alloc(44+n*2);
  b.write('RIFF');b.writeUInt32LE(b.length-8,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);
  b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);b.writeUInt32LE(48000,24);b.writeUInt32LE(96000,28);
  b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(n*2,40);
  return b; // Test-only silent PCM, never added to production assets.
}
(async()=>{
 const browser=await chromium.launch({headless:true});
 try { for(const fixture of [false,true]) {
  const page=await browser.newPage();const errors=[],messages=[],requests={};
  page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{if(['error','warning'].includes(m.type()))messages.push(m.text());});
  await page.route('http://cat.test/**',async route=>{
   const pathname=decodeURIComponent(new URL(route.request().url()).pathname);
   if(pathname.startsWith('/assets/audio/') && /\.(wav|mp3)$/.test(pathname)) {
    requests[pathname]=(requests[pathname]||0)+1;
    return route.fulfill(fixture?{status:200,contentType:'audio/wav',body:wav()}:{status:404,body:''});
   }
   const file=path.join(root,pathname==='/'?'index.html':pathname);
   if(!fs.existsSync(file)||!fs.statSync(file).isFile())return route.fulfill({status:404,body:''});
   const ext=path.extname(file);return route.fulfill({status:200,body:fs.readFileSync(file),contentType:({'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png'})[ext]||'application/octet-stream'});
  });
  await page.addInitScript(()=>{
   window.requestAnimationFrame=()=>0;
   const stats=window.audioStats={contexts:0,media:0,created:0,live:0,peak:0,connected:0,peakConnected:0,decodes:0,by:{}};
   const Native=window.AudioContext;
   window.AudioContext=class extends Native {
    constructor(...args){super(...args);stats.contexts++;}
    decodeAudioData(...args){stats.decodes++;return super.decodeAudioData(...args);}
    createGain(){return this.track(super.createGain(),false);}
    createOscillator(){return this.track(super.createOscillator(),true);}
    createBufferSource(){return this.track(super.createBufferSource(),true);}
    track(node,source){
     let connected=false;const connect=node.connect.bind(node),disconnect=node.disconnect.bind(node);
     node.connect=(...args)=>{if(!connected){connected=true;stats.connected++;stats.peakConnected=Math.max(stats.peakConnected,stats.connected);}return connect(...args);};
     node.disconnect=(...args)=>{if(connected){connected=false;stats.connected--;}return disconnect(...args);};
     if(source){stats.created++;const tag=window.audioTag||'ui';const row=stats.by[tag]||={live:0,peak:0};
      const start=node.start.bind(node);node.start=(...args)=>{start(...args);row.live++;row.peak=Math.max(row.peak,row.live);stats.live++;stats.peak=Math.max(stats.peak,stats.live);};
      let ended=false;node.addEventListener('ended',()=>{if(!ended){ended=true;row.live--;stats.live--;}});}
     return node;
    }
   };
   const Audio=window.Audio;window.Audio=class extends Audio{constructor(...a){super(...a);stats.media++;window.testMusic=this;}};
  });
  await page.goto('http://cat.test/');
  await page.evaluate(async()=>{
   // Isolate live game from attract-mode scheduling; use actual game event functions.
   window.arcade=undefined;
   const play=sfx.playSfx;sfx.playSfx=name=>{window.audioTag=name;try{play(name);}finally{window.audioTag=null;}};
   sound=true;sfx.setMuted(false);await sfx.preloadAudio();joined.fill(false);joined[0]=true;start();
  });
  for(const two of [false,true]) {
   await page.evaluate(two=>{
    mode='over';joined[1]=two;start();players.forEach(p=>{p.inv=999;p.rapid=true;p.level=3;});keys.add('KeyF');keys.add('KeyK');shots=[];update(0);if(shots.length!==players.length*3)throw Error('Both pilots must fire 3-way volleys');
   },two);
   for(let burst=0;burst<8;burst++){
    await page.evaluate(()=>{for(let i=0;i<30;i++){players.forEach(p=>p.inv=999);update(1/60);}});
    await page.waitForTimeout(40);
   }
   await page.evaluate(()=>{
    keys.clear();for(let i=0;i<12;i++){wave=i%2?2:4;spawn();}
    enemies.forEach(e=>{e.y=150;e.shoot=0;e.visibleAge=10;});update(.016);
    for(const e of [...enemies])kill(e,players[0]);
    players[0].bombs=3;bomb(players[0]);elapsed=LEVEL1.bossSpawnTime;bossSpawned=false;update(.016);
   });
   await page.waitForTimeout(150);
   await page.evaluate(()=>{for(let i=0;i<12;i++){$('#sound').onclick();$('#sound').onclick();}pause();pause();});
   await page.waitForTimeout(150);
  }
  await page.waitForTimeout(1400);
  const stats=await page.evaluate(()=>audioStats);
  
  assert.equal(stats.contexts,1);assert.equal(stats.media,1);assert.equal(stats.live,0);assert.equal(stats.connected,2);
  assert.ok(stats.peakConnected<=60);
  for(const [name,cap] of Object.entries({fire:5,enemy_shot:4,enemy_hit:6,small_explosion:4,heavy_explosion:3,bomb:2,boss_warning:3})){
   if(stats.by[name])assert.ok(stats.by[name].peak<=cap,`${name} voice cap`);
  }
  assert.deepEqual(errors,[]);assert.ok(!messages.some(m=>/AudioContext|uncaught/i.test(m)));
  if(!fixture)assert.ok(Object.values(requests).every(n=>n===1),JSON.stringify(requests));
  assert.equal(Object.keys(requests).filter(p=>p.endsWith('.wav')).length,4);
  assert.equal(stats.decodes,fixture?4:0);
  console.log(JSON.stringify({fixture,passed:true,stats,requests,console:{count:messages.length,unique:[...new Set(messages)]},pageErrors:errors}));
  await page.close();
 }}finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
