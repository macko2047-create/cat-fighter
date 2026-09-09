# WebRTC 實體 HTTPS 測試

本次使用已提交的 `1dbcc9231d8b79b604c0ff2fa521f4986b710ec8`，不更改遊戲或網路實作。
最小路徑：現有 Node HTTP 服務 + Cloudflare Quick Tunnel。HTTPS 網站與 `/p2p/*` 都轉送至同一個 Node process。

GitHub Pages 是靜態 hosting，無法執行 `tools/p2p-server.cjs` 或處理 JSON POST `/p2p/*`。瀏覽器使用根路徑 `/p2p/*`，因此測試時整個網站改從 Tunnel 根網址開啟，不使用 GitHub Pages 的 `/cat-fighter/` 路徑；無須 CORS 或客端改動。

## 已啟動的測試網址

兩部裝置均開啟：

https://began-gas-roller-visited.trycloudflare.com/

這是臨時測試網址，僅在本機 Node 與 cloudflared 持續運行、電腦保持清醒且連網時可用。Tunnel 重啟會產生新網址，需要更新 PUBLIC_ORIGIN 並重啟 Node；重啟 Node 會清除房間。

## 重建命令

需要 Node.js 22+、cloudflared。本機已有兩者，不需要 npm install。
測試副本位於 `/private/tmp/cat-fighter-https-1dbcc92`，使用 Git 封存避免納入無關工作樹變更。

如需重建副本，在 repository 執行：

```sh
mkdir -p /private/tmp/cat-fighter-https-1dbcc92
git archive --format=tar --output=/private/tmp/cat-fighter-https-1dbcc92.tar 1dbcc9231d8b79b604c0ff2fa521f4986b710ec8
tar -xf /private/tmp/cat-fighter-https-1dbcc92.tar -C /private/tmp/cat-fighter-https-1dbcc92
```

Terminal A（目前已運行，不要重複啟動）：

```sh
cloudflared tunnel --url http://127.0.0.1:18767 --no-autoupdate
```

Terminal B（目前已運行；若重建 Tunnel，PUBLIC_ORIGIN 必須改為當次終端印出的 HTTPS origin）：

```sh
cd /private/tmp/cat-fighter-https-1dbcc92
PUBLIC_ORIGIN=https://began-gas-roller-visited.trycloudflare.com HOST=127.0.0.1 PORT=18767 node tools/p2p-server.cjs
```

PUBLIC_ORIGIN 不加結尾 `/`，不加路徑。HOST 僅監聽 loopback；PORT 必須與 Tunnel 指向一致。ICE_SERVERS 不設定，保留既有 Google STUN。不得設定 TURN；沒有新的帳戶、資料庫或 gameplay relay。

兩部手機網址格式為 `https://<當次-tunnel-subdomain>.trycloudflare.com/`。不用 IP、port 或 QR code。
測試完成後停止兩個程序；自行於終端啟動時可在各終端按 Ctrl+C。

## 實體驗收

先用同一個一般 Wi-Fi、兩部實體 Safari 測試，再交換 P1/P2；跨行動網路是額外 NAT 測試。

- [ ] 兩部裝置開啟上方相同 HTTPS 根網址，正常載入遊戲。
- [ ] iPhone/iPad P1 按 BOOT → TWO-PLAYER → Create Game。
- [ ] 顯示六位數字房號；P2 輸入完整房號（包括開頭零）後 Join Game。
- [ ] 兩邊顯示 Direct connection ready；沒有相機或麥克風權限提示。
- [ ] 兩邊關閉連線視窗；只有 P1 按 START，兩邊同步進入遊戲。
- [ ] P2 拖曳移動／射擊、同點雙擊炸彈；P1 看見 P2 動作，炸彈不扣 P1 庫存。
- [ ] 讓 P2 暫時失去網路（停用 Wi-Fi 並避免行動數據自動接替）；P1 安全暫停，P2 控制中立化。無通知停流依既有 watchdog 偵測，不要求物理斷網瞬間完成。
- [ ] 恢復網路，保留原頁面，按 Reconnect（需要時）；重連後兩邊仍 paused。
- [ ] 只有 P1 明確 RESUME 後兩邊才恢復 playing。
- [ ] 放開所有觸控後沒有殘留移動、射擊、炸彈或排隊動作。
- [ ] 交換 P1/P2 重做；再測 P1 暫時失去網路，確認 P2 偵測快照停流及恢復流程。

不要以重新整理／關閉頁面代替暫時斷網：既有 pagehide/離房流程會結束 session，需要新房間，這不是保留狀態重連。

## 傳輸與限制

Tunnel 只承載靜態下載與 HTTP signaling（仍有定期 poll）。連線後 P2 input 與 P1 snapshots 走瀏覽器 RTCDataChannel，不經 signaling。維持既有 STUN-only 限制，某些 NAT 組合不能直連，不在本次加入 TURN。

Quick Tunnel 不支援 SSE，因此這個公開測試網址只驗收 WebRTC 入口。原 LAN/SSE 程式與本地 HTTP 使用方式保持不變；現有 LAN origin 檢查亦不是公開 HTTPS 模式。

Cloudflare 官方說明：https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/do-more-with-tunnels/trycloudflare/
