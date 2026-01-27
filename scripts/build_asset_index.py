#!/usr/bin/env python3
"""Scan assets directory and rebuild assets/manifest.json."""

from __future__ import annotations

import json
import re
from pathlib import Path

ASSETS_DIR = Path(__file__).resolve().parents[1] / "assets"
MANIFEST_PATH = ASSETS_DIR / "manifest.json"
ALLOWED_EXT = {".png", ".jpg", ".jpeg", ".svg", ".webp"}


def load_existing() -> dict:
    if MANIFEST_PATH.exists():
        return json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    return {"version": 1, "assets": []}


def main() -> None:
    existing = load_existing()
    existing_by_id = {asset["id"]: asset for asset in existing.get("assets", [])}

    assets = []
    errors = []

    for file_path in sorted(ASSETS_DIR.glob("*")):
        if not file_path.is_file() or file_path.suffix.lower() not in ALLOWED_EXT:
            continue
        stem = file_path.stem
        if not re.fullmatch(r"\d+", stem):
            errors.append(str(file_path.name))
            continue

        asset_id = stem
        prev = existing_by_id.get(asset_id, {})
        tags = prev.get("tags") or ["absurd"]
        season = prev.get("season")
        asset = {
            "id": asset_id,
            "tags": tags,
            "file": f"assets/{file_path.name}",
        }
        if season:
            asset["season"] = season
        assets.append(asset)

    if errors:
        raise SystemExit(
            "Asset file names must be numeric only (no letters): " + ", ".join(errors)
        )

    manifest = {"version": 1, "assets": assets}
    MANIFEST_PATH.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
