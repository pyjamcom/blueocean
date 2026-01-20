#!/usr/bin/env python3
import argparse
import json
from pathlib import Path
from typing import Any, Dict, List


def read_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def main() -> int:
    parser = argparse.ArgumentParser(description="Validate adoption hurdles mitigations per feature.")
    parser.add_argument("--config", default="config/adoption_hurdles.json", help="Adoption hurdles config")
    parser.add_argument("--features", required=True, help="Features JSON with mitigations")
    parser.add_argument("--out", default=None, help="Output JSON report")
    args = parser.parse_args()

    config = read_json(Path(args.config))
    required = set(config.get("mitigations_required", []))
    features = read_json(Path(args.features))
    items: List[Dict[str, Any]] = features.get("features", features)

    failing = []
    for feature in items:
        mitigations = set(feature.get("mitigations", []))
        missing = sorted(required - mitigations)
        if missing:
            failing.append({"id": feature.get("id"), "missing_mitigations": missing})

    report = {
        "total_features": len(items),
        "fail_count": len(failing),
        "failing_features": failing,
        "required_mitigations": sorted(required),
    }

    out_path = Path(args.out) if args.out else Path("reports/adoption_hurdles_check.json")
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {out_path}")
    return 1 if failing else 0


if __name__ == "__main__":
    raise SystemExit(main())
