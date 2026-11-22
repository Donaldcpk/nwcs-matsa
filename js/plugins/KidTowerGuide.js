/*:
 * @target MZ
 * @plugindesc 大廳與無限之塔：一句大字加上箭頭。先拿寶箱，再去打機械人。
 * @author tower-setup
 *
 * 打贏機械人會自己跳下一層，所以塔裡不再叫學生去找下一層的門。
 * 第一次打贏機械人之後，箭頭會收起來；底下的大字仍然留著。
 */
function kidGuideStep(state) {
    const mapId = Number(state.mapId);
    if (mapId === 18) {
        const chests = [];
        if (!state.goldOpen) chests.push({ id: 26, x: state.goldX, y: state.goldY });
        if (!state.crownOpen) chests.push({ id: 17, x: state.crownX, y: state.crownY });
        if (chests.length > 0) {
            chests.sort(function(a, b) {
                const da = Math.abs(a.x - state.px) + Math.abs(a.y - state.py);
                const db = Math.abs(b.x - state.px) + Math.abs(b.y - state.py);
                return da - db;
            });
            const text = state.goldOpen || state.crownOpen
                ? "還有一個寶箱，走過去拿"
                : "走到寶箱，拿獎勵";
            return { eventId: chests[0].id, lines: [text] };
        }
        if (!state.enteredTower) return { eventId: 25, lines: ["走到右邊的門"] };
        return { eventId: 25, lines: ["回去打機械人"] };
    }
    if (mapId === 65) {
        const floor = Number(state.floor) || 0;
        if (floor > 100) return { eventId: 0, lines: ["你打完 100 層了！"] };
        const show = floor < 1 ? 1 : floor;
        return {
            eventId: 25,
            lines: ["打這隻機械人。贏了會自己去下一層。", "第 " + show + " 層 / 100"]
        };
    }
    if (mapId === 20) {
        return { eventId: 39, lines: ["跟他說話領獎", "再回塔裡打機械人"] };
    }
    return null;
}

function kidGuideDoorAllowed(goldOpen, crownOpen) {
    return !!(goldOpen && crownOpen);
}

// 箭頭圖預設朝下。目標在畫面外時，把箭頭貼在邊緣並轉向目標。
function kidGuideArrowPlacement(targetX, targetY, boxW, boxH, margin) {
    const onScreen = targetX >= margin && targetX <= boxW - margin
        && targetY >= margin && targetY <= boxH - margin;
    if (onScreen) {
        return { x: targetX, y: targetY, rotation: 0, onScreen: true };
    }
    const cx = boxW / 2;
    const cy = boxH / 2;
    const vx = targetX - cx;
    const vy = targetY - cy;
    if (vx === 0 && vy === 0) {
        return { x: cx, y: margin, rotation: Math.PI, onScreen: false };
    }
    const maxX = boxW / 2 - margin;
    const maxY = boxH / 2 - margin;
    const scale = Math.max(Math.abs(vx) / maxX, Math.abs(vy) / maxY);
    return {
        x: cx + vx / scale,
        y: cy + vy / scale,
        rotation: Math.atan2(vx, vy),
        onScreen: false
    };
}

// 第一次打贏機械人後，箭頭和頭上的驚嘆號都不再出現。大字提示不受這個影響。
function kidGuideShowArrow(state) {
    if (!state || state.firstRobotDone) return false;
    return Number(state.eventId) > 0;
}

if (typeof module !== "undefined" && module.exports && typeof PluginManager === "undefined") {
    module.exports = {
        kidGuideStep: kidGuideStep,
        kidGuideDoorAllowed: kidGuideDoorAllowed,
        kidGuideArrowPlacement: kidGuideArrowPlacement,
        kidGuideShowArrow: kidGuideShowArrow
    };
}

if (typeof PluginManager !== "undefined") {
(() => {
    "use strict";

    const INTRO = [
        { code: 101, indent: 0, parameters: ["", 0, 0, 2, ""] },
        { code: 401, indent: 0, parameters: ["先拿寶箱。"] },
        { code: 101, indent: 0, parameters: ["", 0, 0, 2, ""] },
        { code: 401, indent: 0, parameters: ["然後去打機械人。"] },
        { code: 401, indent: 0, parameters: ["贏了會自己去下一層，一直打到第 100 層。"] },
        { code: 0, indent: 0, parameters: [] }
    ];

    let introInterpreter = null;

    function enteredTower() {
        return !!($gameSystem && $gameSystem._kidGuideEnteredTower);
    }

    function liveStep() {
        if (!$gameMap || !$gamePlayer) return null;
        const mapId = $gameMap.mapId();
        if (mapId === 65 && $gameSystem) $gameSystem._kidGuideEnteredTower = true;
        if (mapId === 18) {
            const gold = $gameMap.event(26);
            const crown = $gameMap.event(17);
            if (!gold || !crown) return null;
            return kidGuideStep({
                mapId: mapId,
                goldOpen: $gameSelfSwitches.value([18, 26, "A"]),
                crownOpen: $gameSelfSwitches.value([18, 17, "A"]),
                goldX: gold.x,
                goldY: gold.y,
                crownX: crown.x,
                crownY: crown.y,
                px: $gamePlayer.x,
                py: $gamePlayer.y,
                floor: 0,
                enteredTower: enteredTower()
            });
        }
        if (mapId === 65) {
            return kidGuideStep({
                mapId: mapId,
                floor: $gameVariables.value(202),
                goldOpen: true,
                crownOpen: true,
                px: 0,
                py: 0
            });
        }
        if (mapId === 20) {
            return kidGuideStep({ mapId: mapId, floor: 0, goldOpen: true, crownOpen: true, px: 0, py: 0 });
        }
        return null;
    }

    function makeArrowBitmap() {
        const bitmap = new Bitmap(72, 96);
        const context = bitmap.context;
        context.fillStyle = "#ffe14a";
        context.strokeStyle = "#3a2a00";
        context.lineWidth = 6;
        context.beginPath();
        context.moveTo(36, 90);
        context.lineTo(8, 42);
        context.lineTo(24, 42);
        context.lineTo(24, 6);
        context.lineTo(48, 6);
        context.lineTo(48, 42);
        context.lineTo(64, 42);
        context.closePath();
        context.fill();
        context.stroke();
        bitmap.baseTexture.update();
        return bitmap;
    }

    const _Scene_Map_createAllWindows = Scene_Map.prototype.createAllWindows;
    Scene_Map.prototype.createAllWindows = function() {
        _Scene_Map_createAllWindows.call(this);
        const width = 980;
        const height = 128;
        const rect = new Rectangle(
            Math.floor((Graphics.boxWidth - width) / 2),
            Graphics.boxHeight - height - 8,
            width,
            height
        );
        this._kidGuideWindow = new Window_KidGuide(rect);
        this.addWindow(this._kidGuideWindow);
    };

    const _Scene_Map_update = Scene_Map.prototype.update;
    Scene_Map.prototype.update = function() {
        _Scene_Map_update.call(this);
        this.updateKidGuideIntro();
        if (this._kidGuideWindow) this._kidGuideWindow.refreshStep(liveStep());
    };

    Scene_Map.prototype.updateKidGuideIntro = function() {
        if (introInterpreter) {
            introInterpreter.update();
            if (!introInterpreter.isRunning()) introInterpreter = null;
            return;
        }
        if (!$gameSystem || $gameSystem._kidGuideIntroDone) return;
        if ($gameMap.mapId() !== 18) return;
        if ($gameMap.isEventRunning() || $gameMessage.isBusy()) return;
        if ($gamePlayer.isTransferring()) return;
        $gameSystem._kidGuideIntroDone = true;
        introInterpreter = new Game_Interpreter();
        introInterpreter.setup(INTRO, 0);
    };

    function Window_KidGuide() {
        this.initialize.apply(this, arguments);
    }

    Window_KidGuide.prototype = Object.create(Window_Base.prototype);
    Window_KidGuide.prototype.constructor = Window_KidGuide;

    Window_KidGuide.prototype.initialize = function(rect) {
        Window_Base.prototype.initialize.call(this, rect);
        this._text = "";
        this.opacity = 230;
    };

    Window_KidGuide.prototype.refreshStep = function(step) {
        const text = step && !$gameMessage.isBusy() ? step.lines.join("\n") : "";
        this.visible = !!text;
        if (text === this._text) return;
        this._text = text;
        this.contents.clear();
        if (!text) return;
        this.contents.fontSize = 30;
        this.changeTextColor("#ffe14a");
        const lines = text.split("\n");
        const lineHeight = 40;
        const block = lines.length * lineHeight;
        const top = Math.max(0, Math.floor((this.contentsHeight() - block) / 2));
        for (let i = 0; i < lines.length; i++) {
            this.drawText(lines[i], 0, top + i * lineHeight, this.contentsWidth(), "center");
        }
        this.resetFontSettings();
    };

    const _Spriteset_Map_createCharacters = Spriteset_Map.prototype.createCharacters;
    Spriteset_Map.prototype.createCharacters = function() {
        _Spriteset_Map_createCharacters.call(this);
        this._kidGuideArrow = new Sprite();
        this._kidGuideArrow.bitmap = makeArrowBitmap();
        this._kidGuideArrow.anchor.x = 0.5;
        this._kidGuideArrow.anchor.y = 1;
        this._kidGuideArrow.z = 9;
        this._kidGuideArrow.visible = false;
        this._tilemap.addChild(this._kidGuideArrow);
        this._kidGuideBalloonWait = 0;
    };

    const _Spriteset_Map_update = Spriteset_Map.prototype.update;
    Spriteset_Map.prototype.update = function() {
        _Spriteset_Map_update.call(this);
        this.updateKidGuideArrow();
    };

    Spriteset_Map.prototype.updateKidGuideArrow = function() {
        const arrow = this._kidGuideArrow;
        if (!arrow) return;
        if ($gameSystem && $gameVariables && Number($gameVariables.value(202)) >= 2) {
            $gameSystem._kidGuideFirstRobotDone = true;
        }
        const step = liveStep();
        const event = step && step.eventId ? $gameMap.event(step.eventId) : null;
        const show = kidGuideShowArrow({
            firstRobotDone: !!($gameSystem && $gameSystem._kidGuideFirstRobotDone),
            eventId: event ? step.eventId : 0
        });
        if (!show || $gameMessage.isBusy()) {
            arrow.visible = false;
            return;
        }
        arrow.visible = true;
        const bounce = Math.sin(Graphics.frameCount / 6) * 10;
        const place = kidGuideArrowPlacement(
            event.screenX(),
            event.screenY() - 78,
            Graphics.boxWidth,
            Graphics.boxHeight - 140,
            56
        );
        arrow.x = place.x;
        arrow.y = place.y + (place.onScreen ? bounce : 0);
        arrow.rotation = place.rotation;
        this._kidGuideBalloonWait -= 1;
        if (this._kidGuideBalloonWait <= 0 && event.isBalloonPlaying && !event.isBalloonPlaying()) {
            $gameTemp.requestBalloon(event, 1);
            this._kidGuideBalloonWait = 80;
        }
    };
})();
}
