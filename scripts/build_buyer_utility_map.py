#!/usr/bin/env python3
import argparse
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Tuple


def read_json(path: Path) -> Dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def score_gaps(scores: Dict[str, Dict[str, int]], threshold: int) -> List[Tuple[str, str, int]]:
    gaps = []
    for stage, lever_scores in scores.items():
        for lever, value in lever_scores.items():
            if value <= threshold:
                gaps.append((stage, lever, value))
    gaps.sort(key=lambda item: item[2])
    return gaps


def main() -> int:
    parser = argparse.ArgumentParser(description="Build buyer utility gap report.")
    parser.add_argument("--config", default="config/buyer_utility_map.json", help="Buyer utility config")
    parser.add_argument("--date", default=datetime.now(timezone.utc).strftime("%Y-%m-%d"), help="Report date")
    parser.add_argument("--threshold", type=int, default=2, help="Gap threshold (<=)")
    parser.add_argument("--out", default=None, help="Output JSON path")
    args = parser.parse_args()

    data = read_json(Path(args.config))
    scores = data.get("scores", {})
    gaps = score_gaps(scores, args.threshold)

    gap_list = [
        {"stage": stage, "lever": lever, "score": score, "name": f"{stage}:{lever}"}
        for stage, lever, score in gaps
    ]

    report = {
        "date": args.date,
        "threshold": args.threshold,
        "gaps": gap_list[:10],
        "total_gaps": len(gap_list),
    }

    out_path = Path(args.out) if args.out else Path(f"reports/buyer_utility_{args.date}.json")
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {out_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
