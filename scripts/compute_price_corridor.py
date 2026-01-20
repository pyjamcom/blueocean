#!/usr/bin/env python3
import argparse
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List


def read_json(path: Path) -> Dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def main() -> int:
    parser = argparse.ArgumentParser(description="Compute price corridor of the mass.")
    parser.add_argument("--config", default="config/price_corridor.json", help="Price corridor config")
    parser.add_argument("--date", default=datetime.now(timezone.utc).strftime("%Y-%m-%d"), help="Report date")
    parser.add_argument("--out", default=None, help="Output JSON path")
    args = parser.parse_args()

    data = read_json(Path(args.config))
    alternatives: List[Dict[str, Any]] = data.get("alternatives", [])
    prices = [item.get("price", 0) for item in alternatives]
    prices = [p for p in prices if p is not None]
    if not prices:
        raise SystemExit("No prices provided.")

    corridor_low = min(prices)
    corridor_high = max(prices)
    corridor_mid = sum(prices) / len(prices)

    report = {
        "date": args.date,
        "currency": data.get("meta", {}).get("currency", "USD"),
        "corridor": {
            "low": corridor_low,
            "mid": round(corridor_mid, 2),
            "high": corridor_high,
        },
        "alternatives": alternatives,
        "strategy": data.get("target", {}),
    }

    out_path = Path(args.out) if args.out else Path(f"reports/price_corridor_{args.date}.json")
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {out_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
