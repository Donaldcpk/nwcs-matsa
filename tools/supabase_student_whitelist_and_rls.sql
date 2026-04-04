-- =============================================================================
-- 學校電郵名冊 + 排行榜身分綁定（Supabase SQL Editor 執行）
-- 與遊戲端 school-auth-gate、OmniscientEncyclopedia 搭配。
--
-- 【重要順序】若已啟用本檔底部的 auth.users 觸發器：
--   1) 先將電郵寫入 student_whitelist（見 tools/supabase_seed_admin_whitelist.sql）
--   2) 再到 Authentication → Users 手動新增／邀請使用者
--   否則 Dashboard 會回報「此電郵未列入授權名冊」。
-- =============================================================================

-- 1) 名冊：email、earth_ref（地球身分參照，全班／全球榜可見）、seat_code（可選／舊欄位）、不要放密碼。
CREATE TABLE IF NOT EXISTS public.student_whitelist (
    email text PRIMARY KEY,
    seat_code text,
    earth_ref text,
    is_admin boolean NOT NULL DEFAULT false
);

ALTER TABLE public.student_whitelist ADD COLUMN IF NOT EXISTS earth_ref text;

ALTER TABLE public.student_whitelist ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "student_whitelist_select_own" ON public.student_whitelist;
CREATE POLICY "student_whitelist_select_own"
  ON public.student_whitelist
  FOR SELECT
  TO authenticated
  USING (lower(email) = lower((auth.jwt() ->> 'email')::text));

-- 2) 排行榜新增欄位（若已存在會略過錯誤，可手動對照）
ALTER TABLE public.global_leaderboard
  ADD COLUMN IF NOT EXISTS registered_email text;

ALTER TABLE public.global_leaderboard
  ADD COLUMN IF NOT EXISTS seat_code text;

ALTER TABLE public.global_leaderboard
  ADD COLUMN IF NOT EXISTS earth_ref text;

-- 3) 寫入時強制 player_id、registered_email、seat_code、earth_ref 與 JWT／名冊一致（防止客戶端竄改）
CREATE OR REPLACE FUNCTION public.global_leaderboard_enforce_identity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  jwt_email text;
  ref_earth text;
  ref_seat text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION '需要登入後才能寫入排行榜';
  END IF;
  jwt_email := auth.jwt() ->> 'email';
  NEW.player_id := auth.uid()::text;
  NEW.registered_email := jwt_email;
  SELECT w.earth_ref, w.seat_code INTO ref_earth, ref_seat
  FROM public.student_whitelist w
  WHERE lower(w.email) = lower(jwt_email)
  LIMIT 1;
  NEW.seat_code := ref_seat;
  NEW.earth_ref := COALESCE(NULLIF(trim(ref_earth), ''), ref_seat);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_global_leaderboard_identity ON public.global_leaderboard;
CREATE TRIGGER trg_global_leaderboard_identity
  BEFORE INSERT OR UPDATE ON public.global_leaderboard
  FOR EACH ROW
  EXECUTE FUNCTION public.global_leaderboard_enforce_identity();

-- 4) 排行榜 RLS：任何人可讀；僅已登入者可寫入自己的列
ALTER TABLE public.global_leaderboard ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "global_leaderboard_select_public" ON public.global_leaderboard;
DROP POLICY IF EXISTS "global_leaderboard_insert_anon" ON public.global_leaderboard;
DROP POLICY IF EXISTS "global_leaderboard_update_anon" ON public.global_leaderboard;
DROP POLICY IF EXISTS "global_leaderboard_insert_auth" ON public.global_leaderboard;
DROP POLICY IF EXISTS "global_leaderboard_update_auth" ON public.global_leaderboard;

CREATE POLICY "global_leaderboard_select_public"
  ON public.global_leaderboard
  FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "global_leaderboard_insert_auth"
  ON public.global_leaderboard
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid()::text = player_id);

CREATE POLICY "global_leaderboard_update_auth"
  ON public.global_leaderboard
  FOR UPDATE
  TO authenticated
  USING (auth.uid()::text = player_id)
  WITH CHECK (auth.uid()::text = player_id);

-- 5) 僅允許「名冊內電郵」註冊 Auth（若建立失敗，見檔案底部備註）
CREATE OR REPLACE FUNCTION public.enforce_student_whitelist_signup()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.student_whitelist w
    WHERE lower(w.email) = lower(NEW.email)
  ) THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION '此電郵未列入授權名冊，請向老師查詢。';
END;
$$;

DROP TRIGGER IF EXISTS trg_auth_users_whitelist ON auth.users;
CREATE TRIGGER trg_auth_users_whitelist
  BEFORE INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_student_whitelist_signup();

-- -----------------------------------------------------------------------------
-- 管理員名冊：範例見 tools/supabase_seed_admin_whitelist.sql；真實電郵請用 .local.sql（見 SECURITY_GIT.txt）
-- -----------------------------------------------------------------------------
-- Supabase：Authentication → Providers → Email → 建議關閉「Confirm email」以利學生首次登入。
-- 若 auth.users 觸發器無法建立，可改由老師在 Dashboard 手動「Add user」，並仍保留名冊供 seat 查詢。
-- -----------------------------------------------------------------------------
