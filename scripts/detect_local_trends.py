#!/usr/bin/env python3
import argparse
import json
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional


def parse_ts(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def read_json(path: Path) -> Optional[Dict[str, Any]]:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        return None
    except json.JSONDecodeError:
        return None


def main() -> int:
    parser = argparse.ArgumentParser(description="Detect local trend spikes by GeoCell.")
    parser.add_argument("--events", required=True, help="Path to stream events JSON")
    parser.add_argument("--config", default="config/trend_thresholds.json", help="Threshold config")
    parser.add_argument("--date", default=datetime.now(timezone.utc).strftime("%Y-%m-%d"), help="Report date")
    parser.add_argument("--out", default=None, help="Output JSON path")
    parser.add_argument(
        "--window-end",
        default=None,
        help="Optional ISO timestamp to use as window end (defaults to latest event)",
    )
    args = parser.parse_args()

    events_path = Path(args.events)
    events_payload = json.loads(events_path.read_text(encoding="utf-8"))
    events: List[Dict[str, Any]] = events_payload.get("events", events_payload)

    thresholds = read_json(Path(args.config)) or {}
    streams_per_hour_threshold = float(thresholds.get("streams_per_hour", 0))
    creators_per_hour_threshold = float(thresholds.get("unique_creators_per_hour", 0))
    window_minutes = int(thresholds.get("sustained_window_minutes", 30))
    boost_duration_minutes = int(thresholds.get("boost_duration_minutes", 15))

    if not events:
        raise SystemExit("No events provided.")

    if args.window_end:
        window_end = parse_ts(args.window_end)
    else:
        window_end = max(parse_ts(event["started_at"]) for event in events)
    window_start = window_end - timedelta(minutes=window_minutes)
    window_hours = window_minutes / 60.0

    per_cell: Dict[str, List[Dict[str, Any]]] = {}
    for event in events:
        started_at = parse_ts(event["started_at"])
        if started_at < window_start or started_at > window_end:
            continue
        cell_id = event.get("geo_cell_id")
        if not cell_id:
            continue
        per_cell.setdefault(cell_id, []).append(event)

    trend_flags = []
    tagged_events = []

    for cell_id, cell_events in per_cell.items():
        stream_count = len(cell_events)
        creator_ids = {e.get("creator_id") for e in cell_events if e.get("creator_id")}
        creators_count = len(creator_ids)
        streams_per_hour = stream_count / window_hours if window_hours else 0
        creators_per_hour = creators_count / window_hours if window_hours else 0

        if streams_per_hour >= streams_per_hour_threshold and creators_per_hour >= creators_per_hour_threshold:
            trend_id = f"{cell_id}-{window_end.strftime('%Y%m%d%H%M')}"
            trend_flags.append(
                {
                    "trend_id": trend_id,
                    "geo_cell_id": cell_id,
                    "window_start": window_start.isoformat(),
                    "window_end": window_end.isoformat(),
                    "streams_per_hour": round(streams_per_hour, 2),
                    "unique_creators_per_hour": round(creators_per_hour, 2),
                    "boost_duration_minutes": boost_duration_minutes,
                }
            )
            for event in cell_events:
                tagged_events.append(
                    {
                        "event_id": event.get("event_id"),
                        "geo_cell_id": cell_id,
                        "trend_id": trend_id,
                    }
                )

    report = {
        "date": args.date,
        "window": {
            "start": window_start.isoformat(),
            "end": window_end.isoformat(),
            "minutes": window_minutes,
        },
        "thresholds": {
            "streams_per_hour": streams_per_hour_threshold,
            "unique_creators_per_hour": creators_per_hour_threshold,
        },
        "trend_flags": trend_flags,
        "tagged_events": tagged_events,
    }

    out_path = Path(args.out) if args.out else Path(f"reports/trend_flags_{args.date}.json")
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {out_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
