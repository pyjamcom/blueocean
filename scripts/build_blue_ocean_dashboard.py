#!/usr/bin/env python3
import argparse
import json
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Optional, Tuple


def read_json(path: Path) -> Optional[Dict[str, Any]]:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        return None
    except json.JSONDecodeError:
        return None


def find_latest_report(reports_dir: Path, patterns: Tuple[str, ...]) -> Optional[Path]:
    candidates = []
    for pattern in patterns:
        candidates.extend(reports_dir.glob(pattern))
    if not candidates:
        return None
    # pick most recently modified
    candidates.sort(key=lambda p: p.stat().st_mtime, reverse=True)
    return candidates[0]


def fmt(value: Any) -> str:
    if value is None:
        return "N/A"
    if isinstance(value, float):
        return f"{value:.2f}"
    return str(value)


def extract_strategy_summary(data: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    if not data:
        return {"focus_score": None, "divergence_score": None, "tagline_candidate": None}
    return {
        "focus_score": data.get("focus_score") or data.get("summary", {}).get("focus_score"),
        "divergence_score": data.get("divergence_score") or data.get("summary", {}).get("divergence_score"),
        "tagline_candidate": data.get("tagline_candidate") or data.get("summary", {}).get("tagline_candidate"),
    }


def extract_buyer_utility_summary(data: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    if not data:
        return {"top_gap": None, "gap_score": None}
    top_gap = None
    gap_score = None
    gaps = data.get("gaps") or data.get("top_gaps")
    if isinstance(gaps, list) and gaps:
        top_gap = gaps[0].get("name") if isinstance(gaps[0], dict) else str(gaps[0])
        gap_score = gaps[0].get("score") if isinstance(gaps[0], dict) else None
    return {"top_gap": top_gap, "gap_score": gap_score}


def extract_aarr_summary(data: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    if not data:
        return {"acquisition": None, "activation": None, "retention": None, "referral": None, "revenue": None}
    # Accept multiple possible keys
    return {
        "acquisition": data.get("acquisition") or data.get("new_users"),
        "activation": data.get("activation") or data.get("activation_rate"),
        "retention": data.get("retention") or data.get("retention_d1"),
        "referral": data.get("referral") or data.get("k_factor"),
        "revenue": data.get("revenue") or data.get("arpu"),
    }


def extract_loops_summary(data: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    if not data:
        return {"ugc_loop_completion": None, "viewer_loop_completion": None, "social_loop_completion": None}
    return {
        "ugc_loop_completion": data.get("ugc_loop_completion"),
        "viewer_loop_completion": data.get("viewer_loop_completion"),
        "social_loop_completion": data.get("social_loop_completion"),
    }


def extract_budget_summary(data: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    if not data:
        return {"daily_cap_pjm": None, "spent_pjm": None, "remaining_pjm": None}
    return {
        "daily_cap_pjm": data.get("daily_cap_pjm"),
        "spent_pjm": data.get("spent_pjm"),
        "remaining_pjm": data.get("remaining_pjm"),
    }


def extract_local_fame_summary(data: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    if not data:
        return {"top_creator": None, "top_cell": None}
    top_creator = data.get("top_creator")
    top_cell = data.get("top_cell")
    return {"top_creator": top_creator, "top_cell": top_cell}


def render_svg(dashboard: Dict[str, Any], out_path: Path) -> None:
    cards = {c["id"]: c for c in dashboard.get("cards", [])}

    strat = cards.get("strategy_canvas", {}).get("summary", {})
    util = cards.get("buyer_utility", {}).get("summary", {})
    aarr = cards.get("aarr", {}).get("summary", {})
    loops = cards.get("loops", {}).get("summary", {})
    budget = cards.get("budget", {}).get("summary", {})
    fame = cards.get("local_fame", {}).get("summary", {})

    def card(x, y, w, h, title, lines):
        text_lines = "".join(
            f"<text x=\"{x+20}\" y=\"{y+64+i*22}\" font-family=\"Helvetica, Arial, sans-serif\" font-size=\"14\" fill=\"#555\">{line}</text>"
            for i, line in enumerate(lines)
        )
        return (
            f"<g>"
            f"<rect x=\"{x}\" y=\"{y}\" width=\"{w}\" height=\"{h}\" rx=\"16\" fill=\"#f6f3ec\" stroke=\"#2b2b2b\" stroke-width=\"2\"/>"
            f"<text x=\"{x+20}\" y=\"{y+36}\" font-family=\"Helvetica, Arial, sans-serif\" font-size=\"20\" fill=\"#1f1f1f\">{title}</text>"
            f"{text_lines}"
            f"</g>"
        )

    svg = f"""<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"1200\" height=\"800\" viewBox=\"0 0 1200 800\">
  <rect width=\"1200\" height=\"800\" fill=\"#fffaf2\"/>
  <text x=\"40\" y=\"48\" font-family=\"Helvetica, Arial, sans-serif\" font-size=\"28\" fill=\"#111\">Blue Ocean Dashboard</text>
  <text x=\"40\" y=\"74\" font-family=\"Helvetica, Arial, sans-serif\" font-size=\"14\" fill=\"#666\">Auto-generated from reports</text>
  {card(40, 110, 360, 170, 'Strategy Canvas', [f"Focus: {fmt(strat.get('focus_score'))}", f"Divergence: {fmt(strat.get('divergence_score'))}", f"Tagline: {fmt(strat.get('tagline_candidate'))}"])}
  {card(420, 110, 360, 170, 'Buyer Utility Map', [f"Top gap: {fmt(util.get('top_gap'))}", f"Gap score: {fmt(util.get('gap_score'))}"])}
  {card(800, 110, 360, 170, 'AARRR Funnel', [f"Acq: {fmt(aarr.get('acquisition'))}", f"Act: {fmt(aarr.get('activation'))}", f"Ret: {fmt(aarr.get('retention'))}", f"Ref: {fmt(aarr.get('referral'))}", f"Rev: {fmt(aarr.get('revenue'))}"])}
  {card(40, 310, 360, 170, 'Growth Loops', [f"UGC: {fmt(loops.get('ugc_loop_completion'))}", f"Viewer: {fmt(loops.get('viewer_loop_completion'))}", f"Social: {fmt(loops.get('social_loop_completion'))}"])}
  {card(420, 310, 360, 170, 'PJM Budget', [f"Cap: {fmt(budget.get('daily_cap_pjm'))}", f"Spent: {fmt(budget.get('spent_pjm'))}", f"Remaining: {fmt(budget.get('remaining_pjm'))}"])}
  {card(800, 310, 360, 170, 'Local Fame', [f"Top creator: {fmt(fame.get('top_creator'))}", f"Top cell: {fmt(fame.get('top_cell'))}"])}
  {card(40, 510, 1120, 220, 'Notes', ['Wire GA4 + internal events to populate cards.'])}
</svg>
"""

    out_path.write_text(svg, encoding="utf-8")


def build_dashboard(reports_dir: Path) -> Dict[str, Any]:
    def load_latest(patterns: Tuple[str, ...]) -> Optional[Dict[str, Any]]:
        path = find_latest_report(reports_dir, patterns)
        return read_json(path) if path else None

    strategy_data = load_latest(("differentiation_*.json", "strategy_canvas_*.json", "strategy_canvas_snapshot.json"))
    utility_data = load_latest(("buyer_utility_*.json", "buyer_utility_gaps.json"))
    aarr_data = load_latest(("normalized_metrics_*.json", "funnel_*.json"))
    loops_data = load_latest(("loops_*.json",))
    budget_data = load_latest(("budget_daily_*.json",))
    fame_data = load_latest(("local_fame_*.json", "local_fame_latest.json"))

    dashboard = {
        "meta": {
            "title": "Blue Ocean Dashboard",
            "generated_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
            "data_sources": ["reports"],
        },
        "cards": [
            {
                "id": "strategy_canvas",
                "title": "Strategy Canvas",
                "source": str(find_latest_report(reports_dir, ("differentiation_*.json", "strategy_canvas_*.json", "strategy_canvas_snapshot.json")) or ""),
                "summary": extract_strategy_summary(strategy_data),
            },
            {
                "id": "buyer_utility",
                "title": "Buyer Utility Map",
                "source": str(find_latest_report(reports_dir, ("buyer_utility_*.json", "buyer_utility_gaps.json")) or ""),
                "summary": extract_buyer_utility_summary(utility_data),
            },
            {
                "id": "aarr",
                "title": "AARRR Funnel",
                "source": str(find_latest_report(reports_dir, ("normalized_metrics_*.json", "funnel_*.json")) or ""),
                "summary": extract_aarr_summary(aarr_data),
            },
            {
                "id": "loops",
                "title": "Growth Loops",
                "source": str(find_latest_report(reports_dir, ("loops_*.json",)) or ""),
                "summary": extract_loops_summary(loops_data),
            },
            {
                "id": "budget",
                "title": "PJM Budget Health",
                "source": str(find_latest_report(reports_dir, ("budget_daily_*.json",)) or ""),
                "summary": extract_budget_summary(budget_data),
            },
            {
                "id": "local_fame",
                "title": "Local Fame",
                "source": str(find_latest_report(reports_dir, ("local_fame_*.json", "local_fame_latest.json")) or ""),
                "summary": extract_local_fame_summary(fame_data),
            },
        ],
    }
    return dashboard


def main() -> None:
    parser = argparse.ArgumentParser(description="Build Blue Ocean dashboard JSON + SVG from reports.")
    parser.add_argument("--reports-dir", default="reports", help="Reports directory")
    parser.add_argument("--out-json", default="reports/blue_ocean_dashboard.json", help="Dashboard JSON output")
    parser.add_argument("--out-svg", default="reports/blue_ocean_dashboard.svg", help="Dashboard SVG output")
    args = parser.parse_args()

    reports_dir = Path(args.reports_dir)
    reports_dir.mkdir(parents=True, exist_ok=True)

    dashboard = build_dashboard(reports_dir)

    out_json = Path(args.out_json)
    out_json.parent.mkdir(parents=True, exist_ok=True)
    out_json.write_text(json.dumps(dashboard, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    out_svg = Path(args.out_svg)
    render_svg(dashboard, out_svg)


if __name__ == "__main__":
    main()
