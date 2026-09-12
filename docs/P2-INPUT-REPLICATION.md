# Phase B1 — P2 movement replication

P1 remains the gameplay authority. P2 movement alone now follows input → prediction → authoritative processing → snapshot ACK → replay. No rollback, gameplay changes, or snapshot-rate reduction.

## Wire and simulation

- Existing input envelopes retain fire, target, and actions. `inputEpoch` identifies the host-issued movement generation; `moves` carries `{seq,dt,x,y,target}` commands. Axes preserve keyboard, analogue and touch controls.
- P2 captures one command per active animation frame (`dt <= 35 ms`), predicts immediately, and retransmits its unacknowledged commands through the existing 50 ms LAN send path. Failed requests retain the queue. The queue is bounded to 180; prediction stops growing at that bound.
- P1 buffers at most 180 commands, waits for sequence gaps, and consumes each sequence once. A simulation-time credit capped at 100 ms prevents a received burst from granting unlimited movement. ACK advances only after a whole command has been consumed, including commands discarded during movement restrictions.
- Authority and prediction both call `CatInputReplication.move`: 260 units/s, existing directional axes, exact touch arrival, existing bounds, and death/respawn/entering restrictions. P1/local controls retain their existing movement path. Collision, fire, bombs, enemies and results still run solely on P1.
- Protocol validation copies known fields, bounds durations/axes/targets/list length, and rejects malformed sequence numbers. Client-supplied positions are not accepted. Existing local server request-size limits remain intact.

## ACK and presentation

Snapshots include `inputEpoch` and `lastProcessedInput`. P2 removes commands through that ACK, copies the authoritative player into separate simulation state, and replays the remainder. Stale ACKs cannot undo cleanup.

Local P2 rendering uses this simulation directly, never historical snapshot interpolation. A decaying render offset smooths corrections under 80 pixels; larger corrections and player lifecycle changes snap. Remote entities retain the existing presentation system. Existing 250 ms stale presentation freeze and 2 second connection watchdog remain.

## Lifecycle

Host motion stops and mode transitions issue a fresh epoch. Connection loss clears queues, and the next host epoch resets sequences to 1. Input epochs from an old connection cannot affect the new queue. Paused snapshots clear pending movement; only the existing host START/RESUME flow allows gameplay again. Ordinary guest blur keeps sequence continuity until the host's pause snapshot renegotiates the epoch.

## Diagnostics and verification

`lan.diagnostics().inputReplication` exposes sent/generated commands, processed commands, ACK, pending/queued counts, duplicate/stale/out-of-order counts, reconciliation count, mean/max error and epoch. Retransmitted acknowledged commands legitimately increase the stale count.

- `node --test tests/input-replication.test.cjs tests/net-protocol.test.cjs tests/presentation.test.cjs`
- `node tests/game.test.cjs --current`
- `node tests/lan.test.cjs` (real HTTP/SSE, pause/reconnect and gameplay coverage)
- `node tests/input-replication-browser.cjs` (Playwright bundled Chromium; 100 ms delayed input, immediate prediction, convergence and pause epochs; diagnostics written to `/tmp/cat-b1-diagnostics.json`)

The complete `node --test tests/*.test.cjs` run has two legacy failures: `baseline.test.cjs` and its inclusion by `game.test.cjs` without `--current`. Both fail on the existing movement starting-position expectation (`326 != 261`), reproduced with unmodified `HEAD:game.js`. The current-game suite passes.

The former RTC/relay smoothness harness is archived. Production acceptance now exercises this replication path through the local HTTP/SSE LAN server only.

## Recorded local results

The 100 ms delayed HTTP-input run recorded 21 reconciliations, 12 pending commands at sampling, and zero mean/max reconciliation error; final authority/render distance was zero. Pending neutral commands are expected while a live client continues sending.

The archived RTC harness previously passed P1/P2/diagonal/reversal/fire/Boss and disconnect/reconnect checks without page errors. Those historical measurements are not part of the supported LAN-only acceptance suite.
