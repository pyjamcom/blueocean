#!/usr/bin/env python3
"""Generate visual-only questions from assets manifest."""

from __future__ import annotations

import json
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MANIFEST_PATH = ROOT / "assets" / "manifest.json"
QUESTIONS_PATH = ROOT / "data" / "questions.json"
POOLS_DIR = ROOT / "data" / "pools"


def load_assets():
    data = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    assets = data.get("assets", [])
    assets.sort(key=lambda a: int(a["id"]))
    return assets


def group_by_tag(assets):
    grouped = defaultdict(list)
    for asset in assets:
        for tag in asset.get("tags", []):
            grouped[tag].append(asset)
    return grouped


def take(group, count, offset=0):
    if not group:
        return []
    selected = []
    idx = offset
    while len(selected) < count:
        selected.append(group[idx % len(group)])
        idx += 1
    return selected


def make_answer(asset, index):
    return {
        "id": f"a{index}",
        "asset_id": asset["id"],
        "tags": asset.get("tags", []),
    }


def build_question(
    qid,
    category,
    prompt_asset,
    answers,
    correct_index,
    humor_tag,
    extra=None,
):
    question = {
        "id": qid,
        "category": category,
        "prompt_image": prompt_asset["id"],
        "answers": [make_answer(a, i + 1) for i, a in enumerate(answers)],
        "correct_index": correct_index,
        "humor_tag": humor_tag,
        "duration_ms": 6000,
    }
    if extra:
        question.update(extra)
    return question


def generate_questions(assets):
    by_tag = group_by_tag(assets)
    questions = []

    # 1) visual_provocation - odd one out: 3 party + 1 absurd
    party = take(by_tag["party"], 3)
    absurd = take(by_tag["absurd"], 1)
    answers = party + absurd
    questions.append(
        build_question(
            "q_visual_provocation_01",
            "visual_provocation",
            party[0],
            answers,
            3,
            "silly",
        )
    )

    # 2) telepath_sync - continue scene: prompt travel, correct travel, distractors
    travel = take(by_tag["travel"], 2)
    distractors = take(by_tag["food"], 1) + take(by_tag["animal"], 1) + take(by_tag["party"], 1)
    answers = [travel[1]] + distractors
    questions.append(
        build_question(
            "q_telepath_sync_01",
            "telepath_sync",
            travel[0],
            answers,
            0,
            "social",
        )
    )

    # 3) icon_battle - pair with battle_pair_ids
    battle_pair = take(by_tag["animal"], 1) + take(by_tag["food"], 1)
    battle_answers = battle_pair + take(by_tag["absurd"], 2)
    questions.append(
        build_question(
            "q_icon_battle_01",
            "icon_battle",
            battle_pair[0],
            battle_answers,
            0,
            "battle",
            {"battle_pair_ids": [battle_pair[0]["id"], battle_pair[1]["id"]]},
        )
    )

    # 4) absurd_toast - mood prompt + 4 emo icons
    mood_prompt = take(by_tag["party"], 1)[0]
    mood_answers = take(by_tag["party"], 1) + take(by_tag["travel"], 1) + take(by_tag["chaos"], 1) + take(by_tag["absurd"], 1)
    questions.append(
        build_question(
            "q_absurd_toast_01",
            "absurd_toast",
            mood_prompt,
            mood_answers,
            0,
            "toast",
        )
    )

    # 5) drunk_reflex - trigger asset required
    trigger = take(by_tag["chaos"], 1)[0]
    reflex_answers = take(by_tag["chaos"], 2) + take(by_tag["party"], 2)
    questions.append(
        build_question(
            "q_drunk_reflex_01",
            "drunk_reflex",
            trigger,
            reflex_answers,
            0,
            "reflex",
            {"trigger_asset_id": trigger["id"]},
        )
    )

    # 6) absurd_sum - prompt pair ids
    pair_ids = take(by_tag["food"], 1) + take(by_tag["animal"], 1)
    sum_answers = take(by_tag["absurd"], 3) + take(by_tag["food"], 1)
    questions.append(
        build_question(
            "q_absurd_sum_01",
            "absurd_sum",
            pair_ids[0],
            sum_answers,
            0,
            "absurd",
            {"prompt_pair_ids": [pair_ids[0]["id"], pair_ids[1]["id"]]},
        )
    )

    # 7) face_mimic - face overlays required
    face_prompt = take(by_tag["party"], 1)[0]
    overlay_ids = [a["id"] for a in take(by_tag["chaos"], 2)]
    mimic_answers = take(by_tag["animal"], 4)
    questions.append(
        build_question(
            "q_face_mimic_01",
            "face_mimic",
            face_prompt,
            mimic_answers,
            0,
            "mimic",
            {"face_overlay_ids": overlay_ids},
        )
    )

    # 8) sound_pantomime - audio asset required
    audio_asset = take(by_tag["party"], 1)[0]
    panto_answers = take(by_tag["food"], 2) + take(by_tag["animal"], 2)
    questions.append(
        build_question(
            "q_sound_pantomime_01",
            "sound_pantomime",
            audio_asset,
            panto_answers,
            0,
            "panto",
            {"audio_asset_id": audio_asset["id"]},
        )
    )

    # 9) silhouette_guess - silhouette base required
    silhouette = take(by_tag["animal"], 1)[0]
    silhouette_answers = take(by_tag["animal"], 3) + take(by_tag["food"], 1)
    questions.append(
        build_question(
            "q_silhouette_guess_01",
            "silhouette_guess",
            silhouette,
            silhouette_answers,
            0,
            "guess",
            {"silhouette_base_id": silhouette["id"]},
        )
    )

    # 10) trophy_rewards - trophy stamp required
    trophy = take(by_tag["party"], 1)[0]
    trophy_answers = take(by_tag["party"], 2) + take(by_tag["absurd"], 2)
    questions.append(
        build_question(
            "q_trophy_rewards_01",
            "trophy_rewards",
            trophy,
            trophy_answers,
            0,
            "reward",
            {"trophy_stamp_id": trophy["id"]},
        )
    )

    return questions


def write_question_pools(questions):
    by_category = defaultdict(list)
    for question in questions:
        by_category[question["category"]].append(question["id"])

    POOLS_DIR.mkdir(parents=True, exist_ok=True)

    for category, ids in by_category.items():
        pool_path = POOLS_DIR / f"{category}.json"
        pool_data = {"type": category, "question_ids": ids}
        if pool_path.exists():
            existing = json.loads(pool_path.read_text(encoding="utf-8"))
            if "scene_ids" in existing:
                pool_data["scene_ids"] = existing["scene_ids"]
        pool_path.write_text(json.dumps(pool_data, indent=2) + "\n", encoding="utf-8")


def main() -> None:
    assets = load_assets()
    questions = generate_questions(assets)

    QUESTIONS_PATH.write_text(
        json.dumps({"version": 1, "questions": questions}, indent=2) + "\n",
        encoding="utf-8",
    )

    write_question_pools(questions)


if __name__ == "__main__":
    main()
