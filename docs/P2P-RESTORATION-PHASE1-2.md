# Public P2P restoration — Phase 1 + Phase 2

## Scope / changed files

Only local implementation and validation. No deployment, commit, push, DNS or production infrastructure changes.

Production/docs changed by this task:
- `index.html`
- `src/lan.js`
- `src/coop-menu.js`
- `src/p2p-transport.js`
- `tools/build-pages.cjs`
- `tools/lan-server.cjs`
- `README.md`
- `docs/P2P-RESTORATION-PHASE1-2.md`

Tests changed/added:
- `tests/p2p-origin.test.cjs`
- `tests/p2p-browser.cjs`
- `tests/p2p-fragmentation.test.cjs` (new)
- `tests/p2p-public-build-browser.cjs` (new)
- `tests/build-pages.test.cjs`
- `tests/lan.test.cjs`
- `tests/aircraft-network-browser.cjs`
- `tests/input-replication-browser.cjs`
- `tests/predicted-shots-browser.cjs` (already untracked before this task; only explicit LAN URL added)
- `tests/coop-menu-browser.cjs`

Pre-existing edits in lan, P2P transport, presentation, LAN tests and audio README were preserved. No changes to game.js, protocol, replication, presentation, aircraft/controller modules, signaling service, Worker, Durable Object schema or security limits. The LAN server static-file denylist needed one bounded repair: allow the P2P client script, continue denying relay.

## Transport / wire contract

Page startup reads `?transport=lan|p2p`, otherwise `cat-fighter-transport` meta (shipped default `p2p`). Invalid choices fail closed. The selected transport is copied into the session and cannot change during that session. There is no probing or fallback. Local LAN uses `http://HOST:8767/?transport=lan`; LAN discovery and diagnostics run only in LAN mode and have no Cloudflare dependency.

`window.lan` remains the sole gameplay coordinator. CatP2P hooks feed its existing acceptInput/acceptState functions, after complete CatNetProtocol.input/state validation. Invalid payloads throw back to the existing transport's fail/close path before gameplay or ACK state is applied.

P2P sends `{kind:'input',data:{x,y,fire,target,inputEpoch,moves,selection,actions}}`; LAN retains its existing POST `{input:{...},actions:[...]}` envelope. Movement uses existing sequenced replication, ACKs, retransmission, epoch and reconciliation logic. P2P actions are copied and removed only when send returns true. Backpressure retains pending actions; a definitive disconnect discards stale actions safely and pauses.

Host sends `{kind:'state',data:snapshot()}` using the same current snapshot, including IDs, dead/removal, boss/debris, aircraft revisions and lastProcessedInput. No P2P snapshot fork. Existing transport bounds remain: 512 KiB UTF-8 envelope, 8000-character fragments, maximum 66 incoming fragments; oversized envelopes close safely rather than partially queue. Tests reconstruct a 500000-character payload and reject an oversized multibyte payload, plus real boss/debris gameplay fragmentation.

## Safety / lifecycle

P2P watchdog observes incoming gameplay in ready/playing/paused states. Either one-way stall closes the stale RTC channel after 2 seconds, clears unsafe controls/actions/prediction and pauses; the remote observes channel closure or its watchdog. No reliance on a queued pause over a broken channel.

Reconnect rebuilds RTC through the existing transport, without connect()'s new-session reset. Host simulation, score and session survive where valid. Input epochs and predictions reset, authoritative state stays paused, and only P1 RESUME restarts gameplay.

Hooks capture session identity. Leave invalidates pending creation attempts and old callbacks before closing transport; a late room-create result is released. LAN SSE callbacks and asynchronous send completions also check session identity. Background visibility closes P2P; pagehide closes/leaves and clears active session, including pending creation. Returning via bfcache does not resurrect a closed room. Tests dispatch old-room callbacks after creating a new room and verify no mutation.

## UI / build

Current TWO-PLAYER → WI-FI CO-OP → CREATE/JOIN and aircraft confirmation flow stays in place. RECONNECT is available for an unready P2P session. Configuration errors are visible outside LAN diagnostics. Existing controller/touch menu and START edge ownership remain in their modules.

Generated `_site` contains P2P, loads it before lan.js, includes signaling configuration meta and excludes relay. Missing/invalid signaling origin fails before network requests for both CREATE and JOIN; public build tests observe zero `/lan/*` requests.

## Validation results

Commands use Node and bundled headless Playwright; local servers/workerd ran with permission for loopback. Worker tests only bundle via `deploy --dry-run` and run Miniflare locally; no deployment occurs.

PASS:
- `node --test tests/p2p-origin.test.cjs`
- `node --test tests/p2p-signaling.test.cjs`
- `node --test tests/p2p-worker.test.cjs` — 7 security/persistence tests
- `node tests/p2p-worker-browser.cjs` — real cross-origin Worker + RTC
- `node tests/p2p-browser.cjs` — current CREATE/JOIN, six digits, real RTC, aircraft confirmation/P1 START, movement, P1/P2 shooting, bomb backpressure/exact-once delivery, rejoin ownership, touch/gamepad, reconciliation, boss/debris fragmentation, signaling outage, both one-way losses, reconnect/explicit resume, malformed input/state, authority rejection, old callbacks, background, pagehide/bfcache and leave/new room
- `node --test tests/p2p-fragmentation.test.cjs` — 3 boundary/backpressure tests
- `node tests/lan.test.cjs` — current real HTTP/SSE regression
- `node --test tests/net-protocol.test.cjs tests/input-replication.test.cjs tests/presentation.test.cjs tests/predicted-shots.test.cjs tests/controller-menu.test.cjs` (with origin tests: 41 passing tests)
- `node tests/input-replication-browser.cjs` — final ACK position error 0
- `node tests/predicted-shots-browser.cjs` — seven firing scenarios
- `node tests/controller-ux-browser.cjs`
- `node tests/coop-menu-browser.cjs`
- `node --test tests/build-pages.test.cjs` — 3 tests
- `node tools/build-pages.cjs`
- `node tests/p2p-public-build-browser.cjs`
- `git diff --check`

FAIL CAUSED BY CHANGE: none remaining. Obsolete P2P UI selectors and LAN-only build expectations were updated and rerun successfully.

PRE-EXISTING FAIL:
- `tests/aircraft-network-browser.cjs:58`: one-keypress selection expected 1, actual 0.
- `tests/aircraft-menu-browser.cjs:17`: expected no half-controller, actual right Joy-Con returned.
Both reproduced identically in an independent `git archive HEAD` source copy (HEAD `25fbaa5`), with no restoration changes. They were not repaired. These suites stop at their failed assertion; later assertions are not counted as passing.

The mentioned coordinate mismatch did not reproduce: both current LAN regression and the unmodified HEAD LAN regression passed.

BLOCKED: no remaining local runtime blocker. Initial sandbox loopback failures were resolved by running the authorized local tests with elevated execution. Live public pairing remains unvalidated because the verified production signaling endpoint is intentionally not configured, and physical-device tests are not automated here.

## Configuration / next physical-device tests

Before a separately authorized public rollout, verify the actual Worker HTTPS origin and its exact allowed game Origin `https://catfighter.armedgaltactical.com`; put the verified origin into the signaling meta and build. No live URL is guessed. Worker stays signaling-only. No code/security/schema change was required. Whether a Worker deployment is needed depends on the existing verified infrastructure; this task did not inspect or change it.

Physical acceptance matrix after configuration (not performed):
1. Two actual devices on one Wi-Fi: CREATE/JOIN including leading-zero code, aircraft model/confirm/back and P1 START; exchange host/guest roles.
2. Desktop Chromium + iPhone/iPad Safari, then Android Chrome; test different Wi-Fi/mobile networks and restrictive NAT. Failed direct connectivity must report failure and remain paused, without fallback.
3. Real Joy-Con mappings and ordinary gamepad: focus navigation, Confirm/Back, held START consumption, reconnect navigation; combine touch aiming with controller fire/movement.
4. Both players move/shoot, P2 bomb and rejoin affect only P2; sustained/rapid/spread fire, predicted-shot removal, boss/debris and large snapshots remain consistent.
5. Interrupt each direction separately (or disable each device's network), including congested P2 actions. Both pause, clear stale input, reconnect preserves score/players, and P1 must explicitly RESUME.
6. Background/lock each phone, switch tabs/apps, restore visibility, reload, leave/new room and browser Back/Forward cache. Old rooms must never mutate new sessions.
7. Local LAN URL with `?transport=lan` still creates/joins without Internet/Cloudflare; discovery and diagnostics appear only there.
