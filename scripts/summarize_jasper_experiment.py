#!/usr/bin/env python3
import argparse
import json
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List


def load_events(path: Path) -> List[Dict[str, Any]]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    return payload.get("events", payload)


def main() -> int:
    parser = argparse.ArgumentParser(description="Summarize Jasper experiment metrics by variant.")
    parser.add_argument("--events", required=True, help="Path to experiment events JSON")
    parser.add_argument("--date", default=datetime.now(timezone.utc).strftime("%Y-%m-%d"), help="Report date")
    parser.add_argument("--out", default=None, help="Output JSON path")
    parser.add_argument("--cohort-date", default=None, help="Optional cohort date filter (YYYY-MM-DD)")
    args = parser.parse_args()

    events = load_events(Path(args.events))
    if args.cohort_date:
        events = [e for e in events if e.get("cohort_date") == args.cohort_date]

    variant_users = defaultdict(set)
    activation_users = defaultdict(set)
    retention_users = defaultdict(set)
    invites_sent = defaultdict(int)
    invites_converted = defaultdict(int)

    for event in events:
        variant = event.get("variant")
        user_id = event.get("user_id")
        if not variant or not user_id:
            continue
        event_type = event.get("event_type")
        if event_type == "exposure":
            variant_users[variant].add(user_id)
        else:
            variant_users[variant].add(user_id)
        if event_type == "activation":
            activation_users[variant].add(user_id)
        if event_type in ("retention_d1", "d1_retention"):
            retention_users[variant].add(user_id)
        if event_type == "invite_sent":
            invites_sent[variant] += 1
        if event_type == "invite_converted":
            invites_converted[variant] += 1

    report_variants = {}
    for variant, users in variant_users.items():
        total_users = len(users)
        activated = len(activation_users.get(variant, set()))
        retained = len(retention_users.get(variant, set()))
        sent = invites_sent.get(variant, 0)
        converted = invites_converted.get(variant, 0)

        activation_rate = (activated / total_users) if total_users else 0.0
        retention_rate = (retained / activated) if activated else 0.0
        invite_conversion = (converted / sent) if sent else 0.0
        k_factor = (sent / activated) * invite_conversion if activated else 0.0

        report_variants[variant] = {
            "total_users": total_users,
            "activation_rate": round(activation_rate, 4),
            "d1_retention_rate": round(retention_rate, 4),
            "k_factor": round(k_factor, 4),
            "invites_sent": sent,
            "invites_converted": converted,
        }

    report = {
        "date": args.date,
        "cohort_date": args.cohort_date,
        "variants": report_variants,
        "event_types": ["exposure", "activation", "retention_d1", "invite_sent", "invite_converted"],
    }

    out_path = Path(args.out) if args.out else Path(f"reports/jasper_strength_metrics_{args.date}.json")
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {out_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
