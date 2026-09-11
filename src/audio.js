"use strict";

function createAudio(host, isEnabled = () => true) {
  const limits = { player_shot: 5, enemy_shot: 4, enemy_hit: 6, small_explosion: 4, heavy_explosion: 3, bomb: 2, boss: 3, ui: 2 };
  const groups = { player_shot: 4, enemy_shot: 3, enemy_hit: 3, small_explosion: 3, heavy_explosion: 3, bomb_blast: 1, boss_warning: 1 };
  const installedGroups = { player_shot: 4 };
  const aliases = { fire: 'player_shot', explosion: 'small_explosion', bomb: 'bomb_blast' };
  const tones = { player_shot: [750,.025], enemy_shot: [300,.04], enemy_hit: [180,.04], small_explosion: [90,.12], heavy_explosion: [90,.12], bomb_blast: [60,.4], boss_warning: [300,.2], start: [600,.08], soundEnabled: [550,.08], playerJoined: [500,.08], pickup: [1100,.1] };
  const buffers = new Map(), voices = new Map();
  const volume = { master: 1, music: .30, sfx: .75 };
  let context, master, sfxGain, loading, muted = false, music, musicState = 'NONE', failedMusic = new Set();
  let seed = 0x19ac43; // Independent of gameplay Math.random().
  const random = () => ((seed = (Math.imul(seed,1664525) + 1013904223) >>> 0) / 4294967296);
  const enabled = () => !muted && isEnabled();
  const ignore = promise => promise?.catch?.(() => {});
  function syncVolume() {
    try {
      if (master) master.gain.value = enabled() ? volume.master : 0;
      if (sfxGain) sfxGain.gain.value = volume.sfx;
      if (music) music.volume = enabled() ? volume.master * volume.music : 0;
    } catch {}
  }
  function initAudio() {
    try {
      if (!context) {
        const AudioContext = host.AudioContext || host.webkitAudioContext;
        if (!AudioContext) return;
        context = new AudioContext();
        master = context.createGain();
        sfxGain = context.createGain();
        sfxGain.connect(master); master.connect(context.destination);
      }
      syncVolume();
      ignore(context.resume());
      preloadAudio();
      if (music && musicState !== 'NONE' && !failedMusic.has(musicState) && enabled()) ignore(music.play());
    } catch {}
  }
  function preloadAudio() {
    if (loading) return loading;
    if (!context || !host.fetch) return Promise.resolve();
    loading = Promise.all(Object.entries(installedGroups).flatMap(([name, count]) =>
      Array.from({length: count}, (_, i) => {
        const asset = count === 1 ? name : `${name}_${String(i+1).padStart(2,'0')}`;
        return Promise.resolve().then(() => host.fetch(`assets/audio/sfx/${asset}.wav`))
          .then(response => { if (!response.ok) throw Error('Missing audio'); return response.arrayBuffer(); })
          .then(bytes => context.decodeAudioData(bytes))
          .then(buffer => { const list = buffers.get(name) || []; list.push(buffer); buffers.set(name,list); })
          .catch(() => {});
      })));
    return loading;
  }
  function playSfx(id) {
    if (!enabled()) return;
    const name = aliases[id] || id;
    if (!tones[name]) return;
    const category = name === 'bomb_blast' ? 'bomb' : name === 'boss_warning' ? 'boss' : groups[name] ? name : 'ui';
    let source, gain, voice;
    const active = voices.get(category) || [];
    voices.set(category, active);
    const release = () => {
      const index = active.indexOf(voice);
      if (index !== -1) active.splice(index,1);
      try { source?.disconnect(); gain?.disconnect(); } catch {}
    };
    try {
      if (!context) initAudio();
      if (!context || context.state === 'suspended' || context.state === 'closed') return;
      // Discard new requests; both real buffers and fallback share the same cap.
      if (active.length >= limits[category]) return;
      const available = buffers.get(name);
      gain = context.createGain();
      gain.connect(sfxGain);
      const [frequency, duration] = tones[name];
      if (available?.length) {
        source = context.createBufferSource();
        source.buffer = available[Math.floor(random()*available.length)];
        source.playbackRate.value = .98 + random()*.04;
        gain.gain.value = Math.pow(10, (random()*1.6-.8)/20);
      } else {
        source = context.createOscillator();
        source.type = 'square'; source.frequency.value = frequency;
        gain.gain.setValueAtTime(.035, context.currentTime);
        gain.gain.exponentialRampToValueAtTime(.001, context.currentTime+duration);
      }
      voice = source; active.push(voice);
      source.onended = release;
      source.connect(gain); source.start();
      source.stop(context.currentTime + (source.buffer ? source.buffer.duration/source.playbackRate.value : duration));
    } catch { try { source?.stop(); } catch {} release(); }
  }
  function setMusicState(state) {
    if (!['LEVEL','BOSS','NONE'].includes(state)) return;
    if (state === musicState) return;
    musicState = state;
    try {
      if (music) { music.pause(); music.removeAttribute('src'); music.load(); }
      if (state === 'NONE' || failedMusic.has(state) || !host.Audio) return;
      music ||= new host.Audio();
      music.loop = true; music.preload = 'none';
      music.onerror = () => { failedMusic.add(state); try { music.pause(); } catch {} };
      music.src = `assets/audio/music/music_${state === 'LEVEL' ? 'level1' : 'boss'}.mp3`;
      syncVolume();
      if (enabled()) ignore(music.play());
    } catch {}
  }
  function setMuted(value) {
    muted = !!value; syncVolume();
    try { if (!enabled()) music?.pause(); else initAudio(); } catch {}
  }
  const setVolume = group => value => {
    if (Number.isFinite(value)) volume[group] = Math.max(0,Math.min(1,value));
    syncVolume();
  };
  return { initAudio, preloadAudio, playSfx, setMusicState, stopMusic: () => setMusicState('NONE'),
    setMuted, toggleMute: () => setMuted(!muted), setMasterVolume: setVolume('master'),
    setMusicVolume: setVolume('music'), setSfxVolume: setVolume('sfx') };
}
