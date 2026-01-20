#!/usr/bin/env python3
import argparse
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Optional


def read_json(path: Path) -> Optional[Dict[str, Any]]:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        return None
    except json.JSONDecodeError:
        return None


def main() -> int:
    parser = argparse.ArgumentParser(description="Activate Bangkok launch waves and log timestamps.")
    parser.add_argument("--config", default="config/bangkok_launch_waves.json", help="Wave config")
    parser.add_argument("--activate-wave", default=None, help="Wave ID to activate")
    parser.add_argument("--date", default=datetime.now(timezone.utc).strftime("%Y-%m-%d"), help="Report date")
    parser.add_argument("--out", default=None, help="Output JSON path")
    args = parser.parse_args()

    config = read_json(Path(args.config))
    if not config:
        raise SystemExit("Missing or invalid wave config.")

    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    waves = []
    for wave in config.get("waves", []):
        wave_record = dict(wave)
        if args.activate_wave and wave.get("wave_id") == args.activate_wave:
            wave_record["status"] = "active"
            wave_record["activated_at"] = now
        else:
            wave_record["status"] = wave.get("status", "pending")
        waves.append(wave_record)

    report = {
        "date": args.date,
        "city": config.get("city"),
        "waves": waves,
        "activated_wave": args.activate_wave,
    }

    out_path = Path(args.out) if args.out else Path(f"reports/launch_wave_schedule_{args.date}.json")
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {out_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
