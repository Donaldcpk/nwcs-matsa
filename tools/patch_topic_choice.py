#!/usr/bin/env python3
"""把開場和無限之塔的「只選年級」改成可以選課題。可重複執行。"""

import json
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data")


def load(name):
    path = os.path.join(DATA, name)
    with open(path, encoding="utf-8") as handle:
        return path, json.load(handle)


def save(path, data):
    with open(path, "w", encoding="utf-8") as handle:
        json.dump(data, handle, ensure_ascii=False, separators=(",", ":"))
        handle.write("\n")


def cmd(code, indent, parameters):
    return {"code": code, "indent": indent, "parameters": parameters}


def plugin_choose(indent):
    return cmd(357, indent, ["MZQuizzer", "chooseTopic", "chooseTopic", {}])


def split_choices(lst, choice_index):
    indent = lst[choice_index]["indent"]
    branches = []
    current = None
    end_index = None
    for index in range(choice_index + 1, len(lst)):
        item = lst[index]
        if item["code"] == 404 and item["indent"] == indent:
            if current:
                branches.append(current)
            end_index = index
            break
        if item["code"] == 402 and item["indent"] == indent:
            if current:
                branches.append(current)
            current = {"when": item, "body": []}
            continue
        if current is None:
            raise RuntimeError(f"選項後面不是分支：{item}")
        current["body"].append(item)
    if end_index is None:
        raise RuntimeError("找不到選項結束")
    return branches, end_index


def choice_name(branch):
    params = branch["when"]["parameters"]
    return params[1] if len(params) > 1 else ""


def patch_intro(events):
    event = next(item for item in events if item and item.get("id") == 46)
    lst = event["pages"][0]["list"]
    if any(item["code"] == 401 and item["parameters"] and "請先選擇年級，再選擇課題" in str(item["parameters"][0]) for item in lst):
        return False
    if any(item["code"] == 118 and item["parameters"] == ["gradeLoop"] for item in lst):
        return False
    prompt = next(
        index
        for index, item in enumerate(lst)
        if item["code"] == 401 and "請選擇您目前的年級" in item["parameters"][0]
    )
    lst.insert(prompt - 1, cmd(118, 0, ["gradeLoop"]))
    choice_index = next(
        index
        for index, item in enumerate(lst)
        if item["code"] == 102 and "中一" in item["parameters"][0]
    )
    branches, end_index = split_choices(lst, choice_index)
    by_name = {choice_name(branch): branch for branch in branches}

    def grade_body(value):
        return [cmd(122, 1, [990, 990, 0, 0, value]), cmd(0, 1, [])]

    other_body = [
        cmd(101, 1, ["", 0, 0, 2, "ADMIN"]),
        cmd(401, 1, ["中四到中六的題目圖片還沒放進遊戲。"]),
        cmd(401, 1, ["請先選中一、中二或中三。"]),
        cmd(119, 1, ["gradeLoop"]),
        cmd(0, 1, []),
    ]
    rebuilt = []
    for index, (name, body) in enumerate(
        [("中一", grade_body(1)), ("中二", grade_body(2)), ("中三", grade_body(3)), ("其他", other_body)]
    ):
        rebuilt.append(cmd(402, 0, [index, name]))
        rebuilt.extend(body)
    new_list = lst[: choice_index + 1] + rebuilt + lst[end_index:]
    plugin_at = None
    for index, item in enumerate(new_list):
        if item["code"] == 401 and "資料建檔完成" in item["parameters"][0]:
            plugin_at = index - 1
            break
    if plugin_at is None:
        raise RuntimeError("找不到年級選完後的下一句")
    new_list[plugin_at:plugin_at] = [
        cmd(101, 0, ["", 0, 0, 2, "ADMIN"]),
        cmd(401, 0, ["請選擇語言和課題。之後戰鬥只會出這一課。"]),
        plugin_choose(0),
    ]
    new_list = [
        item
        for item in new_list
        if not (item["code"] == 122 and item["parameters"] == [990, 990, 0, 0, 4])
    ]
    event["pages"][0]["list"] = new_list
    return True


def patch_tower(events, event_id):
    changed = False
    event = next(item for item in events if item and item.get("id") == event_id)
    for page in event["pages"]:
        lst = page["list"]
        choice_indexes = [
            index
            for index, item in enumerate(lst)
            if item["code"] == 102 and any("中一" in choice or "TSA" in choice for choice in item["parameters"][0])
        ]
        if not choice_indexes:
            continue
        choice_index = choice_indexes[0]
        if "選擇課題" in lst[choice_index]["parameters"][0]:
            continue
        branches, end_index = split_choices(lst, choice_index)
        grade = next(branch for branch in branches if "中一" in choice_name(branch))
        boss = next(branch for branch in branches if "塔主" in choice_name(branch))
        back = next(branch for branch in branches if choice_name(branch) == "返回")
        topic_body = [plugin_choose(1)]
        topic_body.extend(item for item in grade["body"] if item["code"] != 122)
        face_at = next(index for index, item in enumerate(topic_body) if item["code"] == 101)
        topic_body.insert(face_at + 1, cmd(401, 1, ["課題記好了。這一課會從第 1 題開始。"]))
        new_choices = cmd(102, 0, [["選擇課題", "挑戰塔主", "返回"], 2, 0, 2, 0])
        rebuilt = [
            cmd(402, 0, [0, "選擇課題"]),
            *topic_body,
            cmd(402, 0, [1, "挑戰塔主"]),
            *boss["body"],
            cmd(402, 0, [2, "返回"]),
            *back["body"],
        ]
        page["list"] = lst[:choice_index] + [new_choices] + rebuilt + lst[end_index:]
        changed = True
    return changed


def patch_troop():
    path, troops = load("Troops.json")
    troop = troops[500]
    changed = False
    for page in troop["pages"]:
        original = page["list"]
        updated = [
            item
            for item in original
            if not (item["code"] == 122 and item["parameters"][:5] == [990, 990, 0, 0, 4])
        ]
        if len(updated) != len(original):
            page["list"] = updated
            changed = True
    if changed:
        save(path, troops)
    return changed


def patch_variables():
    path, system = load("System.json")
    variables = system["variables"]
    names = {
        980: "課題代碼",
        989: "題目語言",
        991: "玩家所選答案",
        992: "目前題號",
    }
    changed = False
    for index, name in names.items():
        if variables[index] != name:
            variables[index] = name
            changed = True
    if changed:
        save(path, system)
    return changed


def main():
    for filename, event_id in (("Map018.json", 24), ("Map065.json", 36)):
        path, data = load(filename)
        if patch_tower(data["events"], event_id):
            save(path, data)
            print("updated", filename)
        else:
            print("skip", filename)
    path, data = load("Map005.json")
    if patch_intro(data["events"]):
        save(path, data)
        print("updated Map005.json")
    else:
        print("skip Map005.json")
    print("troop", "updated" if patch_troop() else "skip")
    print("variables", "updated" if patch_variables() else "skip")


if __name__ == "__main__":
    main()
