# Phase 1 relay lifecycle investigation

> **Archived investigation.** The production game no longer loads or connects to the Internet relay. This historical evidence is not part of current LAN operation.

## Evidence and limits

The supplied P1 counters establish a local pairing gate failure, not socket send
congestion: `send()` counts an unpaired attempt as both `sendFailures` and
`skippedState`. With no queue drops, closes, errors, watchdog or reconnects,
644 skipped states are consistent with receiving missing-peer presence while
P1's socket stays open. `presenceMissing` includes initial waiting-for-P2 presence;
it does not count only unexpected disconnects.

Server `closes` counts every accepted WebSocket's close event, including rejected
handshakes, replaced sockets and earlier sessions. It is not a count of room
failures. State/input counts are also process totals, not per-room measurements.
The supplied aggregate values cannot identify the first P2-side failure.

The sequence one connection/one room → one connection/zero rooms → zero/zero
is compatible with peer loss followed by idle expiry and a close handshake.
Explicit leave or absolute expiry can also delete before the remaining socket
finishes closing. Without timestamps and deletion reasons these cannot be
separated. Default idle expiry is 120 seconds, absolute expiry six hours: neither
explains a fresh, continuously active room failing after 10–20 seconds.

## Complete lifecycle path inventory

| Path | Socket/presence effect | Room/idle effect |
| --- | --- | --- |
| create/join/resume authentication | Assigns role socket, sends session and presence derived from OPEN state | Creates or reuses room; updates `updated` |
| live socket replacement | Clears only replaced role, broadcasts missing presence, closes old socket with 1000 Replaced, assigns new socket, broadcasts presence | Preserves room/token; updates `updated`; intentional pause/RESUME behavior preserved |
| current socket close (any cause) | Increments closes; clears only role whose socket identity matches; broadcasts presence to remaining peer | Keeps room and role reservation; does not refresh idle |
| stale socket close | Increments closes; identity mismatch prevents clearing new role socket | No room mutation |
| accepted state or input | Forwards to opposite role, counts noReceiver if it is not OPEN | Either role updates the same room `updated`, even without a receiver |
| valid diagnostic ping | Echo only, no presence changes | Does not refresh gameplay idle, by existing policy |
| RFC WebSocket ping | `ws` handles pong; no application message/presence change | Does not refresh gameplay idle |
| idle or absolute expiry | Sends ended, closes both current sockets with 1000 | Deletes room; tested before each parsed message and every sweep interval |
| explicit authenticated leave | Sends ended, closes both current sockets with 1000 | Deletes room |
| server dispose / CLI SIGTERM or SIGINT | Ends rooms and terminates remaining clients | Deletes all rooms |
| 5-second authentication timeout | Closes unauthenticated socket with 1008 | No authenticated role to clear |
| >60 messages/s or >2 MiB/s | Error then 1008; includes probes/handshakes in existing limit | Close clears only matching role; room retained |
| invalid JSON/binary/handshake/token/authority/payload/stale session | Error then 1008 | Same identity guard; rejected third player cannot clear real guest |
| >512 KiB incoming frame | `ws` protocol error / 1009 close | Clears matching role only |
| outgoing queue >512 KiB | Terminates slow receiver | Clears matching receiver role only |
| send callback error | Counts sendFailures | No direct close/delete |
| upgrade rejection (URL/origin/attempt/client limits) | Ends HTTP socket before accepted WebSocket | No closes increment or room mutation |
| peer/Cloudflare/TCP disconnection | WebSocket close increments closes, possibly 1006 | Clears matching role only; no direct room deletion |

Client `paired` starts false. Presence assigns `host && guest`; `lost()` sets it
false on missing presence, socket close, reconnect or explicit disconnect.
`ended` closes the transport logically and invokes the LAN leave handler.
Open/handshake failure or timeout closes the candidate socket. Attached socket
errors, invalid frames and oversized frames close that socket; oversized outgoing
messages close the current socket. Reconnect closes the previous socket, opens a
resume candidate, and closes the candidate if the transport was closed meanwhile.
Normal close optionally sends leave, then closes with 1000. LAN watchdog can
invoke guest disconnect, but was not changed. LAN loss clears readiness and
pauses gameplay; this behavior was preserved.

## Minimal verified repair

Server stale-close ownership protection already existed and passes a test with
the old TCP reader paused until the new socket authenticates. No replacement
policy or idle/ping semantics were changed.

Client close events already checked socket identity, but message/error handlers
did not. An event from an old socket could unpair or end the newly resumed
transport. Both handlers now reject events from a stale socket or closed
transport. The regression fails with the guards removed and passes with them.
This is a reproducible lifecycle defect, **not proof of the real-device root
cause**, particularly because P1 reported no reconnects.

Server end is now idempotent by room identity, and close callbacks do not broadcast
presence for already deleted rooms. These keep termination bookkeeping consistent.

## Diagnostics and next real-device capture

`diagnostics().lifecycle` now contains lifetime close-reason, close-code and
room-deletion-reason maps plus the last 128 timestamped lifecycle events.
Process-local socket/room serial numbers correlate authentication, replacement,
presence, rejection, close and deletion without exposing room codes or tokens.
Deletion records include idle age and total age. Effective expiry settings are
included in `limits`. Client presence-loss events include both host/guest flags.
No gameplay messages, probe cadence, thresholds or queues changed.

`peer-or-network` deliberately does not claim to distinguish the browser from
Cloudflare. Cloudflare documents edge restart termination and idle disconnects:
https://developers.cloudflare.com/network/websockets/
A close code alone cannot attribute either. Capture both P1 and P2 events and the
Pi lifecycle window around the FIRST missing presence, with tunnel logs where
available. P2 close code 4008 plus client `invalid-message` stage, for example,
would identify a client validation failure rather than bandwidth congestion.

No Pi access, deployment, or real-device reproduction was performed here.

## Regression coverage

- Real loopback WebSockets for 61 seconds, state and input at 20 Hz, diagnostic
  ping on both peers, with a stricter 2-second room idle TTL: no room/presence loss.
- Replacement with deliberately delayed old close acknowledgment, successful
  fresh traffic afterward, temporary current-peer loss and token resume.
- Alternating host/guest gameplay refreshes idle; probes do not extend gameplay
  idle; existing absolute-expiry, limits, authority and leave tests retained.
- Stale client presence/ended/payload/error callbacks cannot mutate the replacement.
- Existing two-game-runtime integration verifies reconnect pauses and explicit
  host resume, movement/fire, authority, diagnostics and leave.
