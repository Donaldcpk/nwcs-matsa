/*:
 * @target MZ
 * @plugindesc [v2026.Grid.Fix] 棋盤式閃爍抽獎機 (防崩潰修復版)
 * @author 專業 RPG Maker 開發者
 *
 * @help
 * Premium_Roulette.js
 * * 修正了「連打 Enter 導致 scale of null 崩潰」的問題。
 * 捨棄 setInterval，全面改用 MZ 原生 update 迴圈，並加入 0.5 秒防誤觸冷卻。
 * * @param PrizePool
 * @text 獎池設定
 * @type struct<Prize>[]
 * @default []
 *
 * @command StartRoulette
 * @text 開始抽獎機
 * @desc 打開高質感抽獎 UI。
 */

/*~struct~Prize:
 * @param type
 * @text 物品類型
 * @type select
 * @option 金幣 (Gold)
 * @value gold
 * @option 道具 (Item)
 * @value item
 * @option 武器 (Weapon)
 * @value weapon
 * @option 防具 (Armor)
 * @value armor
 * @option 公共事件 (Event/Battle)
 * @value commonevent
 * @default item
 *
 * @param id
 * @text 物品或事件 ID
 * @type number
 * @default 1
 *
 * @param amount
 * @text 數量 / 額度
 * @type number
 * @default 1
 *
 * @param customIcon
 * @text 自訂圖示ID (選填)
 * @type number
 * @default 0
 *
 * @param weight
 * @text 抽選權重
 * @type number
 * @default 10
 *
 * @param rarity
 * @text 稀有度 (UI顏色)
 * @type select
 * @option 普通 (白)
 * @value 0
 * @option 稀有 (藍)
 * @value 1
 * @option 史詩 (紫)
 * @value 2
 * @option 傳說 (金)
 * @value 3
 * @option 詛全面 (紅)
 * @value 4
 * @default 0
 */

(() => {
    const pluginName = "Premium_Roulette";
    const parameters = PluginManager.parameters(pluginName);
    
    let globalPrizePool = [];
    try {
        globalPrizePool = JSON.parse(parameters['PrizePool'] || '[]').map(i => JSON.parse(i));
    } catch (e) { console.error("獎池解析失敗"); }

    PluginManager.registerCommand(pluginName, "StartRoulette", args => {
        if (globalPrizePool.length === 0) return $gameMessage.add("獎池未設定！");
        SceneManager.push(Scene_PremiumRoulette);
    });

    function Scene_PremiumRoulette() { this.initialize(...arguments); }
    Scene_PremiumRoulette.prototype = Object.create(Scene_MenuBase.prototype);
    Scene_PremiumRoulette.prototype.constructor = Scene_PremiumRoulette;

    Scene_PremiumRoulette.prototype.initialize = function() {
        Scene_MenuBase.prototype.initialize.call(this);
        this._phase = 'ready'; 
        this._sprites = [];
        this._targetIndex = 0;
        this._currentIndex = 0;
        
        // 跳動動畫控制
        this._jumpDelay = 2;       
        this._jumpTimer = 0;       
        this._stepsRemaining = 0;  
        
        // 防崩潰動畫控制 (原生 Update 用)
        this._exitDelay = 0;
        this._bouncePhase = 0;
    };

    Scene_PremiumRoulette.prototype.create = function() {
        Scene_MenuBase.prototype.create.call(this);
        this.createBackgroundDesign();
        this.createGrid();
        this.createCursor();
        this.createUI();
        this.determineWinner();
    };

    Scene_PremiumRoulette.prototype.createBackgroundDesign = function() {
        this._bgGraphics = new PIXI.Graphics();
        this._bgGraphics.beginFill(0x000000, 0.85);
        this._bgGraphics.drawRect(0, 0, Graphics.width, Graphics.height);
        this._bgGraphics.endFill();
        this.addChild(this._bgGraphics);
    };

    Scene_PremiumRoulette.prototype.createGrid = function() {
        this._gridContainer = new Sprite();
        this.addChild(this._gridContainer);

        const poolSize = globalPrizePool.length;
        let cols = poolSize > 0 ? Math.ceil(Math.sqrt(poolSize)) : 1;
        cols = Math.max(1, Math.min(cols, 8));
        const rows = Math.ceil(poolSize / cols);
        let cellSize = 100;
        let spacing = 20;

        let totalWidth = cols * cellSize + (cols - 1) * spacing;
        let totalHeight = rows * cellSize + (rows - 1) * spacing;
        const margin = 48;
        while (totalWidth > Graphics.width - margin && cellSize > 52) {
            cellSize -= 6;
            spacing = Math.max(10, spacing - 2);
            totalWidth = cols * cellSize + (cols - 1) * spacing;
            totalHeight = rows * cellSize + (rows - 1) * spacing;
        }
        
        const startX = (Graphics.width - totalWidth) / 2 + (cellSize / 2);
        const startY = (Graphics.height - totalHeight) / 2 + (cellSize / 2);

        const rarityColors = [0xAAAAAA, 0x4169E1, 0x8A2BE2, 0xFFD700, 0xFF0000];

        this._rouletteCellSize = cellSize;

        for (let i = 0; i < poolSize; i++) {
            const col = i % cols;
            const row = Math.floor(i / cols);
            const x = startX + col * (cellSize + spacing);
            const y = startY + row * (cellSize + spacing);
            const prize = globalPrizePool[i];

            const bg = new PIXI.Graphics();
            const color = rarityColors[Number(prize.rarity) || 0];
            bg.lineStyle(3, color, 0.8);
            bg.beginFill(0x222222, 0.8);
            bg.drawRoundedRect(-cellSize/2, -cellSize/2, cellSize, cellSize, 10);
            bg.endFill();
            bg.x = x;
            bg.y = y;
            this._gridContainer.addChild(bg);

            const sprite = new Sprite();
            sprite.anchor.set(0.5);
            sprite.x = x;
            sprite.y = y;
            this.setSpriteIcon(sprite, prize);
            this._sprites.push(sprite);
            this._gridContainer.addChild(sprite);
        }
    };

    Scene_PremiumRoulette.prototype.createCursor = function() {
        const cs = this._rouletteCellSize || 100;
        const pad = 10;
        const side = cs + pad;
        this._cursor = new PIXI.Graphics();
        this._cursor.lineStyle(6, 0xFFFFFF, 1);
        this._cursor.drawRoundedRect(-side / 2, -side / 2, side, side, 12);
        this._cursor.visible = false;
        this.addChild(this._cursor);
    };

    Scene_PremiumRoulette.prototype.createUI = function() {
        this._helpText = new Sprite(new Bitmap(Graphics.width, 100));
        this._helpText.y = Graphics.height - 120;
        this._helpText.bitmap.fontSize = 28;
        this._helpText.bitmap.drawText("按下【確定】開始抽取！", 0, 0, Graphics.width, 100, 'center');
        this.addChild(this._helpText);
        
        this._prizeText = new Sprite(new Bitmap(Graphics.width, 100));
        this._prizeText.y = 50;
        this._prizeText.bitmap.fontSize = 36;
        this.addChild(this._prizeText);
    };

    Scene_PremiumRoulette.prototype.setSpriteIcon = function(sprite, prize) {
        let iconIndex = 314;
        if (prize.type === 'item') iconIndex = $dataItems[Number(prize.id)]?.iconIndex || 0;
        if (prize.type === 'weapon') iconIndex = $dataWeapons[Number(prize.id)]?.iconIndex || 0;
        if (prize.type === 'armor') iconIndex = $dataArmors[Number(prize.id)]?.iconIndex || 0;
        if (prize.type === 'commonevent') iconIndex = 87; 
        if (prize.customIcon && Number(prize.customIcon) > 0) iconIndex = Number(prize.customIcon);
        
        const bitmap = ImageManager.loadSystem("IconSet");
        const pw = ImageManager.iconWidth;
        const ph = ImageManager.iconHeight;
        const sx = (iconIndex % 16) * pw;
        const sy = Math.floor(iconIndex / 16) * ph;
        
        sprite.bitmap = bitmap;
        sprite.setFrame(sx, sy, pw, ph);
        const cs = this._rouletteCellSize || 100;
        sprite.scale.set(Math.min(1.5, Math.max(0.55, cs / 72)));
        sprite.prizeData = prize; 
    };

    Scene_PremiumRoulette.prototype.determineWinner = function() {
        const totalWeight = globalPrizePool.reduce((sum, item) => sum + Number(item.weight), 0);
        let randomNum = Math.random() * totalWeight;
        for (let i = 0; i < globalPrizePool.length; i++) {
            randomNum -= Number(globalPrizePool[i].weight);
            if (randomNum <= 0) {
                this._targetIndex = i;
                break;
            }
        }
    };

    // ========================================================================
    // MZ 原生 Update 迴圈：完全杜絕崩潰
    // ========================================================================
    Scene_PremiumRoulette.prototype.update = function() {
        Scene_MenuBase.prototype.update.call(this);
        
        if (this._phase === 'ready' && (Input.isTriggered('ok') || TouchInput.isTriggered())) {
            this._phase = 'spinning';
            this._helpText.opacity = 0;
            this._cursor.visible = true;
            
            const baseSpins = globalPrizePool.length * 4;
            this._stepsRemaining = baseSpins + this._targetIndex;
            this._jumpDelay = 2; 
        }
        
        if (this._phase === 'spinning') {
            this._jumpTimer++;
            if (this._jumpTimer >= this._jumpDelay) {
                this._jumpTimer = 0;
                this._stepsRemaining--;
                
                this._currentIndex = (this._currentIndex + 1) % globalPrizePool.length;
                this.updateCursorPosition();
                AudioManager.playSe({ name: "Cursor1", volume: 50, pitch: 150 });

                if (this._stepsRemaining < globalPrizePool.length * 2) this._jumpDelay = 4;
                if (this._stepsRemaining < globalPrizePool.length) this._jumpDelay = 8;
                if (this._stepsRemaining < 5) this._jumpDelay = 20;
                if (this._stepsRemaining < 2) this._jumpDelay = 35; 

                // 輪盤停下
                if (this._stepsRemaining <= 0) {
                    this._phase = 'done';
                    this.setupWinState(); // 初始化獎品顯示
                }
            }
        }

        // 停下後的狀態處理 (動畫與退出)
        if (this._phase === 'done') {
            const sprite = this._sprites[this._currentIndex];
            
            // 原生放大彈跳動畫 (不再使用 setInterval，徹底解決 null 崩潰)
            if (this._bouncePhase <= Math.PI) {
                this._bouncePhase += 0.2;
                if (sprite && sprite.scale) {
                    sprite.scale.set(1.5 + Math.sin(this._bouncePhase) * 0.5);
                }
                if (this._bouncePhase > Math.PI && sprite && sprite.scale) {
                    sprite.scale.set(2.0);
                }
            }

            // 防連打冷卻計時 (30 幀 = 0.5 秒)
            if (this._exitDelay > 0) {
                this._exitDelay--;
            } else {
                // 冷卻結束，允許離開
                if (Input.isTriggered('ok') || TouchInput.isTriggered()) {
                    this._phase = 'exiting'; // 鎖定狀態防止重複觸發
                    if (sprite && sprite.prizeData && sprite.prizeData.type === 'commonevent') {
                        $gameTemp.reserveCommonEvent(Number(sprite.prizeData.id));
                    }
                    SceneManager.pop();
                }
            }
        }
    };

    Scene_PremiumRoulette.prototype.updateCursorPosition = function() {
        const targetSprite = this._sprites[this._currentIndex];
        this._cursor.x = targetSprite.x;
        this._cursor.y = targetSprite.y;
    };

    Scene_PremiumRoulette.prototype.setupWinState = function() {
        const sprite = this._sprites[this._currentIndex];
        const prize = sprite.prizeData;
        
        // 設定防連打冷卻 (30 幀)
        this._exitDelay = 30;
        this._bouncePhase = 0;
        
        const rarityColorsStr = ['#FFFFFF', '#4169E1', '#8A2BE2', '#FFD700', '#FF0000'];
        const color = rarityColorsStr[Number(prize.rarity) || 0];
        
        // 音效播放
        if (Number(prize.rarity) === 4) {
            AudioManager.playSe({ name: "Up7", volume: 100, pitch: 100 });
        } else if (Number(prize.rarity) >= 2) {
            AudioManager.playMe({ name: "Victory1", volume: 100, pitch: 100 });
        } else {
            AudioManager.playSe({ name: "Item3", volume: 100, pitch: 100 });
        }

        // 派發獎勵與取得名稱
        let name = "";
        const amount = Number(prize.amount);
        if (prize.type === 'gold') { $gameParty.gainGold(amount); name = amount + " G"; }
        if (prize.type === 'item') { const item = $dataItems[Number(prize.id)]; $gameParty.gainItem(item, amount); name = item.name + " x" + amount; }
        if (prize.type === 'weapon') { const w = $dataWeapons[Number(prize.id)]; $gameParty.gainItem(w, amount); name = w.name + " x" + amount; }
        if (prize.type === 'armor') { const a = $dataArmors[Number(prize.id)]; $gameParty.gainItem(a, amount); name = a.name + " x" + amount; }
        if (prize.type === 'commonevent') { 
            const ce = $dataCommonEvents[Number(prize.id)];
            name = ce ? ce.name : "特殊事件"; 
        }

        // 顯示文字
        this._prizeText.bitmap.clear();
        this._prizeText.bitmap.textColor = color;
        this._prizeText.bitmap.drawText(`獲得：${name}`, 0, 0, Graphics.width, 100, 'center');
        
        this._helpText.bitmap.clear();
        this._helpText.bitmap.drawText("點擊畫面離開", 0, 0, Graphics.width, 100, 'center');
        this._helpText.opacity = 255;
    };

})();