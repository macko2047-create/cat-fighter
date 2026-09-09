# WebRTC Phase 1

## 玩家流程

兩個裝置開啟同一個 Cat Fighter 網址，選 TWO-PLAYER。P1 選 Create Game，將畫面上的六位數字告訴 P2；P2 輸入後選 Join Game。顯示 Direct connection ready 後，P1 關閉對話框並按 START。

只使用資料通道，不使用相機、麥克風、QR code 或媒體 API。玩家不需輸入 IP 或 port。既有 LAN 入口保留於「Existing Wi-Fi LAN mode」。

連線失敗或關閉時立即清除遠端控制並暫停；無通知的封包中斷由兩秒 watchdog 偵測。返回連線可自動恢復 ready，但**不自動恢復遊戲**。通道已關閉時，任一玩家按 Reconnect，重新交換 SDP，保留主機的模擬狀態，再由 P1 按 RESUME。切換背景／失焦會立即嘗試傳送中立輸入與暫停，收不到通知時由 watchdog 保護。

## 模組邊界

- `src/lan.js`：既有同步協調器。`snapshot`、`acceptState`、共用 `acceptInput`、P2 keyboard/touch/gamepad、actions、ownership、暫停及恢復規則共用。歷史名稱 `window.lan` 保留，避免修改 game/render/control 接口。
- `src/p2p-transport.js`：只管理 WebRTC、SDP、封包分段、背壓與連線生命週期。P1 建立單一 reliable ordered `cat-fighter-v1` RTCDataChannel。P1 只傳 state，P2 只傳 input/actions。維持既有 20 Hz 傳輸頻率。
- `src/net-protocol.js`：對收到的狀態／輸入作型別與大小檢查，逐欄複製允許的屬性，限制玩家索引、清單、動作、方向及觸控目標。無效訊息關閉連線並暫停，不套用到遊戲。
- `tools/p2p-signaling.cjs`：獨立、記憶體內的信令服務；不載入或執行任何遊戲模擬，不接受 state/input 路由。
- `tools/p2p-server.cjs`：組裝原有靜態網站與 LAN server，加上 `/p2p/*`。原 `tools/lan-server.cjs` 只新增可選 request handler；不帶參數的行為及 `/lan/*` 保留。

遊戲、敵人、Boss、碰撞、hitbox、時間、rendering 及控制程式未因 WebRTC 修改。

## 服務與部署

本機開發：

```sh
node tools/p2p-server.cjs
```

公開玩家流程需要營運者先部署上述 Node 服務，透過 HTTPS 提供同一網站及 `/p2p/*`，例如反向代理至 loopback Node port。設定 `PUBLIC_ORIGIN=https://your-game.example`，以便檢查 HTTPS 網站的 Origin。`PORT` 預設 8767，`HOST` 預設 127.0.0.1；容器若需要可由營運者設定 `HOST=0.0.0.0`。這些是服務配置，玩家介面不顯示或要求輸入。

靜態 GitHub Pages 本身不執行信令服務；僅更新靜態檔案無法讓六位碼跨裝置配對。本次不含公開部署。服務重啟會清除記憶體房間；既有已連通的 DataChannel 不依賴信令，可繼續傳輸，但需要重建連線時必須開新房間。單程序部署；多副本必須另行設計共享房間儲存／路由。

預設 ICE 使用 Google 公開 STUN `stun:stun.l.google.com:19302`。營運者可用 `ICE_SERVERS` JSON array 改成自己的 STUN，例如 `[{"urls":"stun:stun.example:3478"}]`，本機測試可用 `[]`。本階段只允許 STUN，**不使用 TURN 或遊戲 relay fallback**。某些 NAT／防火牆組合無法建立直接連線；25 秒內未連通會顯示失敗及 Reconnect。此限制不能靠信令服務消除。

WebRTC 實作依照 [MDN data channel 說明](https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API/Using_data_channels) 管理訊息大小與 bufferedAmount。採 non-trickle ICE，等待候選收集完成後送完整 offer/answer，避免 SDP／candidate 排序問題；ICE gathering 最多等待十秒。

## 信令與限制

所有路由使用 JSON POST；敏感憑證放在 Authorization header，不放 URL。端點：create、join、poll、signal、leave。

- 六位房號由 crypto.randomInt 均勻產生，包含前置零；十分鐘後不可再加入。
- Host／Guest 各有獨立 192-bit secret，只保留於該頁面的工作階段，不寫入 localStorage。
- 一房只接受一位 Host 及一位 Guest；重連使用原 secret，第三位不能取代 Guest。
- 任一玩家明確離房即關閉 reservation；重新載入頁面後需新建／加入新房。
- Signal 只接受 role 正確的 offer/answer/restart；request 上限 48 KiB、SDP 上限 32 KiB、每 peer 待取訊息最多 16 個、每分鐘最多 40 個 signal。
- 每個 socket IP 每分鐘最多 30 次 create/join，房間最多 256 個；部署在代理後會共用代理 IP 配額，若需要更高流量須在可信邊界實作限流，不能直接信任任意 X-Forwarded-For。
- poll 每 750 ms 只帶配對／信令資訊；活動 room 最長十二小時，兩分鐘無認證活動即清除。清除以收到下一次 request 時為準，記憶體受 room 上限限制。
- 遊戲訊息最多 512 KiB，分為 8,000 字元 fragment，連同 JSON escape 保持每片低於 64 KiB；接收完整訊息最多每秒 120 個。
- 傳送 buffer 超過 256 KiB 時跳過新快照，保留尚未送出的 actions；不無限累積過時畫面。
- 已建立直接連線後，信令短暫失效不會改用伺服器傳送遊戲資料。

## 驗證

```sh
node --test tests/p2p-signaling.test.cjs tests/net-protocol.test.cjs
node tests/lan.test.cjs
node tests/game.test.cjs --current
# 需環境提供 playwright 及其 bundled browser；不使用系統 Chrome。
node tests/p2p-browser.cjs
P2P_BROWSER=webkit node tests/p2p-browser.cjs
P2P_BROWSER=mixed node tests/p2p-browser.cjs
```

瀏覽器測試使用兩個隔離 context 和真實 RTCDataChannel，涵蓋六位碼、主機明確開始、鍵盤／觸控／手掣、炸彈所有權、Boss／碎片快照分段、封鎖信令仍能遊玩、靜默中斷、失焦、重連後手動恢復、惡意 guest state 拒絕及離房。信令測試另涵蓋到期、第三人、Origin、secret、大小與 queue 限制。

自動化瀏覽器測試不能替代實體 iPhone／iPad Safari 及不同網路 NAT 的驗收。公開 HTTPS 部署、實體裝置及跨網路測試需在營運環境另外完成。

### 本次執行結果（2026-09-09）

- PASS：5 個信令／協定 Node 測試。
- PASS：既有 `tests/lan.test.cjs` HTTP/SSE 整合測試。
- PASS：`tests/game.test.cjs --current`，包含 200 秒模擬、Boss、碰撞、武器、重生與續玩。
- PASS：bundled Chromium 153、WebKit 26.6，各自雙 context 的真實 DataChannel 全流程。
- PASS：Chromium P1 + WebKit P2 跨引擎全流程。
- PASS：傳送背壓解除後炸彈只送一次、pagehide 清理連線、語法及 diff whitespace 檢查。
- 截圖：`artifacts/p2p/{chromium,webkit,mixed}/paired.png` 與 `boss-snapshot.png`；已檢視配對介面的手機尺寸畫面。
- 未執行：公開服務部署、實體 iPhone／iPad Safari、不同 ISP／NAT／行動網路。
