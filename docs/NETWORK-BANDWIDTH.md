# Networking payload diagnostics

During two-player gameplay, open the browser console on either peer:

```js
window.lan.diagnostics().bandwidth
```

`state` always means P1 → P2; `input` always means P2 → P1. Each client
counts its own outgoing messages and the opposite incoming messages. Do not
sum diagnostics from both clients: that would count traffic twice.

The trailing window is 20 seconds, reset when joining/creating a session.
During startup, rates divide by elapsed session time (zero at the exact reset
instant); after 20 seconds they divide by 20. Idle time is included. Samples at
or before the window boundary expire. Average and peak also use only that
window. For a representative reading, play actively for at least 20 seconds.

Measurement uses `TextEncoder().encode(json).length` on the actual serialized
string, with no reserialization or changes to payload objects:

- P2P: the original `{kind,data}` JSON on fully queued sends and the identical
  reassembled JSON on receive. Fragments are not counted separately. Rejected
  sends are excluded; a partially failed send is not a complete logical message.
- LAN: the submitted POST body (including room code and existing wrapper) on
  send, and the exact SSE `data` JSON on receive. POST submissions include
  attempts whose response may later fail; this is not a delivery counter.
  LAN server normalization/wrappers mean P1 and P2 readings can differ slightly.

`messages` and `bytes` are window totals; rates are per second. Hour estimates
use decimal MB: `bytesPerSecond * 3600 / 1_000_000`. The hypothetical Pi receives
state + input and uploads the same amount, so total is twice their sum. This
assumes forwarding the measured logical payloads unchanged. It is a payload-only
planning estimate, not measured Pi WAN usage: HTTP/SSE headers/framing, WebRTC
fragment envelopes, TLS/DTLS, transport headers, acknowledgments, retransmissions,
HTTP headers and request retries are excluded. No extra messages or UI
are introduced. Reading diagnostics does not reset counters.
