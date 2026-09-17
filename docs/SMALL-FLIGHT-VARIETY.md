# 小嘍羅飛行變化

小型敵機按波次循環：直落、左切入、右快速切入、慢速蛇形、左上斜飛、雙邊交叉、右上快速斜飛、加速俯衝。重型機及船波次仍按原有 cadence 插入；第一波保留容易辨認的直落編隊。

各路線速度為原關卡速度的 0.82–1.65 倍；俯衝路線入場後平滑加速。側邊入場位於畫面上半部，新路線需在畫面內累積至少 0.75 秒才可射擊，接近畫面底部停止開火。飛出側邊的敵機會清除。

參考：

- [Bandai Namco：Galaga Arrangement](https://galaga.com/en/history/galagaArrange.php)：隨關卡引入不同飛行模式與編隊攻擊。
- [Christer Kaitila：Stage3D Shoot-'Em-Up](https://code.tutsplus.com/build-a-stage3d-shoot-em-up-terrain-enemy-ai-and-level-data--active-11160t)：直線、波浪及曲線敵機移動。

驗證：`node tests/game.test.cjs`，包含 1P／2P 全路線進出畫面、速度差異、入場射擊延遲及 200 秒模擬。舊 CF-ARCH-02 玩法 trace hash 因指定玩法改動不再適用，保留歷史常數而改驗證位置有效、敵機數量有界與 Boss 到達；其他既有測試繼續執行。
