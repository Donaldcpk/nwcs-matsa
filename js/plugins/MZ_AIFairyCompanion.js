/*:
 * @target MZ
 * @plugindesc [v3.0 終極UX版] AI 視覺小精靈 (Siri式對話介面)
 * @author 專業RPG Maker工程師
 * @url https://your-website.com
 *
 * @help MZ_AIFairyCompanion.js
 * ============================================================================
 * v3.0 重大更新：
 * 1. 徹底移出主選單與地圖干擾。小精靈現在以 1/3 大小的圖示常駐於畫面左下角。
 * 2. 點擊圖示會彈出「類似 Siri/Line」的對話視窗介面。
 * 3. 完整保留對話紀錄 (隨存檔保存)。
 * 4. 可自由勾選是否附帶「當前遊戲截圖」。
 * 5. 擁有完整的「等待進度條」與輸入防呆機制，不再卡死遊戲。
 * ============================================================================
 * * 使用方式：
 * 1. 金鑰不要寫在這個插件。瀏覽器會把問題送到 proxyUrl，由伺服器轉問 AI。
 * 2. 設定小精靈的行走圖與索引。
 * 3. 進入地圖或戰鬥後，左下角會出現小精靈圖示，點擊即可互動。
 *
 * @param proxyUrl
 * @text 精靈伺服器網址
 * @desc 只填代理網址，不要填 API 金鑰。
 * @type text
 * @default https://oqsvxizemgyfointylpe.supabase.co/functions/v1/game-proxy
 *
 * @param aiModel
 * @text AI 模型（已不使用）
 * @desc 模型由伺服器的 GEMINI_MODEL 決定。這裡留空即可。
 * @type text
 * @default
 *
 * @param systemPrompt
 * @text 系統提示詞 (System Prompt)
 * @desc 設定小精靈的個性和遊戲世界觀設定
 * @type note
 * @default "你是一隻跟隨勇者冒險的系統精靈。請嚴格遵守以下規則：1. **必須使用繁體中文**回答。2. 絕不自己憑空創作答案。3. 如果玩家詢問與遊戲進度、數學題目無關的「無謂聊天」，請嚴格拒絕並提醒玩家專注遊戲。4. 數學公式請一律使用 LaTeX 格式輸出。5. 戰鬥時，我會提供【當前戰鬥題目資料】，請直接給出解題思路與正確答案，確保真實無誤。"
 *
 * @param fairyImage
 * @text 小精靈圖片
 * @desc 選擇小精靈的行走圖 (img/characters)
 * @type file
 * @dir img/characters
 * @default Nature
 * 
 * @param fairyIndex
 * @text 小精靈圖片索引
 * @desc 行走圖中的第幾個角色 (0-7)
 * @type number
 * @default 0
 *
 * @param progressVarId
 * @text 遊戲進度變數 ID
 * @desc 指定一個變數作為「主線進度」，讓AI知道目前劇情到哪了 (0為不使用)
 * @type variable
 * @default 0
 *
 * @param costPerAsk
 * @text 每次發問花費 (G)
 * @desc 戰鬥中每次向小精靈發問需要扣除的金幣
 * @type number
 * @default 500
 */

(() => {
    'use strict';

    const pluginName = "MZ_AIFairyCompanion";
    const parameters = PluginManager.parameters(pluginName);
    const COST_PER_ASK = Number(parameters['costPerAsk'] || 0);

    const FAIRY_IMAGE = parameters['fairyImage'];
    const FAIRY_INDEX = Number(parameters['fairyIndex'] || 0);
    const PROGRESS_VAR_ID = Number(parameters['progressVarId'] || 0);

    function mzqActiveQuestionList() {
        if (typeof window.MZQ_questionList === "function") {
            return window.MZQ_questionList();
        }
        return null;
    }

    // -------------------------------------------------------------------------
    // 1. Game_System 擴充 (儲存對話紀錄)
    // -------------------------------------------------------------------------
    const _Game_System_initialize = Game_System.prototype.initialize;
    Game_System.prototype.initialize = function() {
        _Game_System_initialize.call(this);
        this._aiFairyChatHistory = [];
    };

    Game_System.prototype.addAIFairyMessage = function(role, content) {
        if (!this._aiFairyChatHistory) this._aiFairyChatHistory = [];
        this._aiFairyChatHistory.push({ role, content, time: new Date().toLocaleTimeString('en-US', {hour12:false, hour:'2-digit', minute:'2-digit'}) });
        // 最多保留 50 條對話
        if (this._aiFairyChatHistory.length > 50) {
            this._aiFairyChatHistory.shift();
        }
    };

    Game_System.prototype.getAIFairyHistory = function() {
        if (!this._aiFairyChatHistory) this._aiFairyChatHistory = [];
        return this._aiFairyChatHistory;
    };

    // -------------------------------------------------------------------------
    // 2. 動態載入 KaTeX (數學公式)
    // -------------------------------------------------------------------------
    const loadKaTeX = () => {
        if (!document.getElementById('katex-css')) {
            const css = document.createElement('link');
            css.id = 'katex-css';
            css.rel = 'stylesheet';
            css.href = 'https://cdn.jsdelivr.net/npm/katex@0.16.8/dist/katex.min.css';
            document.head.appendChild(css);
        }
        if (!document.getElementById('katex-js')) {
            const script = document.createElement('script');
            script.id = 'katex-js';
            script.src = 'https://cdn.jsdelivr.net/npm/katex@0.16.8/dist/katex.min.js';
            document.head.appendChild(script);
        }
    };

    // -------------------------------------------------------------------------
    // 3. 截圖與數據處理
    // -------------------------------------------------------------------------
    const captureGameContext = () => {
        const context = [];
        const push = (label, read) => {
            try {
                const value = read();
                if (value) context.push(label + value);
            } catch (e) {
                /* 標題畫面或資料還沒準備好時，不要因此答不出題 */
            }
        };
        push("目前地圖: ", () => $gameMap && $gameMap.displayName());
        push("金幣: ", () => $gameParty && ($gameParty.gold() + " G"));
        push("", () => {
            const leader = $gameParty && $gameParty.leader && $gameParty.leader();
            if (!leader) return "";
            return `隊長: ${leader.name()} (Lv.${leader.level}, HP:${leader.hp}/${leader.mhp}, MP:${leader.mp}/${leader.mmp})`;
        });
        if (PROGRESS_VAR_ID > 0) {
            push("遊戲進度階段: ", () => String($gameVariables.value(PROGRESS_VAR_ID)));
        }
        let inBattle = false;
        try {
            inBattle = !!($gameParty && $gameParty.inBattle());
        } catch (e) {
            inBattle = false;
        }
        context.push(inBattle ? "狀態: 正在戰鬥中" : "狀態: 地圖探索中");
        if (inBattle) {
            push("敵人: ", () => $gameTroop.aliveMembers().map(e => `${e.name()}(HP:${e.hp}/${e.mhp})`).join(", "));
        }
        return `[當前遊戲狀態]\n${context.join('\n')}\n[狀態結束]`;
    };

    function currentBattleQuestion() {
        if (typeof $gameParty === "undefined" || !$gameParty || !$gameParty.inBattle()) return null;
        if (!window.NwcsAiHelp) return null;
        const list = mzqActiveQuestionList();
        let pictureName = "";
        if (typeof $gameScreen !== "undefined" && $gameScreen && $gameScreen.picture(98) && $gameScreen.picture(98).name()) {
            pictureName = $gameScreen.picture(98).name();
        }
        const index = (typeof $gameVariables !== "undefined" && $gameVariables) ? ($gameVariables.value(992) || 0) : 0;
        return window.NwcsAiHelp.findQuestion(list, pictureName, index);
    }

    async function blobToBase64(blob) {
        const buffer = await blob.arrayBuffer();
        const bytes = new Uint8Array(buffer);
        let binary = "";
        const chunk = 0x8000;
        for (let i = 0; i < bytes.length; i += chunk) {
            binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
        }
        return btoa(binary);
    }

    async function loadQuestionImage(path) {
        if (!path) return null;
        try {
            const response = await fetch(path);
            if (!response.ok) return null;
            const blob = await response.blob();
            if (!blob || blob.size < 32 || blob.size > 1200000) return null;
            const mime = blob.type && blob.type.startsWith("image/") ? blob.type : "image/png";
            return { mimeType: mime === "image/jpg" ? "image/jpeg" : mime, data: await blobToBase64(blob) };
        } catch (e) {
            console.warn("題目圖片讀不到", e);
            return null;
        }
    }

    function captureScreenshotBase64() {
        const source = document.getElementById("gameCanvas");
        if (!source || !source.width || !source.height) return "";
        try {
            const maxEdge = 960;
            const scale = Math.min(1, maxEdge / Math.max(source.width, source.height));
            const canvas = document.createElement("canvas");
            canvas.width = Math.max(1, Math.round(source.width * scale));
            canvas.height = Math.max(1, Math.round(source.height * scale));
            const ctx = canvas.getContext("2d");
            ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
            const url = canvas.toDataURL("image/jpeg", 0.72);
            const comma = url.indexOf(",");
            return comma >= 0 ? url.slice(comma + 1) : "";
        } catch (e) {
            console.warn("畫面截圖失敗", e);
            return "";
        }
    }

    function showReplyBadge() {
        const chatWindow = document.getElementById("ai-fairy-chat-window");
        const badge = document.getElementById("ai-fairy-badge");
        if (!badge) return;
        badge.style.display = chatWindow && chatWindow.style.display === "none" ? "block" : "none";
    }

    // -------------------------------------------------------------------------
    // 4. 送到學校伺服器，由伺服器轉問 AI
    // -------------------------------------------------------------------------
    let isWaitingForAI = false;

    const fetchAIResponse = async (userText, useVision) => {
        if (isWaitingForAI) return;

        $gameSystem.addAIFairyMessage("user", userText);
        AIFairyUI.renderHistory();
        AIFairyUI.setLoading(true);
        isWaitingForAI = true;

        const currentBadge = document.getElementById("ai-fairy-badge");
        if (currentBadge) currentBadge.style.display = "none";

        try {
            const question = currentBattleQuestion();
            const help = window.NwcsAiHelp;
            const tutor = help ? help.buildTutorContext(question, userText) : ("玩家說：" + userText);
            const contextText = captureGameContext() + "\n" + tutor;
            const images = [];
            if (question && help) {
                const image = await loadQuestionImage(help.questionImagePath(question));
                if (image) images.push(image);
            }
            if (useVision && images.length === 0) {
                const shot = captureScreenshotBase64();
                if (shot) images.push({ mimeType: "image/jpeg", data: shot });
            }
            if (!help) throw new Error("missing help");
            const result = await help.postProxy({
                action: "ai",
                context: contextText,
                images: images
            });
            const replyText = result.ok && result.reply
                ? result.reply
                : ("😵 " + (result.error || "精靈暫時沒有回應。"));
            $gameSystem.addAIFairyMessage("ai", replyText);
            AIFairyUI.renderHistory();
            showReplyBadge();
        } catch (error) {
            console.error(error);
            $gameSystem.addAIFairyMessage("ai", "😵 魔法通訊中斷了，請檢查網路後再試。");
            AIFairyUI.renderHistory();
            showReplyBadge();
        } finally {
            AIFairyUI.setLoading(false);
            isWaitingForAI = false;
        }
    };

    // -------------------------------------------------------------------------
    // 5. HTML/CSS 介面 (Siri Style)
    // -------------------------------------------------------------------------
    class AIFairyUI {
        static init() {
            if (document.getElementById('ai-fairy-wrapper')) return;

            const wrapper = document.createElement('div');
            wrapper.id = 'ai-fairy-wrapper';
            // 固定在左下角
            wrapper.style.position = 'absolute';
            wrapper.style.bottom = '20px';
            wrapper.style.left = '20px';
            wrapper.style.zIndex = '2000';
            wrapper.style.fontFamily = 'sans-serif';
            wrapper.style.display = 'none'; // 預設隱藏，進入地圖才顯示

            // --- 對話視窗 ---
            const chatWindow = document.createElement('div');
            chatWindow.id = 'ai-fairy-chat-window';
            chatWindow.style.display = 'none';
            chatWindow.style.width = '320px';
            chatWindow.style.height = '450px';
            chatWindow.style.backgroundColor = 'rgba(255, 255, 255, 0.95)';
            chatWindow.style.border = '2px solid #5c9fd6';
            chatWindow.style.borderRadius = '15px';
            chatWindow.style.boxShadow = '0 10px 25px rgba(0,0,0,0.5)';
            chatWindow.style.marginBottom = '15px';
            chatWindow.style.flexDirection = 'column';
            chatWindow.style.overflow = 'hidden';
            // 阻擋點擊穿透到遊戲
            chatWindow.addEventListener('mousedown', e => e.stopPropagation());
            chatWindow.addEventListener('touchstart', e => e.stopPropagation());
            chatWindow.addEventListener('keydown', e => e.stopPropagation());

            // 標題列
            const header = document.createElement('div');
            header.style.backgroundColor = '#5c9fd6';
            header.style.color = 'white';
            header.style.padding = '10px 15px';
            header.style.fontWeight = 'bold';
            header.style.display = 'flex';
            header.style.justifyContent = 'space-between';
            header.style.alignItems = 'center';
            header.innerHTML = `
                <span>✨ 系統精靈助手</span>
                <span id="ai-fairy-close" style="cursor: pointer; font-size: 18px; line-height: 1;">✖</span>
            `;
            chatWindow.appendChild(header);

            // 歷史紀錄區
            const historyArea = document.createElement('div');
            historyArea.id = 'ai-fairy-history-area';
            historyArea.style.flex = '1';
            historyArea.style.padding = '15px';
            historyArea.style.overflowY = 'auto';
            historyArea.style.display = 'flex';
            historyArea.style.flexDirection = 'column';
            historyArea.style.gap = '15px';
            historyArea.style.scrollBehavior = 'smooth';
            chatWindow.appendChild(historyArea);

            // 進度條區
            const loadingArea = document.createElement('div');
            loadingArea.id = 'ai-fairy-loading-area';
            loadingArea.style.display = 'none';
            loadingArea.style.padding = '10px 15px';
            loadingArea.style.backgroundColor = '#f1f8ff';
            loadingArea.innerHTML = `
                <div style="font-size: 12px; color: #5c9fd6; margin-bottom: 5px; font-weight: bold;">精靈正在觀察與思考...</div>
                <div style="width: 100%; height: 6px; background-color: #ddd; border-radius: 3px; overflow: hidden;">
                    <div id="ai-fairy-progress-bar" style="width: 0%; height: 100%; background-color: #5c9fd6; transition: width 0.2s;"></div>
                </div>
            `;
            chatWindow.appendChild(loadingArea);

            // 輸入區
            const inputArea = document.createElement('div');
            inputArea.style.padding = '10px';
            inputArea.style.borderTop = '1px solid #ddd';
            inputArea.style.backgroundColor = '#fafafa';
            inputArea.style.display = 'flex';
            inputArea.style.flexDirection = 'column';
            inputArea.style.gap = '8px';

            const visionToggle = document.createElement('label');
            visionToggle.style.fontSize = '12px';
            visionToggle.style.color = '#555';
            visionToggle.style.cursor = 'pointer';
            visionToggle.style.display = 'flex';
            visionToggle.style.alignItems = 'center';
            visionToggle.style.gap = '5px';
            visionToggle.innerHTML = `<input type="checkbox" id="ai-fairy-use-vision" checked> 📸 讓精靈查看當前遊戲畫面`;
            inputArea.appendChild(visionToggle);

            const inputRow = document.createElement('div');
            inputRow.style.display = 'flex';
            inputRow.style.gap = '8px';

            const inputField = document.createElement('input');
            inputField.id = 'ai-fairy-input';
            inputField.type = 'text';
            inputField.placeholder = '請問需要什麼幫助？...';
            inputField.style.flex = '1';
            inputField.style.padding = '8px 12px';
            inputField.style.border = '1px solid #ccc';
            inputField.style.borderRadius = '20px';
            inputField.style.outline = 'none';
            inputField.style.fontSize = '14px';

            const sendBtn = document.createElement('button');
            sendBtn.id = 'ai-fairy-send';
            sendBtn.innerText = '發送';
            sendBtn.style.padding = '8px 15px';
            sendBtn.style.backgroundColor = '#5c9fd6';
            sendBtn.style.color = 'white';
            sendBtn.style.border = 'none';
            sendBtn.style.borderRadius = '20px';
            sendBtn.style.cursor = 'pointer';
            sendBtn.style.fontWeight = 'bold';

            inputRow.appendChild(inputField);
            inputRow.appendChild(sendBtn);
            inputArea.appendChild(inputRow);
            chatWindow.appendChild(inputArea);

            // --- 左下角圓形小圖示 ---
            const iconContainer = document.createElement('div');
            iconContainer.id = 'ai-fairy-icon-container';
            iconContainer.style.position = 'relative';
            iconContainer.style.width = '40px';
            iconContainer.style.height = '40px';
            iconContainer.style.cursor = 'pointer';

            const icon = document.createElement('div');
            icon.id = 'ai-fairy-icon';
            icon.style.width = '100%';
            icon.style.height = '100%';
            icon.style.backgroundColor = 'rgba(255,255,255,0.8)';
            icon.style.border = '2px solid #5c9fd6';
            icon.style.borderRadius = '50%';
            icon.style.boxShadow = '0 4px 10px rgba(0,0,0,0.3)';
            icon.style.display = 'flex';
            icon.style.justifyContent = 'center';
            icon.style.alignItems = 'center';
            icon.style.overflow = 'hidden';
            icon.style.transition = 'transform 0.2s';
            icon.innerHTML = '<span style="font-size: 20px;">🧚</span>'; 
            
            // 加入 hover 效果
            iconContainer.onmouseover = () => icon.style.transform = 'scale(1.1)';
            iconContainer.onmouseout = () => icon.style.transform = 'scale(1)';
            
            // 紅色驚嘆號提示
            const badge = document.createElement('div');
            badge.id = 'ai-fairy-badge';
            badge.innerText = '❗️';
            badge.style.position = 'absolute';
            badge.style.top = '-8px';
            badge.style.right = '-8px';
            badge.style.fontSize = '18px';
            badge.style.display = 'none'; // 預設隱藏
            badge.style.pointerEvents = 'none';
            badge.style.zIndex = '10';

            iconContainer.appendChild(icon);
            iconContainer.appendChild(badge);
            
            wrapper.appendChild(chatWindow);
            wrapper.appendChild(iconContainer);
            document.body.appendChild(wrapper);

            // --- 綁定事件 ---
            iconContainer.addEventListener('click', (e) => {
                e.stopPropagation();
                // 點擊時隱藏提示
                const currentBadge = document.getElementById('ai-fairy-badge');
                if (currentBadge) currentBadge.style.display = 'none';
                
                if (chatWindow.style.display === 'none') {
                    // 如果在戰鬥中，檢查是否暫停計時器
                    if ($gameParty.inBattle() && typeof window.Kurimanju !== 'undefined' && window.Kurimanju.pauseTimer) {
                        window.Kurimanju.pauseTimer();
                    }
                    chatWindow.style.display = 'flex';
                    this.renderHistory();
                    inputField.disabled = false;
                } else {
                    // 關閉時，如果在戰鬥中，恢復計時器
                    if ($gameParty.inBattle() && typeof window.Kurimanju !== 'undefined' && window.Kurimanju.resumeTimer) {
                        window.Kurimanju.resumeTimer();
                    }
                    chatWindow.style.display = 'none';
                }
            });

            header.querySelector('#ai-fairy-close').addEventListener('click', () => {
                // 關閉時，如果在戰鬥中，恢復計時器
                if ($gameParty.inBattle() && typeof window.Kurimanju !== 'undefined' && window.Kurimanju.resumeTimer) {
                    window.Kurimanju.resumeTimer();
                }
                chatWindow.style.display = 'none';
            });

            const handleSend = () => {
                const text = inputField.value.trim();
                if (!text || isWaitingForAI) return;
                if (!window.NwcsAiHelp || !window.NwcsAiHelp.proxyUrl()) {
                    alert("精靈的通訊網址還沒設定。");
                    return;
                }

                if ($gameParty.inBattle() && COST_PER_ASK > 0) {
                    if ($gameParty.gold() < COST_PER_ASK) {
                        alert(`金幣不足！呼叫小精靈需要 ${COST_PER_ASK} G。`);
                        return;
                    }
                    const confirmAsk = confirm(`戰鬥中呼叫小精靈將扣除 ${COST_PER_ASK} G，確定要發問嗎？`);
                    if (!confirmAsk) return;
                    $gameParty.loseGold(COST_PER_ASK);
                }

                const useVision = document.getElementById('ai-fairy-use-vision').checked;
                inputField.value = '';
                fetchAIResponse(text, useVision);
            };

            sendBtn.addEventListener('click', handleSend);
            inputField.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') handleSend();
            });

            // 啟動時嘗試截取圖示
            this.extractIconImage();
        }

        static extractIconImage() {
            const bitmap = ImageManager.loadCharacter(FAIRY_IMAGE);
            if (!bitmap.isReady()) {
                bitmap.addLoadListener(() => this.extractIconImage());
                return;
            }
            const pw = bitmap.width / 12;
            const ph = bitmap.height / 8;
            const n = FAIRY_INDEX;
            const sx = (n % 4 * 3 + 1) * pw; // 正面中間那格
            const sy = (Math.floor(n / 4) * 4 + 0) * ph; // 面朝下
            
            const canvas = document.createElement('canvas');
            canvas.width = pw;
            canvas.height = ph;
            const ctx = canvas.getContext('2d');
            // 只畫出小精靈的頭部/身體
            ctx.drawImage(bitmap._canvas || bitmap._image, sx, sy, pw, ph, 0, 0, pw, ph);
            
            const iconDiv = document.getElementById('ai-fairy-icon');
            if (iconDiv) {
                let img = document.getElementById('ai-fairy-icon-img');
                if (!img) {
                    img = document.createElement('img');
                    img.id = 'ai-fairy-icon-img';
                    iconDiv.insertBefore(img, iconDiv.firstChild);
                }
                img.src = canvas.toDataURL();
                img.style.width = '150%';
                img.style.height = '150%';
                img.style.objectFit = 'cover';
                img.style.objectPosition = 'center 20%';
                
                const emojiSpan = iconDiv.querySelector('span');
                if (emojiSpan) emojiSpan.remove();
            }
        }

        static renderHistory() {
            const historyArea = document.getElementById('ai-fairy-history-area');
            if (!historyArea) return;
            
            historyArea.innerHTML = '';
            const history = $gameSystem.getAIFairyHistory();

            if (history.length === 0) {
                historyArea.innerHTML = `<div style="text-align:center; color:#999; font-size:12px; margin-top:20px;">這裡是與小精靈的通訊紀錄。<br>有什麼困難都可以問我喔！</div>`;
                return;
            }

            history.forEach(msg => {
                const bubbleWrapper = document.createElement('div');
                bubbleWrapper.style.display = 'flex';
                bubbleWrapper.style.flexDirection = 'column';
                bubbleWrapper.style.maxWidth = '85%';

                const bubble = document.createElement('div');
                bubble.style.padding = '10px 14px';
                bubble.style.borderRadius = '15px';
                bubble.style.fontSize = '14px';
                bubble.style.lineHeight = '1.4';
                bubble.style.wordWrap = 'break-word';

                const timeStr = document.createElement('div');
                timeStr.style.fontSize = '10px';
                timeStr.style.color = '#aaa';
                timeStr.style.marginTop = '4px';
                timeStr.innerText = msg.time;

                if (msg.role === 'user') {
                    bubbleWrapper.style.alignSelf = 'flex-end';
                    bubble.style.backgroundColor = '#5c9fd6';
                    bubble.style.color = 'white';
                    bubble.style.borderBottomRightRadius = '4px';
                    timeStr.style.textAlign = 'right';
                    bubble.innerText = msg.content;
                } else {
                    bubbleWrapper.style.alignSelf = 'flex-start';
                    bubble.style.backgroundColor = '#f1f1f1';
                    bubble.style.color = '#333';
                    bubble.style.borderBottomLeftRadius = '4px';
                    timeStr.style.textAlign = 'left';
                    
                    let text = msg.content;
                    
                    // KaTeX 數學公式解析
                    if (window.katex) {
                        try {
                            // 先處理換行
                            text = text.replace(/\n/g, '<br>');
                            
                            text = text.replace(/\$\$(.*?)\$\$/gs, (match, formula) => {
                                return window.katex.renderToString(formula, { throwOnError: false, displayMode: true });
                            }).replace(/\$(.*?)\$/g, (match, formula) => {
                                return window.katex.renderToString(formula, { throwOnError: false, displayMode: false });
                            });
                        } catch (e) {
                            console.warn("KaTeX Error", e);
                        }
                    } else {
                        text = text.replace(/\n/g, '<br>');
                    }
                    
                    // 簡易 Markdown 解析 (處理 **, ## 等)
                    text = text.replace(/^### (.*$)/gim, '<h3 style="margin: 5px 0; color: #5c9fd6;">$1</h3>');
                    text = text.replace(/^## (.*$)/gim, '<h2 style="margin: 8px 0; color: #5c9fd6;">$1</h2>');
                    text = text.replace(/^# (.*$)/gim, '<h1 style="margin: 10px 0; color: #5c9fd6;">$1</h1>');
                    text = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
                    text = text.replace(/\*(.*?)\*/g, '<em>$1</em>');
                    
                    bubble.innerHTML = text;
                }

                bubbleWrapper.appendChild(bubble);
                bubbleWrapper.appendChild(timeStr);
                historyArea.appendChild(bubbleWrapper);
            });

            // 捲動到最底
            historyArea.scrollTop = historyArea.scrollHeight;
        }

        static setLoading(isLoading) {
            const loadingArea = document.getElementById('ai-fairy-loading-area');
            const inputField = document.getElementById('ai-fairy-input');
            const sendBtn = document.getElementById('ai-fairy-send');
            const progressBar = document.getElementById('ai-fairy-progress-bar');
            
            if (!loadingArea) return;

            if (isLoading) {
                loadingArea.style.display = 'block';
                inputField.disabled = true;
                sendBtn.disabled = true;
                sendBtn.style.backgroundColor = '#ccc';
                
                // 假進度條動畫
                progressBar.style.width = '0%';
                this._progressInterval = setInterval(() => {
                    let current = parseFloat(progressBar.style.width) || 0;
                    if (current < 90) {
                        progressBar.style.width = (current + Math.random() * 15) + '%';
                    }
                }, 500);
            } else {
                if (this._progressInterval) clearInterval(this._progressInterval);
                progressBar.style.width = '100%';
                setTimeout(() => {
                    loadingArea.style.display = 'none';
                    progressBar.style.width = '0%';
                    inputField.disabled = false;
                    sendBtn.disabled = false;
                    sendBtn.style.backgroundColor = '#5c9fd6';
                    inputField.focus();
                }, 300);
            }
        }

        static toggleVisibility(visible) {
            const wrapper = document.getElementById('ai-fairy-wrapper');
            if (wrapper) {
                wrapper.style.display = visible ? 'block' : 'none';
                // 如果隱藏圖示，同時關閉對話框
                if (!visible) {
                    const chatWindow = document.getElementById('ai-fairy-chat-window');
                    if (chatWindow) chatWindow.style.display = 'none';
                }
            }
        }
    }

    // -------------------------------------------------------------------------
    // 6. 生命週期與 MZ 引擎掛鉤
    // -------------------------------------------------------------------------

    const _Scene_Boot_start = Scene_Boot.prototype.start;
    Scene_Boot.prototype.start = function() {
        _Scene_Boot_start.call(this);
        loadKaTeX();
        AIFairyUI.init(); // 初始化 UI DOM
    };

    // 只有在 Map 場景才顯示左下角精靈
    const _Scene_Map_onMapLoaded = Scene_Map.prototype.onMapLoaded;
    Scene_Map.prototype.onMapLoaded = function() {
        _Scene_Map_onMapLoaded.call(this);
        AIFairyUI.toggleVisibility(true);
    };

    const _Scene_Map_terminate = Scene_Map.prototype.terminate;
    Scene_Map.prototype.terminate = function() {
        _Scene_Map_terminate.call(this);
        AIFairyUI.toggleVisibility(false);
    };

    // 戰鬥畫面現在也顯示左下角精靈
    const _Scene_Battle_start = Scene_Battle.prototype.start;
    Scene_Battle.prototype.start = function() {
        _Scene_Battle_start.call(this);
        AIFairyUI.toggleVisibility(true);
    };

    const _Scene_Battle_terminate = Scene_Battle.prototype.terminate;
    Scene_Battle.prototype.terminate = function() {
        _Scene_Battle_terminate.call(this);
        AIFairyUI.toggleVisibility(false);
    };

})();
