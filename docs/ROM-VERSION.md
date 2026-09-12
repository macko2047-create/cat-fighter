# ROM 版本、Build ID 與快取驗證

ROM 是產品版本，目前固定顯示 `ROM Ver. 0.9.12 · dev`；只在 `src/rom-version.js` 維護 `rom`、`channel`。它不代表部署的新舊。

Build ID 由 `tools/build-info.cjs` 自動生成：

```text
YYYYMMDD-HHMM-<git-short-sha>[-dirty]-<content-fingerprint>
```

時間使用 UTC。最後八位是 HTML、遊戲 JS/CSS、src JS/JSON/CSS 及建置／HTTP 工具的內容指紋，確保同一分鐘、同一 SHA 下的改碼仍有不同 ID；不用手改版本字串。未提交或未追蹤檔案會標記 `dirty`，不阻止建置。無 Git 時用 `nogit`、`dirty: null`，不假裝工作樹乾淨；`--require-git` 的正式建置仍會因 Git 不可用而失敗。

生成的一份 metadata 同時輸出為 `version.json` 與 `src/build-info.js`；BOOT 與一次性的 Console 訊息均讀取 `window.CatBuildInfo`。JSON 包含 `rom`、`channel`、`build`、`git`、`dirty`、`content`，沒有獨立手填的 Build 字串。

## 本機與部署

- `node tools/lan-server.cjs`：啟動時自動準備 Build 與有內容雜湊的 HTML，不改寫來源檔案。讀取 HTML／版本資訊時會偵測來源改動；沒有內容／Git 狀態變更時，不會因時鐘跨分鐘改 ID。改了伺服器程式仍須重啟 Node。
- `node tools/build-pages.cjs`：重建 `_site/`，產生固定的 Build artifact 與 `/version.json`。原有 Pages Actions workflow 會自動呼叫，不需要每次改 HTML。
- `CAT_SITE_ROOT=_site node tools/lan-server.cjs`：在本機驗證同一份待發布 artifact；不重新生成它的 Build ID。
- 直接用未建置的靜態來源或 `file://` 開啟時，ROM 仍顯示產品版本，但 BUILD 顯示 unavailable。請使用上述 server 或建置產物，避免把來源副本誤認成已建置版本。

## HTTP 快取

Node LAN/P2P 靜態頁面共用以下政策，LAN 訊息／同步處理未改動：

| 資源 | 政策 |
| --- | --- |
| `/`、`/index.html` | `Cache-Control: no-cache`，內容 ETag，可回 304 |
| `/version.json` | `Cache-Control: no-store`，即使提供 ETag 仍回新 200 |
| JS/CSS，`?v=` 與實際內容 SHA-256 前 12 位吻合 | `public, max-age=31536000, immutable` |
| 未版本化或版本不吻合的 JS/CSS | `no-cache`，不把新內容永久存於舊版本 URL |
| 圖片、音效等穩定路徑 | `no-cache` + ETag；未改動可 304，不必重下載 |

所有 HTML 直接載入的本機 JS/CSS 都由同一雜湊工具處理，包括 build-info 與 ROM 顯示程式；改變內容才更換該資源 URL。建置後可用 `node tools/version-assets.cjs --root _site --check` 驗證；既有來源 `node tools/version-assets.cjs` 指令保留。

## GitHub Pages 限制

[GitHub Pages 是靜態託管](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages)，不會執行本專案的 Node HTTP server。因此上述 response headers 只在 Node server 下經過驗證；此 workflow 無法替 GitHub Pages 設定 response headers，不應宣稱其 `/version.json` 已有 `no-store`。

Pages 必須發布完整 `_site` artifact，不能直接發布未建置的 repository root。既有 `.github/workflows/pages.yml` 已建置並上傳 `_site`；GitHub Settings → Pages → Source 須使用 GitHub Actions。這次沒有更改遠端設定或部署。

若 Pages/CDN 仍提供舊 HTML，使用帶唯一 query 的首頁網址重新開啟，並核對下面的版本請求；若它仍回舊 ID，就是部署／CDN 尚未更新。要保證特定 response headers，需在實際託管／反向代理層設定，不能靠 HTML meta 標籤保證。

## 測試機驗證

1. 建置／啟動最新版本，在裝置 A、B 開啟相同伺服器／部署網址。
2. Reload 兩邊；BOOT 的 `BUILD ...` 必須完全相同，也須與預期產物 `_site/version.json` 相同。兩邊同樣舊，不代表最新。
3. 如要比較「已載入版本」與伺服器版本，可在 Console 執行：

```js
const latest = await fetch('version.json?verify=' + Date.now(), {
  cache: 'no-store'
}).then(r => r.json());
({loaded: CatBuildInfo.build, server: latest.build,
  matches: CatBuildInfo.build === latest.build});
```

4. 改碼後再建置／發布；兩邊 reload 應出現新的 ID。不要只比較 ROM 字串。

## 自動驗證

- `node --test tests/build-pages.test.cjs tests/build-cache.test.cjs`
- `node tests/build-id-browser.cjs`（需 Playwright Chromium）：兩個獨立有快取的客戶端、桌面／手機尺寸、同網址 reload、暫存副本改 JS/CSS 並重建、兩邊確認實際新程式／樣式及新 Build ID、一次啟動訊息。輸出 `/tmp/cat-build-id-browser.json` 與 `/tmp/cat-build-id-mobile.png`。
- `node tests/game.test.cjs --current`、`node tests/lan.test.cjs`：現有遊戲與網路回歸驗證。
