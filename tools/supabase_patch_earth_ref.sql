-- =============================================================================
-- 已部署舊版名冊／排行榜時請執行此補丁（新增「地球身分參照」earth_ref）
-- 執行完再跑 Python 產生的 whitelist_inserts.sql
-- =============================================================================

ALTER TABLE public.student_whitelist
  ADD COLUMN IF NOT EXISTS earth_ref text;

ALTER TABLE public.global_leaderboard
  ADD COLUMN IF NOT EXISTS earth_ref text;

-- 舊資料：若曾把座號放在 seat_code，先複製到 earth_ref（避免空白）
UPDATE public.student_whitelist
SET earth_ref = seat_code
WHERE (earth_ref IS NULL OR earth_ref = '')
  AND seat_code IS NOT NULL
  AND seat_code <> ''
  AND seat_code <> 'ADMIN';

UPDATE public.global_leaderboard
SET earth_ref = seat_code
WHERE (earth_ref IS NULL OR earth_ref = '')
  AND seat_code IS NOT NULL
  AND seat_code <> '';

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
