#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
將 enermy STAT.xlsx（工作表1）的數值寫入 data/Enemies.json。
欄位順序須與試算表相同：id, 最大hp, 最大mp, 攻擊, 魔法攻擊, 防禦, 魔法防禦, 敏捷度, 運氣, 經驗值, 金幣
會同步 params / exp / gold，並從備註移除 <TrueParams:...>（改以 params 為準）。

用法：
  python3 tools/merge_enemy_stats_from_xlsx.py [xlsx路徑]
預設 xlsx：~/Downloads/enermy STAT.xlsx
"""
import json
import re
import sys
from pathlib import Path

try:
    import openpyxl
except ImportError:
    print("請先安裝: pip install openpyxl")
    sys.exit(1)

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_XLSX = Path.home() / "Downloads" / "enermy STAT.xlsx"
ENEMIES_JSON = ROOT / "data" / "Enemies.json"


def parse_id(cell):
    if cell is None:
        return None
    if isinstance(cell, (int, float)) and not isinstance(cell, bool):
        return int(cell)
    s = str(cell).strip()
    m = re.match(r"^id\s*(\d+)$", s, re.I)
    if m:
        return int(m.group(1))
    if s.isdigit():
        return int(s)
    return None


def row_to_params(row):
    if len(row) < 9:
        return None
    nums = []
    for i in range(1, 9):
        v = row[i]
        if v is None:
            return None
        if isinstance(v, (int, float)):
            nums.append(int(round(v)))
        else:
            try:
                nums.append(int(float(str(v).replace(",", ""))))
            except ValueError:
                return None
    mhp, mmp, atk, mat, def_, mdf, agi, luk = nums
    # MZ: mhp, mmp, atk, def, mat, mdf, agi, luk
    return [mhp, mmp, atk, def_, mat, mdf, agi, luk]


def clean_note(note):
    if not note:
        return ""
    s = str(note)
    s = re.sub(r"<TrueParams\s*:[^>]*>", "", s, flags=re.I)
    return s.strip()


def main():
    xlsx = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_XLSX
    if not xlsx.is_file():
        print("找不到試算表:", xlsx)
        sys.exit(1)
    if not ENEMIES_JSON.is_file():
        print("找不到:", ENEMIES_JSON)
        sys.exit(1)

    wb = openpyxl.load_workbook(xlsx, read_only=True, data_only=True)
    ws = wb.active
    rows = list(ws.iter_rows(values_only=True))
    wb.close()

    updates = {}
    for row in rows[1:]:
        if not row or row[0] is None:
            continue
        eid = parse_id(row[0])
        if eid is None:
            continue
        params = row_to_params(row)
        if params is None:
            continue
        ex = g = None
        if len(row) > 9 and row[9] is not None and isinstance(row[9], (int, float)):
            ex = int(round(row[9]))
        if len(row) > 10 and row[10] is not None and isinstance(row[10], (int, float)):
            g = int(round(row[10]))
        updates[eid] = {"params": params, "exp": ex, "gold": g}

    with open(ENEMIES_JSON, "r", encoding="utf-8") as f:
        data = json.load(f)

    applied = 0
    for entry in data:
        if not entry or not isinstance(entry, dict):
            continue
        eid = entry.get("id")
        if eid not in updates:
            continue
        u = updates[eid]
        entry["params"] = u["params"]
        if u["exp"] is not None:
            entry["exp"] = u["exp"]
        if u["gold"] is not None:
            entry["gold"] = u["gold"]
        entry["note"] = clean_note(entry.get("note", ""))
        applied += 1

    with open(ENEMIES_JSON, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, separators=(",", ":"))

    missing = [i for i in sorted(updates) if not any(e and isinstance(e, dict) and e.get("id") == i for e in data)]
    print(f"已更新 {applied} 筆敵人；試算表有效列 {len(updates)}。")
    if missing:
        print("試算表有但 JSON 無 id:", missing)


if __name__ == "__main__":
    main()
