const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
function fixture(failure) {
  const nodes=[], requests=[], media=[];
  let contexts=0, decodes=0;
  class Node {
    constructor() { this.gain={value:0,setValueAtTime(){},exponentialRampToValueAtTime(){}}; this.frequency={}; this.playbackRate={}; }
    connect() { return this; } disconnect() { this.disconnected=true; }
    start() { this.started=true; } stop() {}
  }
  class Context {
    constructor() { contexts++; this.currentTime=0; this.state='running'; }
    createGain() { return new Node(); }
    createOscillator() { const n=new Node(); nodes.push(n); return n; }
    createBufferSource() { return this.createOscillator(); }
    resume() { return Promise.reject(Error('autoplay')); }
    decodeAudioData() { decodes++; return failure==='decode' ? Promise.reject(Error()) : Promise.resolve({duration:.1}); }
  }
  class Audio {
    constructor() { media.push(this); }
    play() { this.plays=(this.plays||0)+1; return Promise.reject(Error('autoplay')); } pause() { this.paused=true; }
    removeAttribute() {} load() {}
  }
  const host={AudioContext:Context,Audio,fetch:async path=>{requests.push(path);return {ok:failure!=='missing',arrayBuffer:async()=>new ArrayBuffer(1)};}};
  const sandbox={host}; vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync('src/audio.js','utf8')+'; globalThis.api=createAudio(host);',sandbox);
  return {api:sandbox.api,nodes,requests,media,get contexts(){return contexts;},get decodes(){return decodes;}};
}
test('preload once, reuse buffers, bounded voices and release on end',async()=>{
  const f=fixture(); f.api.initAudio(); await f.api.preloadAudio();
  assert.equal(f.requests.length,18); assert.equal(f.decodes,18);
  for(let i=0;i<100;i++) f.api.playSfx('player_shot');
  assert.equal(f.nodes.length,5);
  assert.ok(f.nodes.every(n=>n.buffer && n.playbackRate.value>=.98 && n.playbackRate.value<=1.02));
  f.nodes[0].onended(); f.api.playSfx('player_shot'); assert.equal(f.nodes.length,6);
  await f.api.preloadAudio(); assert.equal(f.requests.length,18);
});
test('missing/decode failure falls back with category caps; unknown sounds harmless',async()=>{
  for(const failure of ['missing','decode']) {
    const f=fixture(failure); f.api.initAudio(); await f.api.preloadAudio();
    for(const [name,limit] of Object.entries({player_shot:5,enemy_shot:4,enemy_hit:6,small_explosion:4,heavy_explosion:3,bomb_blast:2,boss_warning:3,pickup:2})) {
      const before=f.nodes.length;
      for(let i=0;i<50;i++) f.api.playSfx(name);
      assert.equal(f.nodes.length-before,limit);
    }
    f.api.playSfx('unknown'); assert.ok(f.nodes.every(n=>!n.buffer));
  }
});
test('mute, volume, rejected autoplay and music switches reuse infrastructure',async()=>{
  const f=fixture(); f.api.setMuted(true); f.api.playSfx('fire'); assert.equal(f.contexts,0);
  f.api.setMusicState('LEVEL'); f.api.setMuted(false); await f.api.preloadAudio();
  f.api.setMasterVolume(.5); f.api.setMusicVolume(.4); assert.equal(f.media[0].volume,.2);
  for(let i=0;i<50;i++){ f.api.setMuted(true); assert.equal(f.media[0].volume,0); f.api.setMuted(false); }
  f.api.setMusicState('BOSS'); assert.equal(f.media.length,1); assert.match(f.media[0].src,/music_boss.mp3/);
  f.media[0].onerror(); f.api.stopMusic(); f.api.setMusicState('BOSS');
  assert.equal(f.contexts,1); assert.equal(f.requests.length,18);
});

test('initialization/unmute never retries failed or stopped music',async()=>{
  const f=fixture();f.api.setMusicState('LEVEL');f.media[0].onerror();
  const count=f.media[0].plays;
  for(let i=0;i<10;i++){f.api.setMuted(true);f.api.setMuted(false);}
  assert.equal(f.media[0].plays,count);
  f.api.stopMusic();f.api.initAudio();assert.equal(f.media[0].plays,count);
  await f.api.preloadAudio();
});
test('fallback completion and duplicate ended notifications release voices safely',async()=>{
  const f=fixture('missing');f.api.initAudio();await f.api.preloadAudio();
  for(let i=0;i<5;i++)f.api.playSfx('fire');
  const ended=f.nodes[0];ended.onended();assert.equal(ended.disconnected,true);
  f.api.playSfx('fire');ended.onended();f.api.playSfx('fire');
  assert.equal(f.nodes.length,6);
  for(const node of f.nodes)node.onended();
  for(let i=0;i<5;i++)f.api.playSfx('fire');assert.equal(f.nodes.length,11);
});
