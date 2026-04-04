#!/usr/bin/env python3
"""
從校方 Excel 產生 student_whitelist 的 INSERT（請最後在本機執行一次即可）。

欄位假設：
  第 1 欄：學生電郵
  第 2 欄：密碼（僅供紙本／口頭提醒，腳本會略過，不寫入資料庫）
  第 3 欄：地球身分參照（會同步到排行榜 global_leaderboard.earth_ref，全班／全球榜可見）

  python3 tools/generate_student_whitelist_sql.py "/絕對路徑/STD AC.xlsx" > whitelist_inserts.sql

產生的 whitelist_inserts.sql 貼到 Supabase SQL Editor 執行。
請先執行 tools/supabase_student_whitelist_and_rls.sql，若資料庫是舊版再執行
tools/supabase_patch_earth_ref.sql（新增 earth_ref 欄位與觸發器）。
"""
from __future__ import annotations

import sys
import zipfile
import xml.etree.ElementTree as ET
from pathlib import Path


def read_shared_strings(z: zipfile.ZipFile) -> list[str]:
    data = z.read("xl/sharedStrings.xml")
    root = ET.fromstring(data)
    ns = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
    out: list[str] = []
    for si in root.findall(".//m:si", ns):
        out.append("".join(si.itertext()))
    return out


def col_index_from_ref(ref: str) -> int:
    letters = "".join(ch for ch in ref if ch.isalpha())
    n = 0
    for ch in letters:
        n = 26 * n + (ord(ch) - ord("A") + 1)
    return n - 1


def cell_value(c, strings: list[str], ns) -> str:
    v = c.find("m:v", ns)
    if v is None or v.text is None:
        return ""
    if c.get("t") == "s":
        return strings[int(v.text)]
    return v.text


def read_sheet_rows(path: Path, max_rows: int = 5000) -> list[list[str]]:
    with zipfile.ZipFile(path) as z:
        strings = read_shared_strings(z)
        sheet = z.read("xl/worksheets/sheet1.xml")
        root = ET.fromstring(sheet)
        ns = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
        rows_out: list[list[str]] = []
        for row in root.findall(".//m:row", ns):
            pairs: list[tuple[int, str]] = []
            for c in row.findall("m:c", ns):
                ref = c.get("r", "") or ""
                if not ref:
                    continue
                pairs.append((col_index_from_ref(ref), cell_value(c, strings, ns)))
            if not pairs:
                continue
            pairs.sort(key=lambda x: x[0])
            max_i = pairs[-1][0]
            line = [""] * (max_i + 1)
            for i, val in pairs:
                if i >= 0:
                    line[i] = val
            rows_out.append(line)
            if len(rows_out) >= max_rows:
                break
    return rows_out


def sql_escape(s: str) -> str:
    return s.replace("'", "''")


def main() -> None:
    if len(sys.argv) < 2:
        print(__doc__, file=sys.stderr)
        sys.exit(1)
    path = Path(sys.argv[1]).expanduser()
    if not path.is_file():
        print("找不到檔案:", path, file=sys.stderr)
        sys.exit(1)

    rows = read_sheet_rows(path)
    if not rows:
        print("-- 無資料", file=sys.stderr)
        sys.exit(1)

    print("-- 由 generate_student_whitelist_sql.py 產生；第三欄為地球身分參照 earth_ref")
    print("BEGIN;")
    for r in rows[1:]:
        while len(r) < 3:
            r.append("")
        email = (r[0] or "").strip().lower()
        earth_ref = (r[2] or "").strip()
        if not email or "@" not in email:
            continue
        if email in ("學生電郵", "email"):
            continue
        print(
            f"INSERT INTO public.student_whitelist (email, earth_ref, is_admin) "
            f"VALUES ('{sql_escape(email)}', '{sql_escape(earth_ref)}', false) "
            f"ON CONFLICT (email) DO UPDATE SET earth_ref = EXCLUDED.earth_ref;"
        )
    print("COMMIT;")


if __name__ == "__main__":
    main()
