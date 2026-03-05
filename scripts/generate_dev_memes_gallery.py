from __future__ import annotations

import csv
import json
import os
from datetime import datetime, timezone
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
DEFAULT_DATASET_DIR = ROOT.parent / "escapers" / "downloads" / "pngegg_memes_1_200_preview"
DATASET_DIR = Path(os.environ.get("DEV_MEMES_DATASET_DIR", DEFAULT_DATASET_DIR))
MASTER_CSV = DATASET_DIR / "master_memes.csv"
MEMES_ONLY_CSV = DATASET_DIR / "memes_only.csv"
OUTPUT_JSON = ROOT / "apps" / "web" / "public" / "dev-memes-gallery.json"

PAGE_SIZE = 40
GRID_COLUMNS = 10
GRID_ROWS = 4
PAGE_COLUMN = "dev_memes_page_number"


def read_csv_rows(path: Path) -> tuple[list[str], list[dict[str, str]]]:
    with path.open("r", encoding="utf-8", newline="") as handle:
        reader = csv.DictReader(handle)
        return list(reader.fieldnames or []), list(reader)


def write_csv_rows(path: Path, fieldnames: list[str], rows: list[dict[str, str]]) -> None:
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames, lineterminator="\r\n")
        writer.writeheader()
        writer.writerows(rows)


def should_publish(row: dict[str, str]) -> bool:
    saved_relpath = (row.get("saved_relpath") or "").strip()
    if not saved_relpath or "/files/" not in saved_relpath:
        return False
    if (row.get("exact_duplicate_copy") or "").strip() == "true":
        return False
    return True


def main() -> None:
    if not MASTER_CSV.exists():
        raise FileNotFoundError(f"master CSV not found: {MASTER_CSV}")
    if not MEMES_ONLY_CSV.exists():
        raise FileNotFoundError(f"memes_only CSV not found: {MEMES_ONLY_CSV}")

    master_fieldnames, master_rows = read_csv_rows(MASTER_CSV)
    if PAGE_COLUMN not in master_fieldnames:
        master_fieldnames.append(PAGE_COLUMN)

    published_page_by_row_id: dict[str, int] = {}
    items: list[dict[str, object]] = []

    published_index = 0
    for row in master_rows:
        row[PAGE_COLUMN] = ""
        if not should_publish(row):
            continue
        published_index += 1
        page_number = ((published_index - 1) // PAGE_SIZE) + 1
        published_page_by_row_id[row["row_id"]] = page_number
        row[PAGE_COLUMN] = str(page_number)
        items.append(
            {
                "position": published_index,
                "pageNumber": page_number,
                "rowId": row["row_id"],
                "title": row["title"],
                "fileName": row["saved_filename"],
                "imageUrl": row["resolved_png_url"],
                "searchPage": int(row["search_page"]),
                "pageItemIndex": int(row["page_item_index"]),
            }
        )

    if published_index != 3536:
        raise RuntimeError(f"expected 3536 published originals, got {published_index}")

    write_csv_rows(MASTER_CSV, master_fieldnames, master_rows)

    memes_fieldnames, memes_rows = read_csv_rows(MEMES_ONLY_CSV)
    if PAGE_COLUMN not in memes_fieldnames:
        memes_fieldnames.append(PAGE_COLUMN)
    for row in memes_rows:
        page_number = published_page_by_row_id.get(row["row_id"])
        row[PAGE_COLUMN] = str(page_number) if page_number else ""
    write_csv_rows(MEMES_ONLY_CSV, memes_fieldnames, memes_rows)

    manifest = {
        "version": 1,
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "pageSize": PAGE_SIZE,
        "columns": GRID_COLUMNS,
        "rows": GRID_ROWS,
        "pageCount": (published_index + PAGE_SIZE - 1) // PAGE_SIZE,
        "totalItems": published_index,
        "items": items,
    }
    OUTPUT_JSON.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    print(
        json.dumps(
            {
                "datasetDir": str(DATASET_DIR),
                "outputJson": str(OUTPUT_JSON),
                "publishedOriginals": published_index,
                "pageCount": manifest["pageCount"],
            },
            ensure_ascii=False,
        )
    )


if __name__ == "__main__":
    main()
