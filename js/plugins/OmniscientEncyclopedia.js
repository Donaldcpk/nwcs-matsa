/*:
 * @target MZ
 * @plugindesc [v1.0] 全知圖鑑與世界排名 - 完整整合版
 * @author 專業 MZ 插件編寫員
 *
 * @help OmniscientEncyclopedia.js
 * * 備註欄位標籤 (Note Tags):
 * 在道具/武器/防具/敵人的備註欄中輸入：
 * <Score: 50>  (將 50 替換為你想給予的積分，預設為 10)
 *
 * 【排行榜／Supabase】
 * 網頁版登入後（school-auth-gate）會以 Supabase Auth 的 user id 作為 player_id，
 * 與換電腦無關；未登入時仍用存檔內隨機 UUID。
 * 請在資料表 global_leaderboard 設 player_id (text, UNIQUE)，POST 使用
 * ?on_conflict=player_id。建議執行 tools/supabase_student_whitelist_and_rls.sql：
 * 名冊表 student_whitelist、登入觸發器、以及 JWT 寫入 registered_email／earth_ref（地球身分參照）。
 * 除錯：上傳／讀取失敗時請開 F12 主控台，會印出 HTTP 狀態與錯誤本文（常見為 401
 * 金鑰錯誤、404 表名錯誤、RLS 擋下寫入）。Supabase 儀表板請使用與 PostgREST 相容的
 * anon（JWT）或專案提供的 publishable key；若 401 請在專案 Settings → API 核對。
 *
 * @param scoreVariableId
 * @text 積分綁定變數 ID
 * @desc 用來儲存圖鑑積分的全域變數 ID。
 * @type variable
 * @default 10
 *
 * @param supabaseUrl
 * @text Supabase 專案 URL
 * @desc 你的 Supabase API 網址 (例如: https://oqsvxizemgyfointylpe.supabase.co)
 * @type string
 *
 * @param supabaseKey
 * @text Supabase Anon Key
 * @desc 你的 Supabase 公開 API 密鑰 (sb_publishable_...)
 * @type string
 */

(() => {
    'use strict';

    const pluginName = "OmniscientEncyclopedia";
    const parameters = PluginManager.parameters(pluginName);
    const scoreVarId = Number(parameters['scoreVariableId'] || 10);

    // ======================================================================
    // 1. Game_System - 初始化圖鑑資料庫與加分邏輯
    // ======================================================================
    const _Game_System_initialize = Game_System.prototype.initialize;
    Game_System.prototype.initialize = function() {
        _Game_System_initialize.call(this);
        this._omniscientEncyclopedia = {
            items: [], weapons: [], armors: [], enemies: []
        };
        this._onlineNickname = ""; // 儲存網路暱稱
        this._leaderboardPlayerId = ""; // 排行榜主鍵（登入後為 auth.uid，否則存檔 UUID）
    };

    Game_System.prototype.unlockEncyclopediaEntry = function(item, type) {
        if (!item || !this._omniscientEncyclopedia) return;
        
        const list = this._omniscientEncyclopedia[type];
        if (list && !list.includes(item.id)) {
            list.push(item.id);
            this.addEncyclopediaScore(item);
        }
    };

    Game_System.prototype.addEncyclopediaScore = function(item) {
        const score = item.meta.Score ? Number(item.meta.Score) : 10;
        const currentScore = $gameVariables.value(scoreVarId);
        $gameVariables.setValue(scoreVarId, currentScore + score);
    };

    // ======================================================================
    // 2. 攔截核心資料 (獲取物品 & 擊敗敵人)
    // ======================================================================
    const _Game_Party_gainItem = Game_Party.prototype.gainItem;
    Game_Party.prototype.gainItem = function(item, amount, includeEquip) {
        _Game_Party_gainItem.call(this, item, amount, includeEquip);
        if (item && amount > 0) {
            let type = '';
            if (DataManager.isItem(item)) type = 'items';
            else if (DataManager.isWeapon(item)) type = 'weapons';
            else if (DataManager.isArmor(item)) type = 'armors';
            
            if (type) $gameSystem.unlockEncyclopediaEntry(item, type);
        }
    };

    const _Game_Enemy_performCollapse = Game_Enemy.prototype.performCollapse;
    Game_Enemy.prototype.performCollapse = function() {
        _Game_Enemy_performCollapse.call(this);
        const enemy = this.enemy();
        $gameSystem.unlockEncyclopediaEntry(enemy, 'enemies');
    };

    // ======================================================================
    // 3. 主選單 UI 整合
    // ======================================================================
    const _Window_MenuCommand_addSaveCommand = Window_MenuCommand.prototype.addSaveCommand;
    Window_MenuCommand.prototype.addSaveCommand = function() {
        if (this.needsCommand("encyclopedia")) {
            this.addCommand("全知圖鑑", 'encyclopedia', true);
        }
        if (this.needsCommand("leaderboard")) {
            this.addCommand("世界排名", 'leaderboard', true);
        }
        _Window_MenuCommand_addSaveCommand.call(this);
    };

    const _Scene_Menu_createCommandWindow = Scene_Menu.prototype.createCommandWindow;
    Scene_Menu.prototype.createCommandWindow = function() {
        _Scene_Menu_createCommandWindow.call(this);
        this._commandWindow.setHandler('encyclopedia', this.commandEncyclopedia.bind(this));
        this._commandWindow.setHandler('leaderboard', this.commandLeaderboard.bind(this));
    };

    // 進入圖鑑
    Scene_Menu.prototype.commandEncyclopedia = function() {
        // [新增] 自動同步目前包包內的道具與隊員身上的裝備
        if ($gameSystem._omniscientEncyclopedia) {
            $gameParty.items().forEach(item => $gameSystem.unlockEncyclopediaEntry(item, 'items'));
            $gameParty.weapons().forEach(item => $gameSystem.unlockEncyclopediaEntry(item, 'weapons'));
            $gameParty.armors().forEach(item => $gameSystem.unlockEncyclopediaEntry(item, 'armors'));
            
            $gameParty.allMembers().forEach(actor => {
                actor.equips().forEach(equip => {
                    if (equip) {
                        if (DataManager.isWeapon(equip)) $gameSystem.unlockEncyclopediaEntry(equip, 'weapons');
                        if (DataManager.isArmor(equip)) $gameSystem.unlockEncyclopediaEntry(equip, 'armors');
                    }
                });
            });
        }
        SceneManager.push(Scene_Encyclopedia);
    };
    
    Scene_Menu.prototype.commandLeaderboard = async function() {
        SoundManager.playOk();
        NetworkManager.ensureLeaderboardPlayerId();
        if (!$gameSystem._onlineNickname) {
            const earth = window.__sbEarthRef || window.__sbSeatCode;
            const defName = earth
                ? "勇者" + earth
                : "勇者" + $gameParty.leader().name();
            let accepted = false;
            while (!accepted) {
                const raw = prompt(
                    "歡迎來到全球龍虎榜！\n請輸入暱稱（1～16 字，勿不雅用語；設定後無法更改）：",
                    defName
                );
                if (raw === null) {
                    this._commandWindow.activate();
                    return;
                }
                const check = NetworkManager.validateNickname(raw);
                if (check.ok) {
                    $gameSystem._onlineNickname = check.name;
                    accepted = true;
                } else {
                    alert(check.message);
                }
            }
        }

        const uploaded = await NetworkManager.uploadScore();
        if (uploaded) {
            try {
                const t = new Date().toLocaleString();
                localStorage.setItem('nwcs_leaderboard_last_sync', new Date().toISOString());
                console.log('[OmniscientEncyclopedia] 排行榜已同步於', t);
            } catch (e) {
                /* ignore */
            }
        } else {
            alert(
                '世界排名分數暫時無法上傳（可能是網路、金鑰、未登入或資料表／RLS 設定）。\n仍會嘗試顯示排行榜；請按 F12 查看主控台錯誤詳情。'
            );
        }

        SceneManager.push(Scene_Leaderboard);
    };
})();

// ======================================================================
// 4. Supabase 網路連線管理器 (NetworkManager)
// ======================================================================
class NetworkManager {
    static getBaseUrl() {
        const raw = PluginManager.parameters('OmniscientEncyclopedia')['supabaseUrl'] || '';
        return String(raw).trim().replace(/\/+$/, '');
    }

    static getKey() {
        return String(PluginManager.parameters('OmniscientEncyclopedia')['supabaseKey'] || '').trim();
    }

    static ensureLeaderboardPlayerId() {
        if (window.__sbUserId) {
            $gameSystem._leaderboardPlayerId = window.__sbUserId;
            return;
        }
        if ($gameSystem._leaderboardPlayerId) return;
        if (window.crypto && typeof window.crypto.randomUUID === 'function') {
            $gameSystem._leaderboardPlayerId = window.crypto.randomUUID();
        } else {
            $gameSystem._leaderboardPlayerId =
                'p' + Date.now() + '_' + Math.random().toString(36).slice(2, 14);
        }
    }

    static getBearerForRest() {
        if (window.__sbAccessToken) return window.__sbAccessToken;
        return this.getKey();
    }

    static async refreshUserSessionIfNeeded() {
        const rt = window.__sbRefreshToken;
        if (!rt || !window.__sbUserId) return;
        const base = this.getBaseUrl();
        const key = this.getKey();
        if (!base || !key) return;
        try {
            const response = await fetch(`${base}/auth/v1/token?grant_type=refresh_token`, {
                method: 'POST',
                headers: {
                    apikey: key,
                    Authorization: `Bearer ${key}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ refresh_token: rt })
            });
            const data = await response.json().catch(() => ({}));
            if (response.ok && data.access_token) {
                window.__sbAccessToken = data.access_token;
                if (data.refresh_token) window.__sbRefreshToken = data.refresh_token;
                try {
                    const p =
                        (window.SCHOOL_AUTH && window.SCHOOL_AUTH.storagePrefix) || 'nwcs_sb_';
                    localStorage.setItem(p + 'at', data.access_token);
                    if (data.refresh_token) localStorage.setItem(p + 'rt', data.refresh_token);
                } catch (e) {
                    /* ignore */
                }
            }
        } catch (e) {
            console.warn('[OmniscientEncyclopedia] refresh session', e);
        }
    }

    static validateNickname(raw) {
        if (raw === undefined || raw === null) {
            return { ok: false, message: '請輸入暱稱。', name: '' };
        }
        const name = String(raw).trim();
        const chars = [...name];
        if (chars.length < 1) {
            return { ok: false, message: '暱稱不可為空白。', name: '' };
        }
        if (chars.length > 16) {
            return { ok: false, message: '暱稱請勿超過 16 個字元。', name: '' };
        }
        const lower = name.toLowerCase();
        const banned = [
            // English Profanity & Offensive Words
            'fuck', 'fucker', 'fucking', 'motherfucker', 'shit', 'shitty', 'bullshit', 'damn', 'goddamn', 'bitch',
            'bitches', 'cunt', 'dick', 'dickhead', 'ass', 'asshole', 'bastard', 'slut', 'whore', 'penis',
            'vagina', 'cock', 'cocksucker', 'pussy', 'wanker', 'twat', 'prick', 'cum', 'jizz', 'boob',
            'tits', 'dildo', 'masturbate', 'rape', 'pedo', 'pedophile', 'nazi', 'hitler', 'kys', 'suicide',
            'porn', 'porno', 'sex', 'nudes', 'naked', 'chode', 'clit', 'douche', 'douchebag', 'arse',
            'arsehole', 'bollocks', 'jerk', 'jerkoff', 'mofo', 'bugger', 'crap', 'pecker', 'piss', 'poop',
            'shite', 'retard', 'retarded', 'schlong', 'scrote', 'scrotum', 'semen', 'shag', 'skank', 'smegma',
            'snatch', 'sperm', 'testicle', 'tosser', 'turd', 'wank', 'whorehouse', 'xxx', 'incest', 'slutty',
            
            // English System & Reserved Names
            'admin', 'administrator', 'root', 'system', 'mod', 'moderator', 'support', 'staff', 'owner', 'guest',
        
            // Chinese Profanity, Insults & Offensive Words (Traditional & Simplified)
            '干你', '操你', '屌', '肏', '白痴', '智障', '殺你', '去死', '媽的', '王八蛋',
            '幹你娘', '操你媽', '雞巴', '雞掰', '傻逼', '媽逼', '尼瑪', '賤人', '婊子', '妓女',
            '腦殘', '廢物', '賤貨', '狗娘', '畜生', '雜種', '腦癱', '變態', '弱智', '靠北',
            '靠夭', '趕羚羊', '草泥馬', '機車', '破麻', '狗屎', '吃屎', '混蛋', '敗類', '垃圾',
            '幹林娘', '幹您娘', '靠杯', '靠腰', '哭爸', '哭夭', '機掰', '臭婊', '綠茶婊', '狗雜種',
            '死全家', '砍你', '捅你', '弄死你', '強姦', '輪姦', '迷姦', '援交', '包養', '賣淫',
            '嫖娼', '傻屌', '逗逼', '裝逼', '牛逼', '苦逼', '撕逼', '懵逼', '媽蛋', '泥煤', 
            '龜孫', '龜兒子', '兔崽子', '狗日的', '殺千刀', '短命鬼', '神經病', '精神病', '色狼', '痴漢', 
            '淫娃', '蕩婦', '淫婦', '奸夫', '綠帽', '狗男女', '死媽', '全家炸', '死爹', '欠幹', 
            '欠操', '找死', '找抽', '裝蒜', '腦進水', '神經', '發神經', '有病', '不要臉', '無恥',
        
            // Chinese System & Reserved Names
            '系統', '管理員', '官方', '客服', '站長', '版主', '測試', '測試員', '公告', '系統管理員'
        ];
        for (let i = 0; i < banned.length; i++) {
            const w = banned[i];
            if (name.includes(w) || lower.includes(w.toLowerCase())) {
                return { ok: false, message: '暱稱含有不當用語，請換一個。', name: '' };
            }
        }
        return { ok: true, name, message: '' };
    }

    static generatePlayerPayload() {
        const encyc = $gameSystem._omniscientEncyclopedia;
        const totalUnlocks = encyc
            ? encyc.items.length + encyc.weapons.length + encyc.armors.length + encyc.enemies.length
            : 0;

        let totalStats = 0;
        const actorsData = [];

        $gameParty.allMembers().forEach(actor => {
            actorsData.push({ name: actor.name(), level: actor.level });
            for (let i = 0; i < 8; i++) totalStats += actor.param(i);
        });

        const combatPower = totalStats / 4;
        const scoreVarId = Number(PluginManager.parameters('OmniscientEncyclopedia')['scoreVariableId'] || 10);
        const totalScore = $gameVariables.value(scoreVarId);

        return {
            player_id: $gameSystem._leaderboardPlayerId,
            nickname: $gameSystem._onlineNickname,
            score: totalScore,
            combat_power: parseFloat(combatPower.toFixed(2)),
            encyclopedia_count: totalUnlocks,
            actors_data: actorsData,
            updated_at: new Date().toISOString(),
            registered_email: window.__sbUserEmail || null,
            seat_code: window.__sbSeatCode || null,
            earth_ref: window.__sbEarthRef || window.__sbSeatCode || null
        };
    }
    // 上傳分數 (UPSERT，以 player_id 合併；資料表須有 player_id UNIQUE)
    static async uploadScore() {
        NetworkManager.ensureLeaderboardPlayerId();
        await this.refreshUserSessionIfNeeded();
        const base = this.getBaseUrl();
        const url = `${base}/rest/v1/global_leaderboard?on_conflict=player_id`;
        const key = this.getKey();
        const bearer = this.getBearerForRest();
        if (!key || !base) {
            console.error('[OmniscientEncyclopedia] Supabase：未設定 supabaseUrl 或 supabaseKey');
            return false;
        }

        const payload = this.generatePlayerPayload();

        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'apikey': key,
                    'Authorization': `Bearer ${bearer}`,
                    'Prefer': 'resolution=merge-duplicates' 
                },
                body: JSON.stringify(payload)
            });
            if (!response.ok) {
                const body = await response.text();
                console.error(
                    '[OmniscientEncyclopedia] 上傳失敗 HTTP',
                    response.status,
                    response.statusText,
                    body ? body.slice(0, 500) : ''
                );
                return false;
            }
            return true;
        } catch (error) {
            console.error('[OmniscientEncyclopedia] Supabase 連線錯誤:', error);
            return false;
        }
    }

    static async fetchTop50(orderBy) {
        await this.refreshUserSessionIfNeeded();
        const base = this.getBaseUrl();
        const url = `${base}/rest/v1/global_leaderboard?select=*&order=${orderBy}.desc&limit=50`;
        const key = this.getKey();
        const bearer = this.getBearerForRest();

        try {
            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    'apikey': key,
                    'Authorization': `Bearer ${bearer}`,
                    'Content-Type': 'application/json'
                }
            });
            if (!response.ok) {
                const body = await response.text();
                console.error(
                    '[OmniscientEncyclopedia] 讀取排行榜失敗 HTTP',
                    response.status,
                    body ? body.slice(0, 500) : ''
                );
                return [];
            }
            return await response.json();
        } catch (error) {
            console.error('[OmniscientEncyclopedia] Supabase 讀取錯誤:', error);
            return [];
        }
    }
}

// ======================================================================
// 5. 全知圖鑑 UI 類別
// ======================================================================
class Window_EncycCategory extends Window_Command {
    initialize(rect) { super.initialize(rect); }
    makeCommandList() {
        this.addCommand("道具", 'items');
        this.addCommand("武器", 'weapons');
        this.addCommand("防具", 'armors');
        this.addCommand("敵人", 'enemies');
    }
}

class Window_EncycList extends Window_Selectable {
    initialize(rect) {
        super.initialize(rect);
        this._data = [];
        this._category = 'items';
    }
    setCategory(category) {
        const changed = this._category !== category;
        this._category = category;
        this.refresh();
        if (changed) {
            this.scrollTo(0, 0);
        }
    }
    makeItemList() {
        switch (this._category) {
            case 'items': this._data = $dataItems.filter(item => item && item.name); break;
            case 'weapons': this._data = $dataWeapons.filter(item => item && item.name); break;
            case 'armors': this._data = $dataArmors.filter(item => item && item.name); break;
            case 'enemies': this._data = $dataEnemies.filter(item => item && item.name); break;
        }
    }
    refresh() {
        this.makeItemList();
        Window_Selectable.prototype.refresh.call(this);
    }
    maxItems() { return this._data ? this._data.length : 0; }
    isUnlocked(item) {
        if (!item) return false;
        const list = $gameSystem._omniscientEncyclopedia[this._category];
        return list && list.includes(item.id);
    }
    drawItem(index) {
        const item = this._data[index];
        if (item) {
            const rect = this.itemLineRect(index);
            const unlocked = this.isUnlocked(item);
            
            this.changePaintOpacity(unlocked); // 未解鎖會變半透明
            
            // [新增] 格式化 ID，例如把 1 變成 "001"
            const idText = String(item.id).padStart(3, '0');
            const nameText = unlocked ? item.name : "？？？？？";
            const displayText = `${idText}. ${nameText}`; // 組合字串：001. 聖劍
            
            const iconIndex = unlocked && item.iconIndex ? item.iconIndex : 0;
            
            // 敵人沒有圖示，僅裝備道具顯示
            if (this._category !== 'enemies' && unlocked) {
                this.drawIcon(iconIndex, rect.x, rect.y);
            }
            
            // 根據有沒有畫圖示，決定文字要往右推多少
            const textX = (this._category !== 'enemies' && unlocked) ? rect.x + 36 : rect.x;
            this.drawText(displayText, textX, rect.y, rect.width - 36);
            
            this.changePaintOpacity(1);
        }
    }
    updateHelp() {
        if (this._helpWindow) {
            const item = this.item();
            const unlocked = this.isUnlocked(item);
            this._helpWindow.setItemDetail(item, unlocked, this._category);
        }
    }
    item() { return this._data && this.index() >= 0 ? this._data[this.index()] : null; }
}

class Window_EncycDetail extends Window_Base {
    initialize(rect) {
        super.initialize(rect);
        this._item = null;
        this._unlocked = false;
        this._category = '';
    }
    setItemDetail(item, unlocked, category) {
        if (this._item !== item || this._unlocked !== unlocked || this._category !== category) {
            this._item = item;
            this._unlocked = unlocked;
            this._category = category;
            this.refresh();
        }
    }
    refresh() {
        this.contents.clear();
        if (!this._item) return;

        if (!this._unlocked) {
            this.drawText("【尚未獲得此情報】", 0, this.innerHeight / 2 - this.lineHeight(), this.innerWidth, 'center');
            return;
        }

        if (this._category !== 'enemies' && this._item.iconIndex) {
            this.drawIcon(this._item.iconIndex, 0, 0);
            this.drawText(this._item.name, 36, 0, this.innerWidth - 36);
        } else {
            this.drawText(this._item.name, 0, 0, this.innerWidth, 'center');
        }
        
        const lineY = this.lineHeight();
        this.contents.fillRect(0, lineY + 10, this.innerWidth, 2, "rgba(255, 255, 255, 0.5)");

        let y = lineY + 20;

        if (this._category === 'weapons' || this._category === 'armors') {
            const params = ["最大HP", "最大MP", "攻擊力", "防禦力", "魔法攻擊", "魔法防禦", "敏捷", "幸運"];
            for (let i = 0; i < 8; i++) {
                if (this._item.params[i] !== 0) {
                    this.changeTextColor(ColorManager.systemColor());
                    this.drawText(params[i], 0, y, 120);
                    this.resetTextColor();
                    this.drawText((this._item.params[i] > 0 ? "+" : "") + this._item.params[i], 120, y, 60, 'right');
                    y += this.lineHeight();
                }
            }
        } else if (this._category === 'enemies') {
            const enemyParams = ["最大HP", "最大MP", "攻擊力", "防禦力", "魔法攻擊", "魔法防禦", "敏捷", "幸運"];
            for (let i = 0; i < 8; i++) {
                const x = (i % 2 === 0) ? 0 : this.innerWidth / 2;
                if (i % 2 === 0 && i !== 0) y += this.lineHeight();
                this.changeTextColor(ColorManager.systemColor());
                this.drawText(enemyParams[i], x, y, 100);
                this.resetTextColor();
                this.drawText(this._item.params[i], x + 100, y, 60, 'right');
            }
            y += this.lineHeight() * 2;
            
            this.changeTextColor(ColorManager.systemColor());
            this.drawText("EXP", 0, y, 60);
            this.resetTextColor();
            this.drawText(this._item.exp, 60, y, 80, 'left');
            
            this.changeTextColor(ColorManager.systemColor());
            this.drawText("金錢", this.innerWidth / 2, y, 60);
            this.resetTextColor();
            this.drawText(this._item.gold, this.innerWidth / 2 + 60, y, 80, 'left');
            y += this.lineHeight();
        }

        y += this.lineHeight();
        this.contents.fillRect(0, y - 10, this.innerWidth, 2, "rgba(255, 255, 255, 0.5)");
        if (this._item.description) {
            this.drawTextEx(this._item.description, 0, y);
        }

        const score = this._item.meta.Score ? Number(this._item.meta.Score) : 10;
        this.drawText(`★ 圖鑑積分: ${score}`, 0, this.innerHeight - this.lineHeight() - 10, this.innerWidth, 'right');
    }
}

class Scene_Encyclopedia extends Scene_MenuBase {
    create() {
        super.create();
        this.createCategoryWindow();
        this.createDetailWindow();
        this.createListWindow();
    }
    createCategoryWindow() {
        const rect = new Rectangle(0, this.mainAreaTop(), 240, this.mainAreaHeight());
        this._categoryWindow = new Window_EncycCategory(rect);
        this._categoryWindow.setHandler('ok', this.onCategoryOk.bind(this));
        this._categoryWindow.setHandler('cancel', this.popScene.bind(this));
        this._categoryWindow.setHandler('select', this.onCategorySelect.bind(this));
        this.addWindow(this._categoryWindow);
    }
    createDetailWindow() {
        const x = 240 + 300; 
        const width = Graphics.boxWidth - x;
        const rect = new Rectangle(x, this.mainAreaTop(), width, this.mainAreaHeight());
        this._detailWindow = new Window_EncycDetail(rect);
        this.addWindow(this._detailWindow);
    }
    createListWindow() {
        const x = 240;
        const width = 300;
        const rect = new Rectangle(x, this.mainAreaTop(), width, this.mainAreaHeight());
        this._listWindow = new Window_EncycList(rect);
        this._listWindow.setHandler('cancel', this.onListCancel.bind(this));
        this._listWindow.setHelpWindow(this._detailWindow);
        this.addWindow(this._listWindow);
        this.onCategorySelect();
        this._encycCategorySymbol = this._categoryWindow.currentSymbol();
        this._categoryWindow.activate();
    }
    update() {
        Scene_MenuBase.prototype.update.call(this);
        // Window_Command 游標移動不會觸發 setHandler('select')，需在這裡同步分類
        if (this._categoryWindow && this._categoryWindow.active) {
            const sym = this._categoryWindow.currentSymbol();
            if (sym && sym !== this._encycCategorySymbol) {
                this._encycCategorySymbol = sym;
                this.onCategorySelect();
                if (this._listWindow && !this._listWindow.active) {
                    this._listWindow.deselect();
                    this._detailWindow.setItemDetail(null, false, sym);
                }
            }
        }
    }
    onCategorySelect() {
        if (this._listWindow && this._categoryWindow.currentSymbol()) {
            this._listWindow.setCategory(this._categoryWindow.currentSymbol());
        }
    }
    onCategoryOk() {
        this._listWindow.activate();
        this._listWindow.select(0);
    }
    onListCancel() {
        this._listWindow.deselect();
        this._categoryWindow.activate();
    }
}

// ======================================================================
// 6. 全球龍虎榜 UI 類別
// ======================================================================
class Window_LeaderboardTab extends Window_HorzCommand {
    initialize(rect) { super.initialize(rect); }
    windowWidth() { return Graphics.boxWidth; }
    maxCols() { return 3; }
    makeCommandList() {
        this.addCommand("🏆 積分排行", 'score');
        this.addCommand("⚔️ 戰力排行", 'combat_power');
        this.addCommand("📖 圖鑑排行", 'encyclopedia_count');
    }
}

class Window_LeaderboardList extends Window_Selectable {
    initialize(rect) {
        super.initialize(rect);
        this._data = [];
        this._sortKey = 'score';
        this._isLoading = false;
    }
    
    async loadData(sortKey) {
        this._sortKey = sortKey;
        this._isLoading = true;
        if (this._helpWindow) {
            this._helpWindow.setPlayerData(null);
        }
        this.refresh(); 
        
        this._data = await NetworkManager.fetchTop50(sortKey);
        
        this._isLoading = false;
        this.refresh();
        this.select(0);
    }

    maxItems() { return this._data ? this._data.length : 0; }

    drawItem(index) {
        if (this._isLoading) return;
        const player = this._data[index];
        if (player) {
            const rect = this.itemLineRect(index);
            let rankText = `#${index + 1}`;
            if (index === 0) { this.changeTextColor(ColorManager.textColor(14)); rankText = "👑 #1"; }
            else if (index === 1) { this.changeTextColor(ColorManager.textColor(8)); }
            else if (index === 2) { this.changeTextColor(ColorManager.textColor(2)); }
            else { this.resetTextColor(); }
            
            this.drawText(rankText, rect.x, rect.y, 56);
            this.resetTextColor();
            const nickW = 92;
            this.drawText(player.nickname, rect.x + 56, rect.y, nickW);
            this.contents.fontSize = Math.max(12, $gameSystem.mainFontSize() - 4);
            this.changeTextColor(ColorManager.systemColor());
            const er = String(player.earth_ref || player.seat_code || '').trim();
            const earthLabel = er ? `🌍${er.slice(0, 10)}` : '';
            this.drawText(earthLabel, rect.x + 56 + nickW + 4, rect.y, 100);
            this.contents.fontSize = $gameSystem.mainFontSize();
            this.resetTextColor();
            let valText = "";
            if (this._sortKey === 'score') valText = `${player.score} 分`;
            else if (this._sortKey === 'combat_power') valText = `戰力 ${player.combat_power}`;
            else if (this._sortKey === 'encyclopedia_count') valText = `${player.encyclopedia_count} 種`;
            
            this.drawText(valText, rect.x + 258, rect.y, Math.max(80, rect.width - 258), 'right');
        }
    }

    refresh() {
        super.refresh();
        if (this._isLoading) {
            this.drawText("資料載入中...", 0, this.innerHeight / 2 - this.lineHeight(), this.innerWidth, 'center');
        } else if (this._data.length === 0) {
            this.drawText("目前沒有排行榜資料", 0, this.innerHeight / 2 - this.lineHeight(), this.innerWidth, 'center');
        }
    }

    updateHelp() {
        if (!this._helpWindow) return;
        if (this._isLoading || !this._data || this._data.length === 0 || this.index() < 0) {
            this._helpWindow.setPlayerData(null);
            return;
        }
        const player = this._data[this.index()];
        this._helpWindow.setPlayerData(player || null);
    }
}

class Window_LeaderboardDetail extends Window_Base {
    initialize(rect) {
        super.initialize(rect);
        this._player = null;
        this._sortKey = 'score';
    }
    setSortKey(key) {
        if (this._sortKey !== key) {
            this._sortKey = key;
            this.refresh();
        }
    }
    setPlayerData(player) {
        if (this._player !== player) {
            this._player = player;
            this.refresh();
        }
    }
    leaderboardHelpLines() {
        // 刻意短句、少行數，避免右欄寬度不足與底部被裁切
        const head = [];
        try {
            const iso = localStorage.getItem('nwcs_leaderboard_last_sync');
            if (iso) {
                const ds = new Date(iso).toLocaleString();
                head.push(`\\C[11]本機上次成功同步：${ds}`);
            }
        } catch (e) {
            /* ignore */
        }
        if (this._sortKey === 'score') {
            return head.concat([
                "\\C[14]【積分】",
                "圖鑑總分愈高名次愈前。",
                "解鎖圖鑑會加分；備註可設分數，預設+10。",
                "衝榜：多解鎖圖鑑。",
                "🌍 為「地球身分參照」（校方名冊），全班可見。"
            ]);
        }
        if (this._sortKey === 'combat_power') {
            return head.concat([
                "\\C[14]【戰力】",
                "隊伍最多4人，八維加總÷4。",
                "衝榜：升級、換裝。",
                "🌍 地球身分參照見列表與下方詳情。"
            ]);
        }
        return head.concat([
            "\\C[14]【圖鑑】",
            "四類解鎖數相加（各類不重複）。",
            "衝榜：收集與擊敗新敵。",
            "🌍 地球身分參照見列表與下方詳情。"
        ]);
    }
    refresh() {
        this.contents.clear();
        let y = 4;
        const helpLines = this.leaderboardHelpLines();
        const mainFont = $gameSystem.mainFontSize();
        const helpFont = 14;
        const textW = Math.max(40, this.innerWidth - 8);
        this.contents.fontSize = helpFont;
        this.contents.outlineWidth = 2;
        helpLines.forEach(line => {
            this.resetTextColor();
            const h = this.textSizeEx(line).height;
            this.drawTextEx(line, 4, y, textW);
            y += Math.max(helpFont + 4, h);
        });
        this.contents.fontSize = mainFont;
        this.contents.outlineWidth = 3;
        y += 4;
        this.contents.fillRect(0, y, this.innerWidth, 2, "rgba(255, 255, 255, 0.35)");
        y += 10;
        const bottomReserve = 28;

        if (!this._player) {
            this.changeTextColor(ColorManager.textColor(8));
            this.contents.fontSize = helpFont;
            this.drawText("點左側列表看詳情", 4, y, textW, 'center');
            this.contents.fontSize = mainFont;
            return;
        }

        this.contents.fontSize = Math.min(mainFont, 20);
        this.changeTextColor(ColorManager.systemColor());
        let rankVal = "";
        if (this._sortKey === 'score') rankVal = `積分 ${this._player.score}`;
        else if (this._sortKey === 'combat_power') rankVal = `戰力 ${this._player.combat_power}`;
        else rankVal = `圖鑑 ${this._player.encyclopedia_count}種`;
        const nick = String(this._player.nickname || '');
        this.drawText(nick.length > 10 ? nick.slice(0, 10) + '…' : nick, 4, y, textW, 'center');
        y += this.lineHeight();
        this.contents.fontSize = helpFont;
        this.changeTextColor(ColorManager.systemColor());
        const earthShow = String(
            this._player.earth_ref || this._player.seat_code || ''
        ).trim();
        this.drawText(
            earthShow ? `🌍 地球身分：${earthShow.slice(0, 24)}` : '🌍 地球身分：—',
            4,
            y,
            textW,
            'center'
        );
        y += this.lineHeight();
        this.contents.fontSize = Math.min(mainFont, 20);
        this.resetTextColor();
        this.drawText(rankVal, 4, y, textW, 'center');
        y += this.lineHeight() + 4;

        if (window.__sbIsAdmin && this._player) {
            this.contents.fontSize = helpFont;
            this.changeTextColor(ColorManager.textColor(14));
            const em = this._player.registered_email || '（無登入電郵）';
            this.drawText('帳號：' + String(em).slice(0, 36), 4, y, textW, 'left');
            y += this.lineHeight();
            this.contents.fontSize = mainFont;
        }

        this.changeTextColor(ColorManager.systemColor());
        this.contents.fontSize = helpFont;
        this.drawText("隊伍（參考）", 4, y, textW, 'center');
        y += this.lineHeight();
        this.contents.fontSize = Math.min(mainFont, 18);
        let actors = [];
        try {
            actors = typeof this._player.actors_data === 'string' ? JSON.parse(this._player.actors_data) : this._player.actors_data;
        } catch (e) {
            console.warn("無法解析玩家隊伍資料", e);
        }

        const maxY = this.innerHeight - bottomReserve;
        if (actors && actors.length > 0) {
            actors.forEach((actor, i) => {
                if (y >= maxY) return;
                this.resetTextColor();
                const nm = String(actor.name || '').slice(0, 8);
                this.drawText(nm, 6, y, textW - 50);
                this.changeTextColor(ColorManager.textColor(3));
                this.drawText(`Lv${actor.level}`, 4, y, textW - 8, 'right');
                y += this.lineHeight();
            });
        } else {
            if (y < maxY) {
                this.resetTextColor();
                this.drawText("（無）", 4, y, textW, 'center');
                y += this.lineHeight();
            }
        }

        this.contents.fontSize = helpFont;
        if (this._player.updated_at) {
            const date = new Date(this._player.updated_at);
            this.changeTextColor(ColorManager.textColor(8));
            const ds = `${date.toLocaleDateString()} ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
            this.drawText(`更新 ${ds}`, 4, this.innerHeight - this.lineHeight() - 2, textW, 'left');
        }
        this.contents.fontSize = mainFont;
    }
}

class Scene_Leaderboard extends Scene_MenuBase {
    create() {
        super.create();
        this.createTabWindow();
        this.createDetailWindow();
        this.createListWindow();
    }
    createTabWindow() {
        const rect = new Rectangle(0, this.mainAreaTop(), Graphics.boxWidth, this.calcWindowHeight(1, true));
        this._tabWindow = new Window_LeaderboardTab(rect);
        this._tabWindow.setHandler('ok', this.onTabOk.bind(this));
        this._tabWindow.setHandler('cancel', this.popScene.bind(this));
        this._tabWindow.setHandler('select', this.onTabSelect.bind(this));
        this.addWindow(this._tabWindow);
    }
    createDetailWindow() {
        const detailW = Math.min(340, Math.max(260, Math.floor(Graphics.boxWidth * 0.38)));
        this._leaderboardDetailW = detailW;
        const x = Graphics.boxWidth - detailW;
        const y = this._tabWindow.y + this._tabWindow.height;
        const height = this.mainAreaHeight() - this._tabWindow.height;
        const rect = new Rectangle(x, y, detailW, height);
        this._detailWindow = new Window_LeaderboardDetail(rect);
        this.addWindow(this._detailWindow);
    }
    createListWindow() {
        const y = this._tabWindow.y + this._tabWindow.height;
        const width = Graphics.boxWidth - this._leaderboardDetailW;
        const height = this.mainAreaHeight() - this._tabWindow.height;
        const rect = new Rectangle(0, y, width, height);
        this._listWindow = new Window_LeaderboardList(rect);
        this._listWindow.setHandler('cancel', this.onListCancel.bind(this));
        this._listWindow.setHelpWindow(this._detailWindow);
        this.addWindow(this._listWindow);
        
        this._leaderboardTabSymbol = this._tabWindow.currentSymbol();
        this._detailWindow.setSortKey(this._leaderboardTabSymbol || 'score');
        this._tabWindow.activate(); 
    }
    update() {
        Scene_MenuBase.prototype.update.call(this);
        if (this._tabWindow && this._tabWindow.active) {
            const sym = this._tabWindow.currentSymbol();
            if (sym && sym !== this._leaderboardTabSymbol) {
                this._leaderboardTabSymbol = sym;
                this._detailWindow.setSortKey(sym);
                this._detailWindow.setPlayerData(null);
            }
        }
    }
    onTabSelect() {}
    onTabOk() {
        const sortKey = this._tabWindow.currentSymbol();
        this._listWindow.loadData(sortKey); 
        this._listWindow.activate();
    }
    onListCancel() {
        this._listWindow.deselect();
        this._listWindow.refresh(); 
        this._detailWindow.setPlayerData(null);
        this._tabWindow.activate();
    }
}