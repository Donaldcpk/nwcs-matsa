/**
 * 檢查登入名稱會不會自動補上學校電郵。
 * 備用帳 mathai01–mathai40 必須不用打 @ 也能變成完整電郵。
 */
import fs from 'fs';
import vm from 'vm';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const gatePath = path.join(__dirname, '..', 'js', 'school-auth-gate.js');
const code = fs.readFileSync(gatePath, 'utf8');

const windowObj = {
    SCHOOL_AUTH: {
        studentEmailDomain: 'ngwahsec.edu.hk',
        adminAuthEmail: 'admin@ngwahsec.edu.hk',
        supabaseUrl: 'https://oqsvxizemgyfointylpe.supabase.co',
        supabaseAnonKey: 'test-key'
    }
};
const documentObj = {
    readyState: 'loading',
    addEventListener() {}
};
const context = vm.createContext({
    window: windowObj,
    document: documentObj,
    console,
    localStorage: {
        getItem() {
            return null;
        },
        setItem() {},
        removeItem() {}
    }
});
vm.runInContext(code, context);

const normalize = windowObj.NWCS_normalizeSchoolLogin;
if (typeof normalize !== 'function') {
    throw new Error('登入程式沒有露出 NWCS_normalizeSchoolLogin');
}

const domain = 'ngwahsec.edu.hk';
const cases = [
    ['mathai01', `mathai01@${domain}`],
    ['MATHAI40', `mathai40@${domain}`],
    [' mathai15 ', `mathai15@${domain}`],
    ['s1234567', `s1234567@${domain}`],
    ['nwcs211', `nwcs211@${domain}`],
    ['admin', `admin@${domain}`],
    [`mathai01@${domain}`, `mathai01@${domain}`],
    ['mathai00', 'mathai00'],
    ['mathai41', 'mathai41'],
    ['mathai1', 'mathai1'],
    ['mathai', 'mathai']
];

let failed = 0;
for (const [input, expected] of cases) {
    const got = normalize(input);
    if (got !== expected) {
        failed++;
        console.error(`[FAIL] ${JSON.stringify(input)} => ${JSON.stringify(got)}，預期 ${JSON.stringify(expected)}`);
    } else {
        console.log(`[OK] ${JSON.stringify(input)} => ${got}`);
    }
}

const shouldAutoRegister = windowObj.NWCS_shouldAutoRegister;
if (typeof shouldAutoRegister !== 'function') {
    throw new Error('登入程式沒有露出 NWCS_shouldAutoRegister');
}

const autoCases = [
    [`mathai01@${domain}`, 'Invalid login credentials', false],
    [`mathai40@${domain}`, 'Invalid login credentials', false],
    [`s1234567@${domain}`, 'Invalid login credentials', true],
    [`nwcs211@${domain}`, 'Invalid login credentials', true],
    [`mathai01@${domain}`, '429', false],
    [`s1234567@${domain}`, '同一時間登入的人太多', false]
];
for (const [email, message, expected] of autoCases) {
    const got = shouldAutoRegister(email, message);
    if (got !== expected) {
        failed++;
        console.error(`[FAIL] auto ${email} ${message} => ${got}，預期 ${expected}`);
    } else {
        console.log(`[OK] auto ${email} => ${got}`);
    }
}

const backupMsg = windowObj.NWCS_backupLoginError();
if (!backupMsg.includes('備用密碼') || backupMsg.includes('出生日期')) {
    failed++;
    console.error('[FAIL] 備用帳錯誤訊息不對：' + backupMsg);
} else {
    console.log('[OK] backup message');
}

if (failed) {
    process.exit(1);
}
console.log('登入名稱檢查通過');
