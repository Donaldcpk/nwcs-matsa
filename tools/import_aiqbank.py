#!/usr/bin/env python3
"""把 AIQbank.zip 裡「有題目圖片、而且答案表有答案」的選擇題匯進遊戲。

只寫入兩者都有的題。沒有答案、或沒有圖片的題不會進題庫。
"""

import io
import json
import os
import re
import zipfile

from openpyxl import load_workbook
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ZIP_PATH = os.environ.get(
    "AIQ_ZIP", "/Users/cdlanod/Documents/RMMZ/AIQbank.zip"
)
KEY_PATH = os.environ.get(
    "AIQ_KEY", "/Users/cdlanod/Downloads/Answer Key S1-6.xlsx"
)
PICTURE_DIR = os.path.join(ROOT, "img", "pictures", "AIQ")
DB_PATH = os.path.join(ROOT, "js", "plugins", "questionDatabase.js")
REPORT_PATH = os.path.join(ROOT, "tools", "output", "aiq_import_report.json")

IMG_RE = re.compile(
    r"JS-MATH-(\d)([AB])(\d{1,2})-(CHIT|ENG)-MCQ0*(\d+)(?:\(\d+\))?\.(png|jpg|jpeg)$",
    re.I,
)
HEADER_RE = re.compile(r"^(\d)([AB])(\d{2})(中文|英文)答案$")
SENIOR_RE = re.compile(r"^6(\d{2})(中文|英文)答案$")
Q_RE = re.compile(r"^Q(\d+)$", re.I)
ANS_RE = re.compile(r"^[A-E]$")


def topic_code(chapter):
    form = int(chapter[0])
    book = 0 if chapter[1] == "A" else 100
    return form * 1000 + book + int(chapter[2:])


def norm_answer(value):
    if value is None:
        return None
    text = str(value).strip().upper().replace(" ", "")
    text = (
        text.replace("Ａ", "A")
        .replace("Ｂ", "B")
        .replace("Ｃ", "C")
        .replace("Ｄ", "D")
        .replace("Ｅ", "E")
    )
    return text


def load_answers(path):
    book = load_workbook(path, data_only=True, read_only=True)
    answers = {}
    skipped = {"empty": 0, "bad": 0}
    try:
        for sheet_name in book.sheetnames:
            rows = list(book[sheet_name].iter_rows(values_only=True))
            if not rows:
                continue
            header = list(rows[0])
            column = 0
            while column < len(header):
                raw = header[column]
                if raw is None or str(raw).strip() == "":
                    column += 1
                    continue
                match = HEADER_RE.match(str(raw).strip())
                senior = None if match else SENIOR_RE.match(str(raw).strip())
                if not match and not senior:
                    column += 1
                    continue
                question_like = 0
                answer_like = 0
                for row in rows[1:8]:
                    if column >= len(row) or row[column] is None:
                        continue
                    cell = str(row[column]).strip().upper()
                    if Q_RE.match(cell):
                        question_like += 1
                    elif ANS_RE.match(cell):
                        answer_like += 1
                if question_like == 0 and answer_like > 0:
                    column += 1
                    continue
                answer_col = column + 1
                if match:
                    chapter = f"{match.group(1)}{match.group(2)}{match.group(3)}"
                    lang = "CH" if match.group(4) == "中文" else "EN"
                else:
                    chapter = "6" + senior.group(1)
                    lang = "CH" if senior.group(2) == "中文" else "EN"
                for row in rows[1:]:
                    if column >= len(row):
                        break
                    q_cell = row[column]
                    if q_cell is None or str(q_cell).strip() == "":
                        continue
                    q_match = Q_RE.match(str(q_cell).strip())
                    if not q_match:
                        continue
                    number = int(q_match.group(1))
                    answer = norm_answer(row[answer_col] if answer_col < len(row) else None)
                    if not answer:
                        skipped["empty"] += 1
                        continue
                    if not ANS_RE.match(answer):
                        skipped["bad"] += 1
                        continue
                    answers[(chapter, lang, number)] = answer
                column += 2
    finally:
        book.close()
    return answers, skipped


def iter_images(zip_path):
    with zipfile.ZipFile(zip_path) as outer:
        inners = [
            name
            for name in outer.namelist()
            if name.endswith(".zip") and not name.startswith("__MACOSX")
        ]
        for inner_name in inners:
            with zipfile.ZipFile(io.BytesIO(outer.read(inner_name))) as inner:
                for info in inner.infolist():
                    if info.is_dir() or info.filename.startswith("__MACOSX"):
                        continue
                    base = info.filename.split("/")[-1]
                    match = IMG_RE.search(base)
                    if not match:
                        continue
                    chapter = (
                        f"{match.group(1)}{match.group(2).upper()}"
                        f"{int(match.group(3)):02d}"
                    )
                    lang = "CH" if match.group(4).upper() == "CHIT" else "EN"
                    number = int(match.group(5))
                    ext = match.group(6).lower()
                    is_copy = "(" in base
                    yield {
                        "key": (chapter, lang, number),
                        "ext": ext,
                        "is_copy": is_copy,
                        "size": info.file_size,
                        "data": inner.read(info.filename),
                    }


def choose_images():
    chosen = {}
    for item in iter_images(ZIP_PATH):
        key = item["key"]
        rank = (0 if item["is_copy"] else 1, 1 if item["ext"] == "png" else 0, item["size"])
        current = chosen.get(key)
        if current is None or rank > current["rank"]:
            item["rank"] = rank
            chosen[key] = item
    return chosen


def save_png(data, ext, dest):
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    if ext == "png":
        with open(dest, "wb") as handle:
            handle.write(data)
        return
    with Image.open(io.BytesIO(data)) as image:
        image.convert("RGBA").save(dest, format="PNG")


def question_record(chapter, lang, number, answer):
    lang_folder = "CHIT" if lang == "CH" else "ENG"
    folder = f"JS-MATH-{chapter}-{lang_folder}-MCQ"
    filename = f"JS-MATH-{chapter}-{lang_folder}-MCQ{number:03d}.png"
    letters = ["A", "B", "C", "D", "E"]
    kind = 5 if answer == "E" else 4
    others = [letter for letter in letters[:kind] if letter != answer]
    return {
        "Note": chapter,
        "GUID": f"AIQ/{folder}/{filename}",
        "E": 0,
        "Q_T": kind,
        "Q": "請看題目圖片，選出正確答案。",
        "T": 0,
        "I": 1,
        "A": 0,
        "C_A": answer,
        "A2": others[0] if len(others) > 0 else "",
        "A3": others[1] if len(others) > 1 else "",
        "A4": others[2] if len(others) > 2 else "",
        "A5": others[3] if len(others) > 3 else "",
        "A5_Why": "",
        "S": "",
        "R_T": "None",
        "R_I": 0,
        "R_A": 0,
        "P_T": "None",
        "P_I": 0,
        "P_A": 0,
        "O_L": 0,
        "_file": filename,
        "_folder": folder,
    }


def write_database(groups, topics):
    lines = [
        "// 由 tools/import_aiqbank.py 產生。只收有答案、而且有圖片的題。",
        "var questionDatabase = {",
    ]
    keys = sorted(groups)
    for index, key in enumerate(keys):
        lines.append(f'    "{key}": [')
        rows = groups[key]
        for row_index, row in enumerate(rows):
            payload = {k: v for k, v in row.items() if not k.startswith("_")}
            comma = "," if row_index < len(rows) - 1 else ""
            lines.append("    " + json.dumps(payload, ensure_ascii=False) + comma)
        closer = "    ]," if index < len(keys) - 1 else "    ]"
        lines.append(closer)
    lines.append("};")
    lines.append("window.MZQ_TOPICS = " + json.dumps(topics, ensure_ascii=False, indent=4) + ";")
    lines.append("")
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    with open(DB_PATH, "w", encoding="utf-8") as handle:
        handle.write("\n".join(lines))


def main():
    print("讀取答案表...")
    answers, skipped = load_answers(KEY_PATH)
    print(f"有效答案 {len(answers)}，空白 {skipped['empty']}，無法辨認 {skipped['bad']}")
    print("讀取題目圖片...")
    images = choose_images()
    print(f"圖片 {len(images)}")
    both = sorted(key for key in images if key in answers)
    print(f"有答案又有圖片 {len(both)}")

    if os.path.isdir(PICTURE_DIR):
        for dirpath, _, filenames in os.walk(PICTURE_DIR):
            for filename in filenames:
                os.remove(os.path.join(dirpath, filename))

    groups = {}
    for key in both:
        chapter, lang, number = key
        record = question_record(chapter, lang, number, answers[key])
        image = images[key]
        dest = os.path.join(PICTURE_DIR, record["_folder"], record["_file"])
        save_png(image["data"], image["ext"], dest)
        groups.setdefault(f"{chapter}_{lang}", []).append(record)

    for rows in groups.values():
        rows.sort(key=lambda row: row["GUID"])

    topics = []
    for key in sorted(groups):
        chapter, lang = key.split("_")
        topics.append(
            {
                "key": key,
                "chapter": chapter,
                "lang": lang,
                "grade": int(chapter[0]),
                "code": topic_code(chapter),
                "count": len(groups[key]),
            }
        )
    write_database(groups, topics)

    by_chapter = {}
    for topic in topics:
        by_chapter.setdefault(topic["chapter"], {})[topic["lang"]] = topic["count"]
    report = {
        "answers": len(answers),
        "images": len(images),
        "imported": len(both),
        "skipped_empty_answers": skipped["empty"],
        "skipped_bad_answers": skipped["bad"],
        "images_without_answers": len(images) - len(both),
        "answers_without_images": len(answers) - len(both),
        "chapters": by_chapter,
    }
    os.makedirs(os.path.dirname(REPORT_PATH), exist_ok=True)
    with open(REPORT_PATH, "w", encoding="utf-8") as handle:
        json.dump(report, handle, ensure_ascii=False, indent=2)
    print(json.dumps({"imported": report["imported"], "chapters": len(by_chapter)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
