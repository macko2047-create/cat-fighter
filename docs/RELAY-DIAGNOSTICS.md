# Relay diagnostics: measure before changing behavior

> **Archived diagnostics.** The production game no longer has an Internet relay path or relay-health UI. These notes remain only for identifying and shutting down the old deployment.

Status: instrumentation only. The 2-second watchdog, 20 Hz RAF scheduling,
256 KiB client protection, 512 KiB server protection and gameplay remain unchanged.
No evidence yet identifies the cause on the public Pi path. No deployment was performed.

## Pi setup (manual process)

On the Mac, from this repository:

```sh
ssh pserver 'mkdir -p ~/cat-fighter-relay-diagnostics'
scp tools/relay/server.cjs tools/relay/package.json tools/relay/package-lock.json pserver:~/cat-fighter-relay-diagnostics/
ssh pserver
```

On the Pi:

```sh
cd ~/cat-fighter-relay-diagnostics
npm ci --omit=dev --ignore-scripts
ss -lntp 'sport = :8788'
```

Stop the existing manually started relay with Ctrl-C in its original terminal
(this disconnects any current room). Keep the existing Cloudflare tunnel running.
Start the diagnostic relay below. Replace the origin value with the **game page's**
`location.origin`, printed in its browser Console; preserve all existing allowed
origins if more than one. The relay hostname is not necessarily the game origin.

```sh
RELAY_ORIGINS='https://YOUR-GAME-ORIGIN' RELAY_DIAGNOSTICS=1 HOST=127.0.0.1 PORT=8788 node server.cjs | tee ~/cat-relay-diagnostics.log
```

In another Pi terminal:

```sh
curl http://127.0.0.1:8788/health
```

It must return `{"ok":true}`. Every five seconds stdout now records process memory,
event-loop mean/p95/p99/max, connections, state/input receive rates, ingress/egress
bytes per second, queue peak and slow-receiver/rate-limit incidents. These are
aggregate counters; no tokens, room codes, IP addresses or gameplay bodies.
The metrics endpoint is deliberately not exposed publicly. Copy back the JSON
log covering each run (label its network arrangement and start/end time).

## Client setup and capture

Serve the working-tree game with updated `src/lan.js` and `src/relay-transport.js`
using your usual game-serving workflow; do not use a stale published copy.
Use Internet 2 Players and create a fresh room. On **both P1 and P2**, after joining,
run this Console snippet. Enable ping only after the Pi has been updated: an old
server rejects this diagnostic message. RTT is browser→Cloudflare→Pi→browser,
not peer-to-peer RTT and not control-to-display latency.

```js
window.lan.enableRelayPing(true);
window.relayCapture = [];
clearInterval(window.relayCaptureTimer);
window.relayCaptureTimer = setInterval(() => {
  window.relayCapture.push({at: new Date().toISOString(), data: window.lan.diagnostics()});
  if (window.relayCapture.length > 120) window.relayCapture.shift();
}, 5000);
```

Play for **five minutes** with both devices on home Wi-Fi. Record manually the
number and time of unwanted RESUME pauses, control feel and visible stutters.
Before leaving the room, export on each device:

```js
clearInterval(window.relayCaptureTimer);
console.log(JSON.stringify(window.relayCapture));
```

Copy the JSON output back, labelled P1/P2 and device/browser. If copying a long
Console value is inconvenient, download it from the same Console:

```js
const relayBlob = new Blob([JSON.stringify(window.relayCapture)], {type:'application/json'});
const relayURL = URL.createObjectURL(relayBlob);
const relayLink = document.createElement('a');
relayLink.href = relayURL; relayLink.download = 'relay-diagnostics.json'; relayLink.click();
setTimeout(() => URL.revokeObjectURL(relayURL), 10000);
```

Then deliberately interrupt P2's connection, restore it, verify P1 pauses and
requires explicit RESUME, and export another capture. Repeat a fresh five-minute
run with one device on mobile data and one on Wi-Fi; then reverse roles if useful.
Keep the game foreground except for the deliberate background test; opening
remote DevTools is preferable on mobile. Label background transitions explicitly.

## Reading results

`data.relay.intervals` reports milliseconds: lifetime mean/max/count, p95/p99 of
at most the most recent 4096 samples. `ws`, `state`, `input` are independent arrival
intervals. `gaps` counts intervals strictly above 100/250/500/1000/2000 ms and the
current/maximum consecutive run of such intervals. The first packet has no interval.
Reconnect gaps remain included. P1 receives input; P2 receives state, so the other
arrival meter is normally empty. `ws` includes presence/pong as well as gameplay.

`serialize`, `parse`, `handler`, `snapshotBuild`, `presentation` measure synchronous
work; `sendInterval` measures send attempts and `timerDelay` shows lateness of a
1-second browser timer. Presentation timing is not Canvas paint/GPU timing.
Existing presentation diagnostics accompany these measurements. RTT probes run
at most once a second, only with an empty outbound queue; ping timeout is counted
but never changes readiness or watchdog traffic. Compare an optional ping-disabled
run if rate-limit incidents occur near the existing 60 messages/second boundary.

`bufferedAmountPeak` is sampled at send/receive/probe/export, not a continuous
kernel queue measurement. `counters.queueDrops` counts rejected sends at the
existing 256 KiB protection (guest action queue remains retained on a failed send).
`skippedState` / `skippedInput` also include unpaired/closed send attempts. No new
latest-state replacement policy exists yet; already enqueued snapshots remain FIFO.
Socket close codes, presence loss, reconnect and watchdog events appear in a
bounded last-64-event list with browser visibility and queue size. A watchdog
count is **not automatically a false disconnect**; correlate it with Pi counters,
socket events and device observations. Existing loss handling clears actions;
there is no new action delivery guarantee or acknowledgement protocol in this phase.

Bandwidth: take differences of client sent/received byte counters divided by
elapsed capture time; server rates are per reporting window. Client receive bytes
include pongs/presence, sent bytes count gameplay; server byte counters include
control messages. Neither measures TLS/WebSocket overhead. The earlier 110–133
KB/s state and 1.6–1.8 KB/s input are supplied baselines, not new measurements.
For true P2 input-to-screen latency, record a high-frame-rate video showing touch
and screen response; RTT alone cannot establish it.

## Decision gate

Return both captures and the Pi log before changing watchdog or queue behavior.
Correlate a watchdog timestamp with socket closure, rate limits, queue growth,
CPU/event-loop stalls, browser timer delays and state arrival bursts. A healthy
local test cannot establish Cloudflare behavior or real-device smoothness.
