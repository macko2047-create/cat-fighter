# CF-CAT-HEAD-02 — 貓頭連續網格形狀試作

本版是 Godot 實體 3D 形狀稿，不是 imagegen 圖或完成美術。環境未找到 Blender，使用既有 Godot 工具輸出。

- `head.gd`：連續頭部／耳根網格、闊面、短嘴；純色材質，未製作 UV 或毛紋。
- `head-neutral.tscn`、`head-hurt.tscn`：可載入的兩個形狀場景；共同拓撲公式，受擊耳部頂點向後及向下偏移。尚未建立動畫時間線或 blend shape。
- `front.png`、`three-quarter.png`、`side.png`、`back.png`、`top-back.png`：同一母模五視角。
- `hurt-front.png`、`hurt-side.png`、`hurt-back.png`：耳部後彎，閉眼及汗滴形狀示意。
- `cockpit-fit.png`：放入既有 CF-3D-05 戰機的比例預覽；飛機並非本輪精修範圍。
- `aircraft_baseline.gd`：CF-3D-05 複本，僅增加零件標籤，可靠移除舊貓頭及耳件。

重建：從本目錄執行 Godot `--path . --script res://render.gd`。需圖形渲染環境。

驗證：Godot 4.7.2 圖形渲染成功輸出九張 640×640 PNG；每張非透明內容均未觸及畫布邊界。已檢查正面、側面、後上方、受擊側面及座艙圖。

限制：仍屬形狀探索，尚未达到原插畫還原標準。耳朵仍較尖且缺乏內耳凹面，側面耳厚與曲面需再修；眼嘴尚為簡單幾何定位，汗滴未做正式水滴輪廓；未製作虎紋、毛感或最終材質。沒有接入主遊戲，沒有改動之前美術版本。
