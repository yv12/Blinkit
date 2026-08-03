"""
Phase 2 — Subset + personas
- Build persona_akash/janvi/bardhan.json (10–15 history items + starting state)
- Select ~250-product demo subset across top categories (includes all history items)
- Write data/subset.csv

Image download is separate: scripts/phase2_fetch_images.py
"""

from __future__ import annotations

import csv
import json
import random
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CATALOG = ROOT / "data" / "catalog_clean.csv"
OUT_SUBSET = ROOT / "data" / "subset.csv"
OUT_DIR = ROOT / "data"

TARGET_SUBSET = 250
RNG = random.Random(42)

PRIORITY_TOP = [
    "Dairy & Breakfast",
    "Snacks & Munchies",
    "Beverages",
    "Instant & Frozen",
    "Grocery Staples",
    "Bakery & Biscuits",
    "Sweet Tooth",
    "Home & Cleaning",
    "Pharma & Wellness",
    "Fruits & Vegetables",
    "Meat Fish & Eggs",
    "Personal Care",
    "Kitchen & Dining",
    "Electronics & Appliances",
    "Baby Care",
    "Beauty",
    "Pet Care",
]

AKASH_HISTORY_IDS = [
    "p01953",  # Quaker Rolled Instant Oats
    "p01952",  # Quaker Rolled Instant Oats Breakfast Cereal
    "p02030",  # Amul Gold Full Cream Milk
    "p02031",  # Amul Taaza Toned Milk
    "p02057",  # Amul Fresh Malai Paneer
    "p02058",  # Mother Dairy Paneer
    "p01267",  # Amul Protein Blueberry Shake
    "p01931",  # Amul Probiotic High Protein Curd
    "p01916",  # Milky Mist Skyr High Protein Yogurt
    "p01961",  # Yoga Bar Premium Golden Rolled Oats
    "p02580",  # RiteBite Max Protein bar
    "p01419",  # So Good High Protein Plant Beverage
]

JANVI_HISTORY_IDS = [
    "p02102",  # English Oven Atta Bread
    "p02103",  # Harvest Gold White Bread
    "p02086",  # Amul Salted Butter
    "p01291",  # Bru Instant Coffee
    "p00222",  # Wheel Active Detergent Powder
    "p00223",  # Rin Detergent Bar
    "p04345",  # Coca-Cola Soft Drink
    "p04347",  # Sprite
    "p02642",  # Tata Sampann Moong Dal
    "p02643",  # Tata Sampann Masoor Dal
    "p01905",  # Mother Dairy Curd
    "p02034",  # Mother Dairy Full Cream Milk
]

BARDHAN_HISTORY_IDS = [
    "p04527",  # Mogu Mogu Grape
    "p04530",  # Mogu Mogu Pineapple
    "p04533",  # Mogu Mogu Orange
    "p00951",  # Amul Vanilla Magic Ice Cream
    "p00950",  # Cornetto Double Chocolate
    "p00954",  # Havmor Cassata
    "p05127",  # Britannia Good Day Butter Cookies
    "p05126",  # Hide & Seek Chocolate Chip Cookies
    "p05131",  # Lotus Biscoff
    "p04340",  # Diet Coke
    "p01371",  # Flurys Pure Chamomile
]


def load_catalog() -> dict[str, dict[str, str]]:
    with CATALOG.open(encoding="utf-8", newline="") as f:
        rows = list(csv.DictReader(f))
    return {r["id"]: r for r in rows}


def history_entry(row: dict[str, str]) -> dict:
    return {
        "product_id": row["id"],
        "name": row["name"],
        "category": row["category"],
        "top_category": row["top_category"],
        "price": float(row["price"]) if row["price"] else 0,
        "unit": row["unit"],
    }


def empty_state() -> dict:
    return {
        "accepted_count": 0,
        "consecutive_dismissals": 0,
        "boldness_stage": 0,
        "saved_list": [],
        "cart": [],
        "hidden_products": {},
    }


def build_persona(
    persona_id: str,
    name: str,
    label: str,
    catalog: dict[str, dict],
    history_ids: list[str],
    constraints: dict,
    needs: list[str],
    goals: list[str],
) -> dict:
    history = [history_entry(catalog[i]) for i in history_ids if i in catalog]
    if not (10 <= len(history) <= 15):
        raise SystemExit(f"{persona_id}: history size {len(history)} (need 10–15). ids={history_ids}")
    return {
        "id": persona_id,
        "name": name,
        "label": label,
        "constraints": constraints,
        "needs": needs,
        "goals": goals,
        "order_history": history,
        "state": empty_state(),
    }


def pick(catalog: dict[str, dict], pred, limit: int, used: set[str]) -> list[str]:
    out = []
    for pid, row in catalog.items():
        if pid in used:
            continue
        if pred(row):
            out.append(pid)
            used.add(pid)
        if len(out) >= limit:
            break
    return out


def force_include_ids(catalog: dict[str, dict]) -> list[str]:
    used: set[str] = set()
    picked: list[str] = []
    buckets = [
        (12, lambda r: r["category"] == "Energy Bars" and "protein" in r["name"].lower()),
        (4, lambda r: "chamomile" in r["name"].lower()),
        (8, lambda r: r["category"] == "Ice Cream Frozen Dessert"),
        (8, lambda r: r["top_category"] == "Electronics & Appliances"),
        (5, lambda r: "skipping" in r["name"].lower() or "resistance" in r["name"].lower() or "gym" in r["name"].lower()),
        (6, lambda r: r["category"] == "Chips Crisps"),
        (6, lambda r: r["category"] == "Imported Beverages"),
        (6, lambda r: r["category"] == "Green Flavoured Tea"),
        (3, lambda r: "creatine" in r["name"].lower()),
        (6, lambda r: r["category"] == "Soft Drinks"),
        (5, lambda r: r["category"] == "Toilet Bathroom Cleaners"),
        (6, lambda r: r["category"] == "Namkeen Snacks"),
        (6, lambda r: r["category"] in ("Fresh Fruits", "Fresh Vegetables")),
        (4, lambda r: r["category"] == "Eggs"),
        (4, lambda r: r["category"] in ("Chicken", "Mutton", "Fish Seafood")),
        (4, lambda r: r["category"] == "Liquid Detergents" or "detergent" in r["name"].lower()),
        (4, lambda r: r["category"] == "Coffee"),
        (4, lambda r: r["category"] == "Bread Pav"),
    ]
    for limit, pred in buckets:
        picked.extend(pick(catalog, pred, limit, used))
    return picked


def build_subset(catalog: dict[str, dict], history_ids: set[str]) -> list[dict[str, str]]:
    selected: dict[str, dict] = {}

    for pid in history_ids:
        selected[pid] = catalog[pid]

    for pid in force_include_ids(catalog):
        selected[pid] = catalog[pid]

    by_top: dict[str, list[str]] = defaultdict(list)
    for pid, row in catalog.items():
        if pid in selected:
            continue
        if row["top_category"] == "Smoking & Tobacco":
            continue
        by_top[row["top_category"]].append(pid)

    for top in by_top:
        RNG.shuffle(by_top[top])

    remaining = max(0, TARGET_SUBSET - len(selected))
    per = max(6, remaining // max(1, len(PRIORITY_TOP)))

    for top in PRIORITY_TOP:
        if len(selected) >= TARGET_SUBSET:
            break
        for pid in by_top.get(top, [])[:per]:
            if len(selected) >= TARGET_SUBSET:
                break
            selected[pid] = catalog[pid]

    if len(selected) < TARGET_SUBSET:
        rest: list[str] = []
        for top in PRIORITY_TOP:
            rest.extend(pid for pid in by_top.get(top, []) if pid not in selected)
        RNG.shuffle(rest)
        for pid in rest:
            selected[pid] = catalog[pid]
            if len(selected) >= TARGET_SUBSET:
                break

    if len(selected) < TARGET_SUBSET:
        for pid, row in catalog.items():
            if pid in selected or row["top_category"] == "Smoking & Tobacco":
                continue
            selected[pid] = row
            if len(selected) >= TARGET_SUBSET:
                break

    rows = list(selected.values())
    rows.sort(key=lambda r: (r["top_category"], r["category"], r["name"]))
    return rows


def validate_persona(path: Path) -> None:
    data = json.loads(path.read_text(encoding="utf-8"))
    n = len(data["order_history"])
    if not (10 <= n <= 15):
        raise SystemExit(f"{path.name}: history size {n}")
    if data["state"]["boldness_stage"] != 0:
        raise SystemExit(f"{path.name}: boldness_stage should start at 0")


def ensure_min_ids(catalog: dict[str, dict], ids: list[str], fillers: list) -> list[str]:
    out = [i for i in ids if i in catalog]
    used = set(out)
    for pred in fillers:
        if len(out) >= 12:
            break
        for pid, row in catalog.items():
            if pid in used:
                continue
            if pred(row):
                out.append(pid)
                used.add(pid)
                break
    return list(dict.fromkeys(out))[:15]


def main() -> None:
    catalog = load_catalog()

    akash_ids = ensure_min_ids(
        catalog,
        AKASH_HISTORY_IDS,
        [
            lambda r: r["category"] == "Oats",
            lambda r: r["category"] == "Milk",
            lambda r: r["category"] == "Paneer Tofu",
            lambda r: "protein" in r["name"].lower(),
        ],
    )
    janvi_ids = ensure_min_ids(
        catalog,
        JANVI_HISTORY_IDS,
        [
            lambda r: r["category"] == "Toilet Bathroom Cleaners",
            lambda r: r["category"] == "Bread Pav",
            lambda r: r["category"] == "Butter More",
            lambda r: "detergent" in r["name"].lower(),
            lambda r: r["category"] == "Soft Drinks",
        ],
    )
    bardhan_ids = ensure_min_ids(
        catalog,
        BARDHAN_HISTORY_IDS,
        [
            lambda r: r["category"] == "Chips Crisps",
            lambda r: r["category"] == "Imported Beverages",
            lambda r: r["category"] == "Ice Cream Frozen Dessert",
            lambda r: r["category"] in ("Cookies", "Cream Biscuits"),
            lambda r: r["category"] == "Imported Snacks",
        ],
    )

    personas = [
        build_persona(
            "akash",
            "Akash",
            "fitness",
            catalog,
            akash_ids,
            constraints={"veg_only": True, "price_sensitive": False, "distrusted_top_categories": []},
            needs=["protein", "breakfast"],
            goals=["fitness"],
        ),
        build_persona(
            "janvi",
            "Janvi",
            "household",
            catalog,
            janvi_ids,
            constraints={"veg_only": False, "price_sensitive": True, "distrusted_top_categories": []},
            needs=["household", "staples", "beverages"],
            goals=["household"],
        ),
        build_persona(
            "bardhan",
            "Bardhan",
            "explorer",
            catalog,
            bardhan_ids,
            constraints={
                "veg_only": False,
                "price_sensitive": False,
                "distrusted_top_categories": ["Electronics & Appliances"],
            },
            needs=["indulgence", "novelty"],
            goals=["explore"],
        ),
    ]

    history_ids: set[str] = set()
    for p in personas:
        out = OUT_DIR / f"persona_{p['id']}.json"
        out.write_text(json.dumps(p, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        validate_persona(out)
        history_ids.update(h["product_id"] for h in p["order_history"])
        print(f"wrote {out.name}: {len(p['order_history'])} history items")

    subset = build_subset(catalog, history_ids)
    missing_hist = history_ids - {r["id"] for r in subset}
    if missing_hist:
        raise SystemExit(f"Subset missing history ids: {missing_hist}")

    fields = [
        "id",
        "name",
        "price",
        "unit",
        "category",
        "top_category",
        "subcategory",
        "category_url",
        "image_url",
        "local_image",
    ]
    with OUT_SUBSET.open("w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=fields)
        w.writeheader()
        for row in subset:
            out_row = {k: row.get(k, "") for k in fields if k != "local_image"}
            out_row["local_image"] = f"/images/{row['id']}.svg"
            w.writerow(out_row)

    counts = Counter(r["top_category"] for r in subset)
    print()
    print(f"wrote {OUT_SUBSET} — {len(subset)} products")
    print("Per top_category:")
    for top, n in sorted(counts.items(), key=lambda x: (-x[1], x[0])):
        print(f"  {n:4d}  {top}")
    print("  ----")
    print(f"  {len(subset):4d}  TOTAL")
    print(f"history items included: {len(history_ids)}")

    if not (230 <= len(subset) <= 270):
        raise SystemExit(f"FAIL: subset size {len(subset)} not ~250")
    if len(counts) < 12:
        raise SystemExit(f"FAIL: only {len(counts)} top categories represented")
    print()
    print("DONE: 3 persona files valid; subset.csv ~250 rows spread across categories.")


if __name__ == "__main__":
    main()
