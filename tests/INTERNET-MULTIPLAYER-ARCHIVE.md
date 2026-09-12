# Archived Internet multiplayer tests

Public signaling, WebRTC matchmaking and Internet relay tests are no longer part of the supported game test suite after the LAN-only change. Their source files remain temporarily beside the undeleted deployment implementation so shutdown work can still be verified independently:

- `p2p-origin.test.cjs`
- `p2p-signaling.test.cjs`
- `p2p-worker.test.cjs`
- `p2p-worker-browser.cjs`
- `p2p-browser.cjs`
- `relay.test.cjs`
- `relay-client-close.test.cjs`
- `relay-diagnostics.test.cjs`
- `relay-integration.cjs`
- `smoothness-browser.cjs`

Do not include these in production-game acceptance. Current multiplayer acceptance is `lan.test.cjs`, `coop-menu-browser.cjs`, `coop-layout-browser.cjs`, and `aircraft-network-browser.cjs`.
