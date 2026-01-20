#!/usr/bin/env python3
import argparse
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional, Dict


def read_json(path: Path) -> Optional[Dict]:
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


def main() -> int:
    parser = argparse.ArgumentParser(description="Build sustainability & renewal report.")
    parser.add_argument("--reports-dir", default="reports", help="Reports directory")
    parser.add_argument("--date", default=datetime.now(timezone.utc).strftime("%Y-%m-%d"), help="Report date")
    parser.add_argument("--out", default=None, help="Output JSON path")
    args = parser.parse_args()

    reports_dir = Path(args.reports_dir)
    barriers_path = find_latest(reports_dir, "imitation_barriers_*.json")
    drift_path = find_latest(reports_dir, "strategy_drift_*.json")

    barriers = read_json(barriers_path) if barriers_path else None
    drift = read_json(drift_path) if drift_path else None

    report = {
        "date": args.date,
        "imitation_barriers": barriers.get("summary") if barriers else None,
        "strategy_drift": drift.get("alerts") if drift else None,
        "sources": {
            "imitation_barriers": str(barriers_path) if barriers_path else None,
            "strategy_drift": str(drift_path) if drift_path else None,
        },
    }

    out_path = Path(args.out) if args.out else Path(f"reports/sustainability_{args.date}.json")
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {out_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
