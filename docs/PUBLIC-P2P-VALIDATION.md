# 公開 P2P signaling 交付報告（2026-09-11）

已完成實作與本機驗證；**未部署、未 Commit、未 Push**。

## 架構前後

- 原本：靜態網站只能載入遊戲；同來源 `/p2p/*` 必須由常駐 Node 伺服器提供。
- 現在：GitHub Pages 提供遊戲；設定的 Cloudflare Worker 提供 signaling，單一
  SQLite Durable Object 保存房間／token／SDP／限流資料。Node 同來源模式仍可使用。
- Gameplay 仍直接 **P1 ↔ P2 WebRTC DataChannel**；signaling 不轉送 game state 或 input。
  沒有新增媒體軌道或 TURN。原有可靠有序傳輸、分塊、壅塞保護、重連及 P1 恢復模型不變。
- 部署後，不作為玩家裝置的 Mac／Raspberry Pi **不需要保持上線**。

## 檔案與理由

| 檔案 | 變更理由 |
|---|---|
| `index.html` | 新增空白 signaling origin meta 設定；僅更新 transport 的快取 hash。 |
| `src/p2p-transport.js` | 讀取並驗證設定、產生跨來源 URL；空白維持 `/p2p/*`；不送 cookie，不跟隨 redirect。DataChannel 實作未改。 |
| `tools/p2p-signaling.cjs` | 允許注入 rooms／attempts 儲存介面，預設仍為 Map；共用原有協定與限制。 |
| `tools/cloudflare/signaling-worker.mjs` | Fetch/Node 介面轉接、CORS、bounded body、Durable Object SQLite 原子儲存與到期清理。 |
| `tools/cloudflare/wrangler.jsonc` | Worker 入口、nodejs_compat、allowed origin、Durable Object 綁定／migration。 |
| `tools/cloudflare/package.json`、`package-lock.json` | 鎖定可重現的 Wrangler、workerd 測試與 Playwright 工具。 |
| `tools/cloudflare/.gitignore` | 排除本機依賴、Wrangler 狀態與本機變數。 |
| `tests/p2p-origin.test.cjs` | origin 設定、同來源 fallback、設定拒絕與 fetch 選項。 |
| `tests/p2p-worker.test.cjs` | 正式 Wrangler bundle 的 workerd／SQLite 協定、CORS、容量、過期、重啟測試。 |
| `tests/p2p-worker-browser.cjs` | 真正跨來源 Chromium 配對、重連與 Worker 關閉後的直接傳輸。 |
| `docs/PUBLIC-P2P.md` | 部署、設定、本機測試、跨網路驗收與 NAT 限制。 |
| `docs/PUBLIC-P2P-VALIDATION.md` | 本次驗證結果與 Git 狀態。 |

`game.js`、`src/lan.js`、`src/coop-menu.js`、`src/net-protocol.js`、
`src/presentation.js`、`tools/p2p-server.cjs`、`tools/lan-server.cjs` 均無 diff。
其他玩法、渲染、美術、音訊及控制器檔案也未修改。原有未追蹤檔案保留。

## 公開設定與部署

1. `npm --prefix tools/cloudflare ci`
2. 在 `tools/cloudflare/wrangler.jsonc` 設定 `PUBLIC_ORIGIN`，例如
   `https://macko2047-create.github.io`，不能附加 repo 路徑或尾端 `/`。
3. 在 `tools/cloudflare` 執行 `npx wrangler login`、`npm run check`、`npm run deploy`。
4. 把部署產生的 HTTPS Worker **origin** 填入 `index.html` 的
   `<meta name="cat-fighter-signaling-origin" content="…">`。
5. 依現有 GitHub Pages 流程發布更新的靜態檔案，兩台裝置重新載入。

完整步驟及本機 allowed-origin 覆寫見 [PUBLIC-P2P.md](PUBLIC-P2P.md)。
本次保留空白 meta，因此尚未設定的公開網站不會自行啟用雲端 signaling。

## 測試與確切結果

工具版本：Node v26.8.1、Wrangler 4.131.1、Miniflare 5.20260911.0-alpha、
Playwright 1.62.1。Miniflare 使用其提供的 V4 設定轉換 API；測試跑正式 Wrangler
打包產物，避免自行模擬 Node 相容轉換。依賴安裝於 `/tmp`，瀏覽器使用既有 bundled runtime。

| 執行 | 結果 |
|---|---|
| `NODE_PATH=/tmp/cat-fighter-worker-tools/node_modules node --test tests/p2p-worker.test.cjs` | **7 tests，7 pass，0 fail，0 skipped**；1784.298292 ms。 |
| `node --test tests/p2p-signaling.test.cjs tests/p2p-origin.test.cjs tests/lan.test.cjs tests/net-protocol.test.cjs tests/presentation.test.cjs` | **17 tests，17 pass，0 fail，0 skipped**；3268.061417 ms。 |
| `NODE_PATH=/tmp/cat-fighter-worker-tools/node_modules:/Users/maccow/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules node tests/p2p-worker-browser.cjs` | **PASS，exit 0**：跨來源 create/join、CORS preflight、bearer authorization、直接 input/state、reconnect、Worker shutdown 後繼續交換資料。 |
| Wrangler `deploy --dry-run --config tools/cloudflare/wrangler.jsonc` | **PASS**，正確識別 SIGNALING Durable Object 與 PUBLIC_ORIGIN；沒有部署。每次 Worker／browser 測試也重新打包驗證。 |
| `NODE_PATH=/Users/maccow/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules node tests/p2p-browser.cjs` | **FAIL，exit 1**：第 51 行 START 後等待 `mode==='playing'`，15000 ms timeout；尚未走到 P2P 配對。 |
| 暫存副本使用 HEAD 的 index、transport、Node server/signaling 與相同既有 browser test | **同樣 FAIL，exit 1**：同一行、同一 15000 ms timeout。證實這項完整遊戲測試問題在本次修改前已存在；未為此改動玩法或選機流程。 |
| transport hash 與 HTML 引用檢查 | **PASS**。 |
| `git diff --check` | **PASS，exit 0，無輸出**。 |
| 新增檔案逐一 `git diff --no-index --check /dev/null FILE` | **PASS，無 whitespace 診斷**。 |
| 玩法與既有網路模組 `git diff --exit-code` | **PASS，exit 0，無變更**。 |

Worker 測試包含 create、invalid room、concurrent exclusive join、host/guest auth、
offer/answer/restart、方向與 SDP 驗證、queue drain/full、signal rate、join/idle/absolute expiry、
alarm cleanup、兩種 leave、Origin 拒絕、OPTIONS、JSON/48 KiB、IP attempt limits、
256 room／4096 attempt capacity，以及完整 runtime 重啟後保留 Unicode SDP／tokens／限流計數。

最初受沙盒限制的 LAN socket 測試曾回報 EPERM，允許本機 socket 後重跑成功。
初次 Miniflare harness 的設定／打包／持久化參數不相容已修正並重跑，未列為成功。

## 剩餘限制

- 尚未部署，也尚未以真實不同網路的兩台裝置驗收。
- STUN-only 不保證通過所有 NAT／防火牆。部分行動網路、企業網路或封鎖 UDP 的環境
  可能無法直連；TURN 屬後續另行決定的工作。
- 完整既有遊戲 browser test 仍有上述已確認的基線失敗。
- signaling 仍依原有 750 ms 輪詢支援重連；沒有傳 gameplay，但會消耗 Cloudflare
  請求／SQLite 寫入額度。此實作保留原本 256 房間上限，並非大規模配對服務。
- signaling 過期或不可用時，已建立的 DataChannel 可繼續；新建／重連仍需可用 signaling。

## git status --short

以下為交付時完整輸出；除上表列出的本次檔案外，`??` 項目均為原有未追蹤工作。

```text
 M index.html
 M src/p2p-transport.js
 M tools/p2p-signaling.cjs
?? .DS_Store
?? artifacts/.DS_Store
?? artifacts/arcade-boot/
?? artifacts/arcade-ui/
?? artifacts/boss-damage/
?? artifacts/boss-debris/
?? artifacts/controller-settings/
?? artifacts/gameplay-update/
?? artifacts/github-pages/
?? artifacts/level1/
?? artifacts/p2p/boss-snapshot.png
?? artifacts/p2p/mixed/
?? artifacts/p2p/paired.png
?? artifacts/p2p/webkit/
?? artifacts/performance/
?? artifacts/player-shot-audio/
?? artifacts/player-shot-generated/
?? artifacts/player-shot-listening/
?? artifacts/reference-style/
?? artifacts/touch-ui/
?? assets/.DS_Store
?? assets/art-review/
?? assets/audio/.DS_Store
?? assets/audio/sfx/.DS_Store
?? assets/enemies/sources/
?? assets/models/
?? assets/players/.DS_Store
?? assets/players/p1/.gitkeep
?? assets/players/p2/.gitkeep
?? docs/ARCADE-UI-AND-REJOIN.md
?? docs/BOSS-DAMAGE.md
?? docs/CF-AIRCRAFT-VISUAL-FRAMEWORK-v0.1.md
?? docs/CF-CAT-HEAD-07-dimension-extraction.md
?? docs/CF-CAT-HEAD-08-reference-dimensions.json
?? docs/CF-CAT-HEAD-08-reference-dimensions.md
?? docs/CF-L1-ART-01-player-sprite-production-spec.md
?? docs/GAMEPLAY-UPDATE-2026-09-09.md
?? docs/LEVEL1-INTEGRATION.md
?? docs/PUBLIC-P2P-VALIDATION.md
?? docs/PUBLIC-P2P.md
?? docs/REFERENCE-STYLE-UPDATE.md
?? docs/RENDER-PERFORMANCE.md
?? docs/SMALL-FLIGHT-VARIETY.md
?? logs/
?? src/.DS_Store
?? tests/aircraft-p2-browser.cjs
?? tests/bonus-layout-browser.cjs
?? tests/boss-damage-browser.cjs
?? tests/boss-debris-browser.cjs
?? tests/controller-defaults-browser.cjs
?? tests/controller-export-browser.cjs
?? tests/controller-menu.test.cjs
?? tests/controller-setup-browser.cjs
?? tests/drop-in-browser.cjs
?? tests/half-controllers-browser.cjs
?? tests/level1-browser.cjs
?? tests/lobby-rewards-browser.cjs
?? tests/p2p-origin.test.cjs
?? tests/p2p-worker-browser.cjs
?? tests/p2p-worker.test.cjs
?? tests/player-shot-browser.cjs
?? tests/rejoin-browser.cjs
?? tests/viewport.test.cjs
?? tools/build-arcade-font.py
?? tools/build-boss-damage.cjs
?? tools/build-level1-assets.cjs
?? tools/cloudflare/
?? tools/server-app/
```
