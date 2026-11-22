#!/usr/bin/env node
/**
 * 將名冊同步至 Supabase public.student_whitelist（需 service_role，勿 commit 金鑰）。
 *
 * 用法：
 *   export SUPABASE_URL="https://oqsvxizemgyfointylpe.supabase.co"
 *   export SUPABASE_SERVICE_ROLE_KEY="sb_secret_..."
 *   node tools/sync_student_whitelist_from_csv.mjs --csv ./tools/student_whitelist_rows.csv
 *   node tools/sync_student_whitelist_from_csv.mjs --backup-mathai
 *
 * --backup-mathai 只寫入 mathai01–mathai40，不需要名冊 CSV。
 * 密碼不要放在這個腳本。Auth 帳號用 tools/provision_supabase_auth_users.mjs。
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

loadDotEnv(path.join(__dirname, '.env.supabase.local'));

const BASE = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const BATCH = 100;
const DOMAIN = (process.env.NWCS_EMAIL_DOMAIN || 'ngwahsec.edu.hk').replace(/^@/, '').toLowerCase();

function loadDotEnv(filePath) {
    if (!fs.existsSync(filePath)) return;
    const text = fs.readFileSync(filePath, 'utf8');
    for (const line of text.split(/\r?\n/)) {
        const t = line.trim();
        if (!t || t.startsWith('#')) continue;
        const eq = t.indexOf('=');
        if (eq < 1) continue;
        const key = t.slice(0, eq).trim();
        let val = t.slice(eq + 1).trim();
        if (
            (val.startsWith('"') && val.endsWith('"')) ||
            (val.startsWith("'") && val.endsWith("'"))
        ) {
            val = val.slice(1, -1);
        }
        if (process.env[key] == null || process.env[key] === '') {
            process.env[key] = val;
        }
    }
}

function parseArgs(argv) {
    const opts = {
        csv: path.join(__dirname, 'student_whitelist_rows.csv'),
        backupMathai: false
    };
    for (let i = 2; i < argv.length; i++) {
        if (argv[i] === '--csv' && argv[i + 1]) opts.csv = argv[++i];
        else if (argv[i] === '--backup-mathai') opts.backupMathai = true;
    }
    return opts;
}

function parseCsvLine(line) {
    const cells = [];
    let cur = '';
    let inQ = false;
    for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') {
            inQ = !inQ;
            continue;
        }
        if (ch === ',' && !inQ) {
            cells.push(cur.trim());
            cur = '';
            continue;
        }
        cur += ch;
    }
    cells.push(cur.trim());
    return cells;
}

function readWhitelistCsv(filePath) {
    const text = fs.readFileSync(filePath, 'utf8');
    const lines = text.split(/\r?\n/).filter(Boolean);
    if (!lines.length) return [];
    const header = parseCsvLine(lines[0]).map((h) => h.toLowerCase());
    const emailIdx = header.indexOf('email');
    const seatIdx = header.indexOf('seat_code');
    const adminIdx = header.indexOf('is_admin');
    const earthIdx = header.indexOf('earth_ref');
    const rows = [];
    for (let i = 1; i < lines.length; i++) {
        const c = parseCsvLine(lines[i]);
        const email = (c[emailIdx] || '').trim().toLowerCase();
        if (!email || !email.includes('@')) continue;
        rows.push({
            email,
            seat_code: c[seatIdx] || null,
            earth_ref: c[earthIdx] || c[seatIdx] || null,
            is_admin: (c[adminIdx] || '').toLowerCase() === 'true'
        });
    }
    return rows;
}

function backupMathaiRows() {
    const rows = [];
    for (let n = 1; n <= 40; n++) {
        const id = 'mathai' + String(n).padStart(2, '0');
        rows.push({
            email: `${id}@${DOMAIN}`,
            seat_code: id.toUpperCase(),
            earth_ref: id,
            is_admin: false
        });
    }
    return rows;
}

async function upsertBatch(batch) {
    const res = await fetch(`${BASE}/rest/v1/student_whitelist?on_conflict=email`, {
        method: 'POST',
        headers: {
            apikey: SERVICE_KEY,
            Authorization: `Bearer ${SERVICE_KEY}`,
            'Content-Type': 'application/json',
            Prefer: 'resolution=merge-duplicates,return=minimal'
        },
        body: JSON.stringify(batch)
    });
    if (!res.ok) {
        const text = await res.text();
        throw new Error(`批次 upsert 失敗 ${res.status}: ${text}`);
    }
}

async function main() {
    const opts = parseArgs(process.argv);
    if (!BASE || !SERVICE_KEY) {
        console.error('請設定 SUPABASE_URL 與 SUPABASE_SERVICE_ROLE_KEY（或寫入 tools/.env.supabase.local）');
        process.exit(1);
    }
    if (BASE.indexOf('bwkqqbuibrhlvvgojcsb') >= 0) {
        console.error('這支腳本不可指向舊的 mathrpg 專案。請改用 RMMZ-MATH。');
        process.exit(1);
    }

    const rows = opts.backupMathai ? backupMathaiRows() : null;
    if (!opts.backupMathai) {
        if (!fs.existsSync(opts.csv)) {
            console.error('找不到名冊 CSV：', opts.csv);
            process.exit(1);
        }
    }
    const data = rows || readWhitelistCsv(opts.csv);
    console.log(opts.backupMathai ? '備用帳名冊 mathai01–mathai40' : '名冊：' + opts.csv);
    console.log('待同步：', data.length, '筆');

    for (let i = 0; i < data.length; i += BATCH) {
        const batch = data.slice(i, i + BATCH);
        await upsertBatch(batch);
        console.log(`[OK] ${Math.min(i + BATCH, data.length)} / ${data.length}`);
        await new Promise((r) => setTimeout(r, 200));
    }

    console.log('student_whitelist 同步完成');
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
