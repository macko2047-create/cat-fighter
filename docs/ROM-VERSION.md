# ROM 版本與 GitHub Pages

- 遊戲版本只在 `src/rom-version.js` 的 `ROM_VERSION` 手動調整。
- 執行 `node tools/build-pages.cjs`，從來源 checkout 執行 `git rev-parse --short HEAD`，產生 `_site/src/build-info.js`。只在輸出的 HTML 加入此檔，先載入 build info 再顯示 ROM 版本；所有 script/CSS URL 由既有工具加入內容雜湊，避免舊 SHA 快取。
- `_site/` 已忽略，不提交。每次建置會重建此目錄，不改動來源 HTML。預覽 `_site/index.html` 可見自動 SHA；直接開來源 `index.html` 則顯示 `dev`，不需 Git 或產生檔。來源匯出包沒有 Git、Git 不可用或沒有 HEAD 時，建置也使用 `dev`，不沿用舊 SHA。
- 本機有未提交修改時，SHA 只代表 HEAD，不代表那些修改。正式發布應使用乾淨、已提交的 checkout，建置後發布同一份 `_site`，不要另行提交產物或在提交前產生發布 SHA。

## Pages 啟用方式

目前遠端設定為 `main` 的根目錄直接發布（legacy）。最小切換是將 **Settings → Pages → Build and deployment → Source** 改成 **GitHub Actions**；保留既有 Custom domain 設定。此變更不由本機工具自動執行。

`.github/workflows/pages.yml` 在 main push 或 main 手動執行時 checkout 該次 `github.sha`，隨後執行測試、`node tools/build-pages.cjs --require-git`、資源雜湊檢查，最後上傳並發布 `_site`。正式建置若無 Git HEAD 會停止，避免把 `dev` 誤當正式版本發布。沒有額外 commit、amend 或 SHA 自我引用迴圈。較新的 commit 不會改變已建立 artifact 的 SHA。

本機驗證：`node --test tests/build-pages.test.cjs`、`node tools/build-pages.cjs`、`node tools/version-assets.cjs --root _site --check`。原有 `node tools/version-assets.cjs` 使用方式不變。

GitHub 官方參考：[使用自訂 Pages workflow](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)。
