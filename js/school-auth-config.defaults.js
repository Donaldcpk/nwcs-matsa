/**
 * 學校登入設定（會進 Git；公開儲存庫＝此檔內容任何人都看得到）。
 * Supabase 金鑰為 anon/publishable，與 plugins.js → OmniscientEncyclopedia 須一致。
 * 勿在此放入 service_role。若不想公開教師電郵清單，請改「私人儲存庫」或改用 CI 注入。
 */
window.SCHOOL_AUTH = {
    supabaseUrl: 'https://oqsvxizemgyfointylpe.supabase.co',
    supabaseAnonKey:
        'sb_publishable_rk_C92nMfpMxwZ0ciWajPw_jUYxWrCw',
    adminAuthEmail: 'admin@ngwahsec.edu.hk',
    adminEmails: [
        'nwcs211@ngwahsec.edu.hk',
        'nwcs233@ngwahsec.edu.hk',
        'admin@ngwahsec.edu.hk',
        'nwcs134@ngwahsec.edu.hk',
        'nwcs198@ngwahsec.edu.hk',
        'nwcs203@ngwahsec.edu.hk'
    ],
    studentEmailDomain: 'ngwahsec.edu.hk',
    storagePrefix: 'nwcs_sb_',
    skipGateOnNwjs: true
};
