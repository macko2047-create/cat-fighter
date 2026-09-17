# CF-TEX-01 — P1 SURFACE FIDELITY PASS

## RESULT

完成 CF-3D-05 的純表面改善，提供五個鎖定姿態及比較圖。使用可重現 SVG 貼圖與 Godot 材質；沒有以生成圖取代 3D 渲染。所有產物獨立放在 CF-TEX-01，未修改基準或遊戲。

## FILES_CHANGED

本任務只有新增 CF-TEX-01 內的檔案，既有檔案未覆蓋。

- `p1_production_master.gd`：繼承原始模型，僅保存零件語義標籤並呼叫表面配置。
- `baseline/p1_production_master.gd`：CF-3D-05 原始程式逐位元相同副本。
- `surface_setup.gd`、`materials/surface.gdshader`、`materials/propeller.gdshader`：表面配置與 shader。
- `build_textures.py`、`textures/*`：貼圖來源與實際點陣輸出。
- `render_p1_surface.gd`：沿用鎖定捕捉設定，另加幾何／貼圖驗證及比較圖。
- `p1-normal.png`、`p1-roll-left.png`、`p1-roll-right.png`、`p1-pitch-up.png`、`p1-pitch-down.png`：五張 1024×1024 RGBA。
- `p1-production-review.png`：上排 Normal／Roll Left／Roll Right，下排 Pitch Up／Pitch Down。
- `p1-gameplay-size-preview.png`：五個 72×72 格，未放大。
- `p1-gameplay-before-after.png`：上排 CF-3D-05、下排 CF-TEX-01，各格仍為實際 72px。
- `p1-surface-comparison.png`：左 A ART-02／中 B CF-3D-05／右 C CF-TEX-01；裁去透明邊界後等比例放入比較格，只供外觀比較，正式輸出框位不變。
- `p1-editable-master.tscn`：含材質及貼圖的展開模型，保留全部既有網格。
- `project.godot`、`p1_master.tscn`、`inspect.gd`、`inspect.tscn`：獨立檢視專案。
- `verify_surface_pass.py`、`geometry-verification.json`、`uv-verification.json`、`validation.json`、`surface-audit.json`、`material-assignments.json`：驗證程式及紀錄。

## TEXTURES_ADDED

以下十組皆提供 SVG 來源與 PNG 輸出；SVG 由本任務程式繪製，沒有重新裁切或重畫核准插畫。Godot 由 SVG 產生相同 PNG，再建立帶 mipmap 的 ImageTexture；展開場景內嵌貼圖資源。

| 名稱 | 尺寸 | 用途 |
|---|---|---|
| wing-metal | 1024×1024 | 翼面銀色分區、接縫、低對比鉚釘 |
| fuselage-metal | 512×1024 | 機身／引擎金屬面板 |
| tailplane-metal | 512×512 | 尾翼面板 |
| red-enamel | 512×512 | 鼻端、翼尖、尾翼紅漆 |
| paw-roundel | 512×512 | 深藍圓底、奶白色四趾爪印 |
| smoked-glass | 512×512 | 深藍灰煙燻玻璃 |
| pilot-leather | 512×512 | 暖棕皮革與克制縫線 |
| tabby-head | 1024×1024 | 橘色、深橘虎斑及細毛色筆觸 |
| ear-fur | 512×512 | 耳部細毛色變化 |
| tabby-tail | 256×1024 | 連續環狀虎斑與橘色尾毛 |

## MATERIALS_CHANGED

銀色採藍灰／淺灰面板色差，metallic 約 0.40–0.42、roughness 約 0.40–0.43；紅漆 metallic 0.23、roughness 0.32–0.34。毛色 metallic 0、roughness 0.88。玻璃為深色不透明近似，metallic 0.20、roughness 0.26，保留柔和藍灰反光。座艙圍邊為暖深棕；槍管與槳轂另有金屬材質。槳盤以固定模型座標的半透明環帶控制強度，原有槳弧降低不透明度。

細微色差屬 pigment variation；表面 shader 沒有修改頂點、法線、光源或世界投影。玻璃貼圖包含克制的插畫式反射色帶，不是新的光源。

## PANEL_DETAIL

加入主翼面板分區、機身橫向與側邊接縫、尾翼分隔、引擎罩接縫；座艙周邊沿用原有圍邊和接縫，調整材質對比。新增鉚釘全部在貼圖內。CF-3D-05 已有的立體鉚釘及接縫不能在幾何鎖定下刪除，因此保留並降低對比，沒有新增鉚釘網格。

## MARKING_FIDELITY

爪印改用共用深藍底白爪貼圖，取代原本各個幾何件直接以單色表示的視覺。原有圓底、爪墊、趾部網格均保留，使用同一根節點座標投影，位置與尺寸不變。左右翼紅白藍橫條保留原幾何與對齊，只更新表面色。徽章不使用左右鏡像投影；只有左右翼／尾翼的金屬面板分布使用 abs(X) 保持對稱。

## CAT_TEXTURE_FIDELITY

頭部、舊虎斑網格採共用橘色底、深橘頂後虎斑及低對比毛色筆觸。耳形、頭部尺寸完全不變，沒有新增正面五官。尾巴的 40 段既有網格共用連續根節點 Z 座標貼圖，環紋不再受原分段材質切換限制。身體可見部分維持暖棕飛行裝備。

## UV_STABILITY

五姿態全部通過材質矩陣檢查：shader 的 `part_to_model` 與既有 local transform 相符（容差 1e-5）。平面投影在未旋轉的母模座標計算；旋轉根節點不改變貼圖座標。玻璃與皮革使用既有 sphere UV。沒有 TIME、screen-space 或 world-space UV，所以不會隨鏡頭或 Roll 滑動。

沒有修改任何 mesh UV。Normal／左右 Roll／上下 Pitch 已目視檢查，未見可讀標誌滑動或左右錯置；側面投影仍受基準幾何影響，不宣稱是全角度 UV 重展開。

## GAMEPLAY_SIZE_CHECK

已直接檢查五格 72×72 輸出：橘色頭仍是主要身份提示，紅銀分離清楚，深色座艙仍框住飛行員。白爪與深藍底仍可辨識，但趾部細節在此尺寸有限。鉚釘與細毛筆觸自然淡出；主要面板線沒有形成密集噪點。左右 Roll 仍清楚，外形沒有因貼圖而改變。未改動碰撞或接入遊戲。

## DIFFERENCES_FROM_CF-L1-ART-02

- 頭形、耳朵、翼尖多邊形輪廓、機身比例、座艙開口、尾巴曲線與槳盤形狀仍是 CF-3D-05，不能以本任務改動。
- 原稿的粗細變化描邊、輪廓毛束、精細機身轉折及具厚度的內部座艙細節，無法只靠本次貼圖完整重現，故保留限制。
- 原有爪印／虎斑／接縫的薄幾何仍存在，近看可見部分邊界與起伏；沒有以刪除、位移、透明裁掉它們來變更幾何外觀。
- 金屬為固定光源下的風格化材質，沒有逐筆複製原稿的手繪反射。煙燻玻璃是外觀近似，非折射玻璃。
- 新增鉚釘、面板排列取自原稿的視覺語言，不是逐顆／逐線對位複製。
- 螺旋槳只改透明度與表面色；沒有把原稿不同形狀的槳影強套進鎖定幾何。

## GEOMETRY_UNCHANGED_CONFIRMATION

PASS。459 個 MeshInstance3D 的 local transform、mesh surface arrays（頂點、法線、索引及既有 UV）與根節點變換在材質套用前後雜湊完全相同：

`e34c8878ea739051aad1ca633ad99286b781d5d9e04e0ed2d1d4367344d22168`

原始幾何程式副本亦與 CF-3D-05 逐位元相同。相機／光源建立函式逐字相同；1024×1024、4× MSAA、根尺度 `(1,1,1.12)`、Roll ±28°、Pitch ±10°、Yaw 0 均通過靜態及執行檢查。

五張輸出均為 RGBA、透明角落、無裁邊；畫面 y≥220 的非槳盤區域 alpha 與各自基準影像逐像素完全相同（最大差 0）。槳盤透明度屬本任務允許的表面調整，故不要求其 alpha 與原圖相同。

最終圖形渲染無腳本／shader 錯誤；`verify_surface_pass.py` 通過。驗證結果見 `surface-audit.json`。不把先前排查中的失敗執行當成通過依據。

## READY_FOR_P1_FINAL_APPROVAL

YES — 本表面版本已具備完整交付與驗證，可供使用者最後審閱。這不代表已獲使用者核准，也不代表幾何已等同原稿。未整合主遊戲、未新增 P2、未加烘焙 Drop Shadow。

PASS
