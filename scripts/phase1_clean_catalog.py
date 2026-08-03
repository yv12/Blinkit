"""
Phase 1 — Data cleaning
- Dedupe products_cleaned.csv on (name, unit), keep first
- Map micro-category → top_category via data/mapping.json
- Write data/catalog_clean.csv
- Print per-top-category counts + validation summary
"""

from __future__ import annotations

import csv
import json
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
INPUT_CSV = ROOT / "products_cleaned.csv"
MAPPING_JSON = ROOT / "data" / "mapping.json"
OUTPUT_CSV = ROOT / "data" / "catalog_clean.csv"

OUTPUT_FIELDS = [
    "id",
    "name",
    "price",
    "unit",
    "category",
    "top_category",
    "subcategory",
    "category_url",
    "image_url",
]


def load_mapping(path: Path) -> dict[str, str]:
    with path.open(encoding="utf-8") as f:
        raw = json.load(f)
    mapping = {k: v for k, v in raw.items() if not k.startswith("_")}
    if not mapping:
        raise SystemExit(f"No category mappings found in {path}")
    return mapping


def dedupe_key(row: dict[str, str]) -> tuple[str, str]:
    name = (row.get("name") or "").strip().lower()
    unit = (row.get("unit") or "").strip().lower()
    return name, unit


def clean() -> None:
    if not INPUT_CSV.exists():
        raise SystemExit(f"Missing input CSV: {INPUT_CSV}")
    if not MAPPING_JSON.exists():
        raise SystemExit(f"Missing mapping file: {MAPPING_JSON}")

    mapping = load_mapping(MAPPING_JSON)

    with INPUT_CSV.open(newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        if not reader.fieldnames:
            raise SystemExit("Input CSV has no header")
        required = {"name", "unit", "category"}
        missing = required - set(reader.fieldnames)
        if missing:
            raise SystemExit(f"Input CSV missing columns: {sorted(missing)}")
        rows = list(reader)

    seen: set[tuple[str, str]] = set()
    cleaned: list[dict[str, str]] = []
    unmapped: set[str] = set()
    dropped_dupes = 0

    for row in rows:
        key = dedupe_key(row)
        if not key[0]:
            continue
        if key in seen:
            dropped_dupes += 1
            continue
        seen.add(key)

        micro = (row.get("category") or "").strip()
        top = mapping.get(micro)
        if not top:
            unmapped.add(micro or "<empty>")
            continue

        cleaned.append(
            {
                "id": f"p{len(cleaned) + 1:05d}",
                "name": (row.get("name") or "").strip(),
                "price": (row.get("price") or "").strip(),
                "unit": (row.get("unit") or "").strip(),
                "category": micro,
                "top_category": top,
                "subcategory": (row.get("subcategory") or "").strip(),
                "category_url": (row.get("category_url") or "").strip(),
                "image_url": (row.get("image_url") or "").strip(),
            }
        )

    if unmapped:
        print("ERROR: unmapped micro-categories (add them to data/mapping.json):")
        for cat in sorted(unmapped):
            print(f"  - {cat}")
        raise SystemExit(1)

    OUTPUT_CSV.parent.mkdir(parents=True, exist_ok=True)
    with OUTPUT_CSV.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=OUTPUT_FIELDS)
        writer.writeheader()
        writer.writerows(cleaned)

    # --- validation / done-when checks ---
    dupe_check: Counter[tuple[str, str]] = Counter()
    missing_top = 0
    for row in cleaned:
        dupe_check[dedupe_key(row)] += 1
        if not row["top_category"]:
            missing_top += 1

    dupe_keys = sum(1 for _, n in dupe_check.items() if n > 1)
    top_counts = Counter(row["top_category"] for row in cleaned)

    print("=== Phase 1 clean summary ===")
    print(f"input rows          : {len(rows)}")
    print(f"dropped duplicates  : {dropped_dupes}")
    print(f"output rows         : {len(cleaned)}")
    print(f"dupe keys in output : {dupe_keys}  (must be 0)")
    print(f"missing top_category: {missing_top}  (must be 0)")
    print(f"wrote               : {OUTPUT_CSV}")
    print()
    print("Per top_category counts:")
    for top, n in sorted(top_counts.items(), key=lambda x: (-x[1], x[0])):
        print(f"  {n:5d}  {top}")
    print(f"  -----")
    print(f"  {sum(top_counts.values()):5d}  TOTAL")

    if dupe_keys != 0 or missing_top != 0:
        raise SystemExit("FAIL: done-when checks not met")
    print()
    print("DONE: catalog_clean.csv has 0 dupes, every row has a top_category.")


if __name__ == "__main__":
    try:
        clean()
    except BrokenPipeError:
        sys.exit(0)
