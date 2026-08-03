"""
Phase 3a — Tag demo subset → data/catalog.json + data/tag_review.json
Uses Groq when available; falls back to heuristics (still fully tagged).
"""

from __future__ import annotations

import argparse
import csv
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from phase3_lib import (  # noqa: E402
    CACHE,
    DATA,
    GOAL_VOCAB,
    NEED_VOCAB,
    TIME_VOCAB,
    extract_json,
    get_groq_api_key,
    groq_chat,
    heuristic_tags,
    row_to_catalog_item,
)

SUBSET = DATA / "subset.csv"
OUT_CATALOG = DATA / "catalog.json"
OUT_REVIEW = DATA / "tag_review.json"


def load_subset() -> list[dict]:
    with SUBSET.open(encoding="utf-8", newline="") as f:
        return list(csv.DictReader(f))


def clamp_tags(obj: dict) -> dict:
    needs = [t for t in obj.get("need_tags", []) if t in NEED_VOCAB][:4]
    goals = [t for t in obj.get("goal_tags", []) if t in GOAL_VOCAB][:3]
    times = [t for t in obj.get("time_tags", []) if t in TIME_VOCAB][:4]
    if not needs:
        needs = ["novelty"]
    if not goals:
        goals = ["convenience"]
    if not times:
        times = ["anytime"]
    return {"need_tags": needs, "goal_tags": goals, "time_tags": times}


def llm_tag_batch(batch: list[dict]) -> dict[str, dict]:
    compact = [
        {
            "id": r["id"],
            "name": r["name"],
            "category": r["category"],
            "top_category": r["top_category"],
        }
        for r in batch
    ]
    prompt = {
        "role": "user",
        "content": (
            "Tag grocery products for a cross-sell recommendation engine.\n"
            f"Allowed need_tags: {NEED_VOCAB}\n"
            f"Allowed goal_tags: {GOAL_VOCAB}\n"
            f"Allowed time_tags: {TIME_VOCAB}\n"
            "Rules: pick 1-3 need_tags, 1-2 goal_tags, 1-3 time_tags per product. "
            "time_tags reflect when people usually want the product. "
            "Return JSON object: {\"items\":[{\"id\":\"...\",\"need_tags\":[],\"goal_tags\":[],\"time_tags\":[]}]}\n"
            f"Products: {json.dumps(compact, ensure_ascii=False)}"
        ),
    }
    system = {
        "role": "system",
        "content": "You are a precise product taxonomist. Reply with valid JSON only.",
    }
    raw = groq_chat([system, prompt], temperature=0.1)
    data = extract_json(raw)
    items = data["items"] if isinstance(data, dict) else data
    out: dict[str, dict] = {}
    for item in items:
        pid = item.get("id")
        if not pid:
            continue
        out[pid] = clamp_tags(item)
    return out


def tag_all(rows: list[dict], use_llm: bool, batch_size: int = 12) -> tuple[list[dict], str]:
    tags_by_id: dict[str, dict] = {}
    mode = "heuristic"

    # Always start with heuristics
    for row in rows:
        tags_by_id[row["id"]] = heuristic_tags(row)

    if use_llm and get_groq_api_key():
        mode = "groq+heuristic"
        for i in range(0, len(rows), batch_size):
            batch = rows[i : i + batch_size]
            cache_path = CACHE / f"tags_batch_{i}_{i+len(batch)}.json"
            try:
                if cache_path.exists():
                    llm_tags = json.loads(cache_path.read_text(encoding="utf-8"))
                else:
                    llm_tags = llm_tag_batch(batch)
                    cache_path.write_text(json.dumps(llm_tags, indent=2), encoding="utf-8")
                for pid, tags in llm_tags.items():
                    # merge: prefer LLM, keep heuristic if LLM empty fields
                    base = tags_by_id.get(pid, heuristic_tags(next(r for r in batch if r["id"] == pid)))
                    tags_by_id[pid] = {
                        "need_tags": tags.get("need_tags") or base["need_tags"],
                        "goal_tags": tags.get("goal_tags") or base["goal_tags"],
                        "time_tags": tags.get("time_tags") or base["time_tags"],
                    }
                print(f"  tagged batch {i}-{i+len(batch)-1} via Groq")
            except Exception as e:  # noqa: BLE001
                print(f"  WARN batch {i}: LLM failed ({e}); keeping heuristics")
    elif use_llm:
        print("  WARN: no API key — using heuristics only")
        mode = "heuristic"

    catalog = [row_to_catalog_item(row, tags_by_id[row["id"]]) for row in rows]
    catalog.sort(key=lambda x: x["id"])
    return catalog, mode


def build_review(catalog: list[dict], n: int = 30) -> list[dict]:
    # diversify review sample across top categories
    by_top: dict[str, list[dict]] = {}
    for item in catalog:
        by_top.setdefault(item["top_category"], []).append(item)
    sample: list[dict] = []
    tops = sorted(by_top.keys())
    idx = 0
    while len(sample) < min(n, len(catalog)):
        top = tops[idx % len(tops)]
        bucket = by_top[top]
        if bucket:
            item = bucket.pop(0)
            sample.append(
                {
                    "id": item["id"],
                    "name": item["name"],
                    "top_category": item["top_category"],
                    "need_tags": item["need_tags"],
                    "goal_tags": item["goal_tags"],
                    "time_tags": item["time_tags"],
                    "veg_flag": item["veg_flag"],
                    "image_url": item["image_url"],
                    "review_status": "pending",
                }
            )
        idx += 1
        if idx > len(catalog) * 2:
            break
    return sample


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--heuristic-only", action="store_true")
    args = parser.parse_args()

    rows = load_subset()
    print(f"Tagging {len(rows)} products…")
    catalog, mode = tag_all(rows, use_llm=not args.heuristic_only)

    # validate
    for item in catalog:
        assert item["need_tags"] and item["goal_tags"] and item["time_tags"]
        assert item["image_url"].startswith("/images/")
        assert isinstance(item["veg_flag"], bool)

    OUT_CATALOG.write_text(json.dumps(catalog, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    review = {
        "mode": mode,
        "count": len(catalog),
        "instructions": "Spot-check tags. Edit catalog.json if a tag is wrong; re-run candidates after edits.",
        "sample": build_review(catalog, 30),
    }
    OUT_REVIEW.write_text(json.dumps(review, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    print(f"wrote {OUT_CATALOG} ({len(catalog)} items, mode={mode})")
    print(f"wrote {OUT_REVIEW} (30-item spot-check sample)")
    print("DONE tagging.")


if __name__ == "__main__":
    main()
