# 雙人呈現平滑度驗證 — 2026-09-12

> **封存 transport 量測。** 本文涉及的 Internet/RTC/relay 路徑已從正式遊戲移除；目前雙人模式只透過本機 LAN server。

完成量測、最小呈現修正與自動驗證；未實作 Raspberry Pi relay、未 Commit／Push。

## 根因與證據

主要可重現根因是 P2 預測每幀積分後，又朝「最新權威位置 + 固定 13 px」校正。快照之間校正目標不動，與每幀移動互相抵消，形成網路頻率的速度波紋。固定 50 ms 快照、60 Hz render、260 px/s 移動回放中，原始 P2 視覺速度 185.48–322.30 px/s，標準差 36.69；修正後 260.00 px/s，標準差近 0。

次要根因是以抵達時間作插值座標。回放保持相同模擬時間與位置，只加入 [0, +20, -10, +10] ms 抵達偏移，原始 P1 視覺速度標準差 115.08 px/s，修正後 2.42。P2 在這種抖動下由 46.95 降為 18.92，並非完全消除所有網路抖動。

實際 localhost RTC 的抵達 jitter 約 7–9 ms，原有 100 ms buffer 已足夠：所有量測場景插值覆蓋 100%，無 stale/frozen 或 hard snap。因此不增加 buffer，也不提高 snapshot rate。真實 RTC 的 P1 改善並非每個場景一致；不能把回放改善幅度當成所有裝置的實測改善。

## 精確變更與狀態隔離

- `src/presentation.js`：沿用 snapshot 的 `elapsed` 作模擬時間軸，以最近 12 筆最小 arrival−simulation offset 對齊；呈現時鐘每幀前進，校時速率最多 ±2%，保留 100 ms 延遲。
- P2 reconciliation target 隨估計 snapshot 年齡前進，總投影限 50 ms／13 px。保留原有本地輸入積分、100 ms 指數校正、邊界、觸控停止、80 px 大誤差保護。
- 保留原有 pause／loop／stale reset；模擬時間相對抵達時間出現 >250 ms 不連續時亦重建呈現時鐘，避免測試跳轉 Boss 時長時間凍結。
- `src/lan.js`：本次只增加 presentation 診斷入口與清除統計入口。其餘已有 bandwidth 修改保持原狀。
- 快照、玩家／敵人／子彈的權威資料不回寫；所有插值座標都在副本中。碰撞、傷害、速度、射擊、Boss、難度、控制、得分與 P1 authority 沒有改動。
- `lan.tick()` 的 50 ms 節流、LAN/SSE、P2P reliable ordered channel、fragment、snapshot schema、12 筆 history 淘汰規則均未更改。

## 方法與界限

使用 headless Chromium 兩個隔離 browser context、真正 RTCDataChannel、本機 signaling。測試頁面僅將正式 signaling meta 覆寫成同源測試伺服器；未改正式設定。五個場景各約 4 秒，每 400 ms 反向避免撞邊，場景間暖機 350 ms。Boss 場景有射擊與粒子。另有 deterministic 20 Hz/60 Hz 回放。before 使用保存的原始呈現實作，加上唯讀診斷；after 使用目前程式。

下列速度標準差包含刻意反向期間，並非全程應該保持 260 px/s 的誤差。輸入延遲是測試寫入按鍵至 sampled visible displacement 的上界，取樣可能多算一幀，非實體控制器到螢幕光子的延遲。沒有在使用者兩台實體裝置/WAN 上量測，不能宣稱主觀手感已獲使用者確認。

## 抵達與呈現量測（before → after）

| 場景 | 平均間隔 ms | p95 ms | 最大 ms | jitter σ ms | 平均 frame ms |
|---|---:|---:|---:|---:|---:|
| p1 | 57.64 → 54.97 | 68.10 → 68.00 | 69.40 → 69.30 | 8.31 → 7.62 | 16.67 → 16.67 |
| p2 | 55.49 → 55.48 | 68.30 → 68.20 | 69.40 → 90.30 | 7.88 → 9.24 | 16.67 → 16.73 |
| both-diagonal | 57.62 → 56.26 | 68.30 → 67.50 | 69.50 → 68.90 | 8.55 → 8.00 | 16.67 → 16.67 |
| reverse-fire | 57.97 → 54.94 | 68.20 → 67.50 | 69.40 → 68.70 | 8.17 → 7.53 | 16.66 → 16.67 |
| enemy-heavy | 55.45 → 53.98 | 67.50 → 67.00 | 68.80 → 68.60 | 7.76 → 6.95 | 16.67 → 16.66 |

呈現約 60 fps；after 平均有效延遲約 100 ms、最大 101.27 ms。buffered future snapshots 平均 1.77–1.85、p95/最大 2，history 上限仍為 12。所有五場景 before/after 各約 242–243 幀，interpolated 100%、P2 predicted 100%、frozen 0%、stale 0%、hard snap 0%。分類可重疊：同一幀 P1 插值、P2 預測並柔和校正。

| 場景 | P2 速度 σ px/s | P2 回應上界 ms | 每幀校正平均 px | 校正 p95 px | 最大校正 px |
|---|---:|---:|---:|---:|---:|
| p2 | 82.10 → 63.44 | 23.80 → 27.70 | 1.10 → 0.92 | 3.38 → 2.67 | 3.92 → 5.51 |
| both-diagonal | 68.93 → 61.01 | 25.50 → 17.10 | 0.93 → 0.78 | 2.52 → 2.50 | 4.03 → 4.54 |
| reverse-fire | 75.33 → 65.18 | 24.80 → 22.60 | 1.07 → 0.95 | 2.63 → 3.22 | 3.78 → 4.57 |
| enemy-heavy | 77.31 → 58.12 | 24.60 → 24.70 | 1.07 → 0.79 | 2.92 → 2.44 | 3.90 → 4.36 |

校正平均下降，但少數尖峰並未全部改善：after P2-only 最大單幀校正 5.51 px，同場有 90.30 ms 快照間隔與 35.40 ms render frame。這是保留的量測限制，不宣稱零修正。其餘場景最大校正約 4.36–4.57 px，沒有 >80 px 硬跳。

詳細的 arrival-time prediction offset（不是實際回拉量）、每幀 reconciliation error、分類計數與百分比，見 `artifacts/smoothness/*-summary.json`。after P2 移動時 corrected 約 98.35–99.18%；持續小幅修正屬預期。P1-only 只有暖機殘留的微小 P2 校正。

實體 interpolation：所有移動群組均經既有 `netId` 配對。新出生或不相容實體仍以最新權威位置顯示，避免幽靈；射擊場景平均每幀約 1.48–1.63 個 fallback，最高 5，沒有改動 membership。繪圖平均低於 1 ms，沒有重建造成 frame budget 超時的證據。`game.js` 的 guest draw 使用 `lan.present(visualState)`，没有第二個繞過呈現的正常玩家繪圖路徑。pause/reconnect 只在生命週期邊界 reset，正常移動沒有 reset/freeze 證據。

## 頻寬

最後一個完整 trailing 20 秒 window，十進位 KB／MB；Pi 為 state+input 收發兩倍的 payload-only 推估。

| 指標 | 使用者歷史基線 | 本次 before | 本次 after |
|---|---:|---:|---:|
| state msg/s | 18.25 | 17.65 | 18.15 |
| state KB/s | 132.65 | 35.51 | 36.47 |
| 平均 state bytes | 約 7270 | 2011.70 | 2009.16 |
| input msg/s | 18.8 | 17.75 | 18.05 |
| input KB/s | 1.79 | 1.49 | 1.52 |
| Pi relay MB/hour | 約 968 | 266.39 | 273.48 |

本次平均 snapshot 約 2 KB，歷史基線約 7.27 KB；場景不同，不可宣稱節省了歷史基線的流量。相同測試流程前後平均 bytes 近乎不變；msg/s 小幅差異來自 RAF 排程。沒有增加發送頻率或新增任何 wire 欄位。若同樣回放歷史 7.27 KB 場景，沒有理由因本次純呈現修改降低其約 968 MB/hour 估計；Pi 規劃仍應保留原估計。

## 檔案與驗證

本次修改：`src/presentation.js`、`src/lan.js`（僅診斷入口）、`tests/presentation.test.cjs`。
新增：`tests/smoothness-browser.cjs`、`tests/smoothness-replay.cjs`、`tests/smoothness-summary.cjs`、此報告與 `artifacts/smoothness/` 原始結果/回放實作/測試紀錄。
既有 `index.html`、`src/p2p-transport.js`、`tests/lan.test.cjs`、bandwidth 檔案及其他未提交內容均保留。

- `node --test tests/presentation.test.cjs tests/bandwidth.test.cjs`：13/13 PASS。包括所有群組副本、權威 JSON 不變、teleport/death/entering、touch、stale、重排 ID、固定速度、抖動時鐘、時間跳躍、診斷隔離。
- `node tests/smoothness-browser.cjs`：before/after 真實 RTC 場景 PASS；P1/P2/both/diagonal/reversal/fire/Boss、pause/resume、斷線重連、score/elapsed 保存、等待 P1 resume、無殘留移動／射擊、無 page error。
- `node tests/lan.test.cjs`：現有 HTTP/SSE 整合 PASS，包括控制、炸彈、死亡/rejoin、pause、disconnect/reconnect、loop、leave。
- `node tests/smoothness-replay.cjs`：before/after 回放結果已保存；核心回歸門檻也有 presentation test assertions。
- `node --test tests/game.test.cjs ...`：FAIL。前面的遊戲場景通過，載入既有 `baseline.test.cjs:185` 時 `326 != 261`。單獨執行 `node tests/baseline.test.cjs` 同樣失敗；其 sources 只載入 world/assets/render/audio/level1/enemies/game，不載入本次修改檔案。未修改不相關玩法或測試來掩蓋此既存失敗。
- `git diff --check`：PASS。`git status --short` 完整輸出保存於 `artifacts/smoothness/git-status.txt`。未 stage、Commit、Push、reset 或 checkout。

## 重跑與診斷

```sh
node tests/smoothness-replay.cjs
node tests/smoothness-replay.cjs "$PWD/artifacts/smoothness/before-presentation.js"
# 需要可用的 Playwright 及 localhost bind 權限
MEASURE_OUT=/tmp/after.json node tests/smoothness-browser.cjs
PRESENTATION_SOURCE=artifacts/smoothness/before-presentation.js MEASURE_OUT=/tmp/before.json node tests/smoothness-browser.cjs
node tests/smoothness-summary.cjs /tmp/before.json /tmp/after.json
```

P2 console：

```js
lan.resetPresentationDiagnostics(); // 只清統計，不清呈現 history
lan.diagnostics().presentation;
lan.diagnostics().bandwidth;
```

每個統計序列最多 1800 筆，frame 約 30 秒、arrival 約 100 秒，各有自己的樣本窗口；正式比较應先 reset 再量同一場景。`std` 為母體標準差，p95 為 nearest rank。`arrivalCorrectionPx` 是抵達時 predicted 與 authoritative 的距離，`appliedCorrectionPx` 才是每幀實際校正量。`entityFallbacks` 計算新生/不相容實體，與玩家 hard snap 分開。remote extrapolation 沒有新增；P2 bounded prediction 為唯一預測群組。
