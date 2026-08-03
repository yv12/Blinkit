"""
Offline LLM recommendation pass for persona Yash.

Uses Groq to pick L2/L3/L4 candidates from the catalog using the cut/gym logic:
  high-protein + zero-sugar history
  → new-category healthy / protein alternatives (L2)
  → gym gear, multivitamins, smart scale (L3)
  → recovery / sleep halo (L4)

Hard rules (code-enforced after LLM):
  - No product already in order history
  - L2 must be a category the user has NEVER bought (true cross-category)
  - veg_only
  - Honest bridge required; skip if LLM marks skip

Runtime never calls this — writes data/candidates_yash.json once.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from phase3_lib import CACHE, DATA, extract_json, get_groq_api_key, groq_chat  # noqa: E402
import re
import time

PERSONA_PATH = DATA / "persona_yash.json"
CATALOG_PATH = DATA / "catalog.json"
OUT_PATH = DATA / "candidates_yash.json"

SYSTEM = """You are the offline recommendation brain for a Blinkit-style cross-category discovery MVP.

Persona pattern (Yash):
- Orders many HIGH PROTEIN items (Milky Mist high-protein paneer, Skyr, protein bars, Baker's Loaf high-protein bread).
- Also buys ZERO SUGAR / lighter snacks (Coke Zero, Crax Zero).
- Inference: cutting / gym / weight management — not random snacking.
- Therefore recommend:
  L2: same PROTEIN or low-sugar CUT need, but a NEW category they never bought (whey, protein shakes, plant protein drinks, sugar-free from a new aisle). NEVER another curd/yogurt, paneer, protein bar, bread, chips, or soft drink brand.
  L3: FITNESS / WEIGHT_LOSS goal with a DIFFERENT need — smart weighing scale, multivitamins, gym gloves, resistance bands, shaker, creatine, gym bottle/apparel.
  L4: lifestyle halo only — recovery/sleep (chamomile, melatonin). Sparse.

Hard rules you must obey:
1. CROSS-CATEGORY only for L2: candidate category must NOT appear in history categories.
2. Never recommend the same product type they already buy (no Amul curd if they buy Skyr).
3. Every bridge must cite real history items and state why this NEW aisle fits.
4. If a product fails these rules, set skip=true.
5. Brand-safe, family-safe copy. No tobacco.

Reply JSON ONLY:
{
  "items": [
    {
      "product_id": "...",
      "level": "L2"|"L3"|"L4",
      "shared_tag": "protein"|"weight_loss"|"fitness"|"wellness"|"sleep"|"snack",
      "tag_type": "need"|"goal"|"halo",
      "bridge": "one honest sentence",
      "bio": "playful dating-app one-liner",
      "confidence": 0.0-1.0,
      "skip": false
    }
  ]
}
"""


def load_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def compact_catalog(catalog: list[dict], hist_ids: set[str], hist_cats: set[str]) -> list[dict]:
    """Prefer products useful for the cut/gym ladder; keep payload small for Groq."""
    keywords = (
        "protein",
        "whey",
        "shake",
        "soy",
        "sugar free",
        "no added sugar",
        "zero",
        "diet",
        "multivitamin",
        "vitamin",
        "weighing",
        "scale",
        "creatine",
        "gym",
        "resistance",
        "shaker",
        "chamomile",
        "melatonin",
        "zzzquil",
        "glove",
        "strap",
        "trunk",
        "bottle",
    )
    scored = []
    for p in catalog:
        if p["id"] in hist_ids:
            continue
        if p.get("veg_flag") is False:
            continue
        name = (p.get("name") or "").lower()
        blob = " ".join(
            [
                name,
                p.get("category") or "",
                p.get("top_category") or "",
                " ".join(p.get("need_tags") or []),
                " ".join(p.get("goal_tags") or []),
            ]
        ).lower()
        hit = sum(1 for k in keywords if k in blob)
        if hit == 0 and "protein" not in (p.get("need_tags") or []) and "fitness" not in (
            p.get("goal_tags") or []
        ):
            continue
        # Prefer true new categories for L2 pool visibility
        new_cat_bonus = 2 if p.get("category") not in hist_cats else 0
        scored.append((-(hit + new_cat_bonus), p.get("price") or 0, p))

    scored.sort(key=lambda t: (t[0], t[1]))
    out = []
    for _, __, p in scored[:48]:
        out.append(
            {
                "id": p["id"],
                "name": (p["name"] or "")[:70],
                "cat": p.get("category"),
                "top": p.get("top_category"),
                "price": p.get("price"),
                "needs": (p.get("need_tags") or [])[:4],
                "goals": (p.get("goal_tags") or [])[:3],
                "seen_cat": p.get("category") in hist_cats,
            }
        )
    return out


def parse_llm_json(text: str):
    """Tolerant JSON extract for LLM replies."""
    try:
        return extract_json(text)
    except Exception:
        pass
    cleaned = text.strip()
    cleaned = re.sub(r"```json|```", "", cleaned).strip()
    # Trim to outermost object/array
    m = re.search(r"\{[\s\S]*\}|\[[\s\S]*\]", cleaned)
    if not m:
        raise ValueError(f"No JSON in response: {text[:240]}")
    blob = m.group(0)
    blob = re.sub(r",\s*([}\]])", r"\1", blob)  # trailing commas
    try:
        return json.loads(blob)
    except json.JSONDecodeError:
        # Last resort: keep only well-formed item-like lines via smaller object recovery
        items = []
        for obj in re.finditer(r"\{[^{}]*\"product_id\"[^{}]*\}", blob):
            try:
                items.append(json.loads(re.sub(r",\s*}", "}", obj.group(0))))
            except json.JSONDecodeError:
                continue
        if items:
            return {"items": items}
        raise


def validate_item(item: dict, by_id: dict, hist_ids: set[str], hist_cats: set[str]) -> dict | None:
    if item.get("skip"):
        return None
    pid = item.get("product_id")
    level = item.get("level")
    bridge = str(item.get("bridge") or "").strip()
    if not pid or pid not in by_id or pid in hist_ids:
        return None
    if level not in ("L2", "L3", "L4"):
        return None
    if len(bridge) < 12:
        return None
    p = by_id[pid]
    if p.get("veg_flag") is False:
        return None
    # Cross-category hard rule for L2
    if level == "L2" and p.get("category") in hist_cats:
        return None
    # Same-type guardrails even if category string differs slightly
    name = (p.get("name") or "").lower()

    # Normalize level mistakes from the LLM (gear != L2 protein food)
    if any(k in name for k in ("chamomile", "melatonin", "zzzquil")):
        level = "L4"
        item["shared_tag"] = "sleep"
        item["tag_type"] = "halo"
    elif any(
        k in name
        for k in (
            "creatine",
            "weighing",
            "multivitamin",
            "gym glove",
            "gym gloves",
            "resistance",
            "shaker",
            "wrist strap",
            "gym gallon",
            "gym supporter",
            "thermal bottle",
            "sport thermal",
        )
    ):
        level = "L3"
        item["tag_type"] = "goal"
        if "weigh" in name:
            item["shared_tag"] = "weight_loss"
        elif "vitamin" in name:
            item["shared_tag"] = "wellness"
        else:
            item["shared_tag"] = "fitness"

    if level == "L2":
        banned_substrings = (
            "curd",
            "yogurt",
            "yoghurt",
            "skyr",
            "paneer",
            "protein bar",
            "wafer protein",
            "chips",
            "namkeen",
            "soft drink",
            "diet-coke",
            "diet coke",
            "coca-cola",
            "creatine",
            "glove",
            "bottle",
        )
        # Allow protein shake / whey; block bar/curd clones and gym gear
        if any(b in name for b in banned_substrings) and "shake" not in name and "whey" not in name and "soy" not in name:
            return None
        if p.get("category") in {
            "Curd Yogurt",
            "Paneer Tofu",
            "Energy Bars",
            "Bread Pav",
            "Chips Crisps",
            "Bhujia Namkeen",
            "Soft Drinks",
            "Oats",
            "Sports Fitness",
            "Bottles Flasks",
        }:
            return None

    conf = item.get("confidence", 0.75)
    try:
        conf = float(conf)
    except (TypeError, ValueError):
        conf = 0.75
    conf = max(0.45, min(0.95, conf))

    return {
        "product_id": p["id"],
        "name": p["name"],
        "category": p["category"],
        "top_category": p["top_category"],
        "price": p["price"],
        "level": level,
        "shared_tag": item.get("shared_tag") or ("protein" if level == "L2" else "fitness"),
        "tag_type": item.get("tag_type")
        or ("need" if level == "L2" else "goal" if level == "L3" else "halo"),
        "bridge": bridge,
        "bio": str(item.get("bio") or bridge).strip(),
        "confidence": round(conf, 2),
        "veg_flag": p.get("veg_flag", True),
        "time_tags": p.get("time_tags") or ["anytime"],
        "need_tags": p.get("need_tags") or [],
        "goal_tags": p.get("goal_tags") or [],
        "image_url": p.get("image_url") or f"/images/{p['id']}.svg",
        "in_stock": True,
    }


def main() -> None:
    if not get_groq_api_key():
        raise SystemExit("Missing Groq API key in .env (Gork_API_KEY / GROQ_API_KEY)")

    persona = load_json(PERSONA_PATH)
    catalog = load_json(CATALOG_PATH)
    by_id = {p["id"]: p for p in catalog}
    hist_ids = {h["product_id"] for h in persona["order_history"]}
    hist_cats = {h["category"] for h in persona["order_history"]}

    # Drop stale LLM cache so bridges regenerate with new rules
    for path in CACHE.glob("yash_llm_recs_*.json"):
        path.unlink()
    for path in CACHE.glob("bridges_yash_*.json"):
        path.unlink()

    pool = compact_catalog(catalog, hist_ids, hist_cats)
    history = [
        {"name": (h["name"] or "")[:60], "cat": h["category"]}
        for h in persona["order_history"][:14]
    ]

    batches = [pool[i : i + 12] for i in range(0, len(pool), 12)]
    collected: list[dict] = []

    for bi, batch in enumerate(batches):
        cache_path = CACHE / f"yash_llm_recs_{bi}.json"
        print(f"LLM batch {bi+1}/{len(batches)} ({len(batch)} catalog rows)…")
        if cache_path.exists():
            data = json.loads(cache_path.read_text(encoding="utf-8"))
        else:
            messages = [
                {"role": "system", "content": SYSTEM},
                {
                    "role": "user",
                    "content": json.dumps(
                        {
                            "task": (
                                "Pick cross-category recs for Yash from this slice. "
                                "Use product field `id` as product_id. "
                                "Skip if seen_cat=true for L2. Aim ~2 L2, ~3 L3, ~1 L4 per slice when relevant."
                            ),
                            "needs": persona.get("needs"),
                            "goals": persona.get("goals"),
                            "history": history,
                            "blocked_L2_cats": sorted(hist_cats),
                            "catalog": batch,
                        },
                        ensure_ascii=False,
                    ),
                },
            ]
            data = None
            last_parse_err = None
            for attempt in range(3):
                try:
                    # Prefer a JSON-reliable model for structured picks
                    raw = groq_chat(
                        messages,
                        model="llama-3.3-70b-versatile",
                        temperature=0.2,
                    )
                    data = parse_llm_json(raw)
                    break
                except Exception as err:  # noqa: BLE001
                    last_parse_err = err
                    print(f"  WARN parse/retry {attempt+1}: {err}")
                    time.sleep(2.5 * (attempt + 1))
            if data is None:
                raise SystemExit(f"LLM JSON failed for batch {bi}: {last_parse_err}")
            cache_path.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")

        items = data.get("items", data if isinstance(data, list) else [])
        for item in items:
            # Accept either product_id or id from compact schema
            if not item.get("product_id") and item.get("id"):
                item["product_id"] = item["id"]
            validated = validate_item(item, by_id, hist_ids, hist_cats)
            if validated:
                collected.append(validated)

    # Dedupe by product_id, keep highest confidence / lowest level
    level_rank = {"L2": 0, "L3": 1, "L4": 2}
    best: dict[str, dict] = {}
    for c in collected:
        pid = c["product_id"]
        prev = best.get(pid)
        if not prev or (level_rank[c["level"]], -c["confidence"]) < (
            level_rank[prev["level"]],
            -prev["confidence"],
        ):
            best[pid] = c

    final = list(best.values())
    final.sort(key=lambda c: (level_rank[c["level"]], -c["confidence"], c["price"]))

    # Ensure minimum demo deck diversity
    counts = {lvl: sum(1 for c in final if c["level"] == lvl) for lvl in ("L2", "L3", "L4")}
    if counts["L2"] < 3 or counts["L3"] < 4:
        raise SystemExit(
            f"FAIL: LLM returned too few valid cross-category cards: {counts}. "
            "Re-run after clearing scripts/.cache/yash_llm_recs_*.json"
        )

    OUT_PATH.write_text(json.dumps(final, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"Wrote {OUT_PATH} — {len(final)} candidates {counts}")
    for c in final:
        print(f"  {c['level']} [{c['category']}] {c['name'][:52]}")
        print(f"       {c['bridge'][:100]}")


if __name__ == "__main__":
    main()
