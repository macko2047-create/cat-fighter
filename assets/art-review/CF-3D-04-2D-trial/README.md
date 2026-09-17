# CF-3D-04 → ART-02 2D 翻滾試作

使用內建 imagegen，ART-02 P1 Normal source 為外觀主參考，CF-3D-04 左翻滾 render 僅作姿態／明暗參考。未修改原母稿、3D 或遊戲。

- `p1-roll-left-v1.png`：保留插畫外觀，但縱軸向右上偏斜，不符合零 Yaw。
- `p1-roll-left-v2.png`：縱軸已回正，左右翼有高低差；貓頭、尾翼與機身仍過於接近 Normal，未充分跟隨 3D 的整體翻滾，不能視為精確 -28°。
- 兩版皆為 1254×1254 RGB PNG；棋盤背景已烘焙，沒有透明 alpha。只供方向審閱，不能直接作 production sprite。尚未完成 72px、pivot 或動作連續性驗收。

結論：外觀保留有成效，但生成模型沒有可靠遵從姿態與透明輸出要求；此試作不能當成翻滾動作驗收通過。

完整提示詞見 `prompts.md`。
