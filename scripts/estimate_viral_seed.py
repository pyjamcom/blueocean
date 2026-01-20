#!/usr/bin/env python3
import argparse
import json
import math
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, Tuple


def load_inputs(path: Path) -> Dict[str, float]:
    data = json.loads(path.read_text(encoding="utf-8"))
    return data


def geometric_sum(r0: float, cycles: float) -> float:
    # Sum of 1 + r0 + r0^2 + ... up to cycles (inclusive of seed generation).
    if cycles <= 0:
        return 1.0
    if abs(r0 - 1.0) < 1e-9:
        return cycles + 1.0
    return (r0 ** (cycles + 1.0) - 1.0) / (r0 - 1.0)


def estimate_seed_creators(inputs: Dict[str, float], r0: float) -> Tuple[float, float, int]:
    time_window_hours = float(inputs["time_window_hours"])
    streams_per_creator_per_day = float(inputs["streams_per_creator_per_day"])
    target_streams = float(inputs["target_streams"])
    cycles = max(time_window_hours / 24.0, 0.0)

    creator_multiplier = geometric_sum(r0, cycles)
    streams_per_creator_window = streams_per_creator_per_day * (time_window_hours / 24.0)
    expected_streams_per_seed = creator_multiplier * streams_per_creator_window
    if expected_streams_per_seed <= 0:
        return creator_multiplier, expected_streams_per_seed, 0
    seed_creators = math.ceil(target_streams / expected_streams_per_seed)
    return creator_multiplier, expected_streams_per_seed, seed_creators


def compute_r0(inputs: Dict[str, float]) -> float:
    return (
        float(inputs["avg_viewers_per_stream"])
        * float(inputs["view_to_creator_rate"])
        * float(inputs["creator_activation_rate"])
    )


def main() -> int:
    parser = argparse.ArgumentParser(description="Estimate seed creators for a viral chain reaction.")
    parser.add_argument("--config", default="config/viral_model_inputs.json", help="Input JSON config")
    parser.add_argument("--date", default=datetime.now(timezone.utc).strftime("%Y-%m-%d"), help="Report date")
    parser.add_argument(
        "--out",
        default=None,
        help="Output JSON path (default: reports/viral_seed_estimate_<date>.json)",
    )
    parser.add_argument("--sensitivity", type=float, default=0.2, help="Sensitivity +/- percentage")
    args = parser.parse_args()

    inputs = load_inputs(Path(args.config))
    r0_base = compute_r0(inputs)

    def with_multiplier(mult: float) -> Dict[str, float]:
        return {
            "r0": r0_base * mult,
            "multiplier": mult,
        }

    sensitivity = max(args.sensitivity, 0.0)
    r0_cases = {
        "low": with_multiplier(1.0 - sensitivity),
        "base": with_multiplier(1.0),
        "high": with_multiplier(1.0 + sensitivity),
    }

    estimates = {}
    for key, case in r0_cases.items():
        creator_multiplier, expected_streams_per_seed, seed_creators = estimate_seed_creators(
            inputs, case["r0"]
        )
        estimates[key] = {
            "r0": case["r0"],
            "creator_multiplier": creator_multiplier,
            "expected_streams_per_seed": expected_streams_per_seed,
            "seed_creators_required": seed_creators,
        }

    out_path = Path(args.out) if args.out else Path(f"reports/viral_seed_estimate_{args.date}.json")
    out_path.parent.mkdir(parents=True, exist_ok=True)

    report = {
        "date": args.date,
        "inputs": inputs,
        "assumptions": {
            "generation_cycle_hours": 24,
            "sensitivity_pct": sensitivity,
        },
        "estimates": estimates,
    }

    out_path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {out_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
