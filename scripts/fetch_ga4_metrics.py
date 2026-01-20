#!/usr/bin/env python3
import argparse
import json
from datetime import datetime, timedelta, timezone
from pathlib import Path
import os
import sys
import urllib.request
import urllib.parse


# Load optional env file without committing secrets
def load_env_file(env_path: Path) -> None:
    if not env_path.exists():
        return
    for line in env_path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith('#') or '=' not in line:
            continue
        key, val = line.split('=', 1)
        key = key.strip()
        val = val.strip()
        if key and key not in os.environ:
            os.environ[key] = val


def refresh_access_token() -> str | None:
    client_id = os.environ.get("GA_CLIENT_ID")
    client_secret = os.environ.get("GA_CLIENT_SECRET")
    refresh_token = os.environ.get("GA_REFRESH_TOKEN")
    if not (client_id and client_secret and refresh_token):
        return None

    payload = urllib.parse.urlencode({
        "client_id": client_id,
        "client_secret": client_secret,
        "refresh_token": refresh_token,
        "grant_type": "refresh_token",
    }).encode("utf-8")
    req = urllib.request.Request("https://oauth2.googleapis.com/token", data=payload, method="POST")
    req.add_header("Content-Type", "application/x-www-form-urlencoded")

    try:
        with urllib.request.urlopen(req) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            return data.get("access_token")
    except Exception:
        return None



def load_config() -> dict:
    config_path = Path(__file__).resolve().parents[1] / "config" / "analytics_sources.json"
    return json.loads(config_path.read_text(encoding="utf-8"))


def build_payload(start_date: str, end_date: str) -> dict:
    return {
        "dateRanges": [{"startDate": start_date, "endDate": end_date}],
        "metrics": [
            {"name": "totalUsers"},
            {"name": "sessions"},
            {"name": "eventCount"},
        ],
        "dimensions": [{"name": "date"}],
        "limit": 10000,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Fetch GA4 daily metrics via Data API.")
    parser.add_argument("--date", default=None, help="Single date in YYYY-MM-DD (UTC).")
    parser.add_argument("--start-date", default=None, help="Start date YYYY-MM-DD.")
    parser.add_argument("--end-date", default=None, help="End date YYYY-MM-DD.")
    parser.add_argument("--out-dir", default="reports/raw", help="Output directory for raw GA4 data.")
    args = parser.parse_args()

    load_env_file(Path('config/ga_oauth.env'))

    config = load_config().get("ga4", {})
    property_id = config.get("property_id")
    if not property_id:
        print("Missing GA4 property_id in config/analytics_sources.json", file=sys.stderr)
        return 1

    access_token = os.environ.get(config.get("access_token_env", "GA_ACCESS_TOKEN"))
    if not access_token:
        access_token = refresh_access_token()
        if access_token:
            os.environ[config.get("access_token_env", "GA_ACCESS_TOKEN")] = access_token
        else:
            print("Missing GA access token in env (GA_ACCESS_TOKEN) and could not obtain one via refresh token.", file=sys.stderr)
            return 1

    user_project = os.environ.get(config.get("user_project_env", "GA_USER_PROJECT"), config.get("project_id"))

    if args.date:
        start_date = end_date = args.date
    else:
        if args.start_date and args.end_date:
            start_date, end_date = args.start_date, args.end_date
        else:
            # default: yesterday UTC
            yesterday = datetime.now(timezone.utc).date() - timedelta(days=1)
            start_date = end_date = yesterday.isoformat()

    payload = build_payload(start_date, end_date)
    url = f"https://analyticsdata.googleapis.com/v1beta/properties/{property_id}:runReport"
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(url, data=data, method="POST")
    req.add_header("Authorization", f"Bearer {access_token}")
    req.add_header("Content-Type", "application/json")
    if user_project:
        req.add_header("x-goog-user-project", user_project)

    try:
        with urllib.request.urlopen(req) as resp:
            body = resp.read().decode("utf-8")
            result = json.loads(body)
    except Exception as exc:
        print(f"GA4 request failed: {exc}", file=sys.stderr)
        return 1

    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    suffix = f"{start_date}_{end_date}" if start_date != end_date else start_date
    out_path = out_dir / f"ga4_{suffix}.json"
    out_path.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {out_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
