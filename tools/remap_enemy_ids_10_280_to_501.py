#!/usr/bin/env python3
"""
將 data/Enemies.json 中敵人資料庫 ID 10–280 平移到 501–771（newId = oldId + 491），
並同步 data/Troops.json：members[].enemyId 與戰鬥事件 code 336 第二參數。

用法:
  python3 tools/remap_enemy_ids_10_280_to_501.py --dry-run
  python3 tools/remap_enemy_ids_10_280_to_501.py --write   # 備份 .bak 後寫入

注意: 不可對 Troops 做「所有 10–280 整數」全域替換（會誤傷等待 230 等指令）。
若使用 sync_enemies_from_xlsx，Excel 敵人 id 欄也需改為新編號。
"""

from __future__ import annotations

import argparse
import copy
import json
import shutil
import sys
from pathlib import Path
from typing import Any

LO_ID = 10
HI_ID = 280
OFFSET = 491  # 10 -> 501


def repo_root() -> Path:
    return Path(__file__).resolve().parent.parent


def write_rmmz_array_json(path: Path, data: list[Any]) -> None:
    """RMMZ 慣例：[\n null,\n {...},\n ...\n]"""
    with path.open("w", encoding="utf-8", newline="\n") as f:
        f.write("[\n")
        f.write("null,\n")
        last = len(data) - 1
        for i in range(1, len(data)):
            line = json.dumps(data[i], ensure_ascii=False, separators=(",", ":"))
            if i < last:
                f.write(line + ",\n")
            else:
                f.write(line + "\n")
        f.write("]\n")


def migrate_enemies(enemies: list[Any]) -> tuple[list[Any], dict[str, int]]:
    """回傳 (新陣列, 統計)。"""
    stats = {"moved": 0, "blanked": 0}
    working = copy.deepcopy(enemies)
    blank_src = working[501]
    if not isinstance(blank_src, dict):
        raise SystemExit("Enemies.json index 501 must be a dict (blank template).")

    for old in range(LO_ID, HI_ID + 1):
        new_id = old + OFFSET
        if new_id >= len(working):
            raise SystemExit(f"Enemies.json too short: need index >= {new_id}")
        src = working[old]
        if not isinstance(src, dict):
            raise SystemExit(f"Enemies.json index {old} must be a dict.")
        moved = copy.deepcopy(src)
        moved["id"] = new_id
        working[new_id] = moved
        stats["moved"] += 1

        blank = copy.deepcopy(blank_src)
        blank["id"] = old
        working[old] = blank
        stats["blanked"] += 1

    # 一致性：有 dict 處檢查 id 與索引
    for i in range(1, len(working)):
        e = working[i]
        if isinstance(e, dict) and e.get("id") != i:
            e["id"] = i

    return working, stats


def remap_troop_entry(troop: dict[str, Any]) -> tuple[int, int]:
    """回傳 (members 替換次數, 336 替換次數)。"""
    m_count = 0
    t336 = 0
    for m in troop.get("members") or []:
        if not isinstance(m, dict):
            continue
        eid = m.get("enemyId")
        if isinstance(eid, int) and LO_ID <= eid <= HI_ID:
            m["enemyId"] = eid + OFFSET
            m_count += 1
    for page in troop.get("pages") or []:
        if not isinstance(page, dict):
            continue
        for cmd in page.get("list") or []:
            if not isinstance(cmd, dict):
                continue
            if cmd.get("code") != 336:
                continue
            params = cmd.get("parameters")
            if not isinstance(params, list) or len(params) < 2:
                continue
            target = params[1]
            if isinstance(target, int) and LO_ID <= target <= HI_ID:
                params[1] = target + OFFSET
                t336 += 1
    return m_count, t336


def migrate_troops(troops: list[Any]) -> tuple[list[Any], int, int]:
    total_m = total_336 = 0
    out = copy.deepcopy(troops)
    for t in out:
        if not isinstance(t, dict):
            continue
        a, b = remap_troop_entry(t)
        total_m += a
        total_336 += b
    return out, total_m, total_336


def validate_post(
    enemies: list[Any], troops: list[Any]
) -> list[str]:
    errors: list[str] = []
    for t in troops:
        if not isinstance(t, dict):
            continue
        tid = t.get("id")
        for mi, m in enumerate(t.get("members") or []):
            if not isinstance(m, dict):
                continue
            eid = m.get("enemyId")
            if isinstance(eid, int) and LO_ID <= eid <= HI_ID:
                errors.append(f"Troop {tid} member[{mi}] still references old enemyId {eid}")
        for pi, page in enumerate(t.get("pages") or []):
            if not isinstance(page, dict):
                continue
            for li, cmd in enumerate(page.get("list") or []):
                if not isinstance(cmd, dict) or cmd.get("code") != 336:
                    continue
                p = cmd.get("parameters") or []
                if len(p) >= 2 and isinstance(p[1], int) and LO_ID <= p[1] <= HI_ID:
                    errors.append(
                        f"Troop {tid} page[{pi}] cmd[{li}] 336 still has target id {p[1]}"
                    )
    # 引用存在性
    for t in troops:
        if not isinstance(t, dict):
            continue
        tid = t.get("id")
        for mi, m in enumerate(t.get("members") or []):
            if not isinstance(m, dict):
                continue
            eid = m.get("enemyId")
            if not isinstance(eid, int) or eid <= 0:
                continue
            if eid >= len(enemies) or enemies[eid] is None:
                errors.append(f"Troop {tid} member[{mi}] enemyId {eid} out of range")
            elif isinstance(enemies[eid], dict) and enemies[eid].get("id") != eid:
                errors.append(f"Troop {tid} member[{mi}] enemyId {eid} id mismatch")
    return errors


def main() -> int:
    root = repo_root()
    enemies_path = root / "data" / "Enemies.json"
    troops_path = root / "data" / "Troops.json"

    ap = argparse.ArgumentParser(description="Remap enemy ids 10-280 -> 501-771 + Troops align.")
    ap.add_argument("--dry-run", action="store_true", help="Print stats only, do not write.")
    ap.add_argument("--write", action="store_true", help="Write files (creates .bak backups).")
    args = ap.parse_args()

    if not args.dry_run and not args.write:
        print("Specify --dry-run or --write", file=sys.stderr)
        return 2

    if not enemies_path.is_file() or not troops_path.is_file():
        print("Missing Enemies.json or Troops.json", file=sys.stderr)
        return 1

    enemies = json.loads(enemies_path.read_text(encoding="utf-8"))
    troops = json.loads(troops_path.read_text(encoding="utf-8"))

    new_enemies, estats = migrate_enemies(enemies)
    new_troops, tm, t336 = migrate_troops(troops)

    print("Enemies: moved slots", estats["moved"], "(each -> +491)")
    print("Troops: members enemyId remapped:", tm)
    print("Troops: code 336 target remapped:", t336)

    errs = validate_post(new_enemies, new_troops)
    if errs:
        print("Validation errors:", len(errs))
        for e in errs[:30]:
            print(" ", e)
        if len(errs) > 30:
            print(" ...")
        return 1

    print("Post-migration validation: OK")

    # 抽查 troop 401–505
    by_id = {t["id"]: t for t in new_troops if isinstance(t, dict) and "id" in t}
    for check in range(401, 506):
        tr = by_id.get(check)
        if not tr:
            continue
        sample = [m.get("enemyId") for m in (tr.get("members") or []) if isinstance(m, dict)]
        if sample:
            print(f"  Troop {check} enemyIds sample: {sample[:8]}{'...' if len(sample) > 8 else ''}")

    if args.dry_run:
        print("Dry-run only. Use --write to apply.")
        return 0

    bak_e = enemies_path.with_suffix(enemies_path.suffix + ".bak")
    bak_t = troops_path.with_suffix(troops_path.suffix + ".bak")
    shutil.copy2(enemies_path, bak_e)
    shutil.copy2(troops_path, bak_t)
    print("Backup:", bak_e)
    print("Backup:", bak_t)

    write_rmmz_array_json(enemies_path, new_enemies)
    write_rmmz_array_json(troops_path, new_troops)
    print("Wrote:", enemies_path)
    print("Wrote:", troops_path)
    return 0


if __name__ == "__main__":
    sys.exit(main())
