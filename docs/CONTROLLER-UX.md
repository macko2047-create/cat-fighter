# Controller UX / Visual Onboarding / Menu Navigation

2026-09-13

## 問題與修正

- 原本沒有設定視窗外的啟用回饋；新增 HTML／inline SVG 控制器提示及 READY 脈衝。未產生任何圖片素材，未修改 gameplay canvas。
- 原本把邏輯半支的存在直接稱為 READY；現在分開顯示實體 CONNECTED、邏輯 P1/P2 READY、控制器名稱與 ASSIGNED／NOT ASSIGNED。
- 原本自訂按鍵藏在 Advanced，且改一個動作會交換其他動作的按鍵；現在五個動作直接可見，僅覆寫選定動作。
- 選機模組的 poll 會攔截選單輸入，但未處理控制器焦點；現在 menu-navigation 在此攔截之前操作既有按鈕，沿用選機與網路選單原本的 click handlers。
- 本機與 LAN 有不同的按鍵邊緣記錄。選單確認及 START 切換會消耗目前按壓，避免同一實體按壓在 gameplay 被重新解讀為 Pause；未加入任意延遲。
- LAN 啟用時，原本提前轉入 LAN poll 會繞過設定視窗的綁定 capture；已讓設定維持使用同一套綁定流程。

## 啟用與狀態流程

1. 開機後，底部顯示控制器圖示與 PRESS ANY BUTTON TO ACTIVATE CONTROLLER。
2. 收到邏輯控制器的首次按壓，立即顯示 P1／P2 CONTROLLER READY 與短暫脈衝；首次啟用不會同時點選選單。
3. 若合併 Joy-Con 按下不屬於既有三個邏輯按鍵的實體按鍵，顯示 CONTROLLER CONNECTED，提示再按各半支的 PRIMARY，以確認是哪一側。這避免猜測、改動已驗證的實體按鍵分配。
4. 設定頁另外列出瀏覽器實體裝置，以及各邏輯半支的玩家歸屬。配對交換、重新連接與未加入的控制器仍沿用既有架構。
5. Touch 與 Gamepad 可同時存在；既有 touch 優先／放開後回到 gamepad、鍵盤輸入均保留。

## 選單流程

- Stick／D-pad：空間方向移動焦點；發光邊框顯示目前焦點。
- Confirm：操作既有按鈕，包含 START、設定、雙人選單、選機、CONFIRM 與 START。
- Back：關閉設定／雙人選單；選機已確認時先解除確認，未確認時返回 DEMO，網路選機則返回連線選單。
- Pause：遊戲中暫停；暫停選單可用 Pause 或 Back 繼續。
- 設定頁可導覽 Advanced summary 與 deadzone slider；不要求已知 Joy-Con 校準。
- 鍵盤方向鍵可導覽焦點，Enter 操作既有按鈕；原本鍵盤及觸控 handlers 保留。
- 雙人遊戲仍沿用目前產品的 LAN／各裝置選機模式；未擴增或重設本機雙人玩法。

## Custom Controls 與 Live Test

- Fire、Bomb、Pause、Confirm、Back 使用同一份 `catfighter-bindings` localStorage。
- 按下動作按鈕，該按鈕直接顯示 PRESS NEW BUTTON；下一個新的邏輯按鍵邊緣完成儲存並顯示勾號。
- 改 Fire 不會改 Confirm；改 Bomb 不會改 Back；未指定的動作保留原值／預設。
- 預設 Fire／Confirm 共用 PRIMARY，Bomb／Back 共用 SECONDARY，Pause 使用 MENU。合併 Joy-Con 維持原本三個可用邏輯按鍵，允許動作共用。
- 每張卡片的 RESTORE DEFAULTS 僅清除該控制器的動作覆寫，不動其他控制器、校準或配對。原本 Advanced 的 Restore automatic Joy-Con defaults 仍提供整體 Joy-Con 重設。
- LIVE INPUT TEST 顯示搖桿位置與五個動作亮燈，期間按鍵不操作選單；Back 按兩次退出測試，也可觸控原測試按鈕退出。輸入數值保留在 Advanced。

## 本次修改的檔案

- `game.js`：五動作設定與 UI、capture／reset、設定輪詢分流、START 邊緣消耗。
- `index.html`：連線圖示、啟用提示、實體狀態、操作說明與 live region。
- `style.css`：啟用提示、脈衝、即時搖桿／動作燈、自訂控制按鈕與焦點樣式。
- `src/controller-setup.js`：啟用狀態、P1/P2 狀態、即時測試、互斥設定操作、關閉時消耗邊緣。
- `src/menu-navigation.js`：共用選單／設定控制器輪詢與鍵盤方向焦點。
- `src/coop-menu.js`：使用獨立 Confirm／Back 綁定並同步 LAN 邊緣。
- `src/lan.js`：提供 consumeMenuPad，同步既有 LAN 按鍵記錄。
- `tests/controller-menu.test.cjs`：追加 LAN 設定 capture 及動作獨立性回歸。
- `tests/controller-defaults-browser.cjs`：更新 DOM stub 及新的狀態文案斷言；保留既有 Joy-Con 精確 mapping 測試。
- `tests/controller-setup-browser.cjs`：更新新的 READY／CONNECTED 語意及設定頁導覽斷言。
- `tests/controller-ux-browser.cjs`：新增完整 Chromium／可選 WebKit UX 回歸。
- `tests/lan.test.cjs`：追加 LAN START 持續按壓不暫停的回歸。
- `docs/CONTROLLER-UX.md`：本報告。
- `artifacts/controller-settings/controller-onboarding.png`、`controller-ux.png`：瀏覽器實際截圖，並非生成素材。

`src/half-controllers.js` 本次未修改。開始工作時已有的該檔與其他無關 dirty changes 均保留。未 commit、stage、push、reset、checkout 或 clean。

## 驗證

使用 Node 與 `NODE_PATH=tools/cloudflare/node_modules` 下的 Playwright。Chromium 在原沙箱遇到 macOS MachPort 權限拒絕；改以已獲准的 headless 執行方式完成實際驗證。

| 狀態 | 測試 | 結果 |
| --- | --- | --- |
| PASS | `node tests/controller-menu.test.cjs` | hybrid touch／gamepad／keyboard、既有 frame 流程、LAN 設定 capture |
| PASS | `node tests/controller-defaults-browser.cjs` | Node VM 模擬；standalone／combined／Extended 精確預設、配對、校準、reload、restore、touch fallback |
| PASS | `node tests/controller-ux-browser.cjs` | Chromium；啟用、實體／邏輯狀態、五動作 remap／persist／reset、live test、選機、START、Back、Pause、完整鍵盤與觸控操作 |
| PASS | `node tests/controller-setup-browser.cjs` | Chromium；左右配對、swap、活動亮燈、export、reload、390×844／820×1180／1180×820 設定頁尺寸 |
| PASS | `node tests/controller-single-browser.cjs` | Chromium；左右 standalone、combined→single handover、使用中與閒置裝置斷線 |
| PASS | `node tests/coop-menu-browser.cjs` | Chromium；LAN 選單、角色、房間碼與連線狀態 |
| PASS | `node tests/lan.test.cjs` | 真實本機 HTTP/SSE；P2 混合輸入、同步、暫停／重連與 START 邊緣 |
| PASS | `node --check`、`git diff --check` | 修改的執行腳本語法與 whitespace 檢查 |
| FAIL（既有） | `node tests/game.test.cjs`、`node tests/baseline.test.cjs` | game 前段案例通過，但完整命令在 baseline 的 movement 斷言失敗：326 != 261。以唯讀方式將測試載入的 game.js 替換為 `git show HEAD:game.js`，同樣重現；未更改玩法或舊測試以掩蓋。 |
| BLOCKED | `BROWSER=webkit node tests/controller-ux-browser.cjs` | 缺少 Playwright WebKit 執行檔 `webkit-2336/pw_run.sh`，未執行瀏覽器案例。 |

Chromium 截圖已人工目視檢查。模擬 Gamepad 的 PASS 不等於實機藍牙 PASS。

## 仍需實機確認

Android Chrome、iPad Chrome 與 iPad Safari：首次按鍵揭露裝置、合併 Extended 左右 READY、重新連接、五動作改鍵與 reload、各方向／動作 Live Test、純控制器選機→START→Pause／Resume、雙裝置 LAN 選機及 START 不誤暫停。特別確認 iPad Safari 的實體按鍵揭露與瀏覽器前背景切換行為。
