"use strict";

// Keep the legacy oscillator output synchronous and lazy. The game owns mute.
function createAudio(host, isEnabled) {
  let audio;
  const sounds = {
    start: [600, 0.08],
    soundEnabled: [550, 0.08],
    playerJoined: [500, 0.08],
    explosion: [90, 0.12],
    bomb: [60, 0.4],
    fire: [750, 0.025],
    pickup: [1100, 0.1],
  };
  function beep(freq = 300, duration = 0.08) {
    if (!isEnabled()) return;
    try {
      audio ??= new (host.AudioContext || host.webkitAudioContext)();
      audio.resume();
      const o = audio.createOscillator(),
        g = audio.createGain();
      o.type = "square";
      o.frequency.value = freq;
      g.gain.setValueAtTime(0.035, audio.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + duration);
      o.connect(g).connect(audio.destination);
      o.start();
      o.stop(audio.currentTime + duration);
    } catch {}
  }

  return {
    playSfx(id) {
      const [freq, duration] = sounds[id];
      beep(freq, duration);
    },
  };
}
