# LAN-only multiplayer

Cat Fighter supports Single Player and Local Wi-Fi / LAN co-op only. Start the local server from the repository root:

```sh
node tools/lan-server.cjs
```

Open one of the `Other devices on the same Wi-Fi` URLs printed by the server on both devices. P1 creates a game and P2 joins with the six-digit numeric room code. The browser uses only same-origin `/lan/*` HTTP requests and Server-Sent Events; P1 remains authoritative.

If `/lan/*` is unavailable (for example, on a static public site), the game explains that both devices must use the local Cat Fighter server. It does not load or try an Internet relay, remote signaling service, WebRTC matchmaking, or public endpoint fallback.

## Remaining Internet-multiplayer references

None are required for LAN gameplay. They are retained temporarily because this task explicitly does not delete or shut down deployment infrastructure.

### Dormant client code — safe to remove after shutdown

- `src/p2p-transport.js`
- `src/relay-transport.js`

Neither file is loaded by `index.html` or referenced by the production LAN coordinator.

### Deployment items — not required for LAN; manual shutdown pending

- `tools/p2p-server.cjs` and `tools/p2p-signaling.cjs`
- `tools/cloudflare/` (Worker source, Wrangler configuration, package metadata and lockfile)
- `tools/relay/` (WebSocket relay service and its package metadata)
- `tools/server-app/` (start/stop scripts, Cloudflare tunnel controls, native server app and embedded public-site URL)
- `CNAME` is the public static-site hostname, not a multiplayer relay. Keep or remove it according to the separate public-site hosting decision.

These files still contain `PUBLIC_ORIGIN`, Cloudflare, signaling, relay, or public-domain references. They must not be started or deployed as part of LAN testing.

### Archived documentation — historical/deployment reference only

- `docs/PUBLIC-P2P.md`
- `docs/PUBLIC-P2P-VALIDATION.md`
- `docs/WEBRTC-PHASE1.md`
- `docs/WEBRTC-DEVICE-TEST.md`
- `docs/PI-RELAY.md`
- `docs/RELAY-DIAGNOSTICS.md`
- `docs/RELAY-LIFECYCLE.md`
- `docs/P2-SMOOTHNESS.md`
- `docs/TWO-PLAYER-SMOOTHNESS.md`
- Internet/RTC historical paragraphs in `docs/P2-INPUT-REPLICATION.md`

Each Internet-specific document is marked archived. `README.md` and this document mention Internet/relay only to state that the feature is unsupported.

### Archived tests — not production acceptance

The complete list and current LAN acceptance suite are recorded in `tests/INTERNET-MULTIPLAYER-ARCHIVE.md`. The dormant files are:

- `tests/p2p-origin.test.cjs`
- `tests/p2p-signaling.test.cjs`
- `tests/p2p-worker.test.cjs`
- `tests/p2p-worker-browser.cjs`
- `tests/p2p-browser.cjs`
- `tests/relay.test.cjs`
- `tests/relay-client-close.test.cjs`
- `tests/relay-diagnostics.test.cjs`
- `tests/relay-integration.cjs`
- `tests/smoothness-browser.cjs`

`tests/coop-menu-browser.cjs` contains only negative assertions that the old Internet UI and configuration are absent.

### Generated records — safe to delete separately

- `logs/catfighter-node.log`
- `logs/catfighter-cloudflared.log`
- `artifacts/smoothness/` and `artifacts/p2p/`

These are historical logs or test artifacts, not runtime inputs. They were not deleted because they pre-existed this task and may be useful during manual shutdown.
