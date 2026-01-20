#!/usr/bin/env python3
import argparse
import json
from pathlib import Path
from typing import Dict


def sum_metrics(payload: Dict) -> Dict[str, int]:
    totals = {"totalUsers": 0, "sessions": 0, "eventCount": 0}
    rows = payload.get("rows", [])
    for row in rows:
        metrics = row.get("metricValues", [])
        for idx, key in enumerate(["totalUsers", "sessions", "eventCount"]):
            try:
                totals[key] += int(metrics[idx].get("value", 0))
            except Exception:
                pass
    return totals


def main() -> int:
    parser = argparse.ArgumentParser(description="Normalize GA4 raw metrics into internal summary.")
    parser.add_argument("--in", dest="input_path", required=True, help="Path to raw GA4 JSON")
    parser.add_argument("--out", dest="out_path", required=True, help="Output normalized metrics JSON")
    parser.add_argument("--date", dest="date", required=False, help="Date label (YYYY-MM-DD)")
    args = parser.parse_args()

    raw = json.loads(Path(args.input_path).read_text(encoding="utf-8"))
    totals = sum_metrics(raw)

    normalized = {
        "date": args.date,
        "acquisition": totals.get("totalUsers"),
        "activation": totals.get("sessions"),
        "retention": None,
        "referral": None,
        "revenue": None,
        "source": "ga4",
    }

    Path(args.out_path).write_text(json.dumps(normalized, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {args.out_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
