#!/usr/bin/env python3
import argparse
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List


def read_json(path: Path) -> Dict:
    return json.loads(path.read_text(encoding="utf-8"))


def weighted_score(factors: List[Dict], scale_max: float = 5.0) -> Dict[str, float]:
    total_weight = sum(f.get("weight", 0) for f in factors) or 1.0
    score = sum(f.get("weight", 0) * f.get("score", 0) for f in factors) / total_weight
    strength = score / scale_max
    imitation_risk = 1 - strength
    return {
        "barrier_score": round(score, 3),
        "barrier_strength": round(strength, 3),
        "imitation_risk": round(imitation_risk, 3),
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Assess imitation barriers.")
    parser.add_argument("--config", default="config/imitation_barriers.json", help="Config path")
    parser.add_argument("--date", default=datetime.now(timezone.utc).strftime("%Y-%m-%d"), help="Report date")
    parser.add_argument("--out", default=None, help="Output JSON path")
    args = parser.parse_args()

    data = read_json(Path(args.config))
    factors = data.get("factors", [])
    scores = weighted_score(factors)

    report = {
        "date": args.date,
        "scale": data.get("scale", "1-5"),
        "factors": factors,
        "summary": scores,
    }

    out_path = Path(args.out) if args.out else Path(f"reports/imitation_barriers_{args.date}.json")
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {out_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
