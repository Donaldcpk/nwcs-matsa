/*:
 * @target MZ
 * @plugindesc 突破角色與怪物八維屬性上限
 * @author RMMZ Expert
 * @help 
 * 啟用此插件後，玩家角色與怪物的 8 維屬性上限
 * 將被提升至 999,999,999,999（9999億）。
 * * 屬性代號對應：
 * 0: MHP (最大生命)  1: MMP (最大魔法)
 * 2: ATK (攻擊)      3: DEF (防禦)
 * 4: MAT (魔攻)      5: MDF (魔防)
 * 6: AGI (敏捷)      7: LUK (幸運)
 *
 * 【敵人超過編輯器 999999 怎麼辦？】
 * RPG Maker 編輯器裡敵人八維最高只能填 999999，存檔後會被壓回這個數。
 * 若戰鬥／技能流程需要更大的「基底數值」，請在該敵人「備註」加上：
 * <TrueParams:最大HP,最大MP,攻擊,防禦,魔攻,魔防,敏捷,幸運>
 * 八個用英文逗號或全形逗號隔開；某一格要沿用編輯器數字可留空（連續逗號 ,,）。
 * 例：<TrueParams:5000000,,8000,8000,8000,8000,1200,1200>
 * 遊戲讀取資料後會優先採用此列數值（僅影響該敵人）。
 */

(() => {
    // 定義你想要的絕對最高上限 (JS 安全極限為 9007199254740991)
    const MAX_PARAM_VALUE = 999999999999;

    const parseEnemyTrueParams = function (enemy) {
        if (!enemy || !enemy.meta || enemy.meta.TrueParams === undefined || enemy.meta.TrueParams === '') {
            return null;
        }
        if (enemy._trueParamsRow) {
            return enemy._trueParamsRow;
        }
        const raw = String(enemy.meta.TrueParams);
        const parts = raw.split(/[,，]/);
        const row = [];
        for (let i = 0; i < 8; i++) {
            const cell = (parts[i] !== undefined ? parts[i] : '').trim();
            if (cell === '') {
                row.push(null);
            } else {
                const n = Number(cell);
                row.push(Number.isFinite(n) ? Math.floor(n) : null);
            }
        }
        enemy._trueParamsRow = row;
        return row;
    };

    const _Game_Enemy_paramBase = Game_Enemy.prototype.paramBase;
    Game_Enemy.prototype.paramBase = function (paramId) {
        const enemy = this.enemy();
        const row = enemy && parseEnemyTrueParams(enemy);
        if (row && row[paramId] !== null && row[paramId] !== undefined && row[paramId] >= 0) {
            return row[paramId];
        }
        return _Game_Enemy_paramBase.call(this, paramId);
    };

    // 突破怪物的屬性上限
    Game_Enemy.prototype.paramMax = function (paramId) {
        return MAX_PARAM_VALUE;
    };

    // 突破玩家角色(Actor)的屬性上限
    Game_Actor.prototype.paramMax = function (paramId) {
        return MAX_PARAM_VALUE;
    };
})();
