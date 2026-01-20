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


def find_latest_report(reports_dir: Path, pattern: str) -> Optional[Path]:
    candidates = list(reports_dir.glob(pattern))
    if not candidates:
        return None
    candidates.sort(key=lambda p: p.stat().st_mtime, reverse=True)
    return candidates[0]


def main() -> int:
    parser = argparse.ArgumentParser(description="Estimate launch budget from seed creator model.")
    parser.add_argument("--config", default="config/launch_budget_inputs.json", help="Budget config")
    parser.add_argument("--seed-report", default=None, help="Path to viral seed report")
    parser.add_argument("--date", default=datetime.now(timezone.utc).strftime("%Y-%m-%d"), help="Report date")
    parser.add_argument(
        "--out",
        default=None,
        help="Output JSON path (default: reports/launch_budget_estimate_<date>.json)",
    )
    args = parser.parse_args()

    inputs = read_json(Path(args.config))
    if not inputs:
        raise SystemExit("Missing or invalid launch budget inputs.")

    reports_dir = Path("reports")
    seed_path = Path(args.seed_report) if args.seed_report else find_latest_report(
        reports_dir, "viral_seed_estimate_*.json"
    )
    if not seed_path:
        raise SystemExit("Missing viral seed estimate report.")

    seed_report = read_json(seed_path) or {}
    estimates = seed_report.get("estimates", {})
    base_seed = estimates.get("base", {}).get("seed_creators_required")
    if not base_seed:
        raise SystemExit("Seed report missing base seed creator estimate.")

    pjm_usd_rate = float(inputs["pjm_usd_rate"])
    starter_reward_pjm = float(inputs["starter_reward_pjm"])
    boost_reward_pjm_equivalent = float(inputs["boost_reward_pjm_equivalent"])
    max_pjm_per_creator = float(inputs["max_pjm_per_creator"])

    per_creator_pjm = min(max_pjm_per_creator, starter_reward_pjm + boost_reward_pjm_equivalent)

    def scenario(multiplier: float) -> Dict[str, float]:
        total_pjm = base_seed * per_creator_pjm * multiplier
        total_usd = total_pjm * pjm_usd_rate
        return {
            "seed_creators": base_seed,
            "per_creator_pjm": per_creator_pjm,
            "total_pjm": round(total_pjm, 2),
            "total_usd": round(total_usd, 2),
            "multiplier": multiplier,
        }

    report = {
        "date": args.date,
        "inputs": inputs,
        "seed_report": str(seed_path),
        "scenarios": {
            "low": scenario(1.0),
            "base": scenario(1.2),
            "high": scenario(1.5),
        },
    }

    out_path = Path(args.out) if args.out else Path(f"reports/launch_budget_estimate_{args.date}.json")
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {out_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
