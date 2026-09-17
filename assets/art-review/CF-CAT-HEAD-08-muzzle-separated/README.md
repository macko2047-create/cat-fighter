# CF-CAT-HEAD-08 — 分件耳與立體鼻口部

`build_head.py` 為可直接在 Blender 執行的單檔腳本，無須外部套件或素材。以 08 版尺寸規格為起點，沿用 07 版的獨立耳網格，加入真正前凸的吻部和鼻頭。

## 執行

1. Blender → Scripting → Text Editor → Open，選取 `build_head.py`。
2. 按 Run Script。新模型建立於 `CatHead_08_Muzzle_SeparatedEars` collection。
3. 選取模型後按小鍵盤 `.` 聚焦；以 Material Preview 查看顏色。

每次執行新增 collection，不刪除既有場景物件。預設不存檔、不渲染。腳本頂端 `HEAD_WIDTH = 2.0` 表示頭寬為 2 Blender units；100 U 為正規化頭寬，並非已知毫米。`MUZZLE_FRONT_Y`、`NOSE_TIP_Y` 可調整推定的鼻口前凸位置。

背景執行並輸出模型與預覽（輸出資料夾需沒有同名交付檔）：

```sh
CAT_HEAD_OUTPUT=/absolute/path/to/new-output CAT_HEAD_RENDER=1 \
  /Applications/Blender.app/Contents/MacOS/Blender \
  --background --factory-startup --python-exit-code 1 --python /absolute/path/to/build_head.py
```

## 結構

- `Head_Base`：100 × 80 × 83 U，完整封閉頭顱。
- `Ear_L`、`Ear_R`：各 29 × 12 × 38 U，獨立封閉網格；origin 在 (±29, −5, 65) U。粉紅內耳是各耳自身的材質區。
- `Muzzle_Base`：寬 50、高 28 U，最前界 Y=−44。背面依頭顱曲面埋入，以避免下巴附近懸空，因此完整深度由實際幾何決定，取代規格草案的 12 U。
- `Nose`：寬 10、高 7 U，鼻尖 Y=−46；後端至少與吻部中央交疊，厚度按需要調整。
- 眼睛、嘴線、鬍鬚：簡化定位；嘴線採樣吻部曲面，避免藏入新增量體。
- `CatHead_Root`：統一移動／縮放；耳朵各自繞耳根轉動。`set_ears_hurt(0…1)` 是示意姿勢控制，角度不是圖片實測。

頭、吻部、鼻頭及兩耳保持可獨立編輯。吻部邊緣收進頭顱，這是相交的封閉量體，尚未完成供變形使用的連續拓撲或列印用單一實體。虎紋與白毛為簡化材質區，模型用途是比例與結構檢查。

## 輸出與檢查

- `output/cat-head-muzzle-separated.blend`：含模型、預覽場景與腳本文字。
- `output/front.png`、`three-quarter.png`、`side.png`：中性角度預覽。
- `output/side-clay.png`：統一灰色材質，檢查鼻口部實際輪廓。
- `output/ears-posed.png`：耳朵姿勢示意。
- `output/validation.json`：執行時實際尺寸、封閉性、正向體積、各耳 origin、鼻吻前界及模型包絡。

腳本斷言檢查五個結構件為不同 mesh、尺寸符合固定的寬高／頭耳深度、網格封閉且法線向外、吻部前凸、鼻頭中央與吻部交疊，以及耳朵轉動不改動頭顱頂點。完整耳姿接縫及外觀仍需視覺檢查；所有推定深度均不應稱為原圖的精確 3D 實測。

已在 Blender 5.2.1 LTS 背景執行成功，輸出 `.blend` 與五張預覽；已人工檢視正面、3/4、單色側面及耳朵姿勢圖。實際吻部外接尺寸約 **50 × 34.68 × 28 U**，其中後端依低下巴曲面向內延伸，並非向外凸出 34.68 U；鼻頭約 **10 × 6.34 × 7 U**。整體不含鬍鬚仍為 **100 × 86 × 95 U**。目前白毛邊界及虎紋仍可見按面指定材質的階梯，這是結構母模，尚非完成貼圖的美術成品。
