/*:
 * @target MZ
 * @plugindesc [v2.1] 無限之塔：樓層變數202、塔戰經驗倍率、舊存檔同步
 * @author 專業RPG Maker MZ Plugin 編寫員
 *
 * @help InfiniteTowerScaling.js
 * 進入 Map65 時若變數 202 為 0 且變數 1 有樓層，會自動複製到 202（舊存檔相容）。
 * Troop ID 在 towerTroopIdBegin～End 內（預設 401～500）時，完全依「樓層變數」套用
 * 固定基準值與指數曲線，不再使用資料庫裡的 params 做戰鬥數值（圖鑑／編輯器仍可看原設定）。
 *
 * 【v2.0 重點】
 * - 修正：舊版在 inBattle() 為 false 時（敵人 setup／recoverAll）不會縮放，導致 MHP 變大後 HP 仍為舊值 → 血條非滿。
 * - 改以 Troop ID 範圍判斷，在建立敵人時即套用正確 MHP，開戰即滿血。
 * - 第 1 層：可設定基準 HP／攻防；第 f 層倍率 = exp(λ × (f - 1))，緩慢指數上升。
 *
 * @param floorVariableId
 * @text 塔層數變數 ID
 * @desc 與地圖事件「樓層加減」、共用事件 99 使用的變數一致（預設 202）。
 * @type variable
 * @default 202
 *
 * @param towerExpMultiplier
 * @text 塔戰經驗倍率
 * @desc 僅 Troop 401～500 有效，在樓層曲線之後再乘上此值（2＝雙倍）。
 * @type number
 * @decimals 2
 * @default 2
 *
 * @param towerTroopIdBegin
 * @text 塔用 Troop ID 起始
 * @desc 含此 ID。僅此範圍內的隊伍會套用塔公式。
 * @type number
 * @default 401
 *
 * @param towerTroopIdEnd
 * @text 塔用 Troop ID 結束
 * @type number
 * @default 500
 *
 * @param baseHp
 * @text 第 1 層基準 HP
 * @type number
 * @default 1000
 *
 * @param baseMp
 * @text 第 1 層基準 MP
 * @type number
 * @default 120
 *
 * @param baseAtk
 * @text 第 1 層基準 ATK
 * @type number
 * @default 40
 *
 * @param baseDef
 * @text 第 1 層基準 DEF
 * @type number
 * @default 40
 *
 * @param baseMat
 * @text 第 1 層基準 MAT
 * @type number
 * @default 40
 *
 * @param baseMdf
 * @text 第 1 層基準 MDF
 * @type number
 * @default 40
 *
 * @param baseAgi
 * @text 第 1 層基準 AGI
 * @type number
 * @default 28
 *
 * @param baseLuk
 * @text 第 1 層基準 LUK
 * @type number
 * @default 22
 *
 * @param hpExpLambda
 * @text HP／MP 指數係數 λ
 * @desc 倍率 = exp(λ×(層數-1))。λ 愈小曲線愈平緩。例：0.01 時約 100 層 ≈ 2.7 倍。
 * @type number
 * @decimals 4
 * @default 0.0100
 *
 * @param statExpLambda
 * @text 攻防等指數係數 λ
 * @desc 通常略小於 HP，避免後期秒殺過快。
 * @type number
 * @decimals 4
 * @default 0.0085
 *
 * @param maxFloorClamp
 * @text 層數上限（防異常變數）
 * @type number
 * @default 100
 *
 * @param tierThreshold
 * @text 階級變化層數
 * @type number
 * @default 10
 *
 * @param tierPrefixes
 * @text 階級前綴(逗號分隔)
 * @type string
 * @default ,異化 ,極·異化 ,災厄 ,深淵 
 *
 * @param colorShift
 * @text 每階級色相偏移
 * @type number
 * @default 60
 *
 * @param excludedTroops
 * @text 排除的 Troop ID 清單
 * @desc 逗號分隔，優先於塔範圍（如 BOSS 301、302）。
 * @type string
 * @default 301,302,501,502
 */

(() => {
    'use strict';

    const pluginName = 'InfiniteTowerScaling';
    const p = PluginManager.parameters(pluginName);

    const floorVarId = Number(p.floorVariableId || 202);
    const towerExpMult = (() => {
        const n = Number(p.towerExpMultiplier);
        return Number.isFinite(n) && n > 0 ? n : 2;
    })();
    const towerBegin = Number(p.towerTroopIdBegin || 401);
    const towerEnd = Number(p.towerTroopIdEnd || 500);
    const maxFloorClamp = Math.max(1, Number(p.maxFloorClamp || 100));

    const baseByParam = [
        Number(p.baseHp || 1000),
        Number(p.baseMp || 120),
        Number(p.baseAtk || 40),
        Number(p.baseDef || 40),
        Number(p.baseMat || 40),
        Number(p.baseMdf || 40),
        Number(p.baseAgi || 28),
        Number(p.baseLuk || 22)
    ];

    const parseLambda = (v, def) => {
        const n = Number(v);
        return Number.isFinite(n) && n >= 0 ? n : def;
    };
    const hpLambda = parseLambda(p.hpExpLambda, 0.01);
    const statLambda = parseLambda(p.statExpLambda, 0.0085);

    const tierThreshold = Number(p.tierThreshold || 10);
    const tierPrefixes = String(p.tierPrefixes || '')
        .split(',')
        .map(s => s.trim());
    const colorShift = Number(p.colorShift || 60);
    const excludedTroops = String(p.excludedTroops || '')
        .split(',')
        .map(s => Number(s.trim()))
        .filter(n => !Number.isNaN(n));

    const currentTroopId = () => ($gameTroop && $gameTroop._troopId) || 0;

    const isTowerTroopContext = () => {
        const tid = currentTroopId();
        if (!tid || excludedTroops.includes(tid)) return false;
        return tid >= towerBegin && tid <= towerEnd;
    };

    const towerFloor = () => {
        let f = Number($gameVariables.value(floorVarId)) || 0;
        if (f < 1) f = 1;
        if (f > maxFloorClamp) f = maxFloorClamp;
        return f;
    };

    const expCurve = (floor, lambda) => Math.exp(lambda * (floor - 1));

    const towerParamBase = (paramId) => {
        const base = baseByParam[paramId] || 1;
        const f = towerFloor();
        const lam = paramId <= 1 ? hpLambda : statLambda;
        const v = base * expCurve(f, lam);
        return Math.max(1, Math.floor(v));
    };

    const towerRewardMultiplier = () => expCurve(towerFloor(), hpLambda);

    const getTierIndex = floor =>
        Math.floor(Math.max(0, floor - 1) / tierThreshold);

    // --- 戰鬥數值：塔隊伍覆寫 paramBase（不依賴 inBattle，避免 recoverAll 時未縮放）---
    const _Game_Enemy_paramBase = Game_Enemy.prototype.paramBase;
    Game_Enemy.prototype.paramBase = function (paramId) {
        if (isTowerTroopContext()) {
            return towerParamBase(paramId);
        }
        return _Game_Enemy_paramBase.call(this, paramId);
    };

    const _Game_Enemy_exp = Game_Enemy.prototype.exp;
    Game_Enemy.prototype.exp = function () {
        let baseExp = _Game_Enemy_exp.call(this);
        if (isTowerTroopContext()) {
            baseExp = Math.max(
                1,
                Math.floor(baseExp * towerRewardMultiplier() * towerExpMult)
            );
        }
        return baseExp;
    };

    const _Game_Enemy_gold = Game_Enemy.prototype.gold;
    Game_Enemy.prototype.gold = function () {
        let baseGold = _Game_Enemy_gold.call(this);
        if (isTowerTroopContext()) {
            baseGold = Math.max(0, Math.floor(baseGold * towerRewardMultiplier()));
        }
        return baseGold;
    };

    const _Game_Enemy_name = Game_Enemy.prototype.name;
    Game_Enemy.prototype.name = function () {
        let originalName = _Game_Enemy_name.call(this);
        if (isTowerTroopContext()) {
            const tier = getTierIndex(towerFloor());
            const prefixIndex = Math.min(tier, tierPrefixes.length - 1);
            const prefix = tierPrefixes[prefixIndex];
            if (prefix) return prefix + ' ' + originalName;
        }
        return originalName;
    };

    const _Game_Enemy_battlerHue = Game_Enemy.prototype.battlerHue;
    Game_Enemy.prototype.battlerHue = function () {
        let originalHue = _Game_Enemy_battlerHue.call(this);
        if (isTowerTroopContext()) {
            const tier = getTierIndex(towerFloor());
            originalHue = (originalHue + tier * colorShift) % 360;
        }
        return originalHue;
    };

    // 舊存檔：樓層曾存在變數 1，首次進塔時抄到 202
    const _Scene_Map_onMapLoaded = Scene_Map.prototype.onMapLoaded;
    Scene_Map.prototype.onMapLoaded = function () {
        _Scene_Map_onMapLoaded.call(this);
        if (this._mapId === 65 && floorVarId === 202) {
            let v202 = Number($gameVariables.value(202)) || 0;
            const v1 = Number($gameVariables.value(1)) || 0;
            if (v202 < 1 && v1 >= 1) {
                $gameVariables.setValue(202, v1);
                v202 = v1;
            }
            if (Number($gameVariables.value(202)) < 1) {
                $gameVariables.setValue(202, 1);
            }
        }
    };

    // 保險：塔隊伍在進場後再對齊一次 HP／MP（防其他外掛提早寫入）
    const _Game_Troop_setup = Game_Troop.prototype.setup;
    Game_Troop.prototype.setup = function (troopId) {
        _Game_Troop_setup.call(this, troopId);
        if (isTowerTroopContext()) {
            for (const enemy of this.members()) {
                if (enemy && enemy.isEnemy()) enemy.recoverAll();
            }
        }
    };
})();
