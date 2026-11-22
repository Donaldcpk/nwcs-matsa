#!/usr/bin/env python3
"""把只有文字、沒有題目圖片的課題畫成題卡，補進遊戲。

只收答案表裡有 A–E 的題。已經有照片題的課題不會重畫。
"""

import json
import os
import re
import sys
from io import BytesIO

import matplotlib
matplotlib.use("Agg")
import numpy as np
from matplotlib.font_manager import FontProperties
from matplotlib.mathtext import math_to_image
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from import_aiqbank import load_answers  # noqa: E402

BANK = os.environ.get(
    "AIQ_BANK", "/Users/cdlanod/Documents/MATH ARPG 2.0/QuestionBank"
)
KEY_PATH = os.environ.get(
    "AIQ_KEY", "/Users/cdlanod/Downloads/Answer Key S1-6.xlsx"
)
DB_PATH = os.path.join(ROOT, "js", "plugins", "questionDatabase.js")
PICTURE_DIR = os.path.join(ROOT, "img", "pictures")
SNAP_PATH = os.path.join(ROOT, "tools", "output", "db_snapshot.json")

FONT_PATH = "/System/Library/Fonts/Hiragino Sans GB.ttc"
CARD_W = 980
MAX_H = 360
MARGIN = 16
Q_FONT = 22
A_FONT = 20
Q_MATH = 18
A_MATH = 16
MATH_DPI = 110
BG = (255, 252, 245)
INK = (28, 32, 38)
MUTED = (90, 96, 110)
ACCENT = (36, 99, 160)

ID_RE = re.compile(
    r"(?:JS|SS)-MATH-(\d)([AB])(\d{2})-(CHIT|ENG)-MCQ0*(\d+)",
    re.I,
)
SENIOR_ID_RE = re.compile(
    r"SS-MATH-6(\d{2})-(CHIT|ENG)-MCQ0*(\d+)",
    re.I,
)


def load_lenient(path):
    raw = open(path, encoding="utf-8").read()
    for _ in range(80):
        try:
            data = json.loads(raw)
            return data["questions"] if isinstance(data, dict) else data
        except json.JSONDecodeError as exc:
            if "escape" not in exc.msg:
                raise
            pos = exc.pos
            if pos >= len(raw) or raw[pos] != "\\":
                pos = raw.rfind("\\", 0, min(len(raw), exc.pos + 1))
            if pos < 0:
                raise
            raw = raw[:pos] + "\\\\" + raw[pos + 1 :]
    raise RuntimeError(path)


def latex_to_text(value):
    text = str(value or "")
    text = text.replace("$$", "\n").replace("$", "")
    text = re.sub(
        r"\\d?frac\{([^{}]+)\}\{([^{}]+)\}",
        lambda m: f"({m.group(1)})/({m.group(2)})",
        text,
    )
    text = re.sub(r"\\sqrt\{([^{}]+)\}", r"√(\1)", text)
    replacements = {
        r"\times": "×",
        r"\div": "÷",
        r"\cdot": "·",
        r"\pm": "±",
        r"\leq": "≤",
        r"\geq": "≥",
        r"\le": "≤",
        r"\ge": "≥",
        r"\neq": "≠",
        r"\ne": "≠",
        r"\approx": "≈",
        r"\pi": "π",
        r"\theta": "θ",
        r"\alpha": "α",
        r"\beta": "β",
        r"\circ": "°",
        r"\degree": "°",
        r"\triangle": "△",
        r"\angle": "∠",
        r"\parallel": "∥",
        r"\perp": "⊥",
        r"\infty": "∞",
        r"\sin": "sin",
        r"\cos": "cos",
        r"\tan": "tan",
        r"\log": "log",
        r"\ln": "ln",
        r"\left": "",
        r"\right": "",
        r"\quad": " ",
        r"\,": " ",
        r"\;": " ",
        r"\!": "",
        r"\displaystyle": "",
    }
    for src, dst in replacements.items():
        text = text.replace(src, dst)
    text = re.sub(r"\\(?:text|mathrm|textbf)\{([^{}]*)\}", r"\1", text)
    text = re.sub(r"\^\{([^{}]+)\}", r"^\1", text)
    text = re.sub(r"_\{([^{}]+)\}", r"_\1", text)
    text = text.replace("\\\\", "\n")
    text = re.sub(r"\\[a-zA-Z]+", "", text)
    text = text.replace("{", "").replace("}", "")
    text = text.replace("&", " ")
    text = re.sub(r"[ \t]+\n", "\n", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    text = re.sub(r"[ \t]{2,}", " ", text)
    return text.strip()


FOLDER_RE = re.compile(r"(?:JS|SS)-MATH-(\d)([AB])(\d{2})-(CHIT|ENG)", re.I)
FOLDER_SENIOR_RE = re.compile(r"SS-MATH-(6\d{2})-(CHIT|ENG)", re.I)


def parse_identity(question, folder):
    qid = str(question.get("question_id") or question.get("id") or "")
    number = None
    chapter = None
    lang = None
    senior = SENIOR_ID_RE.search(qid)
    numbered = ID_RE.search(qid)
    if senior:
        chapter = "6" + senior.group(1)
        lang = "CH" if senior.group(2).upper() == "CHIT" else "EN"
        number = int(senior.group(3))
    elif numbered:
        chapter = f"{numbered.group(1)}{numbered.group(2).upper()}{numbered.group(3)}"
        lang = "CH" if numbered.group(4).upper() == "CHIT" else "EN"
        number = int(numbered.group(5))
    folder_senior = FOLDER_SENIOR_RE.search(folder)
    folder_book = FOLDER_RE.search(folder)
    if folder_senior:
        chapter = folder_senior.group(1)
        lang = "CH" if folder_senior.group(2).upper() == "CHIT" else "EN"
    elif folder_book:
        chapter = f"{folder_book.group(1)}{folder_book.group(2).upper()}{folder_book.group(3)}"
        lang = "CH" if folder_book.group(4).upper() == "CHIT" else "EN"
    if not chapter or not lang or not number:
        return None
    return chapter, lang, number


def find_json_sets():
    sets = []
    for dirpath, _, files in os.walk(BANK):
        if "廢" in dirpath or "__MACOSX" in dirpath:
            continue
        jsons = [name for name in files if name.endswith(".json")]
        pngs = [name for name in files if name.lower().endswith((".png", ".jpg", ".jpeg"))]
        if not jsons or pngs:
            continue
        sets.append((dirpath, jsons[0]))
    return sets


def figure_index():
    found = {}
    for dirpath, _, files in os.walk(BANK):
        if "-IMAGE" not in os.path.basename(dirpath):
            continue
        chapter_match = re.search(r"(\d)([AB])(\d{2})", os.path.basename(dirpath))
        if not chapter_match:
            continue
        chapter = f"{chapter_match.group(1)}{chapter_match.group(2).upper()}{chapter_match.group(3)}"
        for name in files:
            num = re.search(r"Q0*(\d+)", name, re.I)
            if not num:
                continue
            ext = os.path.splitext(name)[1].lower()
            if ext not in (".png", ".jpg", ".jpeg"):
                continue
            key = (chapter, int(num.group(1)))
            path = os.path.join(dirpath, name)
            if key not in found or ext == ".png":
                found[key] = path
    return found


MATH_RE = re.compile(r"\$\$(.+?)\$\$|(?<!\$)\$(?!\$)(.+?)(?<!\$)\$(?!\$)", re.S)
MATH_CACHE = {}


def normalize_delims(text):
    text = str(text or "")
    text = text.replace(r"\$", "＄")
    text = text.replace(r"\[", "$$").replace(r"\]", "$$")
    text = text.replace(r"\(", "$").replace(r"\)", "$")
    return text


CJK_RE = re.compile(r"[\u3000-\u303f\u3400-\u9fff\uf900-\ufaff\uff00-\uffef]")
TEXT_CMD_RE = re.compile(r"\\(?:text|textbf|operatorname)\{([^{}]*)\}")


def clean_math(expr):
    expr = expr.strip().replace("\n", " ")
    expr = expr.replace(r"\dfrac", r"\frac").replace(r"\tfrac", r"\frac")
    expr = expr.replace(r"\displaystyle", "").replace(r"\textstyle", "")
    expr = expr.replace(r"\left", "").replace(r"\right", "")
    expr = expr.replace(r"\quad", " ").replace(r"\,", " ").replace(r"\;", " ").replace(r"\!", "")
    return expr


def explode_math(expr):
    """公式裡的中文改回普通文字，避免 LaTeX 字型畫成方塊。"""
    expr = clean_math(expr)
    pieces = []
    pos = 0
    for match in TEXT_CMD_RE.finditer(expr):
        if match.start() > pos:
            pieces.extend(split_cjk(expr[pos:match.start()]))
        pieces.append(("t", match.group(1)))
        pos = match.end()
    if pos < len(expr):
        pieces.extend(split_cjk(expr[pos:]))
    merged = []
    for kind, value in pieces:
        if not value or not value.strip():
            continue
        if merged and merged[-1][0] == kind:
            merged[-1] = (kind, merged[-1][1] + value)
        else:
            merged.append((kind, value))
    return merged


def split_cjk(text):
    out = []
    buf = ""
    mode = None
    for char in text:
        kind = "t" if CJK_RE.match(char) else "m"
        if mode == kind:
            buf += char
        else:
            if buf.strip():
                out.append((mode, buf))
            mode = kind
            buf = char
    if buf and buf.strip():
        out.append((mode, buf))
    return out


def math_image(expr, size):
    key = (expr, size)
    if key in MATH_CACHE:
        return MATH_CACHE[key]
    image = None
    try:
        buf = BytesIO()
        math_to_image(
            f"${clean_math(expr)}$",
            buf,
            prop=FontProperties(size=size),
            dpi=MATH_DPI,
            format="png",
            color="#1c2026",
        )
        buf.seek(0)
        image = Image.open(buf).convert("RGBA")
        arr = np.array(image)
        white = (arr[:, :, 0] > 245) & (arr[:, :, 1] > 245) & (arr[:, :, 2] > 245)
        arr[white, 3] = 0
        image = Image.fromarray(arr)
        box = image.getbbox()
        if box:
            image = image.crop(box)
        if image.height > 48:
            ratio = 48 / image.height
            image = image.resize((max(1, int(image.width * ratio)), 48), Image.Resampling.LANCZOS)
        if image.width > 640:
            ratio = 640 / image.width
            image = image.resize((640, max(1, int(image.height * ratio))), Image.Resampling.LANCZOS)
    except Exception:
        image = None
    MATH_CACHE[key] = image
    return image


def layout_rich(draw, text, font, width, size):
    text = normalize_delims(text)
    parts = []
    pos = 0
    for match in MATH_RE.finditer(text):
        if match.start() > pos:
            parts.append(("t", text[pos:match.start()]))
        if match.group(1) is not None:
            parts.append(("d", match.group(1)))
        else:
            parts.append(("m", match.group(2)))
        pos = match.end()
    if pos < len(text):
        parts.append(("t", text[pos:]))
    lines = [[]]
    x = 0

    def newline():
        nonlocal x
        lines.append([])
        x = 0

    def add_text(value):
        nonlocal x
        value = latex_to_text(value) if "\\" in value else value
        for char in value:
            if char == "\n":
                newline()
                continue
            if char == " " and x == 0:
                continue
            advance = draw.textlength(char, font=font)
            if x and x + advance > width:
                newline()
            lines[-1].append(("c", char, advance))
            x += advance

    def add_math(value, math_size, display):
        nonlocal x
        rendered = False
        for subkind, subval in explode_math(value) or [("m", value)]:
            if subkind == "t":
                add_text(subval)
                rendered = True
                continue
            image = math_image(subval, math_size)
            if image is None:
                add_text(latex_to_text(subval))
                rendered = True
                continue
            if x and x + image.width > width:
                newline()
            lines[-1].append(("i", image, image.width + 4))
            x += image.width + 4
            rendered = True
        if display and rendered:
            newline()

    for kind, value in parts:
        if kind == "d":
            if lines[-1]:
                newline()
            add_math(value, size + 4, True)
            continue
        if kind == "m":
            add_math(value, size, False)
            continue
        add_text(value)
    return [line for line in lines if line]


def line_span(line, font_px):
    tallest = font_px
    wide = 0
    for _kind, payload, advance in line:
        wide += advance
        if _kind == "i":
            tallest = max(tallest, payload.height)
    return tallest, wide


def draw_rich(card, draw, lines, font, color, x0, y, font_px):
    for line in lines:
        tallest, _wide = line_span(line, font_px)
        x = x0
        for kind, payload, advance in line:
            if kind == "i":
                top = y + max(0, (tallest - payload.height) // 2)
                card.paste(payload, (int(x), int(top)), payload)
            else:
                draw.text((x, y + max(0, (tallest - font_px) // 2)), payload, font=font, fill=color)
            x += advance
        y += tallest + 4
    return y


def block_height(lines, font_px):
    if not lines:
        return font_px + 4
    return sum(line_span(line, font_px)[0] + 4 for line in lines)


def render_card(question_text, options, figure_path, dest):
    font = ImageFont.truetype(FONT_PATH, Q_FONT, index=0)
    small = ImageFont.truetype(FONT_PATH, A_FONT, index=0)
    probe = Image.new("RGB", (10, 10))
    draw = ImageDraw.Draw(probe)
    figure = None
    if figure_path and os.path.exists(figure_path):
        with Image.open(figure_path) as fig:
            figure = fig.convert("RGBA")
            figure.thumbnail((220, 200))
    text_width = 860 if figure is None else 620
    question_lines = layout_rich(draw, question_text, font, text_width, Q_MATH)
    option_blocks = []
    for letter in ("A", "B", "C", "D", "E"):
        if letter not in options:
            continue
        option_blocks.append((letter, layout_rich(draw, str(options[letter]), small, text_width - 36, A_MATH)))
    content_w = 0
    for line in question_lines:
        content_w = max(content_w, line_span(line, Q_FONT)[1])
    for _letter, lines in option_blocks:
        for line in lines:
            content_w = max(content_w, 36 + line_span(line, A_FONT)[1])
    width = int(content_w + MARGIN * 2 + 24)
    if figure is not None:
        width += figure.width + 12
    width = max(420, min(CARD_W, width))
    height = MARGIN + block_height(question_lines, Q_FONT) + 8
    for _letter, lines in option_blocks:
        height += block_height(lines, A_FONT) + 2
    height += 10
    if figure is not None:
        height = max(height, figure.height + 24)
    card = Image.new("RGB", (width, max(height, 96)), BG)
    draw = ImageDraw.Draw(card)
    draw.rectangle((0, 0, 8, card.height), fill=ACCENT)
    y = draw_rich(card, draw, question_lines, font, INK, MARGIN + 6, MARGIN, Q_FONT)
    y += 6
    for letter, lines in option_blocks:
        draw.text((MARGIN + 6, y), f"{letter}.", font=small, fill=ACCENT)
        y = draw_rich(card, draw, lines, small, INK, MARGIN + 36, y, A_FONT)
        y += 2
    if figure is not None:
        card.paste(figure, (width - figure.width - 10, 12), figure)
    if card.height > MAX_H or card.width > CARD_W:
        card.thumbnail((CARD_W, MAX_H), Image.Resampling.LANCZOS)
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    card.save(dest, "PNG")


def record(chapter, number, answer, rel):
    letters = ["A", "B", "C", "D", "E"]
    kind = 5 if answer == "E" else 4
    others = [letter for letter in letters[:kind] if letter != answer]
    return {
        "Note": chapter,
        "GUID": rel,
        "E": 0,
        "Q_T": kind,
        "Q": "請看題目圖片，選出正確答案。",
        "T": 0,
        "I": 1,
        "A": 0,
        "C_A": answer,
        "A2": others[0] if others else "",
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
    }


def topic_code(chapter):
    book = re.fullmatch(r"(\d)([AB])(\d{2})", chapter)
    if book:
        return int(book.group(1)) * 1000 + (0 if book.group(2) == "A" else 100) + int(book.group(3))
    senior = re.fullmatch(r"6(\d{2})", chapter)
    if senior:
        return 6000 + int(senior.group(1))
    return 0


def write_database(groups):
    lines = [
        "// 由 tools/import_aiqbank.py 與 tools/render_text_questions.py 產生。",
        "var questionDatabase = {",
    ]
    keys = sorted(groups)
    topics = []
    for index, key in enumerate(keys):
        rows = groups[key]
        lines.append(f'    "{key}": [')
        for row_index, row in enumerate(rows):
            comma = "," if row_index < len(rows) - 1 else ""
            lines.append("    " + json.dumps(row, ensure_ascii=False) + comma)
        lines.append("    ]," if index < len(keys) - 1 else "    ]")
        chapter, lang = key.split("_", 1)
        topics.append(
            {
                "key": key,
                "chapter": chapter,
                "lang": lang,
                "grade": int(chapter[0]),
                "code": topic_code(chapter),
                "count": len(rows),
            }
        )
    lines.append("};")
    lines.append("window.MZQ_TOPICS = " + json.dumps(topics, ensure_ascii=False, indent=4) + ";")
    lines.append("")
    with open(DB_PATH, "w", encoding="utf-8") as handle:
        handle.write("\n".join(lines))


def main():
    if not os.path.exists(SNAP_PATH):
        raise SystemExit("請先匯出目前題庫到 tools/output/db_snapshot.json")
    snapshot = json.load(open(SNAP_PATH, encoding="utf-8"))
    groups = snapshot["db"]
    existing = set(groups)
    answers, _skipped = load_answers(KEY_PATH)
    figures = figure_index()
    added = 0
    missing_answer = 0
    no_figure = 0
    made_keys = []
    for folder, filename in find_json_sets():
        questions = load_lenient(os.path.join(folder, filename))
        if isinstance(questions, dict):
            questions = questions.get("questions") or []
        flat = []
        for item in questions:
            if isinstance(item, dict):
                flat.append(item)
            elif isinstance(item, list):
                flat.extend(inner for inner in item if isinstance(inner, dict))
        buckets = {}
        print(os.path.basename(folder), len(flat), flush=True)
        for question in flat:
            ident = parse_identity(question, folder + "/" + filename)
            if not ident:
                continue
            chapter, lang, number = ident
            key = f"{chapter}_{lang}"
            if key in existing:
                continue
            answer = answers.get((chapter, lang, number))
            if not answer:
                missing_answer += 1
                continue
            options = question.get("options") or {}
            if not isinstance(options, dict) or answer not in options:
                missing_answer += 1
                continue
            text = str(question.get("question") or "").strip()
            if not text:
                continue
            lang_folder = "CHIT" if lang == "CH" else "ENG"
            prefix = "SS" if chapter.startswith("6") or chapter[0] in "45" else "JS"
            folder_name = f"{prefix}-MATH-{chapter}-{lang_folder}-MCQ"
            file_name = f"{prefix}-MATH-{chapter}-{lang_folder}-MCQ{number:03d}.png"
            rel = f"AIQ/TEXT/{folder_name}/{file_name}"
            dest = os.path.join(PICTURE_DIR, rel)
            figure = figures.get((chapter, number))
            if "圖" in text and not figure:
                no_figure += 1
            render_card(text, options, figure, dest)
            buckets.setdefault(key, {})[number] = record(chapter, number, answer, rel)
            added += 1
        for key, bucket in buckets.items():
            groups[key] = [bucket[n] for n in sorted(bucket)]
            made_keys.append(key)
    write_database(groups)
    print(json.dumps({
        "added": added,
        "new_sets": sorted(made_keys),
        "skipped_no_answer": missing_answer,
        "mentions_figure_without_file": no_figure,
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
