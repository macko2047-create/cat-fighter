# Procedural cannon browser listening acceptance

Status: FAIL / NOT APPROVED — subjective listening is incomplete. This is not an audible-defect finding. The agent cannot hear browser audio and has not judged punch, cannon identity, brightness/fatigue, body, boom, buzz, repetition, variant coherence, masking, or P1 perceptual readability.

## Actual gameplay recording

The browser served the four new procedural WAVs in response to the normal player-shot URLs, without changing files in assets/audio/sfx. The actual requestAnimationFrame game loop, weapon fire timing, draw, and input path ran unchanged. Scenario setup selected weapon level/rapid mode, player count and invulnerability only in the disposable browser session. Enemy-hit and explosion functions were triggered to create repeatable crowded mixes. Recordings capture the live master bus with a silent observation branch; no normalization or gain changes were applied. Enemy-hit/explosion sounds are the current synthetic fallbacks. Missing music_level1.mp3 produced one existing 404; there were no JavaScript page errors.

| Recording | Sample peak | Clipped samples | P1 / P2 shot starts |
|---|---:|---:|---:|
| [01-isolated-shots](01-isolated-shots.wav) | -18.37 dBFS | 0 | 2 / 0 |
| [02-sustained-rapid](02-sustained-rapid.wav) | -17.09 dBFS | 0 | 60 / 0 |
| [03-three-way](03-three-way.wav) | -17.95 dBFS | 0 | 60 / 0 |
| [04-two-player-three-way](04-two-player-three-way.wav) | -12.31 dBFS | 0 | 60 / 60 |
| [05-with-enemy-hits](05-with-enemy-hits.wav) | -11.85 dBFS | 0 | 60 / 60 |
| [06-with-explosions](06-with-explosions.wav) | -10.27 dBFS | 0 | 60 / 60 |
| [07-mute-unmute](07-mute-unmute.wav) | -12.01 dBFS | 0 | 38 / 38 |
| [08-pause-resume](08-pause-resume.wav) | -11.94 dBFS | 0 | 38 / 38 |

All four variants decoded; each WAV fetched once. Default master gain 1 and SFX gain 0.75. Maximum captured mix peak: -10.27 dBFS. No samples exceeded full scale in any captured scenario. These are sample-peak measurements, not physical loudness or subjective-quality ratings.

Mute output measured exactly zero after switching; unmute restored shots. Pause produced no new shots, and output was silent after the short existing tails ended; resume restored shots. Both players produced 60 shot starts each in the 4-second two-player/three-way segment. Equal event counts do not establish that P1 is perceptually distinguishable or unmasked.

The isolated-shot clip contains two individually spaced gameplay shots, trimmed before the first enemy sound. The four individual variant WAVs remain separately available for auditioning. Other segments retain normal enemy activity in addition to the requested conditions.

## Exact test files — not production-approved

- `/Users/maccow/isonated project/Cat Fighter/artifacts/player-shot-generated/player_shot_01.wav`
  SHA-256: `a483b35662433c2266d2141cd74465b644a4592186641c91730cb22861e87ecd`
- `/Users/maccow/isonated project/Cat Fighter/artifacts/player-shot-generated/player_shot_02.wav`
  SHA-256: `eaa30f620a12d119d7351a80a18cd33d06039ed3856961ee21d7340b9e5e6ed8`
- `/Users/maccow/isonated project/Cat Fighter/artifacts/player-shot-generated/player_shot_03.wav`
  SHA-256: `31e4239cffe809d8b86667ad3a2a30075368b66eb366ce5837d779e7261171c8`
- `/Users/maccow/isonated project/Cat Fighter/artifacts/player-shot-generated/player_shot_04.wav`
  SHA-256: `23093a7631484be4fb361359cda0d0f0e4d4c94da6cb52c3d7f321d55561146e`

## Comparison with previous files

Previous source WAVs remain untouched and were not routed into this gameplay session. Earlier testing measured 8-second files, long voice occupancy and a +5.57 dBFS player-shot replay peak. The new gameplay recordings have no measured clipping and short tails; this is an objective comparison under different schedules, not a level-matched subjective A/B listening judgement.

## Recommended next action

Listen to the four individual variants and these unnormalized gameplay recordings at a fixed comfortable playback level. Confirm punch/cannon identity, whether the click is fatiguing, body versus bass, continuous-fire buzz, variation coherence, and masking of P1 in segment 04/05/06. Only a completed subjective acceptance should approve the exact four hashes above for production. Do not tune gameplay timing or replace source assets based on this uncompleted listening judgement.

No gameplay/network/audio architecture/source WAV modifications, commits or pushes were made in this task. Only artifacts/player-shot-listening was created. Existing dirty files were preserved.
