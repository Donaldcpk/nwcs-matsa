/*:
 * @target MZ
 * @plugindesc [v1.0] 將戰鬥隊伍自動對齊到畫面最右側，並保留彈性邊距。
 * @author RPG Maker MZ 專業開發員
 * * @help RightAlignBattleParty.js
 * * 這個插件會攔截遊戲原本固定的戰鬥座標，並根據遊戲當前的
 * 視窗寬度 (Graphics.boxWidth)，自動將玩家的「正義隊伍」
 * 放置在戰鬥畫面的右側，同時保留您在參數中設定的邊距。
 * * 若未來您變更了遊戲的解析度，隊伍位置也會自動適應，
 * 永遠保持在畫面的右側！
 * * ============================================================================
 * 使用說明
 * ============================================================================
 * 1. 將此檔案放入您的專案資料夾 js/plugins/ 之中。
 * 2. 在 RPG Maker MZ 編輯器的「插件管理器」中啟用它。
 * 3. 根據您的喜好調整右方的「插件參數」。
 * * @param marginRight
 * @text 右側邊距 (Margin Right)
 * @desc 第一位角色（隊長）距離畫面右側邊緣的像素距離。數值越大越靠左。
 * @default 200
 * @type number
 * @min 0
 * * @param startY
 * @text 起始 Y 座標
 * @desc 第一位角色在畫面上的垂直高度 (Y座標)。預設為 280。
 * @default 280
 * @type number
 * @min 0
 * * @param offsetX
 * @text 角色 X 軸間距
 * @desc 隊友之間的橫向間距。預設 32 (形成向右下的斜線排列)。
 * @default 32
 * @type number
 * * @param offsetY
 * @text 角色 Y 軸間距
 * @desc 隊友之間的縱向間距。預設 48。
 * @default 48
 * @type number
 */

(() => {
    'use strict';

    // 1. 解析插件參數
    const pluginName = "RightAlignBattleParty";
    const parameters = PluginManager.parameters(pluginName);

    const marginRight = Number(parameters['marginRight'] || 200);
    const startY      = Number(parameters['startY'] || 280);
    const offsetX     = Number(parameters['offsetX'] || 32);
    const offsetY     = Number(parameters['offsetY'] || 48);

    // 2. 攔截並覆寫原生函數 (Aliasing & Overriding)
    const _Sprite_Actor_setActorHome = Sprite_Actor.prototype.setActorHome;
    Sprite_Actor.prototype.setActorHome = function(index) {
        
        // 核心邏輯：動態抓取當前畫面寬度，減去邊距，加上角色間距
        // 公式：X = 畫面總寬度 - 右側邊界保留區 + (隊員編號 * 橫向間距)
        const x = Graphics.boxWidth - marginRight + (index * offsetX);
        const y = startY + (index * offsetY);
        
        // 套用新座標
        this.setHome(x, y);
    };

})();
