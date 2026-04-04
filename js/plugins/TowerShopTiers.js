/*:
 * @target MZ
 * @plugindesc [v1.0] Map65 商店：隱藏「破爛／---」分類列；隊伍 Lv50+ 進階貨與價格
 * @author tower-setup
 *
 * @help
 * - 名稱以「破爛」或「---」開頭（資料庫分類列）不列入購買清單。
 * - 僅在指定地圖 ID（預設 65）且商店為一般 Scene_Shop 時生效。
 * - 隊伍領隊等級 ≥ 門檻時：武器／防具改為「同欄位下一筆資料庫 ID」（同 wtype／同裝備槽+atype），
 *   道具依內建對照升級到較高階藥水等；買入價與賣出價乘上 priceMultiplier。
 *
 * @param towerMapId
 * @text 塔商店地圖 ID
 * @type number
 * @default 65
 *
 * @param levelThreshold
 * @text 進階門檻（領隊等級）
 * @type number
 * @default 50
 *
 * @param priceMultiplier
 * @text 進階時價格倍率（買／賣）
 * @type number
 * @decimals 2
 * @default 1.75
 */

(() => {
    'use strict';

    const params = PluginManager.parameters('TowerShopTiers');
    const TOWER_MAP = Number(params.towerMapId || 65);
    const LV_TH = Math.max(1, Number(params.levelThreshold || 50));
    const PRICE_MULT = Math.max(
        1,
        Number(params.priceMultiplier != null ? params.priceMultiplier : 1.75)
    );

    const ITEM_PREMIUM = {
        7: 11,
        8: 11,
        9: 11,
        10: 11,
        13: 17,
        14: 17,
        15: 17,
        16: 17,
        19: 23,
        20: 23,
        21: 23,
        22: 23,
        25: 27,
        26: 27
    };

    function onTowerShop() {
        return $gameMap && $gameMap.mapId() === TOWER_MAP;
    }

    function leaderHighLevel() {
        const a = $gameParty.leader();
        return a && a.level >= LV_TH;
    }

    function hideByName(item) {
        if (!item || !item.name) return true;
        const n = String(item.name);
        return n.startsWith('破爛') || n.startsWith('---');
    }

    function premiumWeaponId(id) {
        const w = $dataWeapons[id];
        const n = $dataWeapons[id + 1];
        if (w && n && w.wtypeId === n.wtypeId) return id + 1;
        return id;
    }

    function premiumArmorId(id) {
        const a = $dataArmors[id];
        const n = $dataArmors[id + 1];
        if (a && n && a.atypeId === n.atypeId && a.etypeId === n.etypeId) {
            return id + 1;
        }
        return id;
    }

    function premiumItemId(id) {
        return ITEM_PREMIUM[id] != null ? ITEM_PREMIUM[id] : id;
    }

    function mapGoodsKindId(goods) {
        const kind = goods[0];
        let id = goods[1];
        if (!leaderHighLevel()) return [kind, id];
        if (kind === 0) return [0, premiumItemId(id)];
        if (kind === 1) return [1, premiumWeaponId(id)];
        if (kind === 2) return [2, premiumArmorId(id)];
        return [kind, id];
    }

    const _Window_ShopBuy_makeItemList = Window_ShopBuy.prototype.makeItemList;
    Window_ShopBuy.prototype.makeItemList = function () {
        this._data = [];
        this._price = [];
        if (!onTowerShop()) {
            _Window_ShopBuy_makeItemList.call(this);
            return;
        }
        const mult = leaderHighLevel() ? PRICE_MULT : 1;
        for (const goods of this._shopGoods) {
            const [kind, mappedId] = mapGoodsKindId(goods);
            const g = goods.slice();
            g[0] = kind;
            g[1] = mappedId;
            const item = this.goodsToItem(g);
            if (!item || hideByName(item)) continue;
            this._data.push(item);
            let pr = goods[2] === 0 ? item.price : goods[3];
            pr = Math.floor(pr * mult);
            this._price.push(pr);
        }
    };

    const _Scene_Shop_sellingPrice = Scene_Shop.prototype.sellingPrice;
    Scene_Shop.prototype.sellingPrice = function () {
        let p = _Scene_Shop_sellingPrice.call(this);
        if (onTowerShop() && leaderHighLevel()) {
            p = Math.floor(p * PRICE_MULT);
        }
        return p;
    };
})();
