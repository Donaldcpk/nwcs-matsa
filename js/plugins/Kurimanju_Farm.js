/*:
 * @target MZ MV
 * @plugindesc [v1.0 農場系統] 真實時間種植、頭頂倒數、收成提醒。
 * @author Kurimanju
 *
 * @help
 * Kurimanju_Farm.js
 * * ============================================================================
 * 功能介紹
 * ============================================================================
 * 讓事件變成可以在「真實時間」下生長的作物。
 * 即使玩家存檔並關閉遊戲，過幾個小時回來，作物也會長大。
 *
 * ============================================================================
 * 變數使用說明 (由插件自動讀取/寫入)
 * ============================================================================
 * 此插件會使用以下變數進行互動，請勿用於其他用途：
 * * [變數 217]：設定種植時間 (分鐘)。 (輸入用：在執行種植指令前設定)
 * [變數 218]：剩餘秒數。 (輸出用：檢查時會自動寫入此變數)
 * [變數 219]：狀態代碼。 (輸出用：0=無/錯誤, 1=生長中, 2=已成熟)
 *
 * ============================================================================
 * 腳本指令 (Script Calls)
 * ============================================================================
 * * 1. 【開始種植】 (請先將時間設在變數 217)
 * Kurimanju.plant();
 * -> 這會讓「當前事件」開始倒數，並自動開啟獨立開關 A。
 *
 * 2. 【檢查狀態】 (用於判斷是否可以收割)
 * Kurimanju.checkCrop();
 * -> 系統會檢查當前事件。
 * 如果熟了：變數 219 變為 2，並開啟獨立開關 B (關閉 A)。
 * 還沒熟：變數 219 變為 1，變數 218 顯示剩餘秒數。
 *
 * 3. 【收割清除】
 * Kurimanju.harvest();
 * -> 清除該地塊的數據，關閉獨立開關 A 和 B。
 *
 * ============================================================================
 * @param LoadAlert
 * @text 讀檔通知
 * @desc 讀取進度時，如果有作物成熟，是否彈出視窗提醒？
 * @type boolean
 * @default true
 *
 * @param AlertMessage
 * @text 通知訊息
 * @desc 提醒視窗的內容。
 * @type string
 * @default 歡迎回來！農田裡有作物已經成熟可以收割囉。
 *
 * @param TimerFontSize
 * @text 倒數計時字體大小
 * @desc 頭頂顯示時間的字體大小。
 * @type number
 * @default 12
 *
 * @param TimerOffsetY
 * @text 倒數計時Y軸偏移
 * @desc 調整時間顯示的高度 (負數往上)。
 * @type number
 * @default -48
 *
 */

var Kurimanju = Kurimanju || {};

(() => {
    const pluginName = "Kurimanju_Farm";
    const parameters = PluginManager.parameters(pluginName);
    
    const needAlert = parameters['LoadAlert'] === 'true';
    const alertMsg = parameters['AlertMessage'];
    const timerFontSize = Number(parameters['TimerFontSize'] || 12);
    const timerOffsetY = Number(parameters['TimerOffsetY'] || -48);

    // 變數 ID 定義
    const VAR_MINUTES = 217;
    const VAR_REMAIN = 218;
    const VAR_STATUS = 219;

    // ========================================================================
    //  資料結構與存檔
    // ========================================================================
    // 擴充 Game_System 來儲存農場數據
    // 數據結構: { "mapId_eventId": timestamp(結束時間) }
    const _Game_System_initialize = Game_System.prototype.initialize;
    Game_System.prototype.initialize = function() {
        _Game_System_initialize.call(this);
        this._kurimanjuFarmData = {};
    };

    Game_System.prototype.setCrop = function(mapId, eventId, minutes) {
        const key = `${mapId}_${eventId}`;
        const now = Date.now();
        const finishTime = now + (minutes * 60 * 1000);
        this._kurimanjuFarmData[key] = finishTime;
    };

    Game_System.prototype.getCropFinishTime = function(mapId, eventId) {
        if (!this._kurimanjuFarmData) return null;
        return this._kurimanjuFarmData[`${mapId}_${eventId}`];
    };

    Game_System.prototype.removeCrop = function(mapId, eventId) {
        if (!this._kurimanjuFarmData) return;
        delete this._kurimanjuFarmData[`${mapId}_${eventId}`];
    };

    // 檢查是否有任何作物成熟 (用於讀檔提醒)
    Game_System.prototype.checkAnyCropReady = function() {
        if (!this._kurimanjuFarmData) return false;
        const now = Date.now();
        for (const key in this._kurimanjuFarmData) {
            if (this._kurimanjuFarmData[key] <= now) {
                return true;
            }
        }
        return false;
    };

    // ========================================================================
    //  公開指令
    // ========================================================================
    
    // 1. 種植
    Kurimanju.plant = function() {
        const mapId = $gameMap.mapId();
        const eventId = $gameMap._interpreter.eventId(); // 獲取當前執行事件 ID
        if (eventId === 0) return;

        const minutes = $gameVariables.value(VAR_MINUTES); // 讀取變數 217
        if (minutes <= 0) return;

        $gameSystem.setCrop(mapId, eventId, minutes);
        
        // 操作獨立開關 A = ON (進入生長狀態)
        const key = [mapId, eventId, 'A'];
        $gameSelfSwitches.setValue(key, true);
        $gameSelfSwitches.setValue([mapId, eventId, 'B'], false);
    };

    // 2. 檢查作物狀態 (給事件互動用)
    Kurimanju.checkCrop = function() {
        const mapId = $gameMap.mapId();
        const eventId = $gameMap._interpreter.eventId();
        const finishTime = $gameSystem.getCropFinishTime(mapId, eventId);

        if (!finishTime) {
            $gameVariables.setValue(VAR_STATUS, 0); // 無作物
            return;
        }

        const now = Date.now();
        const remainMs = finishTime - now;

        if (remainMs <= 0) {
            // 成熟了
            $gameVariables.setValue(VAR_STATUS, 2);
            $gameVariables.setValue(VAR_REMAIN, 0);
            // 自動切換開關 B = ON (成熟圖案)
            $gameSelfSwitches.setValue([mapId, eventId, 'A'], false);
            $gameSelfSwitches.setValue([mapId, eventId, 'B'], true);
        } else {
            // 還在長
            $gameVariables.setValue(VAR_STATUS, 1);
            $gameVariables.setValue(VAR_REMAIN, Math.ceil(remainMs / 1000));
        }
    };

    // 3. 收割
    Kurimanju.harvest = function() {
        const mapId = $gameMap.mapId();
        const eventId = $gameMap._interpreter.eventId();
        
        $gameSystem.removeCrop(mapId, eventId);
        
        // 重置開關，變回空地
        $gameSelfSwitches.setValue([mapId, eventId, 'A'], false);
        $gameSelfSwitches.setValue([mapId, eventId, 'B'], false);
    };

    // ========================================================================
    //  讀檔監聽
    // ========================================================================
    const _DataManager_extractSaveContents = DataManager.extractSaveContents;
    DataManager.extractSaveContents = function(contents) {
        _DataManager_extractSaveContents.call(this, contents);
        // 讀檔成功後檢查
        setTimeout(() => {
            if (needAlert && $gameSystem.checkAnyCropReady()) {
                window.alert(alertMsg);
            }
        }, 1000); // 延遲一下確保畫面載入
    };

    // ========================================================================
    //  頭頂倒數計時 Sprite
    // ========================================================================
    
    // 定義一個新的 Sprite 類別
    function Sprite_CropTimer() {
        this.initialize(...arguments);
    }
    Sprite_CropTimer.prototype = Object.create(Sprite.prototype);
    Sprite_CropTimer.prototype.constructor = Sprite_CropTimer;

    Sprite_CropTimer.prototype.initialize = function(character) {
        Sprite.prototype.initialize.call(this);
        this._character = character;
        this.anchor.x = 0.5;
        this.anchor.y = 1;
        this.y = timerOffsetY; // 高度偏移
        this.bitmap = new Bitmap(100, 24); // 畫布大小
        this.bitmap.fontSize = timerFontSize;
        this._lastText = "";
    };

    Sprite_CropTimer.prototype.update = function() {
        Sprite.prototype.update.call(this);
        this.updateVisibility();
        if (this.visible) this.updateText();
    };

    Sprite_CropTimer.prototype.updateVisibility = function() {
        const char = this._character;
        if (!char || !(char instanceof Game_Event)) {
            this.visible = false;
            return;
        }

        // 只有在地圖事件且有設定農作物數據時才顯示
        const finishTime = $gameSystem.getCropFinishTime($gameMap.mapId(), char.eventId());
        const now = Date.now();
        
        // 如果有數據 且 時間還沒到 -> 顯示
        // 如果時間到了 -> 隱藏 (因為要等玩家去點擊收割)
        if (finishTime && finishTime > now) {
            this.visible = true;
        } else {
            this.visible = false;
        }
    };

    Sprite_CropTimer.prototype.updateText = function() {
        const char = this._character;
        const finishTime = $gameSystem.getCropFinishTime($gameMap.mapId(), char.eventId());
        const now = Date.now();
        let diff = Math.ceil((finishTime - now) / 1000);

        if (diff < 0) diff = 0;

        const h = Math.floor(diff / 3600);
        const m = Math.floor((diff % 3600) / 60);
        const s = diff % 60;
        
        const text = `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;

        if (this._lastText !== text) {
            this._lastText = text;
            this.bitmap.clear();
            this.bitmap.drawText(text, 0, 0, 100, 24, "center");
        }
    };

    // 將 Sprite 綁定到地圖事件的 CharacterSprite 上
    const _Spriteset_Map_createCharacters = Spriteset_Map.prototype.createCharacters;
    Spriteset_Map.prototype.createCharacters = function() {
        _Spriteset_Map_createCharacters.call(this);
        
        // 遍歷所有的 CharacterSprite，如果是事件，就掛一個 Timer Sprite
        for (const sprite of this._characterSprites) {
            if (sprite._character instanceof Game_Event) {
                const timerSprite = new Sprite_CropTimer(sprite._character);
                sprite.addChild(timerSprite);
            }
        }
    };

})();