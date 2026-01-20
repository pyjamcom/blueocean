#!/usr/bin/env python3
import argparse
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict


def read_json(path: Path) -> Dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def main() -> int:
    parser = argparse.ArgumentParser(description="Compute target costing from strategic price.")
    parser.add_argument("--config", default="config/target_costing.json", help="Target costing config")
    parser.add_argument("--date", default=datetime.now(timezone.utc).strftime("%Y-%m-%d"), help="Report date")
    parser.add_argument("--out", default=None, help="Output JSON path")
    args = parser.parse_args()

    data = read_json(Path(args.config))
    strategic_price = float(data.get("strategic_price", 0))
    margin_target = float(data.get("margin_target_pct", 0))
    target_cost = strategic_price * (1 - margin_target)

    components = data.get("cost_components", [])
    total_current = sum(c.get("current_cost", 0) for c in components)

    report = {
        "date": args.date,
        "strategic_price": strategic_price,
        "margin_target_pct": margin_target,
        "target_cost": round(target_cost, 4),
        "current_cost": round(total_current, 4),
        "gap_to_target": round(total_current - target_cost, 4),
        "components": components,
    }

    out_path = Path(args.out) if args.out else Path(f"reports/target_cost_{args.date}.json")
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {out_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
