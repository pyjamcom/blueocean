#!/usr/bin/env python3
import argparse
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List


def read_json(path: Path) -> Dict:
    return json.loads(path.read_text(encoding="utf-8"))


def main() -> int:
    parser = argparse.ArgumentParser(description="Assess BOS risk matrix.")
    parser.add_argument("--config", default="config/bos_risk_matrix.json", help="Risk matrix config")
    parser.add_argument("--date", default=datetime.now(timezone.utc).strftime("%Y-%m-%d"), help="Report date")
    parser.add_argument("--out", default=None, help="Output JSON path")
    args = parser.parse_args()

    data = read_json(Path(args.config))
    categories: List[Dict] = data.get("categories", [])
    total_weight = sum(c.get("weight", 0) for c in categories) or 1.0
    weighted = sum(c.get("weight", 0) * c.get("score", 0) for c in categories) / total_weight

    report = {
        "date": args.date,
        "scale": data.get("scale", "1-5"),
        "weighted_risk_score": round(weighted, 3),
        "categories": categories,
    }

    out_path = Path(args.out) if args.out else Path(f"reports/bos_risk_{args.date}.json")
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {out_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
