#!/usr/bin/env python3
"""Builds a global story pack from the scene manifest."""

from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List


def load_manifest(path: Path) -> List[Dict[str, Any]]:
    data = json.loads(path.read_text(encoding="utf-8"))
    scenes = data.get("scenes", [])
    if not isinstance(scenes, list):
        raise ValueError("manifest.scenes must be a list")
    return scenes


def build_pack(scenes: List[Dict[str, Any]]) -> Dict[str, Any]:
    ordered = list(scenes)
    scene_ids: List[str] = []
    scene_ids_by_type: Dict[str, List[str]] = {}

    for scene in ordered:
        scene_id = scene.get("id")
        scene_type = scene.get("type")
        if not scene_id or not scene_type:
            raise ValueError("scene is missing id or type")
        scene_ids.append(scene_id)
        scene_ids_by_type.setdefault(scene_type, []).append(scene_id)

    return {
        "version": 1,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "scene_ids": scene_ids,
        "scene_ids_by_type": scene_ids_by_type,
    }


def write_pack(output_dir: Path, name: str, pack: Dict[str, Any]) -> Path:
    output_dir.mkdir(parents=True, exist_ok=True)
    path = output_dir / name
    path.write_text(json.dumps(pack, indent=2) + "\n", encoding="utf-8")
    return path


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Build story packs from a scene manifest.")
    parser.add_argument(
        "--manifest",
        default="data/story_scene_manifest.json",
        help="Path to story_scene_manifest.json",
    )
    parser.add_argument(
        "--output-dir",
        default="data",
        help="Directory for generated story_pack JSON files",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    manifest_path = Path(args.manifest)
    output_dir = Path(args.output_dir)
    scenes = load_manifest(manifest_path)

    global_pack = build_pack(scenes)
    write_pack(output_dir, "story_pack_global.json", global_pack)


if __name__ == "__main__":
    main()
