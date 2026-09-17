# 參考風格背景與光影更新

- 新增 `assets/backgrounds/whisker-islands-v2.png`：imagegen 生成的手繪深藍海、岩岸、燈塔、植被與邊緣雲層。
- `src/world.js`：背景循環捲動、80px 接縫混合快取與細小動態反光。圖片載入前／失敗時沿用原背景。支援直接開啟 HTML。
- `src/render.js`：右上光源、向左下的較深投影、船尾浪、P1 金色／P2 藍色曳光彈、紅橙敵彈、爆炸煙霧及加色發光。
- 飛機 PNG、尺寸、碰撞、傷害及亂數均未修改。後續按使用者提出船撞岸問題，船的出生位置與水平漂移限制於 x=230–440 的中央水道。
- 原始繪圖檔備份：`artifacts/reference-style/*-before.js`。

驗證：

- `CAT_FIGHTER_GAMEPLAY_ONLY=1 node tests/baseline.test.cjs`：117 案例通過。保留原畫面雜湊；此明確選項只略過歷史繪圖雜湊案例。
- `node tests/game.test.cjs`：200 秒玩法模擬通過；接續的預設歷史畫面雜湊如預期不同，不宣稱整套通過。
- `tests/level1-browser.cjs`：Chromium 1P／2P、Boss、半血射速、過關、重開、戰敗及 file:// 通過。
- `artifacts/reference-style/preview.cjs`：明確等待新背景和飛機載入，檢查 file://、擷取特效預覽，無頁面錯誤。

Canvas 測試替身補上 gradient API；暫停背景測試改為驗證畫面持續變化與 ambient 時鐘，不再依賴某條舊水線的位置。
