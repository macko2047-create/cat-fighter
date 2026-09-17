# CF-L1-ART-03 — 玩家 Roll Key Poses

狀態：已產出，待審閱。只包含 P1／P2 的 Roll Left 與 Roll Right；沒有 Pitch、Special、Hit 或 Crash，沒有改動遊戲、碰撞或 manifest。共用的鏡頭、Roll、光源與 3D-to-2D 原則見 [`docs/CF-AIRCRAFT-VISUAL-FRAMEWORK-v0.1.md`](../../../docs/CF-AIRCRAFT-VISUAL-FRAMEWORK-v0.1.md)。

## 交付

- `p1-roll-left-master.png`、`p1-roll-right-master.png`
- `p2-roll-left-master.png`、`p2-roll-right-master.png`
- `gameplay-size-comparison.png`：上列 P1、下列 P2；每列順序為 Normal、Roll Left、Roll Right，真實 72×72 邏輯像素合成。
- `gameplay-size-preview.png`：完整 Level 1 海面、敵機與子彈情景。

四張 master 均為 256×256 RGBA PNG，pivot 為 (128,128)。原始 imagegen 輸出存作 `*-source.png`，但 P1 兩張與 P2 Roll Right 的原始檔帶棋盤背景；`build-roll-assets.cjs` 只將邊緣連通的中性棋盤像素轉為 alpha，再等比例縮放到中心 190px 安全區，並未重畫飛機。這樣保存了白色機翼與貓毛等被輪廓封住的白色區塊。master 均已驗證有 alpha 且為 256×256。

## 檢查結果

- 機頭、中心機身與尾巴在四張圖都保持垂直向上；沒有斜向 whole-sprite rotation 或 Yaw。
- P1 左滾以畫面左翼較暗、窄及遠側可見面呈現；右滾則改為畫面右翼較暗、窄。P2 依其海鷗翼輪廓有較不同的折角與壓縮。
- 右上固定光源沒有直接鏡像；P1／P2 兩側在可見翼面及陰影上有區別。P2 黑耳保留在畫面右側。
- 以 72×72 合成時，Normal／兩個 Roll 都可區別、P1/P2 尺度近似，並保留子彈／敵機空間。

仍建議在核准前留意兩項：P1 Roll Right 的可見翼展比 Normal 稍窄，符合遠翼壓縮但在小尺寸較克制；P2 的槳影亮度偏高，日後精修可降低其不透明度。兩項不影響機頭朝向或 pivot，亦不以修改玩法解決。

製作採用內建 imagegen 的 identity-preserve 編輯模式，輸入為目前選用的 CF-L1-ART-02 Normal masters；所有 prompt 均鎖定原機身、貓、顏色、標誌、座艙與尾巴，且禁止其餘姿態與烘焙投影。
