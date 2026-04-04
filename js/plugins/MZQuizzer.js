//=============================================================================
// MZ-Quiz-Engine.js (Fix: Progression & Wait Mode & Penalty & Stability)
//=============================================================================
/*:
 * @target MZ
 * @plugindesc [v1.4.6] Quiz Engine（TSA 答錯同一題；題庫 T 欄可倒數逾時算錯）
 * @author Starbird (Modified by Senior Programmer)
 * @help MZ-Quiz-Engine.js
 *
 * @command getQuestion
 * @desc Pulls the question based on Variable 992.
 *
 * @param penaltyStateId
 * @text 懲罰狀態 ID (跳過回合)
 * @desc 當答錯時施加的狀態 ID。建議設為「無法行動」且「不自動解除」。
 * @type state
 * @default 300
 *
 * @param quizPromptSubstring
 * @text 縮窄訊息窗：觸發字串
 * @desc 戰鬥訊息全文含此字串時，將訊息窗改矮以免遮住題圖。題庫改提示語時請同步修改。
 * @default 請看題目圖片
 *
 * @param quizMessageLineCount
 * @text 縮窄時訊息行數
 * @desc 1～4。愈少愈不遮擋圖片；過小可能裁切頭圖。
 * @type number
 * @min 1
 * @max 4
 * @default 2
 *
 * @param TsaLockVariableId
 * @text TSA 題號鎖定變數 ID
 * @desc Var 990=4（TSA）時：答錯會重複同一題直到答對。0=未鎖定，>0 表示目前題號為 (值-1)。勿與其他系統共用。
 * @type variable
 * @default 988
 *
 * @help 
 * [v1.4.6] TSA（Var 990=4）：以變數鎖定題號，答錯再出題時仍為同一題，與塔模式一致。
 *         題庫「T」>0 時視為倒數幀數（60幀=1秒，如 900=15秒），逾時視同答錯；勿再併用事件「計時器」（到期會中止戰鬥）。
 *         軍團事件：在適當頁（如回合 0、戰鬥開始）只放插件指令「MZQuizzer → getQuestion」即可，倒數由題庫 T 控制。
 *
 * [v1.4.5] 二～五選題若選項為英文字母 A、AB、ABC、ABCD、ABCDE：一律依字母順序顯示，**不洗牌**。
 *         其餘（文字敘述選項等）維持題庫原始順序，亦不洗牌。
 *
 * [v1.4.3] 戰鬥中若訊息含「圖片題提示」，訊息窗暫改較矮；其餘訊息維持預設高度。
 *
 * [v1.4.2] 覆寫 Game_Interpreter.skipBranch，避免事件分歧列表不完整時拋 TypeError（indent of undefined）。
 *
 * [v1.4.0 關鍵修正]
 * 1. 強化了「解除懲罰」的邏輯：
 *    - 答對時，會嘗試從「當前行動者」或「全體隊員」身上移除狀態 300。
 *    - 確保即使在回合開始前觸發，也能正確解除殘留的懲罰狀態。
 * 
 * 2. 關於戰鬥事件 (Troop Event) 的重要設定：
 *    - 請務必將戰鬥事件中的「條件分歧 (Conditional Branch)」和「更改狀態 (Change State)」指令 **全部刪除**。
 *    - 只保留 `MZQuizzer getQuestion` 這一行指令即可。
 *    - 插件現在會全權負責狀態的施加與解除，事件裡多寫反而會導致衝突（例如答對了卻被事件誤判為答錯而施加狀態）。
 *
 * === 設定變量 ===
 * Var 990: 模式 (1=S1, 2=S2, 3=S3, 4=TSA 操練)
 * Var 989: 語言 (1=中文, 2=英文) ※TSA 模式會忽略，僅用圖片題
 * Var 992: 非 TSA：當前題號（答對 +1）。TSA：題號由「TSA 鎖定變數」保存，答對才清掉並下次再隨機
 */

(() => {
    const pluginName = "MZQuizzer";
    const parameters = PluginManager.parameters(pluginName);
    const penaltyStateId = Number(parameters['penaltyStateId'] || 300);
    const quizPromptSubstring = String(parameters['quizPromptSubstring'] || '請看題目圖片');
    let quizMessageLineCount = Number(parameters['quizMessageLineCount'] || 2);
    if (quizMessageLineCount < 1) quizMessageLineCount = 1;
    if (quizMessageLineCount > 4) quizMessageLineCount = 4;
    const tsaLockVariableId = Number(parameters['TsaLockVariableId'] || 988);

    let _mzqExpireFrame = 0;
    let _mzqPending = null;

    const _Window_Message_startMessage = Window_Message.prototype.startMessage;
    Window_Message.prototype.startMessage = function () {
        const scene = SceneManager._scene;
        const text = $gameMessage.allText() || '';
        const isBattleMsg =
            scene &&
            scene._messageWindow === this &&
            typeof Scene_Battle !== 'undefined' &&
            scene instanceof Scene_Battle;
        if (isBattleMsg && scene.calcWindowHeight) {
            const narrow =
                quizPromptSubstring.length > 0 && text.indexOf(quizPromptSubstring) >= 0;
            const lines = narrow ? quizMessageLineCount : 4;
            const ww = Graphics.boxWidth;
            const wh = scene.calcWindowHeight(lines, false) + 8;
            this.move(0, this.y, ww, wh);
            this.createContents();
        }
        _Window_Message_startMessage.call(this);
    };

    // 引擎原版 skipBranch：在 this._list[this._index + 1] 為 undefined 時仍讀 .indent → TypeError
    // （常見於條件分歧未閉合、或玩家走未到條件的路徑時索引超出列表）
    Game_Interpreter.prototype.skipBranch = function () {
        while (true) {
            const next = this._list && this._list[this._index + 1];
            if (!next || next.indent <= this._indent) break;
            this._index++;
        }
    };

    PluginManager.registerCommand(pluginName, "getQuestion", function() {
        this.getQuestion();
        this.setWaitMode('message');
    });

    Game_Interpreter.prototype.getQuestion = function() {
        // 重置開關
        $gameSwitches.setValue(991, false);
        $gameSwitches.setValue(992, false);

        // --- 1. 確定分類 (Difficulty & Language) ---
        var diff = $gameVariables.value(990);
        var lang = $gameVariables.value(989);

        if (!diff || diff === 0) { diff = 1; }
        if (!lang || lang === 0) { lang = 1; }

        var categoryKey = "Questions"; 
        var folderPrefix = ""; 

        if (diff === 4) {
            categoryKey = "TSA_ALL";
            folderPrefix = "初中題庫/TSA/";
        } else {
            var diffStr = "";
            var folderDiff = "";
            if (diff === 1) { diffStr = "S1"; folderDiff = "S1 AI 生成題目"; }
            else if (diff === 2) { diffStr = "S2"; folderDiff = "S2 AI生成題目"; }
            else if (diff === 3) { diffStr = "S3"; folderDiff = "S3 AI生成題目"; }
            
            var langStr = "";
            var folderLang = "";
            if (lang === 1) { langStr = "CH"; folderLang = "中文題目"; }
            else if (lang === 2) { langStr = "EN"; folderLang = "英文題目"; }

            if (diffStr !== "" && langStr !== "") {
                categoryKey = diffStr + "_" + langStr;
                folderPrefix = "初中題庫/" + folderDiff + "/" + folderLang + "/";
            } else {
                 if (diff === 1) { categoryKey = "S1MCQ"; folderPrefix = "S1MCQ/"; }
                 else if (diff === 2) { categoryKey = "S2MCQ"; folderPrefix = "S2MCQ/"; }
            }
        }

        var questionList = questionDatabase[categoryKey];

        if (!questionList) {
            if (questionDatabase["Questions"]) {
                questionList = questionDatabase["Questions"];
                folderPrefix = "";
            } else {
                $gameMessage.add("Error: No questions found for " + categoryKey);
                return;
            }
        }

        // --- 2. 獲取題號 ---
        var qIndex;
        if (diff === 4) {
            var lockRaw = $gameVariables.value(tsaLockVariableId);
            if (lockRaw > 0) {
                qIndex = lockRaw - 1;
                if (qIndex < 0 || qIndex >= questionList.length) {
                    qIndex = Math.floor(Math.random() * questionList.length);
                    $gameVariables.setValue(tsaLockVariableId, qIndex + 1);
                }
            } else {
                qIndex = Math.floor(Math.random() * questionList.length);
                $gameVariables.setValue(tsaLockVariableId, qIndex + 1);
            }
        } else {
            qIndex = $gameVariables.value(992);
            if (qIndex >= questionList.length) {
                $gameMessage.add("（所有題目已完成）");
                return;
            }
        }

        var question = questionList[qIndex];
        $gameVariables.setValue(995, 0); 

        // --- 3. 顯示圖片 ---
        $gameScreen.showPicture(97, "MZQ_picBG", 0, 0, 0, 100, 100, 255, 0);
        
        var picName = "";
        if (question.P_I && question.P_I !== 0 && question.P_I !== "0") {
            picName = question.P_I;
        } else if (question.GUID) {
            picName = question.GUID;
        }

        if (picName !== "") {
            picName = picName.replace(/\.(png|jpg|jpeg)$/i, "");
            var finalPath = folderPrefix + picName;
            $gameScreen.showPicture(98, finalPath, 0, 0, 0, 100, 100, 255, 0);
        }

        // --- 4. 處理文字與選項 ---
        var qText = question.Q;
        if (question.E === 1) qText = atob(rotHex(qText));
        qText = qText.replace(/(?:\r\n|\r|\n)/g, '\\n');
        $gameMessage.add(qText);

        var choices = [];
        var correctIndex = 0;

        if ([2, 3, 4, 5].includes(question.Q_T)) {
            var answers = [];
            var c_a = question.C_A;
            var a2 = question.A2;
            var a3 = question.A3;
            var a4 = question.A4;
            var a5 = question.A5;

            if (question.E === 1) {
                c_a = atob(rotHex(c_a));
                a2 = atob(rotHex(a2));
                if (a3) a3 = atob(rotHex(a3));
                if (a4) a4 = atob(rotHex(a4));
                if (a5) a5 = atob(rotHex(a5));
            }

            answers.push(c_a);
            answers.push(a2);
            if (a3) answers.push(a3);
            if (a4) answers.push(a4);
            if (a5) answers.push(a5);

            var realAnswer = (question.E === 1 ? atob(rotHex(question.C_A)) : question.C_A);
            var expectedLetters = "ABCDE".slice(0, question.Q_T);
            var letterMcqOrder =
                [2, 3, 4, 5].includes(question.Q_T) &&
                answers.length === question.Q_T &&
                answers.slice().sort().join("") === expectedLetters &&
                expectedLetters.indexOf(realAnswer) >= 0;

            if (letterMcqOrder) {
                choices = expectedLetters.split("");
                correctIndex = choices.indexOf(realAnswer);
            } else {
                for (var i = 0; i < answers.length; i++) {
                    if (answers[i] === realAnswer) {
                        correctIndex = i;
                    }
                    choices.push(answers[i]);
                }
            }
        } else if (question.Q_T === 9) { 
            choices = ["True", "False"];
            var realAns = String(question.C_A).toLowerCase();
            correctIndex = (realAns === "true") ? 0 : 1;
        }

        if (choices.length > 0) {
            var qFrames = Number(question.T);
            if (!isNaN(qFrames) && qFrames > 0 && choices.length > 1) {
                _mzqExpireFrame = Graphics.frameCount + qFrames;
                _mzqPending = { choices: choices, correctIndex: correctIndex };
            } else {
                _mzqExpireFrame = 0;
                _mzqPending = null;
            }

            $gameMessage.setChoices(choices, 0, -1);
            $gameMessage.setChoiceCallback(function(n) {
                _mzqExpireFrame = 0;
                _mzqPending = null;
                $gameVariables.setValue(991, choices[n]);

                if (n === correctIndex) {
                    processCorrectAnswer();
                } else {
                    processWrongAnswer();
                }

                $gameScreen.erasePicture(97);
                $gameScreen.erasePicture(98);
            });
        }
    };

    // 輔助函數：嘗試對目標施加/移除狀態
    function updatePenaltyState(apply) {
        if (!$gameParty.inBattle()) return;

        // 1. 嘗試獲取當前行動者 (Subject)
        let targets = [];
        if (BattleManager._subject) {
            targets.push(BattleManager._subject);
        } 
        // 2. 如果沒有 Subject (例如回合開始時)，則嘗試獲取當前輸入指令的角色 (Actor)
        else if (BattleManager.actor()) {
            targets.push(BattleManager.actor());
        }
        // 3. 如果還是沒有，則假設是對全體隊員進行檢測 (Fallback)
        //    這可以確保即使在特殊時機觸發，也能正確清除狀態
        else {
            targets = $gameParty.members();
        }

        targets.forEach(battler => {
            if (battler && battler.isAlive()) {
                if (apply) {
                    if (!battler.isStateAffected(penaltyStateId)) {
                        battler.addState(penaltyStateId);
                        console.log(`[MZQuizzer] Applied Penalty State ${penaltyStateId} to ${battler.name()}`);
                    }
                } else {
                    if (battler.isStateAffected(penaltyStateId)) {
                        battler.removeState(penaltyStateId);
                        console.log(`[MZQuizzer] Removed Penalty State ${penaltyStateId} from ${battler.name()}`);
                    }
                }
            }
        });
    }

    function processCorrectAnswer() {
        console.log("Correct Answer.");
        $gameSwitches.setValue(991, true);
        $gameSwitches.setValue(992, false);
        
        // --- 修正：更全面地解除懲罰狀態 ---
        updatePenaltyState(false); // false = remove

        // 變量 992 加 1（TSA 隨機操練不加，避免誤觸「題庫用盡」邏輯）
        if ($gameVariables.value(990) !== 4) {
            var currentQ = $gameVariables.value(992);
            $gameVariables.setValue(992, currentQ + 1);
        } else {
            $gameVariables.setValue(tsaLockVariableId, 0);
        }

        $gameVariables.setValue(993, $gameVariables.value(993) + 1); 
        $gameVariables.setValue(996, $gameVariables.value(996) + 1); 
        $gameVariables.setValue(997, 0); 

        $gameScreen.showPicture(99, "MZQ_correctAnswer", 1, 640, 360, 100, 100, 255, 0);
        AudioManager.playSe({name: "MZQ_correctAnswer", volume: 90, pitch: 100, pan: 0});
        setTimeout(function(){ $gameScreen.erasePicture(99); }, 1500);
    }

    function processWrongAnswer() {
        console.log("Wrong Answer.");
        $gameSwitches.setValue(991, false);
        $gameSwitches.setValue(992, true);
        
        $gameVariables.setValue(994, $gameVariables.value(994) + 1); 
        $gameVariables.setValue(997, $gameVariables.value(997) + 1); 
        $gameVariables.setValue(996, 0); 

        $gameScreen.showPicture(99, "MZQ_wrongAnswer", 1, 640, 360, 100, 100, 255, 0);
        AudioManager.playSe({name: "MZQ_wrongAnswer", volume: 90, pitch: 100, pan: 0});
        
        // --- 修正：更全面地施加懲罰狀態 ---
        updatePenaltyState(true); // true = apply

        if (typeof penaltySystem === "function") penaltySystem();
        setTimeout(function(){ $gameScreen.erasePicture(99); }, 1500);
    }

    function rotHex(s) { return s; }

    var MZQ_WindowChoiceList_callCancelHandler = Window_ChoiceList.prototype.callCancelHandler;
    Window_ChoiceList.prototype.callCancelHandler = function() {
        MZQ_WindowChoiceList_callCancelHandler.call(this);
        this._count = 0;
        _mzqExpireFrame = 0;
        _mzqPending = null;
        if (typeof penaltySystem === "function") penaltySystem();
    };

    function tryMzqQuestionTimeout(scene) {
        if (
            _mzqExpireFrame > 0 &&
            _mzqPending &&
            Graphics.frameCount >= _mzqExpireFrame &&
            SceneManager._scene === scene &&
            $gameMessage.isChoice()
        ) {
            var pq = _mzqPending;
            var wp = pq.correctIndex === 0 ? 1 : 0;
            if (wp >= pq.choices.length) wp = 0;
            _mzqExpireFrame = 0;
            _mzqPending = null;
            $gameMessage.onChoice(wp);
        }
    }

    const _Scene_Battle_update_MZQ = Scene_Battle.prototype.update;
    Scene_Battle.prototype.update = function() {
        _Scene_Battle_update_MZQ.call(this);
        tryMzqQuestionTimeout(this);
    };

    const _Scene_Map_update_MZQ = Scene_Map.prototype.update;
    Scene_Map.prototype.update = function() {
        _Scene_Map_update_MZQ.call(this);
        tryMzqQuestionTimeout(this);
    };

    ConfigManager.instantText = true;
    var alias_cm_md = ConfigManager.makeData;
    ConfigManager.makeData = function() {
        var e = alias_cm_md.call(this);
        e.instantText = this.instantText;
        return e;
    };
    var alias_cm_ad = ConfigManager.applyData;
    ConfigManager.applyData = function(e) {
        alias_cm_ad.call(this, e);
        this.instantText = this.readConfigInstantText(e, "instantText");
    };
    ConfigManager.readConfigInstantText = function(e, t) { return (e[t] !== undefined) ? e[t] : false; };
    
    var alias_wm_udf = Window_Message.prototype.updateShowFast;
    Window_Message.prototype.updateShowFast = function() {
        alias_wm_udf.call(this);
        if (ConfigManager.instantText === true) this._showFast = true;
    };

    Sprite_Timer.prototype.updatePosition = function() {
        this.x = (Graphics.width - this.bitmap.width) / 2;
        this.y = 584; 
    };
})();
