# Public two-device multiplayer

Before: the browser posts to same-origin `/p2p/*`; GitHub Pages cannot implement
those routes. A running Node server was necessary for room creation/reconnect.

After: GitHub Pages serves the game; an HTTPS Cloudflare Worker and one SQLite
Durable Object handle room credentials and bounded offer/answer/restart exchange.
Gameplay still uses the existing reliable, ordered P1 ↔ P2 WebRTC DataChannel.
No gameplay state/input, media tracks or TURN relay is added. P1 remains authoritative.
After deployment, the developer's Mac and Raspberry Pi can be offline (unless one
is itself a player's device). Both players' devices must remain connected.

## Deploy

Use Node.js supported by the pinned Wrangler toolchain (Node 22+ recommended).
From the repository root:

```sh
npm --prefix tools/cloudflare ci
```

1. In `tools/cloudflare/wrangler.jsonc`, set `vars.PUBLIC_ORIGIN` to the exact
   static game's origin, e.g. `https://macko2047-create.github.io`. An origin has
   no trailing slash or repository path: **do not append `/cat-fighter/`**.
   Use the actual custom domain instead if the game redirects there.
2. Run:

   ```sh
   cd tools/cloudflare
   npx wrangler login
   npm run check
   npm run deploy
   ```

   Deployment creates the `SIGNALING` binding and SQLite Durable Object migration.
   Keep the binding, class name, migration and fixed object name on later deploys
   to preserve active rooms. This is account-hosted Cloudflare infrastructure,
   not a tunnel to a developer computer. Account quotas/billing still apply.
3. Copy the returned HTTPS Worker origin into the existing meta tag in `index.html`:

   ```html
   <meta name="cat-fighter-signaling-origin" content="https://cat-fighter-signaling.YOUR-SUBDOMAIN.workers.dev">
   ```

4. Publish the changed static files (`index.html` and `src/p2p-transport.js`) using
   your existing GitHub Pages workflow. This implementation does not deploy or
   commit/push automatically. Reload both devices after publishing.

The configuration is captured when the transport script loads. Blank or absent
meta content preserves `/p2p/*` on the current origin for the existing Node server.
Explicit values must be an HTTPS origin (HTTP loopback is allowed for local tests).
Paths, userinfo, query strings and fragments fail closed. Cookies are omitted;
bearer session tokens remain in the Authorization header. Redirects are rejected.
The separate `/lan/*` fallback is unchanged and still needs its local Node server.

## CORS and protocol

Only the configured exact browser Origin is accepted, including for POST and
OPTIONS. Missing Origin, `null`, foreign Origin, non-POST preflight methods and
unexpected preflight headers are rejected. Allowed preflight headers are
`Content-Type, Authorization`. Responses use `Cache-Control: no-store`; approved
responses include the exact `Access-Control-Allow-Origin` and `Vary: Origin`.
No wildcard or credentialed-cookie CORS is used. CORS is not authentication:
non-browser callers can forge Origin; room tokens and rate/capacity limits still matter.

The Worker adapts Fetch to `tools/p2p-signaling.cjs` with `nodejs_compat`, so both
backends share protocol rules: six-digit codes, independent 24-byte host/guest
secrets, 10-minute join expiry, two-minute idle expiry, 12-hour session maximum,
256 rooms, 4,096 tracked IPs, 30 room attempts/IP/minute, 48 KiB request bodies,
32,768-character SDP, 16 queued signals/peer and 40 signals/peer/minute. The Worker
uses Cloudflare's `CF-Connecting-IP`, not caller `X-Forwarded-For`.
Only create/join/poll/signal/leave are exposed; no state/input routes exist.
The existing SDP validation is reused without inventing another SDP parser.

A single Durable Object serializes mutations and commits them atomically in
SQLite before replying. Expiry metadata can be scanned without loading SDP;
large queue values are split into small text rows without splitting Unicode
characters. SQLite retains rooms/tokens/queues/rate counters across object/runtime
restarts. An alarm removes idle rooms even when no more requests arrive.
This is a deliberately bounded service for friends, not a high-volume matchmaking
system. The existing 750 ms polling continues after connection to support reconnect;
it carries no gameplay, but incurs Worker/DO requests and writes. Monitor Cloudflare
usage. Do not log request bodies or Authorization headers.

## Local verification

Existing Node/P2P mode: leave the meta tag empty and run:

```sh
node tools/p2p-server.cjs
```

For cross-origin Worker testing:

```sh
# Terminal 1, repository root: serves the static game on loopback
node tools/p2p-server.cjs
# Terminal 2
cd tools/cloudflare
npm run dev -- --ip 127.0.0.1 --port 8787 --var PUBLIC_ORIGIN:http://127.0.0.1:8767
```

Temporarily set the meta content to `http://127.0.0.1:8787` and open the game at
`http://127.0.0.1:8767` in two browser contexts. Restore the desired public or empty
value afterward. Do not use that loopback URL from another physical device.

Automated tests from the repository root:

```sh
npm --prefix tools/cloudflare test
node --test tests/p2p-origin.test.cjs tests/p2p-signaling.test.cjs tests/lan.test.cjs tests/net-protocol.test.cjs tests/presentation.test.cjs
# Install the headless browser once, then test actual cross-origin Fetch + WebRTC:
cd tools/cloudflare
npx playwright install chromium
npm run test:browser
```

The Worker tests execute the actual Wrangler bundle in Miniflare/workerd with
SQLite persistence. The focused browser test verifies real CORS/preflight,
bearer requests, direct DataChannels, reconnect and traffic after Worker shutdown.
The existing broader `node tests/p2p-browser.cjs` also exercises game/menu behavior;
it requires Playwright resolvable from the repository's tests directory.

## Two devices on different networks

1. Deploy both pieces and open the same HTTPS game URL on each device. Use home
   Wi-Fi for one and cellular/another network for the other.
2. P1 selects Create Room and shares the six-digit code. P2 selects Join Room.
3. Wait for direct connection, choose aircraft, then P1 starts. Verify P2 movement
   and actions appear on P1, and authoritative snapshots arrive at P2.
4. Interrupt one peer's network, restore it, press Reconnect, then explicitly resume
   on P1. Reconnection must not auto-resume the paused game.
5. Inspect network requests: Worker traffic is only `/p2p/*` signaling. Once connected,
   blocking those requests should not stop DataChannel gameplay. Unblock them before
   testing reconnect. Never share tokens or full SDP in public diagnostics.
6. Shut down any developer Mac/Pi that is not a player device and repeat.

## Limits

STUN-only direct WebRTC cannot connect every NAT/firewall combination. Restrictive
NAT, blocked UDP, enterprise networks or some mobile carriers may prevent pairing.
Try another network; a future TURN phase would be a separate scope decision.
This phase promises independence from developer-hosted servers, not universal NAT
traversal. HTTPS, WebRTC-capable browsers and accessible Cloudflare/STUN services
are required for initial setup/reconnect. Expired signaling rooms require a new room;
an already-open DataChannel can continue even if signaling becomes unavailable.
Real remote-network acceptance must still be performed after deployment.

Cloudflare references checked during implementation:
[Durable Object state](https://developers.cloudflare.com/durable-objects/api/state/),
[SQLite storage and transactions](https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/),
[Workers best practices](https://developers.cloudflare.com/workers/best-practices/workers-best-practices/).
