# P2 呈現平滑化 — 2026-09-09

狀態：PASS — ready for another physical P2 smoothness test

未 Commit／Push。沒有修改 update()、碰撞、敵人、Boss、武器、分數、玩法計時或 P1 權威規則。原有 src/arcade.js、style.css 與其他未追蹤工作保留。

## 量測

本機兩個隔離的 headless Chromium context、真實 RTCDataChannel、390×844 viewport。前後使用同一測試路徑；before 透過測試 route 停用 presentation.js，因此仍直接畫最新權威快照。穩定 ID metadata 在兩邊量測均存在。這不是原版封包大小的比較。

移動取樣約 1.8 秒，P1 左右移動，停用一般波次；另外取樣一次 P2 按键至第一個可見位置改變。這是短時間、輕負載、localhost 測試，不能視為實體裝置延遲分布或 Boss 壓力測試。

| 指標 | Before | After（最終版本） |
|---|---:|---:|
| 實際快照到達率 | 18.49 Hz | 17.72 Hz |
| 平均到達間隔 | 54.09 ms | 56.45 ms |
| 間隔 jitter（標準差） | 7.34 ms | 7.89 ms |
| 最大到達間隔 | 67.60 ms | 68.60 ms |
| browser render FPS | 60.00 | 60.01 |
| 平均同步 draw 成本 | 0.098 ms | 0.128 ms |
| 最大同步 draw 成本 | 0.400 ms | 0.300 ms |
| P1 bufferedAmount 取樣最大值 | 880 B | 877 B |
| P2 bufferedAmount 取樣最大值 | 131 B | 131 B |
| 有可見位移的畫格比例 | 30.56% | 95.37% |
| P2 本機按鍵視覺反應（單次） | 100.5 ms | 2.6 ms |
| P2 視覺／權威位置最大差（該取樣） | 0 | 23.28 遊戲座標單位 |

到達間隔使用 acceptState 的 performance.now()，不是由 RAF 推算。P1 buffer 每 5 ms 取樣、P2 每畫格取樣，可能漏掉瞬時峰值。draw 成本不含非同步 GPU 完成時間。位移比例是位置變化代理指標，並非實體畫面評分。

在這個測試中，主要原因是約 20 Hz 快照跳格，加上本機輸入等待送出／P1 處理／回傳。未見持續 DataChannel 積壓或同步繪圖瓶頸。原有 50 ms 發送節流不變；由 RAF 驅動的節流實際可能低於 20 Hz。沒有調高頻率，暫不建議調高。

## 設計

- Host 用 WeakMap 分配穩定 netId，只加入序列化副本，不修改模擬物件。協議白名單接受此選用 metadata；沒有修改連線方式或輸入協議。
- Client 保留最多 12 份帶本機到達時間的快照，renderer 以 now−100 ms 的目標時間在快照間插值。這增加遠端物件約 100 ms 的視覺延遲，用以吸收到達抖動。
- players、enemies（包含 Boss）、shots、hostile、drops、sparks、bossDebris 的 x/y 使用獨立 render copies；碎片角度及背景視覺時間也插值。Boss wreck 等其他狀態維持最新值。
- 實體清單和非視覺欄位始終取最新權威狀態。消失的物件立即移除，新 ID 直接出現；不用陣列索引配對。死亡、重生、入場狀態改變或位置差 ≥100 時不混合。
- 暫停、模式改變、loop 改變、時間倒退、失聯／重新連線會重設；快照超過 250 ms 未更新停止預測，既有 2 秒斷線機制與 P1 明確 RESUME 保留。
- P2 本機飛機每個 render frame 讀取現有鍵盤／手把／觸控輸入，只預測視覺移動。使用現行 260 units/s 及畫面邊界，dt 最大 35 ms。
- 校正目標是最新權威位置加最多 50 ms（13 units）的方向前量；實際視覺誤差可能因平滑而較大。一般使用 100 ms 時常數收斂，校正誤差 >80 units 直接修正。觸控前量不超越目標。停止輸入後收斂，不寫回 keys 或 authority。
- 不預測射擊、碰撞、傷害、死亡、分數、拾取、Boss 或敵人狀態。局部視覺和真實 hitbox 可能短暫不同；hitbox 完全依 P1。
- 無 debug UI。window.lan.diagnostics() 提供最多 240 筆到達時間與當前 bufferedAmount；window.lan.lastVisual 可讀取最後呈現狀態供測試。

## 測試

通過：

- node tests/game.test.cjs --current：目前玩法、200 秒模擬、Boss、武器／傷害／獎勵案例。
- node --test tests/presentation.test.cjs：7 個回歸，包含副本不變性、生成／消失、ID 重排、死亡／瞬移／暫停、重連／過期、即時移動／放開收斂及觸控目標。
- net-protocol、level1、charge、p2p-signaling 測試。
- tests/lan.test.cjs：HTTP/SSE LAN、鍵盤／觸控／手把、死亡／重入、斷線重連與明確 P1 RESUME。
- tests/p2p-browser.cjs：真實 RTCDataChannel、Boss／碎片分包、壅塞、雙向非對稱斷流、清除卡住輸入、重連後不自動恢復、權威拒絕、離開。
- 最終 after 量測額外斷言遠端位移畫格比例 >80%，且 P2 視覺位置獨立於權威位置。
- git diff --check。

最初未帶 --current 的 game.test.cjs 會執行歷史 baseline，因舊出生位置預期 261、目前實際 326 而失敗。檔案註明此歷史測試涵蓋已被取代的玩法；未修改它以掩蓋結果。改用它提供的 --current 通過。

執行環境最初禁止 localhost listen（EPERM）且缺少 Playwright browser，經 runtime 核准後安裝 bundled headless Chromium 並執行測試，未使用系統 Chrome。

尚未完成：新版本實體 iPhone／iPad 60 Hz 觀感驗證（使用者測試項目 9）。自動結果支持進入下一輪 physical test，不能聲稱實體已通過。建議檢查持續移動、快速反向、放開控制、觸控到點、Boss 彈幕、死亡重入及斷線後 P1 RESUME。

## 本次檔案

程式：game.js、index.html、src/lan.js、src/net-protocol.js、src/p2p-transport.js、新增 src/presentation.js。

測試：tests/lan.test.cjs、tests/p2p-browser.cjs、新增 tests/presentation.test.cjs。

報告：新增 docs/P2-SMOOTHNESS.md。

量測／圖片：artifacts/p2p/chromium/before.json、after.json、paired.png、boss-snapshot.png。

重現：將 NODE_PATH 指向提供 playwright 的 node_modules，分別設定 SMOOTHNESS_MEASURE=before 與 SMOOTHNESS_MEASURE=after，執行 node tests/p2p-browser.cjs。需要 localhost listen 與 Playwright headless Chromium。
