# Blender 貓頭形狀試作

`cat-head.blend` 是可編輯母模；`build_head.py` 可重建所有輸出。真實 Blender 網格和渲染，沒有使用 imagegen。

## 本次修改

- 闊面、較平的頭頂與下顎，保留短嘴。
- 頭部與耳根 voxel 融合，修除耳根平台；內耳為布林切出的凹面。
- 橙色、內耳及嘴部均使用純色材質，未加虎紋或毛感。
- 頭部選取後，在 Object Data Properties → Shape Keys 調整 `Hurt • ears back`（0–1），可查看雙耳後彎。檔案保存時為 0。
- 中彈閉眼、痛苦嘴形、汗滴是独立命名物件，預設隱藏；開眼與 Smile 物件預設可見。完整受擊渲染由腳本切換。尚未加統一表情控制器或動畫時間線。

## 預覽

正常：`front.png`、`three-quarter.png`、`side.png`、`back.png`、`top-back.png`。

受擊：`hurt-front.png`、`hurt-side.png`、`hurt-back.png`。

## 重建與檢查

```sh
/Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup --python build_head.py
/Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup --python verify.py
```

在本目錄執行。`validation.json` 記錄 Blender 版本、網格數、保存狀態與圖片邊界。

## 品質界線

這是 Blender 可行性及形狀試作，未達原圖最終還原標準。耳形仍偏修長；內耳偏橢圓，尚需更貼近參考的圓角三角輪廓；嘴部仍有雙球感；後折耳尖略翹。已目視檢查正常與受擊多角度。尚未拓撲整理、UV、毛紋、Godot 匯入或座艙整合。未修改主遊戲或之前美術版本。
