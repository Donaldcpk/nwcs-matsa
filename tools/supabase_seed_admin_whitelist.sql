-- =============================================================================
-- 【範例】管理員名冊 — 請複製為 supabase_seed_admin_whitelist.local.sql 後填入真實電郵
-- （*.local.sql 已列入 .gitignore，不會進入 Git）
-- 執行前須先有 student_whitelist 表（見 supabase_student_whitelist_and_rls.sql）
-- =============================================================================

INSERT INTO public.student_whitelist (email, seat_code, earth_ref, is_admin) VALUES
  ('teacher1@your-school.edu.hk', 'ADMIN', '教師', true),
  ('admin@your-school.edu.hk', 'ADMIN', '教師', true)
ON CONFLICT (email) DO UPDATE SET
  seat_code = EXCLUDED.seat_code,
  earth_ref = EXCLUDED.earth_ref,
  is_admin = EXCLUDED.is_admin;
