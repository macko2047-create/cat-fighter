// Real installed WAV acceptance; NODE_PATH must include playwright.
const {chromium}=require('playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
(async()=>{
 const browser=await chromium.launch({headless:true,ignoreDefaultArgs:['--mute-audio']});
 try {
 const page=await browser.newPage();const errors=[],consoleErrors=[],requests={};
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')consoleErrors.push(m.text());});
 await page.route('http://cat.test/**',async route=>{
  const pathname=decodeURIComponent(new URL(route.request().url()).pathname), file=path.join(root,pathname==='/'?'index.html':pathname);
  if(pathname.startsWith('/assets/audio/'))requests[pathname]=(requests[pathname]||0)+1;
  if(!fs.existsSync(file)||!fs.statSync(file).isFile())return route.fulfill({status:404,body:''});
  return route.fulfill({body:fs.readFileSync(file),contentType:({'.html':'text/html','.js':'text/javascript','.css':'text/css','.wav':'audio/wav','.png':'image/png'})[path.extname(file)]||'application/octet-stream'});
 });
 await page.addInitScript(()=>{
  window.requestAnimationFrame=()=>0;
  window.shotAudioStats={decoded:[],events:[],live:0,peak:0,attempts:0,gains:[]};
  const Native=AudioContext;
  window.AudioContext=class extends Native {
   constructor(...a){super(...a);window.testContext=this;}
   async decodeAudioData(...a){const b=await super.decodeAudioData(...a);shotAudioStats.decoded.push(b);return b;}
   createGain(){const g=super.createGain();shotAudioStats.gains.push(g);return g;}
   createBufferSource(){const n=super.createBufferSource(),start=n.start.bind(n);n.start=(...a)=>{
    shotAudioStats.events.push({time:this.currentTime,index:shotAudioStats.decoded.indexOf(n.buffer),rate:n.playbackRate.value,gain:n.testGain.gain.value});
    shotAudioStats.live++;shotAudioStats.peak=Math.max(shotAudioStats.peak,shotAudioStats.live);return start(...a);
   };const connect=n.connect.bind(n);n.connect=(g,...a)=>{n.testGain=g;return connect(g,...a);};n.addEventListener('ended',()=>shotAudioStats.live--);return n;}
  };
 });
 await page.goto('http://cat.test/');
 await page.evaluate(async()=>{window.arcade=undefined;sound=true;sfx.initAudio();await sfx.preloadAudio();});
 assert.equal(await page.evaluate(()=>shotAudioStats.decoded.length),4);
 const sourceStats=await page.evaluate(()=>shotAudioStats.decoded.map(b=>{
  let peak=0,sum=0,fullScale=0;const bins=[];
  for(let k=0;k<b.numberOfChannels;k++){const a=b.getChannelData(k);for(let i=0;i<a.length;i++){peak=Math.max(peak,Math.abs(a[i]));sum+=a[i]*a[i];if(Math.abs(a[i])>=.9999)fullScale++;}}
  for(let j=0;j<b.duration*10;j++){let sum=0;const a=b.getChannelData(0);for(let i=j*b.sampleRate/10;i<(j+1)*b.sampleRate/10;i++)sum+=a[i]*a[i];bins.push(Math.sqrt(sum/(b.sampleRate/10)));}
  return {duration:b.duration,channels:b.numberOfChannels,rate:b.sampleRate,peak,rms:Math.sqrt(sum/b.length/b.numberOfChannels),fullScale,bins};
 }));
 // Exercise the actual game's 2-player, rapid, 3-way fire at wall-clock cadence.
 await page.evaluate(()=>{joined.fill(true);start();players.forEach(p=>{p.inv=999;p.rapid=true;p.level=3;});keys.add('KeyF');keys.add('KeyK');shots=[];update(0);if(shots.length!==6)throw Error('Expected six projectiles');
 const play=sfx.playSfx;sfx.playSfx=id=>{if(id==='fire')shotAudioStats.attempts++;play(id);};
 window.timer=setInterval(()=>{players.forEach(p=>p.inv=999);update(1/60);},1000/60);
 });
 await page.waitForTimeout(18000);
 await page.evaluate(()=>{clearInterval(timer);keys.clear();});
 assert.equal(await page.evaluate(()=>shotAudioStats.peak),5);
 const before=await page.evaluate(()=>shotAudioStats.events.length);
 await page.evaluate(()=>{$('#sound').onclick();for(let i=0;i<20;i++)sfx.playSfx('fire');});
 assert.equal(await page.evaluate(()=>shotAudioStats.events.length),before);
 assert.equal(await page.evaluate(()=>shotAudioStats.gains[0].gain.value),0);
 await page.evaluate(()=>{$('#sound').onclick();pause();keys.add('KeyF');keys.add('KeyK');for(let i=0;i<120;i++)update(1/60);});
 assert.equal(await page.evaluate(()=>shotAudioStats.events.length),before);
 await page.evaluate(()=>{keys.clear();pause();});
 await page.waitForTimeout(8200);
 await page.evaluate(()=>{sfx.playSfx('fire');});
 assert.equal(await page.evaluate(()=>shotAudioStats.events.length),before+1);
 await page.evaluate(async()=>{for(let i=0;i<10;i++){sfx.initAudio();await sfx.preloadAudio();}});
 assert.ok(Object.entries(requests).filter(([p])=>p.endsWith('.wav')).every(([,n])=>n===1));
 assert.equal(Object.keys(requests).filter(p=>p.endsWith('.wav')).length,4);
 const mix=await page.evaluate(async()=>{
  const events=shotAudioStats.events.filter(e=>e.time<shotAudioStats.events[0].time+18),origin=events[0].time;
  const ctx=new OfflineAudioContext(2,48000*26,48000);
  for(const e of events){const n=ctx.createBufferSource(),g=ctx.createGain();n.buffer=shotAudioStats.decoded[e.index];n.playbackRate.value=e.rate;g.gain.value=e.gain*.75;n.connect(g);g.connect(ctx.destination);n.start(e.time-origin);}
  const b=await ctx.startRendering();let peak=0,sum=0,clipped=0;
  for(let c=0;c<2;c++)for(const v of b.getChannelData(c)){peak=Math.max(peak,Math.abs(v));sum+=v*v;if(Math.abs(v)>1)clipped++;}
  const gaps=events.slice(1).map((e,i)=>e.time-events[i].time);
  return {peak,rms:Math.sqrt(sum/b.length/2),clippedSamples:clipped,maxTriggerGap:Math.max(...gaps),variations:[...new Set(events.map(e=>e.index))],events,attempts:shotAudioStats.attempts,peakVoices:shotAudioStats.peak};
 });
 assert.equal(mix.variations.length,4);assert.deepEqual(errors,[]);
 const result={sourceStats,mix,requests,consoleErrors,pageErrors:errors,checks:{decode:true,variation:true,voiceCap:true,mute:true,pause:true,resume:true,noRepeatedWavLoads:true,noConsoleErrors:consoleErrors.length===0,noClipping:mix.clippedSamples===0}};
 fs.writeFileSync(process.env.AUDIO_REPORT||'/tmp/player-shot-browser-report.json',JSON.stringify(result,null,2));
 console.log(JSON.stringify(result));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
