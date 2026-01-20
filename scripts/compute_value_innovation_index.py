#!/usr/bin/env python3
import argparse
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Optional


def read_json(path: Path) -> Optional[Dict[str, Any]]:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        return None
    except json.JSONDecodeError:
        return None


def find_latest(reports_dir: Path, pattern: str) -> Optional[Path]:
    candidates = list(reports_dir.glob(pattern))
    if not candidates:
        return None
    candidates.sort(key=lambda p: p.stat().st_mtime, reverse=True)
    return candidates[0]


def clamp(value: float) -> float:
    return max(0.0, min(1.0, value))


def main() -> int:
    parser = argparse.ArgumentParser(description="Compute Value Innovation Index.")
    parser.add_argument("--config", default="config/value_innovation_index.json", help="Config path")
    parser.add_argument("--date", default=datetime.now(timezone.utc).strftime("%Y-%m-%d"), help="Report date")
    parser.add_argument("--out", default=None, help="Output JSON path")
    args = parser.parse_args()

    config = read_json(Path(args.config)) or {}
    weights = config.get("weights", {"utility_gain": 0.4, "cost_reduction": 0.2, "differentiation": 0.4})

    reports_dir = Path("reports")
    utility_path = find_latest(reports_dir, "buyer_utility_*.json")
    diff_path = find_latest(reports_dir, "differentiation_*.json")
    cost_path = find_latest(reports_dir, "target_cost_*.json")

    utility_report = read_json(utility_path) if utility_path else None
    diff_report = read_json(diff_path) if diff_path else None
    cost_report = read_json(cost_path) if cost_path else None

    utility_gain = 0.0
    if utility_report:
        gaps = utility_report.get("gaps", [])
        if gaps:
            avg_gap = sum(g.get("score", 0) for g in gaps) / len(gaps)
            utility_gain = clamp(1 - avg_gap / 5.0)
        else:
            utility_gain = 1.0

    differentiation = 0.0
    if diff_report:
        divergence = float(diff_report.get("divergence_score", 0))
        differentiation = clamp(divergence / 5.0)

    cost_reduction = 0.0
    if cost_report:
        current_cost = float(cost_report.get("current_cost", 0))
        gap = float(cost_report.get("gap_to_target", 0))
        if current_cost > 0:
            cost_reduction = clamp(1 - (gap / current_cost))

    index = (
        weights.get("utility_gain", 0) * utility_gain
        + weights.get("cost_reduction", 0) * cost_reduction
        + weights.get("differentiation", 0) * differentiation
    )

    report = {
        "date": args.date,
        "inputs": {
            "utility_gain": round(utility_gain, 3),
            "cost_reduction": round(cost_reduction, 3),
            "differentiation": round(differentiation, 3),
        },
        "weights": weights,
        "value_innovation_index": round(index, 3),
        "sources": {
            "buyer_utility": str(utility_path) if utility_path else None,
            "differentiation": str(diff_path) if diff_path else None,
            "target_cost": str(cost_path) if cost_path else None,
        },
    }

    out_path = Path(args.out) if args.out else Path(f"reports/value_innovation_{args.date}.json")
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {out_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
