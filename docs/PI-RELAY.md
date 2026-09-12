# Raspberry Pi Internet relay

> **Archived deployment record.** The production game no longer loads or connects to this relay. Retain this file only until the Raspberry Pi service, reverse proxy, certificate and DNS are manually shut down.

WiFi remains `/lan/*` HTTP POST + SSE on the local host. Internet now uses
browser P1 ↔ WSS Pi ↔ browser P2, replacing the menu's WebRTC P2P route.
`lan`, `p2p`, and `relay` remain distinct transports. Existing p2p-* DOM IDs
are retained to preserve the accepted room UI; they now invoke CatRelay.
The Pi only forwards opaque JSON. P1 still runs every gameplay decision;
P2 uses the existing input validator and authoritative snapshot presentation.

## Install and start

Install Node.js 22 or newer and npm on Raspberry Pi OS. Copy `tools/relay/`
(including package-lock.json, excluding node_modules) to `/opt/cat-fighter-relay`.
No Mac, game assets, source game modules, database or build is required at runtime.

```sh
cd /opt/cat-fighter-relay
npm ci --omit=dev --ignore-scripts
RELAY_ORIGINS=https://your-game.example HOST=127.0.0.1 PORT=8788 node server.cjs
curl http://127.0.0.1:8788/health
```

Environment:

| Variable | Default | Purpose |
|---|---|---|
| HOST | 127.0.0.1 | Bind address; suitable for a local tunnel |
| PORT | 8788 | HTTP / WebSocket port |
| RELAY_ORIGINS | empty | Comma-separated exact allowed browser origins; empty denies browsers |
| RELAY_IDLE_MS | 120000 | Expire rooms without authenticated gameplay traffic |
| RELAY_SESSION_MS | 21600000 | Absolute six-hour session lifetime |

Use positive millisecond values. A paused connected game still exchanges traffic.
Rooms/tokens live only in memory. Service restart or expiry requires a new room.
Temporary socket disconnection reconnects automatically with the existing token;
the open P1 page retains the paused game. Page reload/explicit leave ends the
client session; this version does not restore a run after a page reload.

## systemd

Create a dedicated service account and an environment file:

```sh
sudo useradd --system --no-create-home --shell /usr/sbin/nologin cat-relay
sudo install -m 600 /dev/null /etc/cat-fighter-relay.env
sudoedit /etc/cat-fighter-relay.env
```

Set `RELAY_ORIGINS=https://your-game.example` in that file. Create
`/etc/systemd/system/cat-fighter-relay.service`:

```ini
[Unit]
Description=Cat Fighter Internet relay
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=cat-relay
Group=cat-relay
WorkingDirectory=/opt/cat-fighter-relay
EnvironmentFile=/etc/cat-fighter-relay.env
ExecStart=/usr/bin/node /opt/cat-fighter-relay/server.cjs
Restart=on-failure
RestartSec=3
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
PrivateTmp=true
MemoryMax=256M
LimitNOFILE=512

[Install]
WantedBy=multi-user.target
```

Ensure `/usr/bin/node` matches `command -v node`, and the service account can
read the deployment directory. Then:

```sh
sudo systemctl daemon-reload
sudo systemctl enable --now cat-fighter-relay
sudo systemctl status cat-fighter-relay
sudo journalctl -u cat-fighter-relay -f
sudo systemctl restart cat-fighter-relay
# Stop and prevent startup at boot:
sudo systemctl disable --now cat-fighter-relay
```

## Public HTTPS / WSS

Expose `http://127.0.0.1:8788` through the user's existing Cloudflare tunnel
under a dedicated HTTPS hostname, e.g. `https://relay.example.com`.
The proxy must preserve WebSocket Upgrade and the browser Origin header.
Set the existing game's `index.html` meta configuration before publishing:

```html
<meta name="cat-fighter-relay-origin" content="https://relay.example.com">
```

The client derives `wss://relay.example.com/relay`. Local tests can use an
explicit `http://127.0.0.1:PORT` origin. There is deliberately no fallback to
LAN/P2P if the relay origin is missing. No DNS/tunnel configuration or deployment
is performed by this change. Publish the game separately on its static host.

## Protocol and bounds

All messages are UTF-8 JSON text on `/relay`; no gameplay polling or compression.
First message: `{kind:"create"}`, `{kind:"join",code:"123456"}`, or
`{kind:"resume",code,token}`. Success: `{kind:"session",code,role,token}`.
Codes are six decimal digits; host and guest get separate random 24-byte tokens.
Tokens are sent in WebSocket messages, never URLs. No payload/token logging.
Each room reserves exactly two slots, including disconnected peers.

Server broadcasts `{kind:"presence",host,guest}` on connection changes.
Only P2 may send `{kind:"input",data:<existing input>}`; only P1 may send
`{kind:"state",data:<existing snapshot>}`. Payloads are forwarded unchanged
and validated by the existing browser net-protocol boundary. The Pi does not
interpret positions, collisions, score or game outcome. No cached state replay.
`{kind:"leave"}` from either player closes the room, invalidates both tokens
and emits `{kind:"ended"}`. Invalid requests receive an error then close 1008;
oversized frames close 1009. Reconnecting never automatically resumes P1.

Bounds: 512 KiB/message, 60 messages/s and 2 MiB/s per socket, 5-second initial
authentication timeout, 60 upgrades/minute per socket IP, 128 connections,
32 rooms, 4096 IP rate buckets; expired buckets removed every 5 seconds.
Behind a tunnel, the connection IP limit is shared; forwarded IP headers are
not trusted. Browser origins use an exact allowlist. Native clients still need
room tokens after joining; origin checks are not authentication.
Slow receiver queues above 512 KiB are disconnected; client send queues above
256 KiB skip a frame using existing action retention. No filesystem serving.

The existing 50 ms / approximately 20 Hz state and input cadence is unchanged.
No bandwidth optimization: retain the planning baseline of state ~110–133 KB/s,
input ~1.6–1.8 KB/s, total relay ingress+egress ~0.8–1.0 GB/hour.
Diagnostics count the same logical `{kind,data}` JSON as P2P. Actual traffic
varies with scene contents and adds WebSocket/TLS overhead; the baseline was
not re-measured across the public Internet in this change.

## Validation

From the repository root, after `npm ci --prefix tools/relay`:

```sh
node --test tests/relay.test.cjs tests/relay-integration.cjs tests/lan.test.cjs
node --test tests/net-protocol.test.cjs tests/presentation.test.cjs tests/bandwidth.test.cjs tests/build-pages.test.cjs
```

Integration runs two isolated real game/client runtimes against real WebSockets:
P2 movement/fire, P1 snapshots and authority, reconnect pause, P1 explicit resume,
bandwidth counters and leave. DOM/controller stubs are used, not browser contexts.
On deployment, also test two devices on different networks, interrupt/reconnect
one connection, and verify P1 remains paused until RESUME. Public Pi/Cloudflare
connectivity requires the user's actual configured endpoint.
