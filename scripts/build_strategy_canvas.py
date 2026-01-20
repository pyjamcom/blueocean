#!/usr/bin/env python3
import argparse
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional


def read_json(path: Path) -> Dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def validate_canvas(data: Dict[str, Any]) -> None:
    factors = data.get("factors", [])
    if not factors:
        raise SystemExit("No factors defined in strategy canvas.")
    expected_len = len(factors)
    for profile in data.get("profiles", []):
        scores = profile.get("scores", [])
        if len(scores) != expected_len:
            raise SystemExit(f"Profile {profile.get('id')} has {len(scores)} scores, expected {expected_len}.")


def compute_focus(scores: List[float]) -> float:
    if not scores:
        return 0.0
    high = sum(1 for s in scores if s >= 4)
    return round(high / len(scores), 2)


def compute_divergence(pyjam_scores: List[float], competitor_scores: List[List[float]]) -> float:
    if not competitor_scores or not pyjam_scores:
        return 0.0
    avg = [sum(vals) / len(vals) for vals in zip(*competitor_scores)]
    diffs = [abs(a - b) for a, b in zip(pyjam_scores, avg)]
    return round(sum(diffs) / len(diffs), 2)


def select_tagline(candidates: List[str]) -> Optional[str]:
    for candidate in candidates:
        if len(candidate.split()) <= 8:
            return candidate
    return None


def render_svg(data: Dict[str, Any], out_path: Path) -> None:
    factors = data["factors"]
    profiles = data["profiles"]
    width = 1200
    height = 600
    margin = 80
    chart_w = width - 2 * margin
    chart_h = height - 2 * margin
    max_score = 5

    def x_pos(idx: int) -> float:
        if len(factors) == 1:
            return margin + chart_w / 2
        return margin + idx * (chart_w / (len(factors) - 1))

    def y_pos(score: float) -> float:
        return margin + chart_h - (score / max_score) * chart_h

    colors = ["#ff5a5f", "#5f9ea0", "#9370db", "#f4a261", "#2a9d8f"]

    lines = []
    for idx, profile in enumerate(profiles):
        points = " ".join(
            f"{x_pos(i):.1f},{y_pos(score):.1f}" for i, score in enumerate(profile["scores"])
        )
        lines.append(
            f"<polyline fill=\"none\" stroke=\"{colors[idx % len(colors)]}\" stroke-width=\"3\" points=\"{points}\" />"
        )

    labels = []
    for i, factor in enumerate(factors):
        labels.append(
            f"<text x=\"{x_pos(i):.1f}\" y=\"{height - margin + 30}\" text-anchor=\"middle\" font-size=\"12\" fill=\"#555\">{factor['label']}</text>"
        )

    svg = f"""<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"{width}\" height=\"{height}\" viewBox=\"0 0 {width} {height}\">
  <rect width=\"{width}\" height=\"{height}\" fill=\"#fffaf2\" />
  <text x=\"{margin}\" y=\"40\" font-family=\"Helvetica, Arial, sans-serif\" font-size=\"24\" fill=\"#111\">Strategy Canvas</text>
  <line x1=\"{margin}\" y1=\"{height - margin}\" x2=\"{width - margin}\" y2=\"{height - margin}\" stroke=\"#ccc\" />
  <line x1=\"{margin}\" y1=\"{margin}\" x2=\"{margin}\" y2=\"{height - margin}\" stroke=\"#ccc\" />
  {''.join(lines)}
  {''.join(labels)}
</svg>
"""
    out_path.write_text(svg, encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(description="Build strategy canvas snapshot + diagnostics.")
    parser.add_argument("--config", default="config/strategy_canvas.json", help="Strategy canvas config")
    parser.add_argument("--date", default=datetime.now(timezone.utc).strftime("%Y-%m-%d"), help="Report date")
    parser.add_argument("--out-snapshot", default="reports/strategy_canvas_snapshot.json", help="Snapshot output")
    parser.add_argument("--out-report", default=None, help="Date-stamped output")
    parser.add_argument("--out-svg", default="reports/strategy_canvas.svg", help="SVG output")
    parser.add_argument("--out-diff", default=None, help="Differentiation report output")
    args = parser.parse_args()

    config = read_json(Path(args.config))
    validate_canvas(config)

    profiles = config.get("profiles", [])
    pyjam = next((p for p in profiles if p.get("id") == "pyjam"), profiles[0])
    pyjam_scores = pyjam.get("scores", [])
    competitor_scores = [p.get("scores", []) for p in profiles if p.get("id") != pyjam.get("id")]

    focus_score = compute_focus(pyjam_scores)
    divergence_score = compute_divergence(pyjam_scores, competitor_scores)
    tagline_candidate = select_tagline(config.get("tagline_candidates", []))

    snapshot = {
        "date": args.date,
        "factors": config.get("factors", []),
        "profiles": profiles,
        "summary": {
            "focus_score": focus_score,
            "divergence_score": divergence_score,
            "tagline_candidate": tagline_candidate,
        },
    }

    out_snapshot = Path(args.out_snapshot)
    out_snapshot.parent.mkdir(parents=True, exist_ok=True)
    out_snapshot.write_text(json.dumps(snapshot, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    if args.out_report or True:
        out_report = Path(args.out_report) if args.out_report else Path(f"reports/strategy_canvas_{args.date}.json")
        out_report.write_text(json.dumps(snapshot, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    diff_report = {
        "date": args.date,
        "focus_score": focus_score,
        "divergence_score": divergence_score,
        "tagline_candidate": tagline_candidate,
        "pyjam_profile": pyjam.get("label"),
    }
    out_diff = Path(args.out_diff) if args.out_diff else Path(f"reports/differentiation_{args.date}.json")
    out_diff.write_text(json.dumps(diff_report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    render_svg(snapshot, Path(args.out_svg))
    print(f"Wrote {out_snapshot}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
