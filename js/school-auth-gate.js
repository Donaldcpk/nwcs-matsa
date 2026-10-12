/**
 * 網頁版進入遊戲前要先登入，成功後才載入 js/main.js。
 * 學生：互聯網登入（s 加 7 位數字），密碼是出生日期 8 位（年份在前）。
 * 老師：學校電郵或 nwcs 編號，密碼是校方已發的密碼。
 * 備用帳：只輸入 mathai01–mathai40（不用打 @），密碼是老師派發的備用密碼。
 * 設定見 school-auth-config.defaults.js。
 */
(function () {
    'use strict';

    var CFG = window.SCHOOL_AUTH || {};
    var PREFIX = CFG.storagePrefix || 'nwcs_sb_';

    function storageKey(suffix) {
        return PREFIX + suffix;
    }

    function schoolDomain() {
        return String(CFG.studentEmailDomain || 'ngwahsec.edu.hk').replace(/^@/, '').toLowerCase();
    }

    function isBackupMathai(local) {
        var m = /^mathai(\d{2})$/.exec(local);
        if (!m) return false;
        var n = parseInt(m[1], 10);
        return n >= 1 && n <= 40;
    }

    function isBackupMathaiEmail(email) {
        var local = String(email || '').toLowerCase().split('@')[0];
        return isBackupMathai(local);
    }

    function backupLoginError() {
        return '備用帳登入失敗。請輸入 mathai01 到 mathai40，密碼用老師派發的備用密碼。';
    }

    function shouldAutoRegister(email, errorMessage) {
        var msg = String(errorMessage || '').toLowerCase();
        if (msg.indexOf('太多') >= 0 || msg === '429' || msg.indexOf('too many') >= 0) return false;
        if (isBackupMathaiEmail(email)) return false;
        return msg.indexOf('invalid') >= 0 || msg.indexOf('credential') >= 0 || msg.indexOf('password') >= 0;
    }

    function normalizeEmail(raw) {
        var s = String(raw || '').trim().toLowerCase();
        var domain = schoolDomain();
        if (s === 'admin') {
            return String(CFG.adminAuthEmail || 'admin@' + domain).toLowerCase();
        }
        // 學生只打 s+7 位、老師只打 nwcs 編號、備用帳只打 mathai01–mathai40 時，自動補上學校電郵。
        var localStaff = /^[a-z][a-z0-9._+-]*$/.test(s) && /^(nwcs|nwcsw|nwcsssw|nwcsies|nwcsptc)/.test(s);
        if (/^s\d{7}$/.test(s) || /^nwcs\d+$/.test(s) || isBackupMathai(s) || (s.indexOf('@') < 0 && localStaff)) {
            return s + '@' + domain;
        }
        return s;
    }

    function authBase() {
        return String(CFG.supabaseUrl || '').replace(/\/+$/, '');
    }

    function anonKey() {
        return String(CFG.supabaseAnonKey || '').trim();
    }

    function isConfiguredAdminEmail(email) {
        var e = String(email || '').toLowerCase();
        var list = CFG.adminEmails;
        if (Array.isArray(list) && list.length) {
            for (var i = 0; i < list.length; i++) {
                if (String(list[i] || '').toLowerCase() === e) return true;
            }
            return false;
        }
        return e === String(CFG.adminAuthEmail || '').toLowerCase();
    }

    function applySession(session) {
        if (!session || !session.access_token) return;
        window.__sbAccessToken = session.access_token;
        window.__sbRefreshToken = session.refresh_token || '';
        var user = session.user || {};
        window.__sbUserId = user.id || '';
        window.__sbUserEmail = (user.email || '').toLowerCase();
        window.__sbIsAdmin = isConfiguredAdminEmail(window.__sbUserEmail);
        try {
            localStorage.setItem(storageKey('at'), session.access_token);
            localStorage.setItem(storageKey('rt'), session.refresh_token || '');
            localStorage.setItem(storageKey('uid'), window.__sbUserId);
            localStorage.setItem(storageKey('em'), window.__sbUserEmail);
        } catch (e) {
            /* ignore */
        }
    }

    function clearSession() {
        window.__sbAccessToken = '';
        window.__sbRefreshToken = '';
        window.__sbUserId = '';
        window.__sbUserEmail = '';
        window.__sbIsAdmin = false;
        window.__sbSeatCode = '';
        window.__sbEarthRef = '';
        try {
            localStorage.removeItem(storageKey('at'));
            localStorage.removeItem(storageKey('rt'));
            localStorage.removeItem(storageKey('uid'));
            localStorage.removeItem(storageKey('em'));
        } catch (e) {
            /* ignore */
        }
    }

    async function fetchSeatCode(accessToken) {
        var email = window.__sbUserEmail;
        if (!email || !accessToken) return;
        var base = authBase();
        var key = anonKey();
        var url =
            base +
            '/rest/v1/student_whitelist?select=earth_ref,seat_code,is_admin&email=eq.' +
            encodeURIComponent(email);
        try {
            var r = await fetch(url, {
                headers: {
                    apikey: key,
                    Authorization: 'Bearer ' + accessToken,
                    'Content-Type': 'application/json'
                }
            });
            if (!r.ok) return;
            var rows = await r.json();
            if (rows && rows[0]) {
                window.__sbEarthRef = rows[0].earth_ref || rows[0].seat_code || '';
                window.__sbSeatCode = rows[0].seat_code || '';
                if (rows[0].is_admin === true) {
                    window.__sbIsAdmin = true;
                }
            }
        } catch (e) {
            console.warn('[school-auth] seat fetch', e);
        }
    }

    async function signInWithPassword(email, password) {
        var base = authBase();
        var key = anonKey();
        var res = await fetch(base + '/auth/v1/token?grant_type=password', {
            method: 'POST',
            headers: {
                apikey: key,
                Authorization: 'Bearer ' + key,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ email: email, password: password })
        });
        var data = await res.json().catch(function () {
            return {};
        });
        if (!res.ok) {
            if (res.status === 429) {
                throw new Error('429');
            }
            var msg = data.msg || data.error_description || data.message || '登入失敗';
            throw new Error(msg);
        }
        return data;
    }

    function sleep(ms) {
        return new Promise(function (resolve) {
            setTimeout(resolve, ms);
        });
    }

    async function signInWithRetry(email, password) {
        var lastError = null;
        for (var attempt = 0; attempt < 4; attempt++) {
            try {
                return await signInWithPassword(email, password);
            } catch (e) {
                var msg = String(e && e.message ? e.message : e);
                if (msg !== '429' && msg.toLowerCase().indexOf('too many') < 0) {
                    throw e;
                }
                lastError = e;
                await sleep(2000 * (attempt + 1));
            }
        }
        throw new Error('同一時間登入的人太多，請等約半分鐘再按一次。帳號本身沒有問題。');
    }

    async function signUp(email, password) {
        var base = authBase();
        var key = anonKey();
        var res = await fetch(base + '/auth/v1/signup', {
            method: 'POST',
            headers: {
                apikey: key,
                Authorization: 'Bearer ' + key,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ email: email, password: password })
        });
        var data = await res.json().catch(function () {
            return {};
        });
        if (!res.ok) {
            var msg = data.msg || data.error_description || data.message || '註冊失敗';
            throw new Error(msg);
        }
        return data;
    }

    async function refreshSession(refreshToken) {
        var base = authBase();
        var key = anonKey();
        var res = await fetch(base + '/auth/v1/token?grant_type=refresh_token', {
            method: 'POST',
            headers: {
                apikey: key,
                Authorization: 'Bearer ' + key,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ refresh_token: refreshToken })
        });
        var data = await res.json().catch(function () {
            return {};
        });
        if (!res.ok) throw new Error('工作階段已過期，請重新登入');
        return data;
    }

    async function tryRestoreSession() {
        try {
            var rt = localStorage.getItem(storageKey('rt'));
            if (!rt) return false;
            var data = await refreshSession(rt);
            if (data.access_token) {
                applySession(data);
                await fetchSeatCode(data.access_token);
                return true;
            }
        } catch (e) {
            clearSession();
        }
        return false;
    }

    function loadMainGame() {
        if (window.__nwcsMainLoaded) return;
        window.__nwcsMainLoaded = true;
        var s = document.createElement('script');
        s.src = 'js/main.js';
        s.defer = true;
        document.body.appendChild(s);
    }

    function hideGate() {
        var g = document.getElementById('schoolLoginGate');
        if (g) {
            g.style.display = 'none';
            g.setAttribute('aria-hidden', 'true');
        }
    }

    function showErr(el, text) {
        if (el) {
            el.textContent = text || '';
            el.style.display = text ? 'block' : 'none';
        }
    }

    function buildGate() {
        var gate = document.createElement('div');
        gate.id = 'schoolLoginGate';
        gate.setAttribute('role', 'dialog');
        gate.innerHTML =
            '<div class="school-login-card">' +
            '<h1 class="school-login-title">伍華數學練習</h1>' +
            '<p class="school-login-hint">學生：登入名稱是互聯網登入（<strong>s</strong> 後面 7 個數字）。密碼是出生日期 <strong>8 位</strong>，年份在前。</p>' +
            '<p class="school-login-hint">老師：登入名稱是學校電郵或 nwcs 編號。密碼是校方已發的密碼。管理帳號可輸入 admin。</p>' +
            '<p class="school-login-hint">備用帳號：只輸入 <strong>mathai01</strong> 到 <strong>mathai40</strong>（不用打 @）。密碼用老師派發的備用密碼。</p>' +
            '<label class="school-login-label">登入名稱</label>' +
            '<input type="text" id="schoolLoginEmail" class="school-login-input" autocomplete="username" autocapitalize="none" spellcheck="false" />' +
            '<label class="school-login-label">密碼</label>' +
            '<input type="password" id="schoolLoginPassword" class="school-login-input" autocomplete="current-password" />' +
            '<p id="schoolLoginError" class="school-login-error" style="display:none"></p>' +
            '<button type="button" id="schoolLoginBtn" class="school-login-btn">登入並進入遊戲</button>' +
            '</div>';
        document.body.appendChild(gate);

        var errEl = document.getElementById('schoolLoginError');
        var btn = document.getElementById('schoolLoginBtn');
        var em = document.getElementById('schoolLoginEmail');
        var pw = document.getElementById('schoolLoginPassword');

        btn.addEventListener('click', async function () {
            showErr(errEl, '');
            var email = normalizeEmail(em.value);
            var password = String(pw.value || '');
            if (!email || !password) {
                showErr(errEl, '請輸入電郵與密碼。');
                return;
            }
            btn.disabled = true;
            try {
                var data;
                try {
                    data = await signInWithRetry(email, password);
                } catch (e1) {
                    var msg1 = String(e1.message || e1 || '');
                    if (!shouldAutoRegister(email, msg1)) {
                        if (isBackupMathaiEmail(email) && msg1.indexOf('太多') < 0 && msg1 !== '429') {
                            throw new Error(backupLoginError());
                        }
                        throw e1;
                    }
                    try {
                        var up = await signUp(email, password);
                        if (up.session && up.session.access_token) {
                            data = up.session;
                        } else if (up.access_token) {
                            data = up;
                        } else {
                            data = await signInWithRetry(email, password);
                        }
                    } catch (e2) {
                        var msg2 = String(e2.message || e2 || '').toLowerCase();
                        if (msg2.indexOf('already') >= 0 || msg2.indexOf('registered') >= 0) {
                            throw new Error('這個登入名稱已有帳號。學生請核對出生日期 8 位；老師請用校方已發的密碼。');
                        }
                        throw new Error(
                            '無法建立帳號：' +
                                (e2.message || e2) +
                                '。請確認登入名稱已列入本學年名冊。'
                        );
                    }
                }
                applySession(data);
                await fetchSeatCode(data.access_token);
                hideGate();
                loadMainGame();
            } catch (e) {
                showErr(errEl, String(e.message || e));
            } finally {
                btn.disabled = false;
            }
        });
    }

    function isSchoolAuthConfigured() {
        var u = String(CFG.supabaseUrl || '');
        var k = String(CFG.supabaseAnonKey || '');
        if (!u || !k) return false;
        if (u.indexOf('YOUR_PROJECT') >= 0) return false;
        if (k.indexOf('YOUR_') >= 0) return false;
        return true;
    }

    function showConfigMissingOverlay() {
        var d = document.createElement('div');
        d.id = 'schoolLoginGate';
        d.style.cssText =
            'position:fixed;inset:0;z-index:10000;display:flex;align-items:center;justify-content:center;background:#111;color:#eee;font-family:system-ui,sans-serif;padding:1rem;';
        d.innerHTML =
            '<div style="max-width:420px;line-height:1.5">' +
            '<h2 style="margin-top:0">缺少學校登入設定</h2>' +
            '<p>請編輯 <code>js/school-auth-config.defaults.js</code>，填入 Supabase 網址與金鑰（須與 plugins.js 內全知圖鑑一致）。</p>' +
            '<p style="opacity:0.85;font-size:0.9rem">公開儲存庫時此檔會被看見；勿放 service_role。</p>' +
            '</div>';
        document.body.appendChild(d);
    }

    async function start() {
        var skip =
            typeof nw === 'object' &&
            CFG.skipGateOnNwjs !== false;
        if (skip) {
            loadMainGame();
            return;
        }
        if (!isSchoolAuthConfigured()) {
            showConfigMissingOverlay();
            return;
        }
        var restored = await tryRestoreSession();
        if (restored) {
            loadMainGame();
            return;
        }
        buildGate();
    }

    window.NWCS_normalizeSchoolLogin = normalizeEmail;
    window.NWCS_shouldAutoRegister = shouldAutoRegister;
    window.NWCS_backupLoginError = backupLoginError;

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', start);
    } else {
        start();
    }
})();
