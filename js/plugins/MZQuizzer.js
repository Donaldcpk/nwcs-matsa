//=============================================================================
// MZ-Quiz-Engine.js (Fix: Progression & Wait Mode & Penalty & Stability)
//=============================================================================
/*:
 * @target MZ
 * @plugindesc [v1.6.0] Quiz Engine（自選課題；沒有原圖的題用 LaTeX 題卡；題圖縮到畫面內）
 * @author Starbird (Modified by Senior Programmer)
 *
 * @command getQuestion
 * @text 出題
 * @desc 依照玩家選好的課題出題。
 *
 * @command chooseTopic
 * @text 選擇課題
 * @desc 讓玩家選年級、中文或英文，再選課題。選好後該課從第 1 題開始。
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
 * [v1.5.0] 開場先選年級，再選範圍（數與代數、圖形與空間、數據處理），然後選課題。選好遊戲才開始。
 *         選單有「選擇課題」。換課題會從第 1 題再開始。舊存檔若沒選課題，第一場戰鬥會先叫你選。
 *
 * [v1.4.7] 題目圖片若比畫面大，會縮小並置中，避免右邊或下邊的字被切掉。
 *         答題時 A／B／C／D 改成畫面下方一整列，四個選項都會在畫面裡。
 *         瀏覽器視窗比遊戲小時，整頁會縮小以完整顯示，不再裁掉右下角。
 *
 * [v1.4.6] 題庫「T」>0 時視為倒數幀數（60幀=1秒，如 900=15秒），逾時視同答錯。
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
 * Var 980: 課題代碼（1A01=1001、1B07=1107。0 代表還沒選）
 * Var 989: 語言 (1=中文, 2=英文)
 * Var 990: 年級 (1=中一 … 3=中三)
 * Var 992: 這一課做到第幾題（答對 +1）。換課題時歸零。
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
    const QUIZ_PICTURE_ID = 98;

    const topicVariableId = 980;

    function mzqDecodeTopic(code) {
        code = Number(code) || 0;
        if (code < 1000) return "";
        var form = Math.floor(code / 1000);
        var rest = code % 1000;
        if (form === 6 && rest < 100) {
            var senior = String(rest);
            if (senior.length < 2) senior = "0" + senior;
            return "6" + senior;
        }
        var book = rest >= 100 ? "B" : "A";
        var chapter = rest % 100;
        if (form < 1 || form > 6 || chapter < 1 || chapter > 30) return "";
        var chapterText = String(chapter);
        if (chapterText.length < 2) chapterText = "0" + chapterText;
        return String(form) + book + chapterText;
    }

    function mzqEncodeTopic(chapter) {
        var book = /^(\d)([AB])(\d{2})$/.exec(chapter || "");
        if (book) {
            return Number(book[1]) * 1000 + (book[2] === "B" ? 100 : 0) + Number(book[3]);
        }
        var senior = /^6(\d{2})$/.exec(chapter || "");
        if (senior) return 6000 + Number(senior[1]);
        return 0;
    }

    function mzqCurriculum() {
        return [
            { no: 1, grade: 1, chapter: "1A01", name: "基礎計算", strands: "A" },
            { no: 2, grade: 1, chapter: "1A02", name: "有向數", strands: "A" },
            { no: 3, grade: 1, chapter: "1A03", name: "基礎代數（一）", strands: "A" },
            { no: 4, grade: 1, chapter: "1A04", name: "基礎代數（二）", strands: "A" },
            { no: 5, grade: 1, chapter: "1A05", name: "百分法（一）", strands: "A" },
            { no: 6, grade: 1, chapter: "1A06", name: "基礎幾何", strands: "G" },
            { no: 7, grade: 1, chapter: "1B07", name: "求積法（一）", strands: "G" },
            { no: 8, grade: 1, chapter: "1B08", name: "直角坐標系（一）", strands: "G" },
            { no: 9, grade: 1, chapter: "1B09", name: "角和平行線（一）", strands: "G" },
            { no: 10, grade: 1, chapter: "1B10", name: "全等及相似（一）", strands: "G" },
            { no: 11, grade: 1, chapter: "1B11", name: "數值估算", strands: "A" },
            { no: 12, grade: 1, chapter: "1B12", name: "數據的組織和表達（一）", strands: "D" },
            { no: 1, grade: 2, chapter: "2A01", name: "近似與誤差", strands: "AG" },
            { no: 2, grade: 2, chapter: "2A02", name: "多項式的運算及因式分解", strands: "A" },
            { no: 3, grade: 2, chapter: "2A03", name: "恆等式", strands: "A" },
            { no: 4, grade: 2, chapter: "2A04", name: "代數分式及公式", strands: "A" },
            { no: 5, grade: 2, chapter: "2A05", name: "二元一次方程", strands: "A" },
            { no: 6, grade: 2, chapter: "2A06", name: "角和平行線（二）", strands: "G" },
            { no: 7, grade: 2, chapter: "2A07", name: "數據的組織和表達（二）", strands: "D" },
            { no: 8, grade: 2, chapter: "2B08", name: "率、比及比例", strands: "A" },
            { no: 9, grade: 2, chapter: "2B09", name: "全等及相似（二）", strands: "G" },
            { no: 10, grade: 2, chapter: "2B10", name: "多邊形", strands: "G" },
            { no: 11, grade: 2, chapter: "2B11", name: "畢氏定理及無理數", strands: "AG" },
            { no: 12, grade: 2, chapter: "2B12", name: "認識三角學", strands: "G" },
            { no: 13, grade: 2, chapter: "2B13", name: "求積法（二）", strands: "G" },
            { no: 1, grade: 3, chapter: "3A01", name: "續因式分解", strands: "A" },
            { no: 2, grade: 3, chapter: "3A02", name: "整數指數定律", strands: "A" },
            { no: 3, grade: 3, chapter: "3A03", name: "百分法（二）", strands: "A" },
            { no: 4, grade: 3, chapter: "3A04", name: "一元一次不等式", strands: "A" },
            { no: 5, grade: 3, chapter: "3A05", name: "概率", strands: "D" },
            { no: 6, grade: 3, chapter: "3A06", name: "集中趨勢的度量", strands: "D" },
            { no: 7, grade: 3, chapter: "3A07", name: "續三角形", strands: "G" },
            { no: 8, grade: 3, chapter: "3B08", name: "四邊形", strands: "G" },
            { no: 9, grade: 3, chapter: "3B09", name: "續立體圖形", strands: "G" },
            { no: 10, grade: 3, chapter: "3B10", name: "求積法（三）", strands: "G" },
            { no: 11, grade: 3, chapter: "3B11", name: "三角比的關係", strands: "G" },
            { no: 12, grade: 3, chapter: "3B12", name: "三角學的應用", strands: "G" },
            { no: 13, grade: 3, chapter: "3B13", name: "直角坐標系（二）", strands: "G" },
            { no: 1, grade: 4, chapter: "4A03", name: "一元二次方程", strands: "A" },
            { no: 2, grade: 4, chapter: "4A02", name: "直線的方程", strands: "AG" },
            { no: 3, grade: 4, chapter: "4A04", name: "函數和函數的圖像", strands: "AG" },
            { no: 4, grade: 4, chapter: "4A05", name: "函數圖像", strands: "AG" },
            { no: 6, grade: 4, chapter: "4B07", name: "指數函數", strands: "A" },
            { no: 7, grade: 4, chapter: "4B08", name: "對數函數", strands: "A" },
            { no: 8, grade: 4, chapter: "4B10", name: "三角學（一）", strands: "G" },
            { no: 9, grade: 4, chapter: "4B09", name: "續方程", strands: "A" },
            { no: 10, grade: 4, chapter: "4A01", name: "複數", strands: "A" },
            { no: 11, grade: 4, chapter: "4B11", name: "圓的基本性質（一）", strands: "G" },
            { no: 12, grade: 4, chapter: "4B12", name: "圓的基本性質（二）", strands: "G" },
            { no: 10, grade: 5, chapter: "5A02", name: "不等式", strands: "A" },
            { no: 14, grade: 5, chapter: "5A01", name: "三角學（二）", strands: "G" },
            { no: 7, grade: 5, chapter: "5A04", name: "變分", strands: "A" },
            { no: 13, grade: 5, chapter: "5B11", name: "離差的度量", strands: "D" },
            { no: 15, grade: 5, chapter: "5B08", name: "圓的方程", strands: "AG" },
            { no: 16, grade: 5, chapter: "5B07", name: "軌跡", strands: "G" },
            { no: 17, grade: 5, chapter: "5A05", name: "排列與組合", strands: "D" },
            { no: 18, grade: 5, chapter: "5A06", name: "續概率", strands: "D" },
            { no: 19, grade: 6, chapter: "603", name: "線性規劃", strands: "AG" },
            { no: 20, grade: 6, chapter: "601", name: "等差數列和等比數列", strands: "A" },
            { no: 21, grade: 6, chapter: "602", name: "等差數列及等比數列的求和法", strands: "A" },
            { no: 23, grade: 6, chapter: "604", name: "統計的應用及誤用", strands: "D" }
        ];
    }

    function mzqStrandName(strand) {
        if (strand === "G") return "圖形與空間";
        if (strand === "D") return "數據處理";
        return "數與代數";
    }

    function mzqLessonInfo(chapter) {
        var list = mzqCurriculum();
        for (var i = 0; i < list.length; i++) {
            if (list[i].chapter === chapter) return list[i];
        }
        return null;
    }

    function mzqRowsForChapter(chapter) {
        var ch = null;
        var en = null;
        (window.MZQ_TOPICS || []).forEach(function(topic) {
            if (topic.chapter !== chapter) return;
            if (topic.lang === "EN") en = topic;
            else ch = topic;
        });
        return { ch: ch, en: en };
    }

    function mzqPlayableLessons(grade, strand) {
        return mzqCurriculum().filter(function(lesson) {
            if (Number(lesson.grade) !== Number(grade)) return false;
            if (lesson.strands.indexOf(strand) < 0) return false;
            var rows = mzqRowsForChapter(lesson.chapter);
            return !!(rows.ch || rows.en);
        });
    }

    function mzqLangIsEnglish() {
        return Number($gameVariables.value(989)) === 2;
    }

    function mzqTopicsFor(grade, lang) {
        var list = window.MZQ_TOPICS || [];
        var langKey = Number(lang) === 2 ? "EN" : "CH";
        return list.filter(function(topic) {
            return Number(topic.grade) === Number(grade) && topic.lang === langKey;
        });
    }

    function mzqGrades() {
        return [1, 2, 3, 4, 5, 6];
    }

    function mzqGradeName(grade) {
        var names = { 1: "中一", 2: "中二", 3: "中三", 4: "中四", 5: "中五", 6: "中六" };
        return names[grade] || ("年級 " + grade);
    }

    window.MZQ_questionList = function() {
        if (!window.questionDatabase) return null;
        var chapter = mzqDecodeTopic($gameVariables.value(topicVariableId));
        if (!chapter) return null;
        var key = chapter + "_" + (mzqLangIsEnglish() ? "EN" : "CH");
        var list = window.questionDatabase[key];
        return list && list.length ? list : null;
    };

    window.MZQ_topicLabel = function() {
        var chapter = mzqDecodeTopic($gameVariables.value(topicVariableId));
        if (!chapter) return "還沒選擇";
        var info = mzqLessonInfo(chapter);
        var grade = mzqGradeName(Number($gameVariables.value(990)));
        var lang = mzqLangIsEnglish() ? "英文" : "中文";
        var name = info ? (info.no + " " + info.name) : chapter;
        return grade + " " + name + " " + lang;
    };

    let _mzqExpireFrame = 0;
    let _mzqPending = null;

    Graphics._defaultStretchMode = function() {
        return true;
    };

    function quizPictureOnScreen() {
        if (typeof $gameScreen === "undefined" || !$gameScreen) return false;
        const pic = $gameScreen.picture(QUIZ_PICTURE_ID);
        return !!(pic && pic.name());
    }

    function applyQuizPictureFit(bitmap, choices) {
        const pic = $gameScreen.picture(QUIZ_PICTURE_ID);
        if (!pic || !bitmap || !bitmap.width || !bitmap.height) return;
        if (typeof QuizPictureFit === "undefined") return;
        const horizontal = QuizPictureFit.choicesAreShort(choices);
        const reserve = QuizPictureFit.bottomReserve(
            choices && choices.length ? choices.length : 4,
            horizontal
        );
        const layout = QuizPictureFit.layout(
            bitmap.width,
            bitmap.height,
            Graphics.boxWidth,
            Graphics.boxHeight,
            reserve
        );
        pic._origin = 0;
        pic._x = layout.x;
        pic._y = layout.y;
        pic._scaleX = layout.scalePercent;
        pic._scaleY = layout.scalePercent;
        pic._targetX = layout.x;
        pic._targetY = layout.y;
        pic._targetScaleX = layout.scalePercent;
        pic._targetScaleY = layout.scalePercent;
        pic._duration = 0;
    }

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
                quizPictureOnScreen() ||
                (quizPromptSubstring.length > 0 && text.indexOf(quizPromptSubstring) >= 0);
            const lines = quizPictureOnScreen() ? 1 : (narrow ? quizMessageLineCount : 4);
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

    const _MZQ_updateWaitMode = Game_Interpreter.prototype.updateWaitMode;
    Game_Interpreter.prototype.updateWaitMode = function() {
        if (this._waitMode === "mzqTopic") {
            var scene = SceneManager._scene;
            if (SceneManager.isSceneChanging() || (scene && scene instanceof Scene_MzqTopic)) {
                return true;
            }
            this._waitMode = "";
            if (this._mzqAskAfterTopic) {
                this._mzqAskAfterTopic = false;
                this.getQuestion();
                this.setWaitMode("message");
                return true;
            }
            return false;
        }
        return _MZQ_updateWaitMode.call(this);
    };

    PluginManager.registerCommand(pluginName, "chooseTopic", function() {
        $gameTemp._mzqForceTopic = true;
        SceneManager.push(Scene_MzqTopic);
    });

    PluginManager.registerCommand(pluginName, "getQuestion", function() {
        if (!window.MZQ_questionList || !window.MZQ_questionList()) {
            this._mzqAskAfterTopic = true;
            $gameTemp._mzqForceTopic = true;
            SceneManager.push(Scene_MzqTopic);
            this.setWaitMode("mzqTopic");
            return;
        }
        this.getQuestion();
        this.setWaitMode("message");
    });

    Game_Interpreter.prototype.getQuestion = function() {
        // 重置開關
        $gameSwitches.setValue(991, false);
        $gameSwitches.setValue(992, false);

        var questionList = (typeof window.MZQ_questionList === "function") ? window.MZQ_questionList() : null;
        var folderPrefix = "";

        if (!questionList || !questionList.length) {
            $gameSwitches.setValue(992, true);
            $gameMessage.add("這個課題還沒有題目。請打開選單，按「選擇課題」。");
            return;
        }

        var qIndex = $gameVariables.value(992);
        if (qIndex < 0 || qIndex >= questionList.length) {
            qIndex = 0;
            $gameVariables.setValue(992, 0);
        }

        var question = questionList[qIndex];
        var skipHops = 0;
        while (
            question &&
            typeof QuizPictureFit !== "undefined" &&
            !QuizPictureFit.hasRecordedAnswer(question)
        ) {
            skipHops++;
            if (skipHops > questionList.length) {
                $gameMessage.add("（這部分題目的答案表還沒有收錄）");
                return;
            }
            if (diff === 4) {
                qIndex = (qIndex + 1) % questionList.length;
                $gameVariables.setValue(tsaLockVariableId, qIndex + 1);
            } else {
                qIndex += 1;
                $gameVariables.setValue(992, qIndex);
                if (qIndex >= questionList.length) {
                    $gameMessage.add("（其餘題目的答案表還沒有收錄，這部分先跳過）");
                    return;
                }
            }
            question = questionList[qIndex];
        }
        $gameVariables.setValue(995, 0); 

        // --- 3. 顯示圖片 ---
        $gameScreen.showPicture(97, "MZQ_picBG", 0, 0, 0, 100, 100, 255, 0);
        
        var picName = "";
        if (question.P_I && question.P_I !== 0 && question.P_I !== "0") {
            picName = question.P_I;
        } else if (question.GUID) {
            picName = question.GUID;
        }

        var quizBitmap = null;
        if (picName !== "") {
            picName = picName.replace(/\.(png|jpg|jpeg)$/i, "");
            var finalPath = folderPrefix + picName;
            $gameScreen.showPicture(QUIZ_PICTURE_ID, finalPath, 0, 0, 0, 100, 100, 255, 0);
            quizBitmap = ImageManager.loadPicture(finalPath);
        }

        // --- 4. 處理文字與選項 ---
        var qText = question.Q;
        if (question.E === 1) qText = atob(rotHex(qText));
        qText = qText.replace(/(?:\r\n|\r|\n)/g, '\\n');
        if (qText === "MCQ") qText = "請選答案";
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

            if (quizBitmap) {
                var fitChoices = choices.slice();
                quizBitmap.addLoadListener(function() {
                    applyQuizPictureFit(quizBitmap, fitChoices);
                });
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

        var currentQ = $gameVariables.value(992);
        $gameVariables.setValue(992, currentQ + 1);

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

    var MZQ_WindowChoiceList_maxCols = Window_ChoiceList.prototype.maxCols;
    Window_ChoiceList.prototype.maxCols = function() {
        if (!quizPictureOnScreen() || typeof QuizPictureFit === "undefined") {
            return MZQ_WindowChoiceList_maxCols.call(this);
        }
        const choices = $gameMessage.choices();
        return QuizPictureFit.choicesAreShort(choices) ? choices.length : 1;
    };

    var MZQ_WindowChoiceList_numVisibleRows = Window_ChoiceList.prototype.numVisibleRows;
    Window_ChoiceList.prototype.numVisibleRows = function() {
        if (!quizPictureOnScreen()) return MZQ_WindowChoiceList_numVisibleRows.call(this);
        const choices = $gameMessage.choices();
        const cols = Math.max(1, this.maxCols());
        return Math.max(1, Math.ceil(choices.length / cols));
    };

    var MZQ_WindowChoiceList_windowWidth = Window_ChoiceList.prototype.windowWidth;
    Window_ChoiceList.prototype.windowWidth = function() {
        if (!quizPictureOnScreen()) return MZQ_WindowChoiceList_windowWidth.call(this);
        return Graphics.boxWidth;
    };

    var MZQ_WindowChoiceList_drawItem = Window_ChoiceList.prototype.drawItem;
    Window_ChoiceList.prototype.drawItem = function(index) {
        if (!quizPictureOnScreen() || this.maxCols() <= 1) {
            MZQ_WindowChoiceList_drawItem.call(this, index);
            return;
        }
        const rect = this.itemLineRect(index);
        this.resetTextColor();
        this.drawText(this.commandName(index), rect.x, rect.y, rect.width, "center");
    };

    var MZQ_WindowChoiceList_windowX = Window_ChoiceList.prototype.windowX;
    Window_ChoiceList.prototype.windowX = function() {
        if (!quizPictureOnScreen()) return MZQ_WindowChoiceList_windowX.call(this);
        return Math.max(0, Math.floor((Graphics.boxWidth - this.windowWidth()) / 2));
    };

    var MZQ_WindowChoiceList_windowY = Window_ChoiceList.prototype.windowY;
    Window_ChoiceList.prototype.windowY = function() {
        if (!quizPictureOnScreen()) return MZQ_WindowChoiceList_windowY.call(this);
        const messageY = this._messageWindow ? this._messageWindow.y : Graphics.boxHeight;
        let y = messageY - this.windowHeight();
        const maxY = Graphics.boxHeight - this.windowHeight();
        if (y > maxY) y = maxY;
        if (y < 0) y = 0;
        return y;
    };

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

    function Scene_MzqTopic() {
        this.initialize.apply(this, arguments);
    }

    Scene_MzqTopic.prototype = Object.create(Scene_MenuBase.prototype);
    Scene_MzqTopic.prototype.constructor = Scene_MzqTopic;

    Scene_MzqTopic.prototype.initialize = function() {
        Scene_MenuBase.prototype.initialize.call(this);
        this._grade = Number($gameVariables.value(990)) || 1;
        if (this._grade < 1 || this._grade > 6) this._grade = 1;
        this._lang = Number($gameVariables.value(989)) === 2 ? 2 : 1;
        this._strand = "A";
        this._lesson = null;
        this._step = "grade";
    };

    Scene_MzqTopic.prototype.create = function() {
        Scene_MenuBase.prototype.create.call(this);
        this.createHelpWindow();
        var rect = new Rectangle(40, 160, Graphics.boxWidth - 80, this.calcWindowHeight(8, true));
        this._pickWindow = new Window_MzqPick(rect);
        this._pickWindow.setHandler("pick", this.onPick.bind(this));
        this._pickWindow.setHandler("cancel", this.onCancel.bind(this));
        this.addWindow(this._pickWindow);
        this.refreshStep();
    };

    Scene_MzqTopic.prototype.createHelpWindow = function() {
        this._helpWindow = new Window_Help(new Rectangle(0, 0, Graphics.boxWidth, this.calcWindowHeight(2, false)));
        this.addWindow(this._helpWindow);
    };

    Scene_MzqTopic.prototype.helpText = function() {
        if (this._step === "grade") {
            return "請選擇年級。選好課題之後，遊戲才會開始。\\n按取消可以回到上一個畫面。";
        }
        if (this._step === "strand") {
            return mzqGradeName(this._grade) + "：課題先分三個範圍。請選一個。\\n按取消可以改年級。";
        }
        if (this._step === "lang") {
            var lessonName = this._lesson ? this._lesson.name : "";
            return lessonName + " 有中文和英文。要做哪一種？\\n按取消可以改課題。";
        }
        return mzqGradeName(this._grade) + " " + mzqStrandName(this._strand) + "：請選擇課題。\\n選好後從第 1 題開始。按取消可以改範圍。";
    };

    Scene_MzqTopic.prototype.refreshStep = function() {
        this._helpWindow.setText(this.helpText());
        this._pickWindow.refresh();
        var index = 0;
        if (this._step === "grade") index = Math.max(0, this._grade - 1);
        this._pickWindow.select(index);
        this._pickWindow.activate();
    };

    Scene_MzqTopic.prototype.finishLesson = function(lesson, lang) {
        $gameVariables.setValue(topicVariableId, mzqEncodeTopic(lesson.chapter));
        $gameVariables.setValue(990, lesson.grade);
        $gameVariables.setValue(989, lang);
        $gameVariables.setValue(992, 0);
        $gameTemp._mzqForceTopic = false;
        this.popScene();
    };

    Scene_MzqTopic.prototype.onPick = function() {
        var picked = this._pickWindow.currentExt();
        if (this._step === "grade") {
            this._grade = picked;
            this._step = "strand";
            this.refreshStep();
            return;
        }
        if (this._step === "strand") {
            this._strand = picked;
            if (!mzqPlayableLessons(this._grade, picked).length) {
                SoundManager.playBuzzer();
                this._helpWindow.setText(mzqGradeName(this._grade) + "的" + mzqStrandName(picked) + "，題目圖片還沒有放進遊戲。\\n請改選其他範圍，或按取消改年級。");
                this._pickWindow.activate();
                return;
            }
            this._step = "topic";
            this.refreshStep();
            return;
        }
        if (this._step === "lang") {
            this.finishLesson(this._lesson, picked);
            return;
        }
        var rows = mzqRowsForChapter(picked.chapter);
        this._lesson = picked;
        if (rows.ch && rows.en) {
            this._step = "lang";
            this.refreshStep();
            return;
        }
        this.finishLesson(picked, rows.ch ? 1 : 2);
    };

    Scene_MzqTopic.prototype.onCancel = function() {
        if (this._step === "lang") {
            this._step = "topic";
            this.refreshStep();
            return;
        }
        if (this._step === "topic") {
            this._step = "strand";
            this.refreshStep();
            return;
        }
        if (this._step === "strand") {
            this._step = "grade";
            this.refreshStep();
            return;
        }
        if ($gameTemp._mzqForceTopic) {
            SoundManager.playBuzzer();
            this._pickWindow.activate();
            return;
        }
        this.popScene();
    };

    function Window_MzqPick() {
        this.initialize.apply(this, arguments);
    }

    Window_MzqPick.prototype = Object.create(Window_Command.prototype);
    Window_MzqPick.prototype.constructor = Window_MzqPick;

    Window_MzqPick.prototype.initialize = function(rect) {
        Window_Command.prototype.initialize.call(this, rect);
    };

    Window_MzqPick.prototype.numVisibleRows = function() {
        return 8;
    };

    Window_MzqPick.prototype.makeCommandList = function() {
        var scene = SceneManager._scene;
        if (!scene || scene.constructor !== Scene_MzqTopic) return;
        if (scene._step === "grade") {
            mzqGrades().forEach(function(grade) {
                this.addCommand(mzqGradeName(grade), "pick", true, grade);
            }, this);
            return;
        }
        if (scene._step === "strand") {
            this.addCommand("數與代數", "pick", true, "A");
            this.addCommand("圖形與空間", "pick", true, "G");
            this.addCommand("數據處理", "pick", true, "D");
            return;
        }
        if (scene._step === "lang") {
            this.addCommand("中文題目", "pick", true, 1);
            this.addCommand("英文題目", "pick", true, 2);
            return;
        }
        var lessons = mzqPlayableLessons(scene._grade, scene._strand);
        if (!lessons.length) {
            this.addCommand("這個範圍還沒有題目", "pick", false, null);
            return;
        }
        lessons.forEach(function(lesson) {
            var rows = mzqRowsForChapter(lesson.chapter);
            var bits = [];
            if (rows.ch) bits.push("中文" + rows.ch.count + "題");
            if (rows.en) bits.push("英文" + rows.en.count + "題");
            this.addCommand(lesson.no + " " + lesson.name + "    " + bits.join("／"), "pick", true, lesson);
        }, this);
    };

    const _Window_MenuCommand_addOriginalCommands = Window_MenuCommand.prototype.addOriginalCommands;
    Window_MenuCommand.prototype.addOriginalCommands = function() {
        _Window_MenuCommand_addOriginalCommands.call(this);
        this.addCommand("選擇課題", "mzqTopic", true);
    };

    const _Scene_Menu_createCommandWindow = Scene_Menu.prototype.createCommandWindow;
    Scene_Menu.prototype.createCommandWindow = function() {
        _Scene_Menu_createCommandWindow.call(this);
        this._commandWindow.setHandler("mzqTopic", this.mzqOpenTopic.bind(this));
    };

    Scene_Menu.prototype.mzqOpenTopic = function() {
        $gameTemp._mzqForceTopic = false;
        SceneManager.push(Scene_MzqTopic);
    };
})();
