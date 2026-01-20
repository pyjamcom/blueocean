#!/usr/bin/env python3
import argparse
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, Any


def read_json(path: Path) -> Dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def main() -> int:
    parser = argparse.ArgumentParser(description="Validate field test evidence coverage.")
    parser.add_argument("--inputs", default="config/validation_inputs.json", help="Validation inputs")
    parser.add_argument("--results", default=None, help="Optional field results JSON")
    parser.add_argument("--date", default=datetime.now(timezone.utc).strftime("%Y-%m-%d"), help="Report date")
    parser.add_argument("--out", default=None, help="Output JSON path")
    args = parser.parse_args()

    inputs = read_json(Path(args.inputs))
    results = read_json(Path(args.results)) if args.results else {}

    required = inputs.get("buyer_chain_targets", []) + inputs.get("complementors", [])
    completed = results.get("completed", [])

    completed_ids = {item.get("role") or item.get("type") for item in completed}
    total_required = len(required)
    total_completed = 0
    gaps = []
    for item in required:
        key = item.get("role") or item.get("type")
        if key in completed_ids:
            total_completed += 1
        else:
            gaps.append(key)

    confidence = total_completed / total_required if total_required else 0.0

    report = {
        "date": args.date,
        "total_required": total_required,
        "total_completed": total_completed,
        "confidence": round(confidence, 3),
        "missing_targets": gaps,
        "hypotheses": inputs.get("hypotheses", []),
    }

    out_path = Path(args.out) if args.out else Path(f"reports/field_validation_{args.date}.json")
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {out_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
