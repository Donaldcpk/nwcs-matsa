#!/usr/bin/env python3
"""Re-render existing TEXT topic cards with current typography and figures.

Does not rewrite questionDatabase.js. Only overwrites TEXT dest PNGs that
already exist. Cards without a figure file are still re-rendered as text-only.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import render_text_questions as r

NEED_CHARS = "圖"
NEED_EN = ("figure", "diagram")


def mentions_figure(text: str) -> bool:
    t = text or ""
    if "圖" in t and "圖書館" not in t.replace("根據圖", "").replace("圖中", "").replace("上圖", "").replace("下圖", ""):
        # still count any 圖; false friends handled in report only
        return "圖" in t
    low = t.lower()
    return any(w in low for w in NEED_EN)


def main():
    figures = r.figure_index()
    refreshed = 0
    missing_dest = 0
    no_fig = 0
    skipped_no_dest_no_fig = 0
    by_topic = {}
    still_missing = {}

    for folder, filename in r.find_json_sets():
        questions = r.load_lenient(os.path.join(folder, filename))
        if isinstance(questions, dict):
            questions = questions.get("questions") or []
        flat = []
        for item in questions:
            if isinstance(item, dict):
                flat.append(item)
            elif isinstance(item, list):
                flat.extend(inner for inner in item if isinstance(inner, dict))
        for question in flat:
            ident = r.parse_identity(question, folder + "/" + filename)
            if not ident:
                continue
            chapter, lang, number = ident
            text = str(question.get("question") or "").strip()
            if not text:
                continue
            options = question.get("options") or {}
            if not isinstance(options, dict):
                continue
            lang_folder = "CHIT" if lang == "CH" else "ENG"
            prefix = "SS" if chapter.startswith("6") or chapter[0] in "45" else "JS"
            folder_name = f"{prefix}-MATH-{chapter}-{lang_folder}-MCQ"
            file_name = f"{prefix}-MATH-{chapter}-{lang_folder}-MCQ{number:03d}.png"
            rel = f"AIQ/TEXT/{folder_name}/{file_name}"
            dest = os.path.join(r.PICTURE_DIR, rel)
            figure = figures.get((chapter, number))
            topic = f"{chapter}_{lang}"
            if not os.path.exists(dest):
                if figure and mentions_figure(text):
                    missing_dest += 1
                else:
                    skipped_no_dest_no_fig += 1
                continue
            if not figure and mentions_figure(text):
                no_fig += 1
                still_missing.setdefault(topic, 0)
                still_missing[topic] += 1
            r.render_card(text, options, figure, dest)
            refreshed += 1
            by_topic[topic] = by_topic.get(topic, 0) + 1

    print(
        __import__("json").dumps(
            {
                "refreshed_cards": refreshed,
                "by_topic": dict(sorted(by_topic.items())),
                "text_cards_mention_figure_still_missing": no_fig,
                "still_missing_by_topic": dict(sorted(still_missing.items(), key=lambda kv: -kv[1])),
                "had_figure_but_no_text_card": missing_dest,
                "figure_index": len(figures),
            },
            ensure_ascii=False,
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
