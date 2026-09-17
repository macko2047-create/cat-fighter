const {chromium}=require('playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'../..'),out=__dirname;
(async()=>{
 const browser=await chromium.launch({headless:true,ignoreDefaultArgs:['--mute-audio']});
 try{
 const page=await browser.newPage();const errors=[],consoleErrors=[],requests={};
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')consoleErrors.push(m.text());});
 await page.route('https://cat.test/**',async r=>{
 const p=decodeURIComponent(new URL(r.request().url()).pathname);
 let file=path.join(root,p==='/'?'index.html':p);
 if(/^\/assets\/audio\/sfx\/player_shot_0[1-4]\.wav$/.test(p))file=path.join(root,'artifacts/player-shot-generated',path.basename(p));
 if(p.startsWith('/assets/audio/'))requests[p]=(requests[p]||0)+1;
 if(!fs.existsSync(file)||!fs.statSync(file).isFile())return r.fulfill({status:404,body:''});
 return r.fulfill({body:fs.readFileSync(file),contentType:({'.html':'text/html','.js':'text/javascript','.css':'text/css','.wav':'audio/wav','.png':'image/png'})[path.extname(file)]||'application/octet-stream'});
 });
 await page.addInitScript(()=>{
 window.listenStats={events:[],buffers:[],live:0,peak:0,gains:[],chunks:[],segments:[]};
 const Native=AudioContext;
 window.AudioContext=class extends Native{
 constructor(...a){super(...a);window.listenContext=this;}
 async decodeAudioData(...a){const b=await super.decodeAudioData(...a);listenStats.buffers.push(b);return b;}
 createGain(){const n=super.createGain();listenStats.gains.push(n);return n;}
 createBufferSource(){const n=super.createBufferSource(),start=n.start.bind(n);n.start=(...a)=>{
 listenStats.live++;listenStats.peak=Math.max(listenStats.peak,listenStats.live);
 listenStats.events.push({time:this.currentTime,type:'buffer',variant:listenStats.buffers.indexOf(n.buffer),tag:listenStats.tag,owner:listenStats.owner});return start(...a);};n.addEventListener('ended',()=>listenStats.live--);return n;}
 createOscillator(){const n=super.createOscillator(),start=n.start.bind(n);n.start=(...a)=>{listenStats.events.push({time:this.currentTime,type:'fallback',tag:listenStats.tag});return start(...a);};return n;}
 };
 });
 await page.goto('https://cat.test/');
 await page.evaluate(async()=>{
 window.arcade=undefined;sound=true;sfx.initAudio();await sfx.preloadAudio();
 const original=sfx.playSfx;sfx.playSfx=id=>{listenStats.tag=id;listenStats.owner=id==='fire'?shots.at(-1)?.owner?.index:null;try{return original(id);}finally{listenStats.tag=null;listenStats.owner=null;}};
 const code=`class Tap extends AudioWorkletProcessor {process(inputs){if(inputs[0]?.[0])this.port.postMessage({frame:currentFrame,data:inputs[0][0]});return true;}}registerProcessor('capture-tap',Tap);`;
 const url=URL.createObjectURL(new Blob([code],{type:'text/javascript'}));await listenContext.audioWorklet.addModule(url);URL.revokeObjectURL(url);
 window.listenTap=new AudioWorkletNode(listenContext,'capture-tap');listenTap.port.onmessage=e=>listenStats.chunks.push(e.data);
 // Additional read-only observation branch. Production graph and gains untouched.
 listenStats.gains[0].connect(listenTap);listenTap.connect(listenContext.destination);
 });
 assert.equal(await page.evaluate(()=>listenStats.buffers.length),4);
 async function setup(two,level,rapid){await page.evaluate(({two,level,rapid})=>{keys.clear();mode='over';joined[0]=true;joined[1]=two;start();players.forEach(p=>{p.inv=999;p.level=level;p.rapid=rapid;});}, {two,level,rapid});await page.waitForTimeout(180);}
 async function segment(name,run){await page.evaluate(name=>listenStats.segments.push({name,start:listenContext.currentTime}),name);await run();await page.evaluate(()=>listenStats.segments.at(-1).end=listenContext.currentTime);}
 async function fire(ms,two=false){await page.evaluate(two=>{keys.add('KeyF');if(two)keys.add('KeyK');},two);await page.waitForTimeout(ms);await page.evaluate(()=>keys.clear());await page.waitForTimeout(180);}
 await setup(false,1,false);
 await segment('01-isolated-shots',async()=>{for(let i=0;i<2;i++){await fire(35);await page.waitForTimeout(260);}});
 await setup(false,1,true);await segment('02-sustained-rapid',()=>fire(4000));
 await setup(false,3,true);await segment('03-three-way',()=>fire(4000));
 await setup(true,3,true);await segment('04-two-player-three-way',()=>fire(4000,true));
 await setup(true,3,true);await segment('05-with-enemy-hits',async()=>{
 await page.evaluate(()=>{window.hitTimer=setInterval(()=>{damageEnemy({type:'small',hp:999},1);},80);});await fire(4000,true);await page.evaluate(()=>clearInterval(hitTimer));});
 await setup(true,3,true);await segment('06-with-explosions',async()=>{
 await page.evaluate(()=>{window.explosionTimer=setInterval(()=>{for(let i=0;i<4;i++)explode(150+i*50,180,'#e7b861',18,i%2?'heavy_explosion':'small_explosion');},250);});await fire(4000,true);await page.evaluate(()=>clearInterval(explosionTimer));});
 await setup(true,3,true);await segment('07-mute-unmute',async()=>{
 await page.evaluate(()=>{keys.add('KeyF');keys.add('KeyK');});await page.waitForTimeout(1000);
 await page.evaluate(()=>{$('#sound').onclick();listenStats.mute={start:listenContext.currentTime,gain:listenStats.gains[0].gain.value};});await page.waitForTimeout(1000);
 await page.evaluate(()=>{listenStats.mute.end=listenContext.currentTime;$('#sound').onclick();});await page.waitForTimeout(1500);await page.evaluate(()=>keys.clear());await page.waitForTimeout(180);});
 await setup(true,3,true);await segment('08-pause-resume',async()=>{
 await page.evaluate(()=>{keys.add('KeyF');keys.add('KeyK');});await page.waitForTimeout(1000);
 await page.evaluate(()=>{pause();listenStats.pause={start:listenContext.currentTime,mode};});await page.waitForTimeout(1000);
 await page.evaluate(()=>{listenStats.pause.end=listenContext.currentTime;pause();});await page.waitForTimeout(1500);await page.evaluate(()=>keys.clear());await page.waitForTimeout(180);});
 await page.waitForTimeout(150);
 const result=await page.evaluate(()=>{
 const sr=listenContext.sampleRate,base=listenStats.chunks[0].frame;
 const last=listenStats.chunks.at(-1),all=new Float32Array(last.frame-base+last.data.length);
 for(const c of listenStats.chunks)all.set(c.data,c.frame-base);
 const slice=(start,end)=>all.slice(Math.max(0,Math.round(start*sr-base)),Math.round(end*sr-base));
 const measure=a=>{let peak=0,sum=0,clipped=0;for(const v of a){peak=Math.max(peak,Math.abs(v));sum+=v*v;if(Math.abs(v)>1)clipped++;}return {peak,peak_dBFS:peak?20*Math.log10(peak):null,rms:Math.sqrt(sum/a.length),clippedSamples:clipped};};
 const wav=a=>{const bytes=new Uint8Array(44+a.length*2),v=new DataView(bytes.buffer);const str=(p,s)=>[...s].forEach((c,i)=>v.setUint8(p+i,c.charCodeAt(0)));str(0,'RIFF');v.setUint32(4,bytes.length-8,true);str(8,'WAVEfmt ');v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,1,true);v.setUint32(24,sr,true);v.setUint32(28,sr*2,true);v.setUint16(32,2,true);v.setUint16(34,16,true);str(36,'data');v.setUint32(40,a.length*2,true);for(let i=0;i<a.length;i++)v.setInt16(44+i*2,Math.round(Math.max(-1,Math.min(1,a[i]))*32767),true);let text='';for(let i=0;i<bytes.length;i+=8192)text+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(text);};
 return {sampleRate:sr,decoded:listenStats.buffers.map(b=>b.duration),
 segments:listenStats.segments.map(s=>{const a=slice(s.start,s.end),events=listenStats.events.filter(e=>e.time>=s.start&&e.time<s.end);return {...s,...measure(a),events,wav:wav(a)};}),
 mute:{...listenStats.mute,...measure(slice(listenStats.mute.start+.05,listenStats.mute.end-.05))},
 pause:{...listenStats.pause,lateTail:measure(slice(listenStats.pause.start+.2,listenStats.pause.end-.05)),newShots:listenStats.events.filter(e=>e.tag==='fire'&&e.time>listenStats.pause.start&&e.time<listenStats.pause.end).length}};
 });
 for(const s of result.segments){fs.writeFileSync(path.join(out,s.name+'.wav'),Buffer.from(s.wav,'base64'));delete s.wav;}
 result.errors=errors;result.consoleErrors=consoleErrors;result.requests=requests;
 result.testFiles=[1,2,3,4].map(i=>{const f=path.join(root,`artifacts/player-shot-generated/player_shot_0${i}.wav`);return {file:f,sha256:crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex')};});
 fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(result,null,2));
 assert.deepEqual(errors,[]);assert.equal(result.mute.peak,0);assert.equal(result.pause.newShots,0);
 assert.ok(result.segments.every(s=>s.clippedSamples===0));
 console.log(JSON.stringify({...result,segments:result.segments.map(({events,...s})=>({...s,shots:events.filter(e=>e.tag==='fire').length,p1:events.filter(e=>e.tag==='fire'&&e.owner===0).length,p2:events.filter(e=>e.tag==='fire'&&e.owner===1).length,tags:[...new Set(events.map(e=>e.tag))]}))}));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
