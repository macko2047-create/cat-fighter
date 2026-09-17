# Level 1 美術整合交付

日期：2026-09-07。範圍：現有 Level 1 從開始至 Boss 過關的可玩美術整合，非全狀態 3D 美術結案。

## 實際完成

- P1 銀紅虎斑、P2 深藍乳牛貓：1024×512 RGBA 圖表，Normal／左右 Roll 使用原母稿，256px cell，72px 顯示。
- 普通鼠兵：核准大頭比例與可愛表情，鼻尖朝畫面下方。
- 重型機：橄欖綠雙引擎；Boss：灰金四引擎；巡邏艇：灰綠船身、救生圈與鼠船長。
- 四款敵人以独立 RGBA PNG 載入；未載入／失敗仍使用原 Canvas fallback。Boss 血條保留。
- 飛機陰影以 sprite alpha 由引擎投向左下。船不套飛機投影。
- 玩法與固定亂數消耗未改。波次、補給、1P/2P Boss HP、半血射擊、過關與全隊戰敗均保留。

## 驗證

`node tests/game.test.cjs`：121 個 focused baseline 案例及原 co-op／200 秒模擬通過。新增實檔 PNG 格位及 alpha header、敵方繪製與方向／Boss HUD 測試。

`node tests/level1-browser.cjs`（需要 Playwright，localhost:8767）：實際 Chrome 驗證六張素材載入、2P 開局、射擊、暫停恢復、175 秒關卡模擬、Boss 1050 HP／半血 .55 秒、擊破過關、重開清零、全隊戰敗、1P 650 HP、file:// 直接執行。頁面 JS 錯誤為零。

`artifacts/level1/formation.png` 與 `boss.png` 為實際 renderer 600×800 畫面，已人工檢视海面合成；敵我可辨識、沒有方形棋盤或黑底。大型原圖保留於 `assets/enemies/sources/`。全去背使用內建 imagegen；本地只做尺寸縮放與圖表排格。

## 尚未完成的原規格

- P1/P2 Up、Down、Special、Hit、Crash 專用姿態，當前對應格使用 Normal，並未宣稱為獨立姿態。
- P2 及全部敵方 3D 母模、固定鏡頭／光源的全狀態輸出；既有 P1 3D 實驗素材未取代選定 2D 美術。
- 敵方 Roll／Damaged／Crash 姿態與多幀動畫。
- 實體藍牙手掣與實際音效聆聽仍需硬件驗證；模擬手掣測試不等同硬件實測。

因此不得將此交付稱為全部 production art 規格完成。下一階段可從現有可玩整合版繼續全狀態製作。

## 重建素材

`node tools/build-level1-assets.cjs`，需要 Sharp 可由 Node 載入。此腳本不去背、不改圖像造型、不修改碰撞，保留原 alpha。玩家來源保持固定格位；未依各姿態輪廓重新置中。生成提示詞保存在 `assets/enemies/sources/prompts.json`。
