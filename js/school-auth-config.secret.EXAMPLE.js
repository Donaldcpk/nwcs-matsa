/**
 * 複製此檔為 school-auth-config.secret.js（勿提交 Git）後填入真實值。
 * cp js/school-auth-config.secret.EXAMPLE.js js/school-auth-config.secret.js
 */
Object.assign(window.SCHOOL_AUTH, {
    supabaseUrl: 'https://YOUR_PROJECT.supabase.co',
    supabaseAnonKey: 'YOUR_ANON_OR_PUBLISHABLE_KEY',
    adminAuthEmail: 'admin@your-school.edu.hk',
    adminEmails: [
        'admin@your-school.edu.hk'
        /* 其他教師 Auth 電郵 */
    ],
    studentEmailDomain: 'your-school.edu.hk'
});
