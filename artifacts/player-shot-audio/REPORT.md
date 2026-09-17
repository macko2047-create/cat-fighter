# Installed player-shot WAV acceptance

Only `src/audio.js` preload selection changed: load the four installed player_shot WAVs. All existing categories, fallback tones, gain, random selection and five-voice cap remain unchanged. Original WAV bytes are unchanged. Existing audio tests were updated for four requests; `tests/player-shot-browser.cjs` exercises the actual installed files in Chromium and the actual game update/fire/mute/pause paths.

## Results

- Four real WAVs loaded and decoded once each. Stereo, 48 kHz source, 8 seconds each. Chromium may resample to its output context rate.
- All four variations selected; pitch/gain variation active. Immediate repeats are allowed by the existing random selector (one variant played four consecutive times early in this run).
- Two players with rapid fire and level-3 spread generated six projectiles per volley. Peak player-shot voices: exactly 5.
- FAIL: 585 fire calls including the initial two produced only 15 real player-shot starts during 18 seconds. Maximum gap between starts: 7.87 seconds. Eight-second buffers occupy the cap even through nearly silent tails.
- FAIL: replaying the actual scheduled player-shot events through browser OfflineAudioContext at the default 0.75 SFX gain produced sample peak 1.898 (+5.57 dBFS), RMS 0.124 (-18.12 dBFS over the 26-second render), and 1,989 channel samples outside [-1, 1]. This is already over range before adding other game sounds. The replay measures digital headroom; it does not measure physical speaker loudness or device processing.
- Mute: master gain becomes zero; no new shot sources start. Unmute and firing after pause resume work.
- Pause: actual game update stops creating shots. Existing eight-second shot tails continue; pause does not suspend/stop existing audio under the current architecture.
- No JavaScript page errors. Each WAV requested exactly once even after repeated initialization/preload calls.
- FAIL for an entirely clean console: existing missing `assets/audio/music/music_level1.mp3` produces one 404. This is outside the four-WAV scope; music was not changed.

## Asset findings

- 01: an additional strong sound begins around 3 seconds after the first sound; likely to sound like an unrelated delayed shot.
- 02 and 04: respectively 2 and 7 PCM samples touch a digital rail. This alone does not prove audible source distortion, but leaves no source peak headroom.
- 03 and 04: long nearly silent tails (roughly after 4.5 and 4 seconds respectively) still reserve voices.
- All four files contain non-silent audio; none is an entirely silent file.

## Validation and limits

`node --test tests/audio.test.cjs`: 5/5 pass.

`tests/audio-browser.cjs`: both existing missing-file and synthetic-buffer regression scenarios pass after expected preload count changed to four. Synthetic audio is used only in this existing regression test.

`tests/player-shot-browser.cjs`: real-file smoke and behavioral assertions complete; diagnostic acceptance flags correctly report clipping and console cleanliness failures. See `browser-report.json` for measured events and results. Run with Playwright available on NODE_PATH. Headless Chromium playback ran with its default mute-audio flag removed. No human/subjective listening assessment was available to this agent; do not interpret playback and signal measurements as a completed subjective listening sign-off.

The browser required an approved sandbox escalation because macOS blocked its Mach service registration. No gameplay, networking, rendering, controls, music behavior, unrelated dirty files, or original WAV contents were modified. No commit or push.
