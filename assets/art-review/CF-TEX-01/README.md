# CF-TEX-01

P1 表面精修獨立專案。形狀／動作使用 CF-3D-05，表面語言參考 CF-L1-ART-02。

完整交付與限制：[REPORT.md](REPORT.md)。

## 預覽

- `p1-surface-comparison.png`：左核准 2D／中 3D 基準／右表面改善。
- `p1-production-review.png`：上排 Normal、左 Roll、右 Roll；下排 Pitch Up、Pitch Down。
- `p1-gameplay-size-preview.png`：實際 72×72 的五個狀態。
- `p1-gameplay-before-after.png`：上排基準、下排改善，均為 72px。

## 重建

在本儲存目錄的上層專案根目錄執行：

```zsh
python3 assets/art-review/CF-TEX-01/build_textures.py
'/Applications/Godot.app/Contents/MacOS/Godot' --rendering-method gl_compatibility --path assets/art-review/CF-TEX-01 --script res://render_p1_surface.gd
python3 assets/art-review/CF-TEX-01/verify_surface_pass.py
```

最後一步需要 Pillow 與 NumPy；渲染本身只需要 Godot。生成器採固定 random seed。十組 SVG 是來源，PNG 為相同點陣輸出；shader 透過 ImageTexture 使用其內容。

也可在 Godot 開啟 `project.godot` 執行檢視場景。拖曳旋轉鏡頭、滾輪縮放、R 重置；1–5 切換五個姿態。檢視場景的自由鏡頭不會影響正式批次輸出的鎖定鏡頭。

`p1-editable-master.tscn` 含展開零件、材質及內嵌貼圖，可以直接載入。此檔會被批次渲染重新輸出；若手動編輯應另存。表面材質使用 Godot shader，未交付通用 DCC 材質轉換。

## 驗證

`surface-audit.json` 為總驗證；`geometry-verification.json`、`uv-verification.json`、`validation.json` 分別記錄幾何雜湊、五姿態貼圖錨定與輸出邊界。`material-assignments.json` 記錄紋理映射範圍。

所有新增檔案均位於此目錄；CF-3D-05、CF-L1-ART-02 與主遊戲保持原樣。
