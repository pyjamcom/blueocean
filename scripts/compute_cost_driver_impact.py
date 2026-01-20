#!/usr/bin/env python3
import argparse
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List


def read_json(path: Path) -> Dict:
    return json.loads(path.read_text(encoding="utf-8"))


def main() -> int:
    parser = argparse.ArgumentParser(description="Compute cost driver impacts from ERRC factors.")
    parser.add_argument("--config", default="config/cost_driver_map.json", help="Cost driver map")
    parser.add_argument("--date", default=datetime.now(timezone.utc).strftime("%Y-%m-%d"), help="Report date")
    parser.add_argument("--out", default=None, help="Output JSON path")
    args = parser.parse_args()

    data = read_json(Path(args.config))
    impacts = []
    total_impact = 0.0

    for entry in data.get("errc_factors", []):
        factor = entry.get("factor")
        drivers = entry.get("cost_drivers", [])
        factor_impact = sum(d.get("impact", 0) for d in drivers)
        total_impact += factor_impact
        impacts.append(
            {
                "factor": factor,
                "drivers": drivers,
                "factor_impact": round(factor_impact, 3),
            }
        )

    report = {
        "date": args.date,
        "total_cost_delta": round(total_impact, 3),
        "factors": impacts,
    }

    out_path = Path(args.out) if args.out else Path(f"reports/cost_driver_impact_{args.date}.json")
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {out_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
