# Cat Fighter LAN Server launcher

Installed at `/Applications/Cat Fighter Server.app`; bundle display name is
`Cat Fighter LAN Server`. The original bundle identifier and generic app icon
are preserved. The old app had no custom icon resource.

`Launcher.swift` checks port 8767 and opens the bundled `Start LAN Server.command`
in Terminal. An existing Node LAN server with the matching project working
directory produces “Cat Fighter LAN Server is already running”; a different
listener produces a port-conflict alert. The command checks again before starting.

Exact server command:

```sh
cd '/Users/maccow/isonated project/Cat Fighter'
unset PUBLIC_ORIGIN CAT_SITE_ROOT
export PORT=8767
exec /opt/homebrew/bin/node tools/lan-server.cjs
```

The absolute Node path is the verified Homebrew installation on this Mac.
The server runs in the foreground: Ctrl+C stops it. Quitting the launcher itself
does not stop Terminal's server. No old start/stop scripts are called.

## Backup and installation

Original app: `artifacts/lan-launcher/Cat Fighter Server.original.app`.
Verified replacement: `artifacts/lan-launcher/Cat Fighter LAN Server.app`.
These paths are relative to the project, are local artifacts, and should not be committed.
The original executable SHA-256 is
`7414e3a1195fa04121064615be793536c292c384d7cda41532465d2748c6fe11`.

Changed bundle files:

- `Contents/MacOS/CatFighterServer`: compiled AppKit launcher.
- `Contents/Resources/Start LAN Server.command`: new foreground LAN command.
- `Contents/Info.plist`: display/name changed; version 2.0.
- `Contents/_CodeSignature/CodeResources`: regenerated ad-hoc signature.

## Verification, 2026-09-12

- Swift compilation, shell syntax, plist validation and strict code signature verification passed.
- Opening the installed app started `/opt/homebrew/bin/node tools/lan-server.cjs` under a zsh parent; localhost HTTP returned 200.
- Bundled command startup printed `http://192.168.0.55:8767` and both localhost and that LAN address returned HTTP 200 from this Mac.
- Re-running the bundled command detected the existing server and printed the required already-running message without starting another server.
- No listeners on 18767; no cloudflared processes before or during verification.
- Ctrl+C stopped the PTY test and released 8767. SIGINT stopped the app-started test server and released 8767 as well.
- GUI automation could not inspect Terminal; launcher UI capture timed out. The native alert's appearance and physical Terminal Ctrl+C interaction remain manually unverified.
- A second Wi-Fi device was unavailable; cross-device access/firewall behavior still needs manual verification at the address printed on the next launch.
- All test server/launcher processes were stopped after verification. Pi services and gameplay code were untouched. No commit or push.
