# Cat Fighter — Pacific Paws

## 動態難度（2026-09-11）

- 仍有生命的玩家計入有效人數，包括短暫重生／進場；耗盡生命後最多 5 秒回落至單人基準，重新加入最多 12 秒升回雙人基準。
- 單發／雙發／三向火力分數為 1／1.7／2.1，Rapid ×1.5；按每人平均火力計算 `1 + 0.2 × (平均火力 - 1)`，上限 1.35。炸彈不計入持續火力。
- 火力升壓最多 12 秒、降壓最多 4 秒，只在遊戲進行時計時。普通／船隊由單人 5、雙人 7 隻基準取整調整，滿火力最多 7／9 隻；重型編隊維持 2 隻，每隊獎勵數量不變。
- Boss 出場 HP 以平滑後人數在 650–1050 間插值，再乘火力壓力、周目倍率；出場後固定。波距、敵人血量、彈速與射擊節奏保留原設定。
- 調校參數集中在 `src/levels/level1.js` 的 `adaptive`；驗證：`node tests/game.test.cjs --current`。

## 更新快取與 START 修復（2026-09-11）

- 頁面的 JavaScript／CSS URL 使用檔案內容雜湊版本碼，避免新版 `game.js` 與瀏覽器快取的舊 `enemies.js` 混用，造成 `formationReward is not defined` 並中斷第一波動畫。
- 修改 JavaScript／CSS 後，執行 `node tools/version-assets.cjs`，並同步更新 `index.html`；驗證使用 `node tools/version-assets.cjs --check`。
- `tests/start-runtime-browser.cjs` 模擬舊快取，重現原本的 START 錯誤，再以版本化資源驗證兩款戰機能在真實 requestAnimationFrame 迴圈中持續遊玩。


## Demo 與現行玩法同步（2026-09-11）

- 74 秒示範循環：神風機 RAPID、第一船隊 2-WAY、下一船隊 3-WAY、中 Boss BOMB／1UP，均由實際射擊擊落攜帶者，再掉落與拾取，沒有預先放置浮空獎勵。
- 中 Boss 章節明確標示掉落示例，說明 50% BOMB、10% 1UP、40% 無獎勵；示例固定展示指定結果，不表示每隊必掉。
- 船隊和中 Boss 的獎勵判定與正式遊戲共用 `formationReward`。新增第二周目 +5% 示範，使用正式編隊生成與倍率；Boss 章節說明最後階段密集但較慢的彈幕。
- 保留觸控拖曳、放手停火、雙擊炸彈，並接入現行單人選機流程。短橫向螢幕手勢提示與 START 留有間距。
- `tests/arcade-browser.cjs` 使用 Playwright 內附 headless Chromium 驗證實際擊落／掉落／拾取、章節循環、正式遊戲狀態隔離、手機／橫向／桌面排版與選機／重試流程。下文舊 60 秒循環描述由本節取代。


## 編隊獎勵與周目（2026-09-11 更新）

- 神風機（有蓄力衝刺狀態的小型敵機）必帶 RAPID，擊落後掉落。
- 每波船隊固定一艘帶火力獎勵：2-WAY → 3-WAY → 2-WAY 循環，按船隊出現次序推進；漏掉或未拾取不會改變順序，每周目重置為 2-WAY。第 35 波重疊編隊按船隊處理。
- 每波中 Boss 機隊固定第一架作獎勵候選，只抽一次：50% BOMB、10% 1UP、40% 無獎勵，三種結果互斥。
- 不再生成定時補給、定時 1UP 或重生／重新加入補給；場上既有獎勵不會阻擋下一編隊攜帶獎勵。
- Final Boss 最後階段基礎彈速由 210 降至 120。每周目保留線性 +5% 難度：敵機移動／衝刺、敵彈速度、射擊頻率及 Boss 血量遞增；神風機預警時間維持不變。
- 驗證：`node tests/game.test.cjs --current`、`node --test tests/charge.test.cjs tests/net-protocol.test.cjs`。下文舊定時／重生補給描述由本節取代。


## 觸控單人與連線選機（2026-09-11）

- 現行介面以每台一人觸控為主：隱藏手掣設定／秘技入口與同機雙人選項，忽略已連接手掣，不顯示遊戲中第二人加入。
- 單人選機只顯示「YOUR AIRCRAFT」，可選 GINGER 或 MINT，CONFIRM 後 START；兩款都只建立一名玩家。
- 建房等待期間只顯示自己的選擇；另一台接通後才顯示雙方。各台只能選自己的戰機；主機同步選機與確認狀態，雙方 READY 後由主機開始。選機期間斷線會清除另一方確認，重連後須重新確認。
- GINGER／MINT 僅外觀不同，共用能力、射擊、碰撞與獎勵規則。難度按玩家數計算：單人普通編隊 5 架、Boss HP 650；雙人 7 架、1050。獎勵按上述編隊規則產生，與選哪款戰機無關。
- 現行驗證：`tests/aircraft-menu-browser.cjs`、`tests/aircraft-network-browser.cjs`、`tests/coop-menu-browser.cjs`、`tests/net-protocol.test.cjs`、`tests/lan.test.cjs`。後文的手掣、同機雙人及 drop-in 說明／測試保留作舊版記錄，並非現行觸控介面的驗收條件。


原創貓鼠二戰戰機直向射擊遊戲，支援本機一至兩人。遊戲執行無套件或網絡依賴，使用 Canvas、內附 PNG 素材與 Web Audio。

大佬損毀階段新增金屬碎片：75%／50%／25%／10% 門檻觸發飛散、翻滾及淡出；詳細行為與驗證見 `docs/BOSS-DAMAGE.md`。

## 遊戲途中加入第二位玩家（2026-09-11）

- 本機單人遊戲中可用 HUD 的 P1／P2 JOIN，再按 CONFIRM JOIN；新手掣可用焦點框選取同一組按鈕。只連接或按首次按鍵不會直接加入。
- 新玩家使用另一款戰機，帶初始火力、3 命及 3 枚炸彈從底部入場，到位後 3 秒無敵。原玩家物件、進度及已生成敵人維持不變。
- 暫停、過關間隔及連線局不提供此入口。已存在但死亡的玩家繼續沿用死亡倒數；重新插入手掣不會重設倒數。
- `tests/drop-in-browser.cjs` 驗證觸控／手掣加入、取消、P2 單人局加入 P1、狀態保留及正常死亡續玩。

## 單邊 Joy-Con 與休眠（2026-09-11）

- 自動模式支援單獨左／右 Joy-Con 的標準瀏覽器輸入，並沿用合併模式的邏輯手掣身分；正在進行的單人遊戲如尚未綁定手掣，按鍵即可接管該玩家。
- 未參與遊戲的手掣斷線不會暫停。合併裝置轉成單邊時給瀏覽器 500ms 完成重綁；只有仍缺少正在控制存活玩家的手掣才暫停。
- 單邊實體按鍵轉換依據 [Chromium Nintendo controller mapping](https://chromium.googlesource.com/chromium/src/+/HEAD/device/gamepad/nintendo_controller.cc)，避免把已轉為橫握的標準輸入再當成合併裝置。
- `tests/controller-single-browser.cjs` 覆蓋左右單支、單人接管、未用半支休眠及使用中手掣斷線。

## 即插即用手掣配對（2026-09-11）

- 已識別的合併 Joy-Con 預設左半支 P1、右半支 P2，不受先按哪邊影響；裝置名稱使用左／右半支，玩家標籤顯示實際配對。
- 在 `joypad` 設定頁移動／按鍵可亮起裝置卡。按 PAIR CONTROLLER TO P1／P2 後，放開並按目標手掣任意鍵即可配對；必要時交換兩位玩家的手掣，CANCEL 可取消。進行中的遊戲／連線局不允許改配對。
- 校準及可辨認的配對記在此瀏覽器；重連時對唯一相同型號裝置重新綁定瀏覽器索引。同名整支手掣無法可靠辨認時仍依加入順序。
- 技術讀值、按鍵映射及手動校準收進 Advanced；測試按鍵不會直接關閉設定。Restore Joy-Con defaults 同時清除半支自訂玩家配對。
- `tests/controller-setup-browser.cjs` 使用使用者匯出檔所示的硬體配置驗證。

## 選機及雙人面板（2026-09-11）

- 開始畫面按 START 進入選機；P1／P2 各有觸控操作區及實際戰機圖格。先加入，再預選及 CONFIRM；先確認者佔用該款，另一人只能確認剩餘戰機。
- CANCEL CHOICE 只解除鎖定；獨立 LEAVE / SOLO 隨時退出（包括已 READY），手掣可保持連接。所有仍參與的玩家確認後，START 閃動。確認與開始是分開的操作。
- 搖桿／十字掣依固定按鈕列上下左右移動 P1／P2 焦點框；推動一次後回中才進行下一次移動，避免斜推抖動連跳。再移動焦點框，再用畫面標示的選取鍵執行該按鈕；加入、戰機、CONFIRM、CANCEL CHOICE、LEAVE 及 START 都以畫面按鈕操作，不使用炸彈／暫停鍵作選單捷徑。鍵盤用 P1 A/D/F/G、P2 左右/K/L，Enter 開始。
- TWO-PLAYER 可選 SAME SCREEN、CREATE ROOM（P1）或 JOIN ROOM（P2）。房間碼可用觸控數字鍵盤或搖桿導航輸入；連線後明確標示身分及等待／就緒狀態，僅房主可 START／RESUME。原有 Wi-Fi LAN 操作保留在展開區。
- 在開始／選機畫面輸入 `joypad` 開啟隱藏手掣設定。
- 驗證：`tests/aircraft-menu-browser.cjs`、`tests/coop-menu-browser.cjs`；使用 Playwright 內附 headless Chromium。連線面板測試以記憶體 transport 驅動實際 LAN 協調器，不連接外部服務。

## 街機介面與雙人續玩（2026-09-09）

- 1UP 改為金邊、綠色內芯的發光寶物，中央只放 `1UP`。上下資訊採內附原創 Cat Arcade 字體，放大分數、關卡、生命和炸彈；生命以貓頭加數量顯示。
- 手掣設定已退回先前手動校準版本：依序設定半支 P1／P2，自己指定方向與射擊、炸彈、暫停鍵。移除圖片自動映射及合併裝置自動拆分。一般整支手掣沿用既有自訂按鍵或 A／B／＋。
- 搖桿死區預設 10%；保留已儲存的死區與自訂按鍵。設定中新增「匯出手掣設定 (.json)」及「複製設定」。
- 雙人模式：一人用完三命後，下方倒數 10 秒。倒數完且隊友仍生存時，按該玩家射擊鍵（鍵盤 P1 F／P2 K）或下方 JOIN，帶三命、三枚炸彈、初始火力從底部飛入，到位後 3 秒無敵。分數及隊友狀態保留。
- 暫停及過關倒數時凍結續玩倒數；全隊 GAME OVER 後只能 RETRY。

## Level 1 美術整合版（2026-09-07）

P1／P2 及普通鼠兵、雙引擎重型機、巡邏艇、四引擎鼠王已接入。由標題開始至 175 秒 Boss、半血加速、過關／戰敗及重新開始均已驗證；1P、2P、直接開啟 HTML 亦通過瀏覽器驗證。

玩家沿用選定 Normal 及現有左右 Roll 母稿；Up／Down／Special／Hit／Crash 暫用 Normal 圖格，原有受擊閃爍與爆炸保留。這是完整可玩流程的美術整合版，**尚非全八姿態／3D 母模完成版**。各機全姿態母模製作仍依視覺框架要求。敵機目前使用單張 Normal。沒有變更關卡數值、碰撞、武器或傷害。

美術接入使用 256px 格、4×2 玩家圖表，維持 72px 玩家顯示；敵方獨立尺寸不影響碰撞。透明 PNG 由 imagegen 製作及去背，打包腳本只縮放／排格。飛機投影由 renderer 依右上光源向左下繪製。

產物與驗證見 `docs/LEVEL1-INTEGRATION.md`、`artifacts/level1/`。

## WebRTC 雙人連線（Phase 1）

TWO-PLAYER → Create Game / Join Game 使用六位數字房號，連通後透過 WebRTC 直接傳送遊戲資料，P1 維持權威模擬。原有 Wi-Fi LAN 模式仍保留。

開發伺服器：`node tools/p2p-server.cjs`。公開使用需部署同源 HTTPS 信令服務；靜態網站本身不能處理配對。架構、安全限制、操作與驗證見 [WEBRTC-PHASE1](docs/WEBRTC-PHASE1.md)。

## 開始

在此資料夾執行：

```sh
python3 -m http.server 8765 --bind 127.0.0.1
```

開啟 http://127.0.0.1:8765 。亦可直接開啟 index.html；手掣建議使用 localhost 測試。

## 手掣

1. 先在 macOS 藍牙連接兩個手掣。
2. 在遊戲開始畫面，各自按一下非開始用的按鈕，登記為 P1、P2。
3. 在開始／選機畫面輸入 `joypad` 開啟設定，確認兩個裝置、Axes 及 Buttons 各自有反應。
4. 如射擊、炸彈或暫停位置有誤，使用對應「設定」按鈕重新指定實體按鈕。設定依裝置名稱保存在本機；同款手掣共用按鍵設定。
5. 關閉設定，用搖桿移動焦點框，按畫面標示的選取鍵執行選機及 CONFIRM；全員 READY 後選中 START 再執行。

預設採 Switch Pro 標準映射：A = button 1，B = button 0，＋ = button 9。搖桿死區預設 10%，在「手掣測試 / 按鍵設定」可調 0–50%，即時套用到整支與半支手掣並儲存在瀏覽器。十字掣不受死區影響。

半支 Joy-Con：左右各自橫握，在設定中按「設定半支 P1」，先放開所有輸入，依指示向右、向上推搖桿，再指定射擊、炸彈及暫停鍵；然後用另一半設定 P2。可使用瀏覽器呈現的兩個獨立裝置，或同一合併裝置中兩組獨立軸／按鍵。校準只保留本次頁面工作階段，重新開頁或斷線重連後需重新設定。「返回整支手掣」可清除半支分配。若瀏覽器沒有提供另一半的獨立輸入，遊戲無法自行分拆。

`tests/half-controllers-browser.cjs` 已用 Chrome 模擬合併／獨立裝置驗證雙人移動、射擊、炸彈、死區及儲存；實體 Joy-Con 尚待實機確認。

要提供手掣設定：先完成半支 P1、P2 校準並確認正常，再開啟「手掣測試 / 按鍵設定」，按「匯出手掣設定 (.json)」將檔案附加到對話，或按「複製設定」直接貼上。內容包含裝置名稱、原始軸／按鍵讀值、兩位玩家的軸向與按鍵校準、死區及自訂按鍵。半支校準只保留本次頁面，請在重新整理／關閉前匯出；匯出不會修改目前設定。

兩個手掣分別控制 P1 / P2；一個手掣搭配鍵盤時，手掣先登記 P1，再按「加入鍵盤 P2」。斷線或失去視窗焦點會暫停；重連後按一下按鈕重新加入，再按 A / ＋ 繼續。

## 鍵盤

- P1：WASD 移動、F 連射、G 炸彈。
- P2：方向鍵移動、K 連射、L 炸彈。
- Enter：開始 / 繼續。Esc：暫停 / 繼續。
- 聲音預設關閉，點選頂部聲音按鈕開啟。

## 關卡

175 秒編隊階段後出現頭目；Final Boss 由完整機體至危急損毀共有四段遞增彈幕，初段已是三發扇射。雙人增加編隊數量與頭目耐久。每人三條命，中彈扣一命；爆炸後從畫面底外飛入，到位後有 3 秒無敵，火力重設為初始單發及普通射速，炸彈數量保留。死亡後新機進場或雙人重新加入時，額外安排一架隨機武器獎勵載機；已有載機或道具時延後出現，同時重生共用一次補給，Boss 戰亦適用。武器 Bonus 分為 Rapid Fire、雙行平行射擊及左右各 30° 的 3 Way；Rapid Fire 加快目前形態的射速；切換至不同形態會恢復普通射速，須再次拾取 Rapid Fire 才能加速。同形態重複拾取保留目前射速。射擊形態以最後拾取為準；BOMB 補充炸彈（最多 5），1UP 增加一命。中型機每三個編隊才有一架攜帶 BOMB，場上不會再出現整隊炸彈補給；每 50 秒依序安排 Rapid Fire、雙行、3 Way，100 秒安排整關唯一的 1UP；已有獎勵載機或掉落道具時，延後下一款出場。載機只在機身顯示獎勵符號，不再畫大圓圈。炸彈清除敵彈；無友軍傷害。一人被擊落後隊友可以繼續，全隊被擊落才戰敗。

測試版擊敗 Boss 後顯示 2.6 秒 MISSION CLEAR，自動進入下一輪。分數、剩餘生命、武器及炸彈保留；已出局的隊友不會自動復活；雙人模式倒數 10 秒後，隊友仍生存時可按射擊鍵或下方 JOIN 重新加入。存活玩家從底部飛入並有 3 秒無敵。每輪重置波次、60／120 秒武器補給與100 秒唯一 1UP。難度按首輪基準每輪增加 5%：敵機與敵彈速度、射擊頻率、Boss 耐久及橫移速度；不作複利增長。全隊出局時，戰場直接顯示大型 GAME OVER，RETRY 會由首輪、零分重新開始。

普通編隊偶爾有一架敵機停頓 0.65 秒，閃出金色警示圈與「!」，然後急速衝向起衝瞬間玩家的位置；起衝後不再追蹤。開場及緩和波次不觸發，每批最多一架候選，候選有 40% 機會啟用。三向散射橫向速度由 ±28 擴至 ±70；二向快射保持原有窄角度。1UP 採金邊綠色寶物徽章，中央只顯示原創街機字體 1UP。

## 驗證

```sh
node --check game.js
node --check src/render.js
node --check src/world.js
node --check src/audio.js
node --check src/levels/level1.js
node --check src/enemies.js
node tests/game.test.cjs --current
node --test tests/charge.test.cjs
```

目前測試涵蓋雙人開局、射擊、炸彈独立消耗、全隊戰敗、連續通關、跨輪狀態保留、難度重置、暫停倒數、同幀擊殺／碰撞、模擬雙手掣分配與斷線重連，以及 200 秒關卡模擬。突進另有 6 個確定性案例。實體藍牙手掣須在使用者 Mac 上完成測試。

不加 `--current` 時亦執行 `tests/baseline.test.cjs`，包含舊 CF-ARCH-02／03 的特徵基準。它仍記錄已被取代的單次勝利、3% 掉落率及舊繪圖雜湊，故不代表現版驗收；此次修改前已在 3% 掉落率案例失敗。歷史雜湊未重建。音效測試驗證 Web Audio 呼叫，不取代實際聆聽。

## 程式邊界

- `game.js`：組裝、玩法、輸入、碰撞、波次、Boss、DOM 介面及 RAF 時間管理。粒子生成與更新仍在此處，保留原有亂數及暫停行為。
- `src/render.js`：`createRenderer(ctx, W, H, background, clamp)` 回傳讀取目前狀態的繪圖函式；只修改 Canvas，不修改實體。
- `src/world.js`：`drawWorld(ctx, W, H, t)` 繪製現有海面、島嶼與雲；時間由 `game.js` 傳入。
- `src/audio.js`：管理一次性 SFX 預載、buffer 重用、voice 上限、oscillator fallback、音量群組及單一串流音樂播放器。素材規格、事件對應與驗證見 `assets/audio/README.md`。
- `src/assets.js`：P1/P2 sprite-sheet manifest、八種純視覺狀態選擇器與安全圖片載入器。玩家圖檔放在 `assets/players/p1/` 與 `assets/players/p2/`；圖片尚未提供、載入中或失敗時，renderer 會沿用現有 Canvas 飛機幾何。

## CF-L1-ASSET-01 玩家圖像接入

`PLAYER_ASSETS` 以穩定 ID `player.p1` / `player.p2` 指向各自的 `sheet.png`。每張表使用 96×96 source cell、2×4 logical grid：第一行 Normal／Left／Right／Up，第二行 Down／Special／Hit／Crash；顯示比例為 0.75，pivot 為中心。這些是純視覺資料，不包含碰撞盒或遊戲座標。未來可將 Special、Hit、Crash 的 manifest 項目擴展成多幀 sequence，而不影響玩法。

HTML 依序載入 world、render、audio、game 的一般 script，無建置步驟，亦保留直接開啟 HTML 的支援。

## CF-ARCH-04 資料邊界

- `src/levels/level1.js`：波次間隔、編隊數量與 cadence、定時補給順序、速度成長、Boss 時間／1P 與 2P HP／射擊間隔；只提供凍結資料。
- `src/enemies.js`：現有類型的分數、子彈碰撞半寬／半高，以及 small／heavy 基礎 HP 與 heavy 固定速度。
- `game.js` 保留排程、原始玩家數判斷、生成、更新順序、碰撞判定與所有狀態修改。wave 35 仍是 boat 類型但保留 heavy 數量、HP、位置與速度；不按 boat 表覆蓋生成屬性。掉落機率、隨機掉落選擇與效果維持原碼。

HTML 在 game 之前載入 level1 與 enemies，一般 script 與直接開啟 HTML 的方式不變。新增 8 個 CF-ARCH-04 案例，原有 106 個案例及固定模擬雜湊不變。

## 全螢幕與觸控（2026-09-08）

START 後收起網站介紹與側欄，維持完整 600×800 戰場比例並最大化戰場。移除舊搖桿操控區，保留 60px 生命／暫停列；直向受螢幕寬度限制時保留留白，不裁切或拉伸戰場。

武器補給：60 秒 RAPID（二向、0.06 秒射擊間隔），120 秒 3-WAY（三向、0.12 秒）；敵機掉落率維持 1.5%，隨機提供武器或炸彈，武器兩款各半。RAPID 為粉紅色雙箭頭，3-WAY 為金色三箭頭。

- P1 在遊戲畫面按住並拖曳，戰機會保持在手指上方 72 CSS px 並自動射擊，放開停止；以實際螢幕尺寸換算，抵達可移動邊界時限制目標並停止漂移。雙擊畫面使用 BOMB，每次消耗一枚。通關倒數期間停用觸控與炸彈。
- joypad 及鍵盤原有移動／射擊／炸彈配置保留；觸控按住時接管 P1，放開即交回，P2 不受影響。
- PAUSE 彈出選單，可調聲音、查看操作介紹、設定手掣，RESUME 返回。
- 點 START 或 FULLSCREEN 嘗試瀏覽器全螢幕；不支援時保留填滿可用視窗的配置。手掣開始後可從暫停選單點 FULLSCREEN。
- 失焦、觸控取消、尺寸變更會清除觸控輸入；離開瀏覽器全螢幕會暫停。

`tests/touch-browser.cjs` 使用 Playwright / Chrome 驗證五種視窗尺寸、比例、72px 手指間距、到位不抖動、邊界限制、取消／放開、通關禁控、暫停設定、手掣移動一致性、雙擊炸彈及全螢幕離開暫停。截圖位於 `artifacts/touch-ui/`。實體手機及藍牙手掣尚需實機確認。

現版驗收使用 `node tests/game.test.cjs --current` 與 `node --test tests/charge.test.cjs`。Chrome 驗收包含 `tests/level1-browser.cjs`、`tests/touch-browser.cjs`、`tests/bonus-layout-browser.cjs`、`tests/lives-browser.cjs` 、`tests/half-controllers-browser.cjs`、`tests/controller-defaults-browser.cjs` 、`tests/controller-export-browser.cjs` 及 `tests/rejoin-browser.cjs`；需可載入 Playwright，部分測試預設使用 localhost:8767。保留的歷史特徵基準與現版差異見上方「驗證」。寶物截圖：`artifacts/touch-ui/lives-rewards.png`。


## 家用 Wi-Fi 連線雙打

### 街機開機與 Demo

開啟遊戲後先按 BOOT，約 2.8 秒模擬開機後進入 60 秒循環 Demo。短段實戰穿插拖動、自動射擊、放開停止、雙擊炸彈及五種補給教學，最後展示已受損 Boss 的決戰。Demo 使用獨立狀態，透過 `runGamePreview` 同步執行正式 `update`、`bomb`、拾取判定與 renderer；命中、擊殺、得分、爆炸及 Boss 扣血均由遊戲規則產生，完成後還原正式遊戲狀態。拖動有接觸圈與軌跡，雙擊有兩次按壓波紋，拾取有原有音效、粒子及提示。示範場景的初始編隊與道具位置由教學編排。

按 START 直接開單人新局；「選機／雙人」及「Wi-Fi 雙打」可由 Demo 開啟。單機 GAME OVER 閒置 15 秒自動返回 Demo，RETRY 取消倒數，頁面在背景或對話框開啟時暫停倒數；連線遊戲不自動離開房間。暫停選單的「返回 DEMO／結束本局」會放棄目前單機局並回到示範；連線期間停用。主頁僅保留遊戲畫面，沒有外圍操作手冊；手掣底層支援保留，主介面以觸控為主。

驗證：`tests/arcade-browser.cjs` 覆蓋 BOOT、60 秒循環、實際擊殺／拾取／炸彈／Boss 扣血、Demo 狀態隔離及例外還原、不同尺寸手勢與 START、本機雙人、GAME OVER 閒置返回、RETRY 取消及連線保護；`tests/touch-browser.cjs` 和 `tests/lan.test.cjs` 已接上開機流程。畫面紀錄在 `artifacts/arcade-boot/`。

### 開始連線

1. 在一部電腦安裝 Node.js 22 或以上，於此遊戲資料夾執行 `node tools/lan-server.cjs`。
2. 電腦及另一部裝置連接同一個 Wi-Fi，各自開啟終端顯示的區域網絡網址，例如 `http://192.168.0.55:8767`。手機不可以用 `localhost`，必須用電腦的網址。
3. 房主按「Wi-Fi 雙打」→「建立房間 · P1」。另一部裝置按「Wi-Fi 雙打」，在 Available hosts 清單選擇房主即可加入；可按「搜尋／更新房主清單」重新搜尋，亦保留六位房間碼加入。清單只列出目前服務中已連線且沒有 P2 的房主。兩部裝置若開啟不同服務，請使用「另一部 host 電腦的網址」切換至房主提供的網址；這不是全 Wi-Fi 網段掃描。開啟連線設定時就會顯示可供其他裝置使用的網址。
4. 兩人均顯示已連線後，關閉設定視窗，由房主按 START。電腦的服務及房主遊戲頁面要保持開啟。

每部裝置只控制自己的飛機；均可用 WASD／方向鍵、F／K 射擊、G／L 炸彈，或該裝置的一個手掣。手機可在整個戰場拖曳並自動射擊，雙擊用炸彈。兩邊共用敵人、分數及關卡，生命與裝備獨立；死亡後初始火力、重生獎勵、10 秒重新加入及跨輪進度沿用現有規則。

房主負責開始、繼續和 RETRY；任一方可暫停。斷線或長時間沒有收到資料時暫停，連線恢復後由房主按 RESUME。P2 離開後可重新加入原房間繼續控制同一架飛機；房主關閉／重新整理頁面會結束房間，不能復原該場進度。按頂部的連線狀態可開啟設定及離開房間。

預設埠為 8767；如已使用，可執行 `PORT=8777 node tools/lan-server.cjs`。無法從手機開啟時，確認電腦防火牆允許 Node 的區域網絡連線，以及 Wi-Fi 並非隔離裝置的訪客網絡。直接開啟 `index.html` 仍可玩原有單機／同機雙打；跨裝置雙打需要上述服務。此功能供家用區域網絡使用，無需雲端帳戶或路由器轉發連接埠。

實作：`tools/lan-server.cjs` 使用 Node 內置 HTTP 提供靜態檔案、房間及 SSE 中繼；`src/lan.js` 每秒最多傳送 20 次房主狀態與 P2 輸入，P2 不另行運行碰撞或敵人模擬。服務不需安裝 npm 套件。HTTP API 參考：[Node.js 官方文件](https://nodejs.org/api/http.html)。

驗證：`node tests/lan.test.cjs` 會建立暫時的 localhost 服務，執行兩個獨立遊戲環境，驗證實際 HTTP/SSE、房間權限、鍵盤／觸控／手掣、炸彈、死亡／重生補給、重新加入、暫停、斷線重連、跨輪及離開房間。亦已在兩個獨立瀏覽器頁面確認連線、同步開始與 P2 炸彈的雙邊 HUD。實體手機的 Wi-Fi 延遲、路由器隔離與防火牆仍需在家中裝置上確認。
