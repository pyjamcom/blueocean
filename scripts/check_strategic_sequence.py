#!/usr/bin/env python3
import argparse
import json
from pathlib import Path
from typing import Any, Dict, List


def read_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def main() -> int:
    parser = argparse.ArgumentParser(description="Check strategic sequence readiness per feature.")
    parser.add_argument("--config", default="config/strategic_sequence.json", help="Sequence config")
    parser.add_argument("--features", required=True, help="Features JSON with sequence scores")
    parser.add_argument("--out", default=None, help="Output JSON report")
    args = parser.parse_args()

    config = read_json(Path(args.config))
    features = read_json(Path(args.features))
    items: List[Dict[str, Any]] = features.get("features", features)
    thresholds = config.get("thresholds", {})

    failing = []
    for feature in items:
        utility = feature.get("utility_score", 0)
        price = feature.get("price_score", 0)
        cost = feature.get("cost_score", 0)
        adoption = feature.get("adoption_readiness", 0)
        checks = {
            "utility": utility >= thresholds.get("utility_score_min", 0),
            "price": price >= thresholds.get("price_score_min", 0),
            "cost": cost >= thresholds.get("cost_score_min", 0),
            "adoption": adoption >= thresholds.get("adoption_readiness_min", 0),
        }
        if not all(checks.values()):
            failing.append({"id": feature.get("id"), "checks": checks})

    report = {
        "total_features": len(items),
        "failing_features": failing,
        "fail_count": len(failing),
    }

    out_path = Path(args.out) if args.out else Path("reports/strategic_sequence_check.json")
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {out_path}")
    return 1 if failing else 0


if __name__ == "__main__":
    raise SystemExit(main())
