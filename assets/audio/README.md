# Audio assets

No real audio is supplied yet. Add short PCM WAV files under `sfx/`:

- player_shot_01.wav … player_shot_04.wav
- enemy_shot_01.wav … enemy_shot_03.wav
- enemy_hit_01.wav … enemy_hit_03.wav
- small_explosion_01.wav … small_explosion_03.wav
- heavy_explosion_01.wav … heavy_explosion_03.wav
- bomb_blast.wav
- boss_warning.wav

Add streamed music under `music/`: `music_level1.mp3`, `music_boss.mp3`.

SFX are fetched/decoded once on first audio initialization, then buffers are reused.
Missing/undecodable variants are ignored; available variants are selected using an
independent PRNG (rate ±2%, gain ±0.8 dB). If none loaded, square-wave fallback
preserves legacy frequencies/durations. Music errors are silent; failed tracks
are not retried this session. Use HTTP for assets; file:// fetch restrictions
still permit oscillator fallback.

Default master/music/SFX gains: 1/.30/.75. Existing game sound flag and boot
interaction remain authoritative. Music uses one reusable HTMLAudioElement,
with immediate LEVEL/BOSS/NONE switching. Pause stops music; resume restarts the
appropriate track. No per-frame audio loading or rendering triggers.

Voice caps (new requests discarded at cap): player_shot 5, enemy_shot 4,
enemy_hit 6, small_explosion 4, heavy_explosion 3, bomb 2, boss 3, ui 2.
Both buffers and oscillators count toward caps and disconnect on completion.

Game mappings: player/enemy volleys → shots; damageEnemy → enemy_hit;
small kills → small_explosion; heavy/boat/boss kills → heavy_explosion;
bomb → bomb_blast; existing boss spawn → boss_warning/BOSS; start/next loop →
LEVEL; clear/game-over/pause → NONE. Existing UI/pickup tones remain.
Arcade simulations are silent and cannot change live music.

Networking is unchanged. Guests consume snapshots rather than resolving combat,
so host combat SFX are not mirrored to guests; no sound packets or snapshot
schema changes were introduced.

Validation:
- node tests/game.test.cjs --current (PASS, including 200-second simulation)
- node --test tests/charge.test.cjs tests/audio.test.cjs (9 PASS)
- node tests/lan.test.cjs (PASS; localhost service required sandbox permission)
- node --test tests/net-protocol.test.cjs tests/p2p-signaling.test.cjs tests/presentation.test.cjs tests/player-assets.test.cjs tests/viewport.test.cjs (15 PASS)
- node --check game.js; node --check src/audio.js (PASS)
- node tests/game.test.cjs (historical baseline fails at superseded drop-rate
  expectation, as already documented in project README; not rewritten)

Audio review (2026-09-10):
- Fixed init/unmute attempting play() on stopped or failed music.
- `node --test tests/audio.test.cjs`: 5 PASS; includes idempotent voice release
  and no retries of stopped/failed music.
- `node tests/game.test.cjs --current`: PASS after the fix.
- `NODE_PATH=<playwright installation> node tests/audio-browser.cjs`: PASS in
  bundled headless Chromium, with test-routed local files (no HTTP server).
  Covers 1P/2P rapid 3-way volleys, enemy fire, small/heavy explosions, bomb,
  Boss entry, repeated mute toggles and pause/resume.
- Missing-assets run: 20 expected 404 messages, exactly one per audio asset;
  no uncaught errors or AudioContext warnings. All 18 SFX requests made once.
- Decoded-buffer run: silent in-memory WAV fixtures only, 18 decodes and 18 SFX
  requests total; no console errors/warnings. Production assets remain absent.
- Both runs: one AudioContext, one music element, all voices end, only the two
  permanent gain nodes remain connected. Observed voice maxima respect caps.
  Music reloads on state changes/resume by the documented restart design.
- RNG uses a private PRNG; triggers are gameplay/UI events, not draw calls.

Headless validation verifies browser resource lifecycle, not audible quality.
Real asset listening remains outstanding.
