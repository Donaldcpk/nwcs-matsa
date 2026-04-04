/*:
 * @target MZ MV
 * @plugindesc [v5.2.1] 每日限時系統 - 解鎖後恢復場景操作；已縮小字體並避開右上角選單。
 * @author Kurimanju
 *
 * @help
 * Kurimanju_TimeLimit.js
 * v5.2.1：管理員密碼解鎖後還原 Scene._active 並刷新計時顯示（修正無法移動）。
 * v5.2 更新：
 * 1. 增加字體大小設定 (預設 20)。
 * 2. 增加 Y 軸偏移設定，避免擋住右上角選單按鈕。
 * * ============================================================================
 * 腳本指令
 * ============================================================================
 * 重置今日時間：
 * Kurimanju.resetTimer();
 *
 * ============================================================================
 * @param ---UI 顯示微調---
 * * @param TimerFontSize
 * @parent ---UI 顯示微調---
 * @text 字體大小
 * @desc 計時器數字的大小。預設 20 (原版約為 28)。
 * @type number
 * @default 20
 *
 * @param TimerOffsetY
 * @parent ---UI 顯示微調---
 * @text Y 軸偏移 (往下移)
 * @desc 為了避開右上角的選單按鈕，請設定垂直距離。
 * @type number
 * @default 60
 *
 * @param TimerOffsetX
 * @parent ---UI 顯示微調---
 * @text X 軸偏移 (往左移)
 * @desc 距離畫面右側邊緣的距離。
 * @type number
 * @default 10
 *
 * @param ---每日限時設定---
 * * @param DailyLimitMinutes
 * @parent ---每日限時設定---
 * @text 每日限制分鐘數
 * @desc 每天可以玩幾分鐘？(基礎時間)
 * @type number
 * @min 1
 * @default 60
 *
 * @param BonusVariableId
 * @parent ---每日限時設定---
 * @text 獎勵時間變數 ID
 * @desc 指定一個變數來增加額外時間。
 * @type variable
 * @default 220
 *
 * @param TimeUpMessage
 * @parent ---每日限時設定---
 * @text 時間結束訊息
 * @desc 每日時間用完時顯示的文字。
 * @type string
 * @default 學習數學時間已夠，明天再繼續吧！
 *
 * @param ---宵禁設定 (Curfew)---
 * * @param EnableCurfew
 * @parent ---宵禁設定 (Curfew)---
 * @text 是否啟用宵禁
 * @desc 是否開啟特定時間段禁止遊玩功能？
 * @type boolean
 * @default true
 * * @param CurfewStart
 * @parent ---宵禁設定 (Curfew)---
 * @text 禁止開始時間 (小時)
 * @desc 24小時制。例如 23 代表晚上 11 點開始禁止遊玩。
 * @type number
 * @min 0
 * @max 23
 * @default 23
 *
 * @param CurfewEnd
 * @parent ---宵禁設定 (Curfew)---
 * @text 禁止結束時間 (小時)
 * @desc 24小時制。例如 6 代表早上 6 點解禁。
 * @type number
 * @min 0
 * @max 23
 * @default 6
 * * @param CurfewMessage
 * @parent ---宵禁設定 (Curfew)---
 * @text 宵禁警告訊息
 * @desc 在禁止時段遊玩時顯示的文字。
 * @type string
 * @default 現在是休息時間，請明天再來！
 *
 * @param ---通用與安全---
 * * @param UnlockPassword
 * @parent ---通用與安全---
 * @text 解鎖密碼
 * @desc 輸入此密碼可無視限制繼續遊玩。
 * @type string
 * @default 23838077
 *
 * @param ForceSave
 * @parent ---通用與安全---
 * @text 強制存檔
 * @desc 觸發限制時，是否強制覆蓋 1 號存檔？
 * @type boolean
 * @default true
 *
 * @param WarningMinutes
 * @parent ---通用與安全---
 * @text 預警時間 (分鐘)
 * @desc 每日時間剩下幾分鐘時提醒？
 * @type number
 * @default 10
 *
 * @param WarningMessage
 * @parent ---通用與安全---
 * @text 預警訊息內容
 * @desc 預警彈窗的文字。
 * @type string
 * @default 注意：學習時間僅剩 10 分鐘，請記得儲存進度！
 *
 * @param ---其他顯示設定---
 * * @param ShowTimer
 * @parent ---其他顯示設定---
 * @text 顯示右上角計時器
 * @desc 是否在畫面上顯示剩餘時間？
 * @type boolean
 * @default true
 *
 * @param TimerLabel
 * @parent ---其他顯示設定---
 * @text 計時器標籤文字
 * @desc 顯示在時間前面的文字。
 * @type string
 * @default 剩餘時間：
 *
 */

var Kurimanju = Kurimanju || {};

(() => {
    const pluginName = "Kurimanju_TimeLimit";
    const parameters = PluginManager.parameters(pluginName);

    // --- UI 參數 ---
    const timerFontSize = Number(parameters['TimerFontSize'] || 20);
    const timerOffsetY = Number(parameters['TimerOffsetY'] || 60);
    const timerOffsetX = Number(parameters['TimerOffsetX'] || 10);

    // --- 邏輯參數 ---
    const baseLimitMinutes = Number(parameters['DailyLimitMinutes'] || 60);
    const bonusVarId = Number(parameters['BonusVariableId'] || 220);
    const timeUpMsg = parameters['TimeUpMessage'] || "學習數學時間已夠，明天再繼續吧！";

    const enableCurfew = (parameters['EnableCurfew'] || 'true') === 'true';
    const curfewStart = Number(parameters['CurfewStart'] || 23);
    const curfewEnd = Number(parameters['CurfewEnd'] || 6);
    const curfewMsg = parameters['CurfewMessage'] || "現在是休息時間，請明天再來！";

    const adminPassword = parameters['UnlockPassword'] || "23838077";
    const forceSave = (parameters['ForceSave'] || 'true') === 'true';
    const warningMinutes = Number(parameters['WarningMinutes'] || 10);
    const warningMsg = parameters['WarningMessage'];
    
    const showTimer = (parameters['ShowTimer'] || 'true') === 'true';
    const timerLabel = parameters['TimerLabel'] || "剩餘時間：";

    // 本地儲存 Key
    const KEY_DATE = "Kurimanju_DailyDate";
    const KEY_SECONDS = "Kurimanju_DailySeconds";

    // 狀態
    let checkInterval = 0;
    let isLockingDown = false;
    let isAdminMode = false; 
    let hasWarned = false;
    let displayTimeText = "--:--:--"; 

    // ========================================================================
    //  公開方法
    // ========================================================================
    Kurimanju.resetTimer = function() {
        console.log("Kurimanju: Timer Reset.");
        localStorage.setItem(KEY_SECONDS, 0);
        hasWarned = false;
        alert("今日時間已重置！");
        updateTimeSystem(true);
    };

    // ========================================================================
    //  核心邏輯
    // ========================================================================
    function checkDailyReset() {
        const todayStr = new Date().toDateString(); 
        const savedDate = localStorage.getItem(KEY_DATE);

        if (savedDate !== todayStr) {
            localStorage.setItem(KEY_DATE, todayStr);
            localStorage.setItem(KEY_SECONDS, 0); 
            hasWarned = false; 
        }
    }

    function updateTimeSystem(forceUpdate = false) {
        if (isLockingDown) return;
        
        if (isAdminMode) {
            displayTimeText = "∞ 管理員模式";
            return;
        }

        const now = new Date();

        // 宵禁檢查
        if (enableCurfew) {
            const currentHour = now.getHours();
            let isCurfewTime = false;
            if (curfewStart > curfewEnd) { 
                if (currentHour >= curfewStart || currentHour < curfewEnd) isCurfewTime = true;
            } else { 
                if (currentHour >= curfewStart && currentHour < curfewEnd) isCurfewTime = true;
            }
            if (isCurfewTime) {
                displayTimeText = "宵禁時間";
                triggerLockdown(curfewMsg);
                return;
            }
        }

        // 時間計算
        let usedSeconds = Number(localStorage.getItem(KEY_SECONDS)) || 0;
        
        if (!forceUpdate) {
            usedSeconds++;
            localStorage.setItem(KEY_SECONDS, usedSeconds);
        }

        let bonusMinutes = 0;
        if ($gameVariables) {
            bonusMinutes = $gameVariables.value(bonusVarId);
        }
        const totalLimitSeconds = (baseLimitMinutes + bonusMinutes) * 60;
        let remainingSeconds = totalLimitSeconds - usedSeconds;

        if (!forceUpdate && remainingSeconds <= 0) {
            remainingSeconds = 0;
            triggerLockdown(timeUpMsg);
        }

        if (!forceUpdate && warningMinutes > 0 && !hasWarned) {
            if (remainingSeconds <= (warningMinutes * 60) && remainingSeconds > 0) {
                hasWarned = true;
                window.alert(warningMsg);
            }
        }

        // 更新文字
        if (remainingSeconds < 0) remainingSeconds = 0;
        const h = Math.floor(remainingSeconds / 3600);
        const m = Math.floor((remainingSeconds % 3600) / 60);
        const s = remainingSeconds % 60;
        displayTimeText = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    }

    function triggerLockdown(message) {
        if (isLockingDown) return;
        isLockingDown = true;
        if (SceneManager._scene) SceneManager._scene.stop();
        if (forceSave) {
            try { $gameSystem.onBeforeSave(); DataManager.saveGame(1); } catch (e) {}
        }
        const input = window.prompt(message + "\n\n(管理員請輸入密碼解鎖)", "");
        if (input === adminPassword) {
            window.alert("密碼正確！已解除所有時間限制。");
            isAdminMode = true;
            isLockingDown = false;
            if (SceneManager._scene) {
                SceneManager._scene._active = true;
            }
            updateTimeSystem(true);
            return;
        }
        SceneManager.exit();
    }

    // ========================================================================
    //  UI 視窗 (修正位置與大小)
    // ========================================================================
    function Window_TimeDisplay() { this.initialize(...arguments); }
    Window_TimeDisplay.prototype = Object.create(Window_Base.prototype);
    Window_TimeDisplay.prototype.constructor = Window_TimeDisplay;
    Window_TimeDisplay.prototype.initialize = function(rect) {
        Window_Base.prototype.initialize.call(this, rect);
        this.opacity = 0; 
        this._lastTimeText = "";
        
        checkDailyReset();
        updateTimeSystem(true); 
        
        this.refresh();
    };
    Window_TimeDisplay.prototype.update = function() {
        Window_Base.prototype.update.call(this);
        if (this._lastTimeText !== displayTimeText) this.refresh();
    };
    Window_TimeDisplay.prototype.refresh = function() {
        this.contents.clear();
        this._lastTimeText = displayTimeText;
        
        // --- 修正：設定字體大小 ---
        this.contents.fontSize = timerFontSize; 

        const text = isAdminMode ? displayTimeText : (timerLabel + " " + displayTimeText);
        this.changeTextColor(ColorManager.normalColor());
        if (!isAdminMode && displayTimeText !== "宵禁時間" && displayTimeText.startsWith("00:00")) {
             this.changeTextColor(ColorManager.crisisColor());
        }
        
        // 因為改變了字體大小，這裡使用 "right" 對齊可以確保數字不會亂跑
        this.drawText(text, 0, 0, this.contentsWidth(), "right");
        
        // 重置回預設字體大小，避免影響其他繪製 (保險起見)
        this.resetFontSettings();
    };

    // ========================================================================
    //  Hook
    // ========================================================================
    const _Scene_Boot_start = Scene_Boot.prototype.start;
    Scene_Boot.prototype.start = function() {
        _Scene_Boot_start.call(this);
        checkDailyReset();
    };

    const _Scene_Map_createAllWindows = Scene_Map.prototype.createAllWindows;
    Scene_Map.prototype.createAllWindows = function() {
        _Scene_Map_createAllWindows.call(this);
        if (showTimer) this.createTimeWindow();
    };
    
    // --- 修正：視窗創建位置 ---
    Scene_Map.prototype.createTimeWindow = function() {
        // 計算位置：
        // X = 畫面總寬 - 視窗寬 - 偏移量
        // Y = 偏移量
        // 寬度改為 250 (之前是 300)，高度改為 60 (配合小字體)
        const winWidth = 250;
        const winHeight = 60;
        const x = Graphics.boxWidth - winWidth - timerOffsetX;
        const y = timerOffsetY;
        
        const rect = new Rectangle(x, y, winWidth, winHeight);
        this._timeWindow = new Window_TimeDisplay(rect);
        this.addWindow(this._timeWindow);
    };

    const _Scene_Battle_createAllWindows = Scene_Battle.prototype.createAllWindows;
    Scene_Battle.prototype.createAllWindows = function() {
        _Scene_Battle_createAllWindows.call(this);
        if (showTimer) this.createTimeWindow();
    };
    Scene_Battle.prototype.createTimeWindow = Scene_Map.prototype.createTimeWindow;

    const _Scene_Base_update = Scene_Base.prototype.update;
    Scene_Base.prototype.update = function() {
        _Scene_Base_update.call(this);
        const isMapOrBattle = (SceneManager._scene instanceof Scene_Map) || (SceneManager._scene instanceof Scene_Battle);
        if (isMapOrBattle) {
            checkInterval++;
            if (checkInterval >= 60) {
                checkInterval = 0;
                updateTimeSystem(false); 
            }
        }
    };
})();