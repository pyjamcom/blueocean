#!/usr/bin/env python3
import argparse
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Optional


def read_json(path: Path) -> Dict:
    return json.loads(path.read_text(encoding="utf-8"))


def list_reports(reports_dir: Path) -> List[Path]:
    candidates = sorted(reports_dir.glob("strategy_canvas_*.json"), key=lambda p: p.stat().st_mtime, reverse=True)
    return candidates


def main() -> int:
    parser = argparse.ArgumentParser(description="Detect value curve drift over time.")
    parser.add_argument("--reports-dir", default="reports", help="Reports directory")
    parser.add_argument("--config", default="config/value_curve_drift_config.json", help="Drift config")
    parser.add_argument("--date", default=datetime.now(timezone.utc).strftime("%Y-%m-%d"), help="Report date")
    parser.add_argument("--out", default=None, help="Output JSON path")
    args = parser.parse_args()

    config = read_json(Path(args.config))
    focus_drop_threshold = float(config.get("focus_drop_threshold", 0.1))
    divergence_drop_threshold = float(config.get("divergence_drop_threshold", 0.1))

    reports_dir = Path(args.reports_dir)
    reports = list_reports(reports_dir)
    if len(reports) < 2:
        raise SystemExit("Need at least two strategy_canvas reports.")

    current = read_json(reports[0])
    previous = read_json(reports[1])

    curr_summary = current.get("summary", {})
    prev_summary = previous.get("summary", {})

    focus_drop = float(prev_summary.get("focus_score", 0)) - float(curr_summary.get("focus_score", 0))
    divergence_drop = float(prev_summary.get("divergence_score", 0)) - float(curr_summary.get("divergence_score", 0))

    report = {
        "date": args.date,
        "current_report": str(reports[0]),
        "previous_report": str(reports[1]),
        "focus_drop": round(focus_drop, 3),
        "divergence_drop": round(divergence_drop, 3),
        "thresholds": {
            "focus_drop_threshold": focus_drop_threshold,
            "divergence_drop_threshold": divergence_drop_threshold,
        },
        "alerts": {
            "focus_drop": focus_drop >= focus_drop_threshold,
            "divergence_drop": divergence_drop >= divergence_drop_threshold,
        },
    }

    out_path = Path(args.out) if args.out else Path(f"reports/value_curve_drift_{args.date}.json")
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {out_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
