/*:
 * @target MZ
 * @plugindesc 【數界雷達 v9.2】 - 傳送/切場景時防 $gamePlayer 未定義；事件 note 防呆
 * @author Gemini AI
 *
 * @help
 * ============================================================================
 * 數界雷達 (MathVerse Radar) - v9.1 操作手冊
 * ============================================================================
 *
 * 【v9.1 緊急修復：閃退問題】
 * 1. 記憶體管理 (Memory Management)
 * - 舊版問題：開啟地圖時產生的「AR快照」未被正確銷毀，導致記憶體堆積崩潰。
 * - 新版修復：加入 terminate() 函數，關閉地圖時強制釋放圖像資源。
 *
 * 2. 輸入邏輯重寫 (Input Overhaul)
 * - 移除所有 Sprite_Button 依賴。
 * - 改用「純座標檢測」：點擊畫面右上角或按 ESC 必定返回，不會觸發錯誤。
 *
 * 3. 智慧洪水演算法 (Smart Flood Fill)
 * - 系統會從主角位置開始掃描連通性。
 * - 只有真正能走到的地板才會被計入 100%。
 *
 * ============================================================================
 * @param OptionName
 * @text 選項顯示名稱
 * @type string
 * @default 數界雷達顯示
 *
 * @param UnlockItemId
 * @text 解鎖道具 ID
 * @type item
 * @default 2
 *
 * @param MinimapY
 * @text 小地圖 Y 軸位置
 * @type number
 * @default 70
 *
 */

(() => {
    const pluginName = "MathVerse_Minimap";
    const parameters = PluginManager.parameters(pluginName);
    const optionName = parameters['OptionName'] || "數界雷達顯示";
    const unlockItemId = Number(parameters['UnlockItemId'] || 2);
    const minimapY = Number(parameters['MinimapY'] || 70);

    // ========================================================================
    //  1. 設定與解鎖
    // ========================================================================
    
    ConfigManager.lfsMinimapVisible = true; 

    const _ConfigManager_makeData = ConfigManager.makeData;
    ConfigManager.makeData = function() {
        const config = _ConfigManager_makeData.call(this);
        config.lfsMinimapVisible = this.lfsMinimapVisible;
        return config;
    };

    const _ConfigManager_applyData = ConfigManager.applyData;
    ConfigManager.applyData = function(config) {
        _ConfigManager_applyData.call(this, config);
        this.lfsMinimapVisible = this.readFlag(config, 'lfsMinimapVisible', true);
    };

    const _Window_Options_addGeneralOptions = Window_Options.prototype.addGeneralOptions;
    Window_Options.prototype.addGeneralOptions = function() {
        _Window_Options_addGeneralOptions.call(this);
        if ($gameParty.hasItem($dataItems[unlockItemId])) {
            this.addCommand(optionName, 'lfsMinimapVisible');
        }
    };

    // ========================================================================
    //  2. 探索核心 (智慧連通性計算)
    // ========================================================================

    const _Game_System_initialize = Game_System.prototype.initialize;
    Game_System.prototype.initialize = function() {
        _Game_System_initialize.call(this);
        this._lfsExploredData = {}; 
        this._lfsTotalReachableCache = {}; 
    };

    function markExplored(x, y) {
        const mapId = $gameMap.mapId();
        if (!$gameSystem._lfsExploredData[mapId]) {
            $gameSystem._lfsExploredData[mapId] = {};
        }
        const range = 2; 
        for (let ix = -range; ix <= range; ix++) {
            for (let iy = -range; iy <= range; iy++) {
                if ($gameMap.isValid(x + ix, y + iy)) {
                    const key = `${Math.floor(x + ix)}_${Math.floor(y + iy)}`;
                    $gameSystem._lfsExploredData[mapId][key] = true;
                }
            }
        }
    }

    function isExplored(x, y) {
        const mapId = $gameMap.mapId();
        if (!$gameSystem._lfsExploredData[mapId]) return false;
        return !!$gameSystem._lfsExploredData[mapId][`${Math.floor(x)}_${Math.floor(y)}`];
    }

    // Flood Fill 算法
    function calculateReachableTiles() {
        const mapId = $gameMap.mapId();
        const width = $gameMap.width();
        const height = $gameMap.height();
        
        if ($gameSystem._lfsTotalReachableCache[mapId]) {
            return $gameSystem._lfsTotalReachableCache[mapId];
        }

        if (!$gamePlayer || typeof $gamePlayer.x !== "number") {
            return 0;
        }

        let visited = new Uint8Array(width * height);
        let queue = [];
        let count = 0;

        const startX = Math.floor($gamePlayer.x);
        const startY = Math.floor($gamePlayer.y);
        
        queue.push({x: startX, y: startY});
        visited[startY * width + startX] = 1;
        count++;

        const dirs = [2, 4, 6, 8];

        while (queue.length > 0) {
            const current = queue.shift();
            for (const d of dirs) {
                if ($gameMap.isPassable(current.x, current.y, d)) {
                    let nx = current.x;
                    let ny = current.y;
                    if (d === 2) ny++;
                    if (d === 4) nx--;
                    if (d === 6) nx++;
                    if (d === 8) ny--;

                    if ($gameMap.isValid(nx, ny)) {
                        const index = ny * width + nx;
                        if (visited[index] === 0) {
                            visited[index] = 1;
                            count++;
                            queue.push({x: nx, y: ny});
                        }
                    }
                }
            }
        }
        $gameSystem._lfsTotalReachableCache[mapId] = count;
        return count;
    }

    function getExplorationRate() {
        const mapId = $gameMap.mapId();
        if (!$gameSystem._lfsExploredData[mapId]) return 0;
        
        const totalReachable = calculateReachableTiles();
        if (totalReachable === 0) return 0;

        let exploredCount = 0;
        const exploredData = $gameSystem._lfsExploredData[mapId];
        
        for (const key in exploredData) {
            if (exploredData[key]) {
                const [sx, sy] = key.split('_').map(Number);
                if ($gameMap.isPassable(sx, sy, 2) || $gameMap.isPassable(sx, sy, 4) ||
                    $gameMap.isPassable(sx, sy, 6) || $gameMap.isPassable(sx, sy, 8)) {
                    exploredCount++;
                }
            }
        }
        
        let rate = Math.floor((exploredCount / totalReachable) * 100);
        return Math.min(rate, 100);
    }

    // ========================================================================
    //  3. LFS 小地圖視窗
    // ========================================================================

    class Window_LFSScanner extends Window_Base {
        constructor(rect) {
            super(rect);
            this.opacity = 0;
            this._scanAngle = 0;
        }

        update() {
            super.update();
            const hasItem = $gameParty.hasItem($dataItems[unlockItemId]);
            const isOptionOn = ConfigManager.lfsMinimapVisible;

            if (!hasItem || !isOptionOn) {
                this.visible = false;
                return; 
            }
            this.visible = true;
            if (!$gameMap || !$gamePlayer) {
                return;
            }
            this.processTouch();
            this.contents.clear();
            markExplored($gamePlayer.x, $gamePlayer.y);
            this.drawLFSBackground();
            this.drawFoggyGrid(); 
            this.drawRadarEvents(); 
            this.drawRadarScan(); 
            this.drawPlayerNode();
        }

        processTouch() {
            if (this.visible && TouchInput.isTriggered()) {
                const tx = TouchInput.x;
                const ty = TouchInput.y;
                if (tx >= this.x && tx <= this.x + this.width &&
                    ty >= this.y && ty <= this.y + this.height) {
                    SoundManager.playOk();
                    SceneManager.push(Scene_LFSFullMap);
                }
            }
        }

        drawLFSBackground() {
            const ctx = this.contents.context;
            ctx.fillStyle = "rgba(0, 20, 40, 0.85)";
            ctx.fillRect(0, 0, this.contents.width, this.contents.height);
            ctx.strokeStyle = "rgba(0, 255, 204, 0.6)";
            ctx.lineWidth = 1;
            ctx.strokeRect(0, 0, this.contents.width, this.contents.height);
        }

        drawFoggyGrid() {
            if (!$gamePlayer) return;
            const ctx = this.contents.context;
            const w = this.contents.width;
            const h = this.contents.height;
            const cx = w / 2;
            const cy = h / 2;
            const zoom = 10; 
            const rangeX = Math.ceil(w / 2 / zoom);
            const rangeY = Math.ceil(h / 2 / zoom);
            const offsetX = ($gamePlayer.x % 1) * zoom;
            const offsetY = ($gamePlayer.y % 1) * zoom;

            for (let dx = -rangeX; dx <= rangeX; dx++) {
                for (let dy = -rangeY; dy <= rangeY; dy++) {
                    const mapX = Math.floor($gamePlayer.x + dx);
                    const mapY = Math.floor($gamePlayer.y + dy);
                    if (!$gameMap.isValid(mapX, mapY)) continue; 

                    if (isExplored(mapX, mapY)) {
                        const drawX = cx + (dx * zoom) - offsetX;
                        const drawY = cy + (dy * zoom) - offsetY;
                        const isWall = !$gameMap.isPassable(mapX, mapY, 2) && 
                                       !$gameMap.isPassable(mapX, mapY, 4) && 
                                       !$gameMap.isPassable(mapX, mapY, 6) && 
                                       !$gameMap.isPassable(mapX, mapY, 8);
                        if (isWall) {
                            ctx.fillStyle = "rgba(0, 100, 100, 0.4)"; 
                            ctx.fillRect(drawX + 1, drawY + 1, zoom - 2, zoom - 2);
                        } else {
                            ctx.strokeStyle = "rgba(0, 255, 204, 0.3)"; 
                            ctx.lineWidth = 1;
                            ctx.strokeRect(drawX, drawY, zoom, zoom);
                        }
                    }
                }
            }
        }

        drawRadarEvents() {
            if (!$gameMap || !$gamePlayer) return;
            const ctx = this.contents.context;
            const cx = this.contents.width / 2;
            const cy = this.contents.height / 2;
            const zoom = 10;
            $gameMap.events().forEach(event => {
                if (!event || event._erased) return;
                const evData = event.event && event.event();
                if (!evData || typeof evData.note !== "string") return;
                const dist = Math.abs(event.x - $gamePlayer.x) + Math.abs(event.y - $gamePlayer.y);
                if (dist > 15) return;
                const note = evData.note;
                let color = null;
                if (note.includes("<LFS:enemy>")) color = "#ff3333"; 
                else if (note.includes("<LFS:item>")) color = "#ffcc00"; 
                else if (note.includes("<LFS:npc>")) color = "#33ccff";  
                if (color) {
                    const dx = (event.x - $gamePlayer.x) * zoom;
                    const dy = (event.y - $gamePlayer.y) * zoom;
                    const offsetX = ($gamePlayer.x % 1) * zoom;
                    const offsetY = ($gamePlayer.y % 1) * zoom;
                    const drawX = cx + dx - offsetX + (zoom/2); 
                    const drawY = cy + dy - offsetY + (zoom/2);
                    if (drawX > 0 && drawX < this.contents.width && drawY > 0 && drawY < this.contents.height) {
                        ctx.fillStyle = color;
                        ctx.beginPath();
                        ctx.arc(drawX, drawY, 3, 0, Math.PI * 2);
                        ctx.fill();
                    }
                }
            });
        }

        drawRadarScan() {
            const ctx = this.contents.context;
            const cx = this.contents.width / 2;
            const cy = this.contents.height / 2;
            const radius = Math.sqrt(cx*cx + cy*cy); 
            this._scanAngle += 0.08;
            if (this._scanAngle > Math.PI * 2) this._scanAngle = 0;
            ctx.save();
            ctx.beginPath();
            ctx.rect(0, 0, this.contents.width, this.contents.height);
            ctx.clip();
            ctx.beginPath();
            ctx.moveTo(cx, cy);
            ctx.lineTo(cx + Math.cos(this._scanAngle) * radius, cy + Math.sin(this._scanAngle) * radius);
            ctx.strokeStyle = "rgba(0, 255, 204, 0.8)";
            ctx.lineWidth = 2;
            ctx.stroke();
            for (let i = 1; i <= 8; i++) {
                const tailAngle = this._scanAngle - (i * 0.05);
                ctx.beginPath();
                ctx.moveTo(cx, cy);
                ctx.lineTo(cx + Math.cos(tailAngle) * radius, cy + Math.sin(tailAngle) * radius);
                ctx.strokeStyle = `rgba(0, 255, 204, ${0.2 - (i * 0.02)})`; 
                ctx.lineWidth = 2;
                ctx.stroke();
            }
            ctx.restore();
        }

        drawPlayerNode() {
            const ctx = this.contents.context;
            const cx = this.contents.width / 2;
            const cy = this.contents.height / 2;
            ctx.save();
            ctx.shadowBlur = 10;
            ctx.shadowColor = "#00ffcc";
            ctx.fillStyle = "#ffffff";
            ctx.beginPath();
            ctx.arc(cx, cy, 3, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
            
            this.contents.fontSize = 10;
            this.contents.fontFace = "Consolas";
            this.changeTextColor(ColorManager.normalColor());
            this.drawText("TAP FOR MAP", 0, this.contents.height - 28, this.contents.width, "center");
        }
    }

    // ========================================================================
    //  4. 全地圖場景 (Scene_LFSFullMap) - 防崩潰優化
    // ========================================================================

    class Scene_LFSFullMap extends Scene_MenuBase {
        
        createBackground() {
            this._backgroundSprite = new Sprite();
            // 【快照功能】
            this._backgroundSprite.bitmap = SceneManager.snap();
            this.addChild(this._backgroundSprite);
            
            const filter = new PIXI.filters.ColorMatrixFilter();
            filter.matrix = [
                0, 0, 0, 0, 0,
                0, 1, 0, 0, 0,
                0, 0, 1.5, 0, 0, 
                0, 0, 0, 1, 0
            ];
            filter.brightness(1.2, false); 
            this._backgroundSprite.filters = [filter];
            this._backgroundSprite.opacity = 255;
        }

        create() {
            super.create();
            this.createFullMapWindow();
            // 這裡不調用 createButtons() 來避免雙重建立
            this.createCustomHud(); 
        }

        // 【安全修復】覆寫掉系統預設的按鈕生成，避免產生看不見的系統按鈕造成衝突
        createButtons() {
            // 空函數：什麼都不做
        }

        // 建立我們自己的、安全的關閉按鈕
        createCustomHud() {
            // 畫一個簡單的文字按鈕，或者使用系統的 X
            this._closeLabel = new Sprite();
            this._closeLabel.bitmap = new Bitmap(100, 40);
            this._closeLabel.bitmap.fontSize = 20;
            this._closeLabel.bitmap.textColor = "#ffffff";
            this._closeLabel.bitmap.drawText("ESC 關閉", 0, 0, 100, 40, "right");
            this._closeLabel.x = Graphics.boxWidth - 110;
            this._closeLabel.y = 10;
            this.addChild(this._closeLabel);
            
            // 觸控區域設定
            this._touchArea = new Rectangle(Graphics.boxWidth - 120, 0, 120, 60);
        }

        update() {
            super.update();
            // 【防崩潰】直接檢測輸入，不依賴 Sprite_Button
            // 1. 鍵盤 ESC 或右鍵
            if (Input.isTriggered('cancel') || Input.isTriggered('menu') || TouchInput.isCancelled()) {
                this.safeClose();
            }
            // 2. 觸控點擊右上角
            if (TouchInput.isTriggered()) {
                const tx = TouchInput.x;
                const ty = TouchInput.y;
                if (tx >= this._touchArea.x && tx <= this._touchArea.x + this._touchArea.width &&
                    ty >= this._touchArea.y && ty <= this._touchArea.y + this._touchArea.height) {
                    this.safeClose();
                }
            }
        }

        // 【記憶體管理】安全關閉函數
        safeClose() {
            SoundManager.playCancel();
            this.popScene();
        }
        
        // 【關鍵修復】當場景結束時，銷毀快照，防止記憶體洩漏 (Crash)
        terminate() {
            super.terminate();
            if (this._backgroundSprite && this._backgroundSprite.bitmap) {
                this._backgroundSprite.bitmap.destroy();
                this._backgroundSprite.bitmap = null;
            }
        }

        createFullMapWindow() {
            const rect = new Rectangle(20, 20, Graphics.boxWidth - 40, Graphics.boxHeight - 40);
            this._fullMapWindow = new Window_LFSFullMap(rect);
            this.addWindow(this._fullMapWindow);
        }
    }

    // --- 全地圖視窗 ---
    class Window_LFSFullMap extends Window_Base {
        initialize(rect) {
            super.initialize(rect);
            this.backOpacity = 0; 
            this.refresh();
        }

        refresh() {
            if (this.contents) {
                this.contents.clear();
                this.drawFullMap();
                this.drawInfo();
            }
        }

        drawFullMap() {
            if (!$gameMap || !$gamePlayer) return;
            const ctx = this.contents.context;
            const w = this.contents.width;
            const h = this.contents.height;
            const mapW = $gameMap.width();
            const mapH = $gameMap.height();

            const rate = getExplorationRate();
            const isMastered = (rate >= 100);

            const themeColor = isMastered ? "rgba(255, 215, 0, 1)" : "rgba(0, 255, 255, 1)";
            const glowColor = isMastered ? "#FFD700" : "#00FFFF";
            const shadowBlurAmount = isMastered ? 20 : 0; 

            let zoom = Math.min((w - 40) / mapW, (h - 60) / mapH);
            zoom = Math.max(zoom, 4);
            zoom = Math.min(zoom, 30);

            const totalMapWidth = mapW * zoom;
            const totalMapHeight = mapH * zoom;
            const startX = (w - totalMapWidth) / 2;
            const startY = (h - totalMapHeight) / 2 + 10; 

            ctx.save();
            ctx.strokeStyle = themeColor;
            ctx.lineWidth = isMastered ? 3 : 2; 
            ctx.shadowBlur = shadowBlurAmount;
            ctx.shadowColor = glowColor;
            ctx.strokeRect(startX - 2, startY - 2, totalMapWidth + 4, totalMapHeight + 4);
            ctx.restore(); 

            for (let x = 0; x < mapW; x++) {
                for (let y = 0; y < mapH; y++) {
                    const drawX = startX + x * zoom;
                    const drawY = startY + y * zoom;

                    ctx.strokeStyle = "rgba(100, 200, 255, 0.1)"; 
                    ctx.lineWidth = 0.5;
                    ctx.strokeRect(drawX, drawY, zoom, zoom);

                    if (isExplored(x, y)) {
                         const isWall = !$gameMap.isPassable(x, y, 2) && 
                                        !$gameMap.isPassable(x, y, 4) &&
                                        !$gameMap.isPassable(x, y, 6) &&
                                        !$gameMap.isPassable(x, y, 8);
                         
                         if (isWall) {
                             ctx.fillStyle = "rgba(0, 150, 200, 0.4)";
                             ctx.fillRect(drawX + 1, drawY + 1, zoom - 2, zoom - 2);
                         } else {
                             ctx.fillStyle = isMastered ? "rgba(255, 223, 0, 0.15)" : "rgba(0, 255, 255, 0.15)";
                             ctx.fillRect(drawX + 1, drawY + 1, zoom - 2, zoom - 2);
                             
                             ctx.strokeStyle = themeColor;
                             ctx.lineWidth = 1;
                             ctx.strokeRect(drawX, drawY, zoom, zoom);
                         }
                    } 
                    
                    if (Math.floor($gamePlayer.x) === x && Math.floor($gamePlayer.y) === y) {
                        ctx.fillStyle = "#ffffff";
                        ctx.shadowBlur = 15;
                        ctx.shadowColor = "white";
                        ctx.beginPath();
                        ctx.arc(drawX + zoom/2, drawY + zoom/2, zoom/2, 0, Math.PI*2);
                        ctx.fill();
                        ctx.shadowBlur = 0; 
                    }
                }
            }
            this.drawFullMapEvents(startX, startY, zoom);
        }

        drawFullMapEvents(startX, startY, zoom) {
            if (!$gameMap) return;
            const ctx = this.contents.context;
            $gameMap.events().forEach(event => {
                if (!event || event._erased) return;
                const evData = event.event && event.event();
                if (!evData || typeof evData.note !== "string") return;
                const note = evData.note;
                let color = null;
                if (note.includes("<LFS:enemy>")) color = "#ff3333"; 
                else if (note.includes("<LFS:item>")) color = "#ffcc00"; 
                else if (note.includes("<LFS:npc>")) color = "#33ccff";  

                if (color) {
                    const ex = event.x;
                    const ey = event.y;
                    const drawX = startX + ex * zoom + zoom/2;
                    const drawY = startY + ey * zoom + zoom/2;
                    ctx.shadowBlur = 5;
                    ctx.shadowColor = color;
                    ctx.fillStyle = color;
                    ctx.beginPath();
                    ctx.arc(drawX, drawY, zoom/2.5, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.shadowBlur = 0;
                }
            });
        }

        drawInfo() {
            const rate = getExplorationRate();
            const isMastered = (rate >= 100);

            // 標題
            this.contents.fontSize = 28;
            this.changeTextColor(isMastered ? "#FFD700" : ColorManager.crisisColor());
            const titleText = isMastered ? "數界全域視圖 [COMPLETE]" : "數界全域視圖";
            this.drawText(titleText, 0, 0, this.contents.width, "center");

            // 垂直圖例
            this.contents.fontSize = 14;
            let legendY = 40; 
            const legendSpacing = 22; 

            this.changeTextColor("#ff5555");
            this.drawText("● 敵對反應", 20, legendY, 150, "left");
            
            legendY += legendSpacing;
            this.changeTextColor("#ffdd00");
            this.drawText("● 資源/機關", 20, legendY, 150, "left");
            
            legendY += legendSpacing;
            this.changeTextColor("#55ffff");
            this.drawText("● 中立單位", 20, legendY, 150, "left");

            // 解析度
            this.contents.fontSize = 18;
            this.changeTextColor(isMastered ? "#FFD700" : "#00ffff"); 
            this.drawText(`邏輯解析度: ${rate}%`, 20, 0, 200, "left");
        }
    }

    const _Scene_Map_createAllWindows = Scene_Map.prototype.createAllWindows;
    Scene_Map.prototype.createAllWindows = function() {
        _Scene_Map_createAllWindows.call(this);
        const rect = new Rectangle(10, minimapY, 140, 160);
        this._lfsWindow = new Window_LFSScanner(rect);
        this.addWindow(this._lfsWindow);
    };

})();