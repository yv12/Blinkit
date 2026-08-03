"""
Phase 3b — Per-persona candidates_*.json from tagged catalog.json
Selects L2/L3/L4 pools with hard constraints, then asks Groq for bridge/bio/confidence.
Falls back to template bridges if LLM unavailable.
"""

from __future__ import annotations

import argparse
import json
import random
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from phase3_lib import CACHE, DATA, extract_json, get_groq_api_key, groq_chat  # noqa: E402

CATALOG_PATH = DATA / "catalog.json"
REVIEW_BRIDGES = DATA / "bridge_review.json"
RNG = random.Random(7)

# Lifestyle halo hops for L4 (goal/need → further need)
HALO_HOPS = {
    "fitness": ["sleep", "wellness"],
    "household": ["wellness", "convenience"],
    "explore": ["indulgence", "wellness"],
    "indulgence": ["novelty"],
    "wellness": ["sleep"],
}


def load_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def persona_history_categories(persona: dict) -> set[str]:
    return {h["category"] for h in persona["order_history"]}


def persona_history_ids(persona: dict) -> set[str]:
    return {h["product_id"] for h in persona["order_history"]}


def persona_bought_names(persona: dict) -> list[str]:
    return [h["name"] for h in persona["order_history"]]


def apply_hard_constraints(persona: dict, item: dict) -> bool:
    c = persona.get("constraints") or {}
    if c.get("veg_only") and not item.get("veg_flag", True):
        return False
    distrust = set(c.get("distrusted_top_categories") or [])
    if item.get("top_category") in distrust:
        return False
    return True


def shared(a: list[str], b: list[str]) -> list[str]:
    return sorted(set(a) & set(b))


def select_pools(persona: dict, catalog: list[dict]) -> list[dict]:
    hist_cats = persona_history_categories(persona)
    hist_ids = persona_history_ids(persona)
    needs = set(persona.get("needs") or [])
    goals = set(persona.get("goals") or [])

    # enrich needs/goals from history item tags if present in catalog
    by_id = {i["id"]: i for i in catalog}
    for hid in hist_ids:
        item = by_id.get(hid)
        if not item:
            continue
        needs.update(item.get("need_tags") or [])
        goals.update(item.get("goal_tags") or [])

    eligible = [
        i
        for i in catalog
        if i["id"] not in hist_ids and apply_hard_constraints(persona, i)
    ]

    l2, l3, l4 = [], [], []

    # Reserve lifestyle-halo products so they are not eaten by L2/L3 dedupe
    halo_needs: set[str] = set()
    for g in goals:
        halo_needs.update(HALO_HOPS.get(g, []))
    if persona["id"] == "akash":
        halo_needs.update({"sleep", "wellness"})
    if persona["id"] == "yash":
        halo_needs.update({"sleep", "wellness"})
    if persona["id"] == "bardhan":
        halo_needs.update({"wellness", "sleep", "novelty"})

    reserved_l4_ids: set[str] = set()
    for item in eligible:
        if item["category"] in hist_cats:
            continue
        item_needs = set(item.get("need_tags") or [])
        is_halo_name = any(k in item["name"].lower() for k in ("chamomile", "herbal infusion", "sleep"))
        hit = sorted(item_needs & halo_needs)
        if is_halo_name or (hit and ("sleep" in hit or "wellness" in hit)):
            l4.append(
                {
                    "product_id": item["id"],
                    "level": "L4",
                    "shared_tag": (hit[0] if hit else "wellness"),
                    "tag_type": "halo",
                    "product": item,
                }
            )
            reserved_l4_ids.add(item["id"])

    for item in eligible:
        if item["id"] in reserved_l4_ids:
            continue
        item_needs = set(item.get("need_tags") or [])
        item_goals = set(item.get("goal_tags") or [])
        new_category = item["category"] not in hist_cats
        shared_needs = sorted(item_needs & needs)
        shared_goals = sorted(item_goals & goals)
        different_need = bool(item_needs - needs) or (shared_goals and not shared_needs)

        # L2: same need, new category
        if shared_needs and new_category:
            l2.append(
                {
                    "product_id": item["id"],
                    "level": "L2",
                    "shared_tag": shared_needs[0],
                    "tag_type": "need",
                    "product": item,
                }
            )
        # L3: same goal, different need
        elif shared_goals and different_need and new_category:
            l3.append(
                {
                    "product_id": item["id"],
                    "level": "L3",
                    "shared_tag": shared_goals[0],
                    "tag_type": "goal",
                    "product": item,
                }
            )

    def rank_key(c):
        price = c["product"]["price"]
        # price-sensitive personas: prefer cheaper
        price_term = price if persona.get("constraints", {}).get("price_sensitive") else -min(price, 500)
        level_boost = {"L2": 0, "L3": 1, "L4": 2}[c["level"]]
        return (level_boost, price_term, c["product"]["name"])

    l2 = sorted(l2, key=rank_key)[:40]
    l3 = sorted(l3, key=rank_key)[:25]
    l4 = sorted(l4, key=rank_key)[:15]

    # ensure demo-critical examples survive for Akash
    if persona["id"] == "akash":
        def boost(pool, pred, level, tag, tag_type):
            for item in eligible:
                if pred(item) and item["id"] not in {c["product_id"] for c in pool}:
                    pool.insert(
                        0,
                        {
                            "product_id": item["id"],
                            "level": level,
                            "shared_tag": tag,
                            "tag_type": tag_type,
                            "product": item,
                        },
                    )

        boost(l2, lambda i: i["category"] == "Energy Bars" and "protein" in i["name"].lower(), "L2", "protein", "need")
        boost(l3, lambda i: "skipping" in i["name"].lower() or "resistance" in i["name"].lower() or "creatine" in i["name"].lower(), "L3", "fitness", "goal")
        boost(l4, lambda i: "chamomile" in i["name"].lower(), "L4", "sleep", "halo")

    if persona["id"] == "yash":
        def boost_y(pool, pred, level, tag, tag_type):
            for item in eligible:
                if pred(item) and item["id"] not in {c["product_id"] for c in pool}:
                    pool.insert(
                        0,
                        {
                            "product_id": item["id"],
                            "level": level,
                            "shared_tag": tag,
                            "tag_type": tag_type,
                            "product": item,
                        },
                    )

        # High-protein / zero-sugar cut pattern
        boost_y(
            l2,
            lambda i: (
                any(k in i["name"].lower() for k in ("protein", "whey", "diet coke", "zero maida", "sugar free", "no added sugar"))
                and i["category"] not in hist_cats
            ),
            "L2",
            "protein",
            "need",
        )
        # Gym / vitamins / smart scale (weight-loss goal, new need)
        boost_y(
            l3,
            lambda i: any(
                k in i["name"].lower()
                for k in (
                    "weighing",
                    "scale",
                    "multivitamin",
                    "resistance",
                    "creatine",
                    "gym glove",
                    "gym gloves",
                    "wrist strap",
                    "shaker",
                    "gym gallon",
                    "gym supporter",
                )
            ),
            "L3",
            "weight_loss",
            "goal",
        )
        boost_y(l4, lambda i: "chamomile" in i["name"].lower() or "melatonin" in i["name"].lower() or "zzzquil" in i["name"].lower(), "L4", "sleep", "halo")

    # dedupe by product keeping lowest level number
    level_rank = {"L2": 2, "L3": 3, "L4": 4}
    best: dict[str, dict] = {}
    for c in l2 + l3 + l4:
        pid = c["product_id"]
        if pid not in best or level_rank[c["level"]] < level_rank[best[pid]["level"]]:
            best[pid] = c
    return list(best.values())


def template_bridge(persona: dict, cand: dict) -> tuple[str, str, float]:
    name = cand["product"]["name"]
    tag = cand["shared_tag"]
    level = cand["level"]
    hist = persona_bought_names(persona)
    anchor = hist[0] if hist else "your usual picks"
    anchor2 = hist[1] if len(hist) > 1 else anchor

    if level == "L2":
        bridge = f"You buy {anchor} and {anchor2} — this hits the same {tag} need, just a new category."
        bio = f"Single, packed with {tag}, looking for someone who already shops smart."
        conf = 0.82
    elif level == "L3":
        bridge = f"You're clearly into {tag} — people on that path usually try this next."
        bio = f"Not your usual aisle. Same {tag} energy, different craving."
        conf = 0.68
    else:
        bridge = f"One hop from your {tag} vibe — a small lifestyle upgrade worth a peek."
        bio = f"Soft launch into {tag}. No pressure, just good timing."
        conf = 0.55

    # personalize a few known demo lines (persona-aware)
    lname = name.lower()
    pid = persona.get("id")
    if pid == "akash" and "protein" in lname and "bar" in lname:
        bridge = "You buy paneer and oats every week — this is protein too, just grab-and-go."
        bio = "Single, 20g protein, looking for someone who lifts."
        conf = 0.9
    elif pid == "akash" and "chamomile" in lname:
        bridge = "Fitness crowd that tracks protein often tracks recovery too — chamomile is the quiet hop."
        bio = "Here for your wind-down arc. Soft, herbal, zero drama."
        conf = 0.62
    elif pid == "akash" and ("skipping" in lname or "resistance" in lname or "creatine" in lname):
        bridge = "You're clearly into fitness — people tracking protein usually track training too."
        bio = "Gym-bag material. Same goal, new need."
        conf = 0.72
    elif pid == "yash" and "protein" in lname and ("bar" in lname or "wafer" in lname or "shake" in lname):
        bridge = "You keep buying Milky Mist paneer, Skyr, and protein bars — this is the same protein habit, new pack."
        bio = "High-protein, no fridge required. Your kind of snack."
        conf = 0.9
    elif pid == "yash" and ("milk" in lname or "curd" in lname or "yogurt" in lname or "paneer" in lname):
        bridge = "Between Skyr, Greek yogurt, and high-protein paneer, dairy protein is clearly your lane."
        bio = "Creamy protein, fridge-side. Fits right next to your Skyr."
        conf = 0.88
    elif pid == "yash" and (tag == "snack" or "chip" in lname or "namkeen" in lname or "popcorn" in lname):
        bridge = "You already rotate Tedhe Medhe, Crax Zero, and Lite Mixture — this is the next munch in that aisle."
        bio = "Crunchy, impulsive, still on-brand for your snack runs."
        conf = 0.84
    elif pid == "yash" and ("scale" in lname or "resistance" in lname or "creatine" in lname or "whey" in lname):
        bridge = "You're stacking protein bars and paneer — people on that track usually measure or train next."
        bio = "Same fitness goal, different tool."
        conf = 0.74
    elif pid == "yash" and ("clean" in lname or "harpic" in lname or "surf" in lname or "rin" in lname or "detergent" in lname):
        bridge = "You already grabbed kitchen cleaner once — this is the restock side of that household habit."
        bio = "Not glamorous. Very useful after snack night."
        conf = 0.7
    elif pid == "yash" and "chamomile" in lname:
        bridge = "Protein-heavy days often need a wind-down — chamomile is the soft hop from your fitness lane."
        bio = "Quiet evening energy. No crunch, no guilt."
        conf = 0.62
    elif "ice cream" in lname or "cornetto" in lname or "frozen dessert" in lname:
        bridge = f"Given your usual {anchor}, this late-night treat still fits the story."
        bio = "Late-night soft yes. Cold, impulsive, honest."
        conf = 0.7

    return bridge, bio, conf


def llm_enrich_bridges(persona: dict, cands: list[dict]) -> list[dict]:
    payload = []
    for c in cands:
        payload.append(
            {
                "product_id": c["product_id"],
                "level": c["level"],
                "shared_tag": c["shared_tag"],
                "tag_type": c["tag_type"],
                "name": c["product"]["name"],
                "category": c["product"]["category"],
                "price": c["product"]["price"],
            }
        )

    history = [
        {"name": h["name"], "category": h["category"]}
        for h in persona["order_history"]
    ]

    batches = [payload[i : i + 10] for i in range(0, len(payload), 10)]
    enriched: dict[str, dict] = {}

    for bi, batch in enumerate(batches):
        cache_path = CACHE / f"bridges_{persona['id']}_{bi}.json"
        try:
            if cache_path.exists():
                data = json.loads(cache_path.read_text(encoding="utf-8"))
            else:
                yash_rules = ""
                if persona.get("id") == "yash":
                    yash_rules = (
                        " For Yash specifically: high-protein + zero-sugar history means a cut/gym pattern. "
                        "L2 must be a NEW category (never another curd/yogurt/paneer/protein-bar/bread/chips/soft-drink). "
                        "L3 should be scale, multivitamins, gym accessories, creatine. "
                        "Skip same-aisle brand swaps."
                    )
                messages = [
                    {
                        "role": "system",
                        "content": (
                            "You write honest one-line recommendation bridges for a grocery app. "
                            "Every bridge MUST cite a real link from the user's purchase history. "
                            "If you cannot justify a product honestly, set skip=true. "
                            + yash_rules
                            + " Reply JSON only: {\"items\":[{\"product_id\",\"bridge\",\"bio\",\"confidence\",\"skip\"}]}"
                        ),
                    },
                    {
                        "role": "user",
                        "content": json.dumps(
                            {
                                "persona": {
                                    "name": persona["name"],
                                    "label": persona["label"],
                                    "needs": persona.get("needs"),
                                    "goals": persona.get("goals"),
                                    "history": history,
                                },
                                "candidates": batch,
                                "bio_style": "playful dating-app one-liner, brand-safe",
                                "bridge_style": "one honest sentence stating the logic",
                            },
                            ensure_ascii=False,
                        ),
                    },
                ]
                raw = groq_chat(messages, temperature=0.4)
                data = extract_json(raw)
                cache_path.write_text(json.dumps(data, indent=2), encoding="utf-8")
            items = data.get("items", data if isinstance(data, list) else [])
            for item in items:
                pid = item.get("product_id")
                if pid:
                    enriched[pid] = item
            print(f"  {persona['id']}: enriched bridge batch {bi+1}/{len(batches)}")
        except Exception as e:  # noqa: BLE001
            print(f"  WARN {persona['id']} batch {bi}: {e} — using templates")

    results = []
    for c in cands:
        llm = enriched.get(c["product_id"])
        if llm and not llm.get("skip") and llm.get("bridge"):
            bridge = str(llm["bridge"]).strip()
            bio = str(llm.get("bio") or bridge).strip()
            try:
                conf = float(llm.get("confidence", 0.7))
            except (TypeError, ValueError):
                conf = 0.7
            conf = max(0.4, min(0.95, conf))
        else:
            if llm and llm.get("skip"):
                continue
            bridge, bio, conf = template_bridge(persona, c)

        if not bridge or len(bridge) < 12:
            continue

        results.append(
            {
                "product_id": c["product_id"],
                "name": c["product"]["name"],
                "category": c["product"]["category"],
                "top_category": c["product"]["top_category"],
                "price": c["product"]["price"],
                "level": c["level"],
                "shared_tag": c["shared_tag"],
                "tag_type": c["tag_type"],
                "bridge": bridge,
                "bio": bio,
                "confidence": round(conf, 2),
                "veg_flag": c["product"]["veg_flag"],
                "time_tags": c["product"]["time_tags"],
                "need_tags": c["product"]["need_tags"],
                "goal_tags": c["product"]["goal_tags"],
                "image_url": c["product"]["image_url"],
            }
        )
    return results


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--heuristic-only", action="store_true")
    parser.add_argument(
        "--only",
        nargs="*",
        default=None,
        help="Optional persona ids to generate (default: all including yash)",
    )
    args = parser.parse_args()

    if not CATALOG_PATH.exists():
        raise SystemExit("Missing data/catalog.json — run phase3_tag_catalog.py first")

    catalog = load_json(CATALOG_PATH)

    all_persona_files = [
        DATA / "persona_akash.json",
        DATA / "persona_janvi.json",
        DATA / "persona_bardhan.json",
        DATA / "persona_yash.json",
    ]
    personas = []
    for path in all_persona_files:
        if not path.exists():
            continue
        p = load_json(path)
        if args.only and p["id"] not in args.only:
            continue
        personas.append(p)
    if not personas:
        raise SystemExit("No personas selected")

    use_llm = (not args.heuristic_only) and bool(get_groq_api_key())
    if not use_llm:
        print("Using template bridges (no Groq key or --heuristic-only)")

    all_review = []
    for persona in personas:
        print(f"Generating candidates for {persona['id']}…")
        pools = select_pools(persona, catalog)
        if use_llm:
            cands = llm_enrich_bridges(persona, pools)
        else:
            cands = []
            for c in pools:
                bridge, bio, conf = template_bridge(persona, c)
                cands.append(
                    {
                        "product_id": c["product_id"],
                        "name": c["product"]["name"],
                        "category": c["product"]["category"],
                        "top_category": c["product"]["top_category"],
                        "price": c["product"]["price"],
                        "level": c["level"],
                        "shared_tag": c["shared_tag"],
                        "tag_type": c["tag_type"],
                        "bridge": bridge,
                        "bio": bio,
                        "confidence": conf,
                        "veg_flag": c["product"]["veg_flag"],
                        "time_tags": c["product"]["time_tags"],
                        "need_tags": c["product"]["need_tags"],
                        "goal_tags": c["product"]["goal_tags"],
                        "image_url": c["product"]["image_url"],
                    }
                )

        # hard filter again + drop empty bridges
        final = []
        for c in cands:
            item = next((x for x in catalog if x["id"] == c["product_id"]), None)
            if not item:
                continue
            if not apply_hard_constraints(persona, item):
                continue
            if not c.get("bridge"):
                continue
            final.append(c)

        final.sort(key=lambda x: ({"L2": 0, "L3": 1, "L4": 2}[x["level"]], -x["confidence"], x["price"]))

        out_path = DATA / f"candidates_{persona['id']}.json"
        out_path.write_text(json.dumps(final, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        levels = {lvl: sum(1 for c in final if c["level"] == lvl) for lvl in ("L2", "L3", "L4")}
        print(f"  wrote {out_path.name}: {len(final)} candidates {levels}")

        if len(final) < 8:
            raise SystemExit(f"FAIL: {persona['id']} has only {len(final)} candidates")

        # sample for human review
        sample = final[:8] + [c for c in final if c["level"] == "L4"][:2]
        for c in sample:
            all_review.append(
                {
                    "persona": persona["id"],
                    "level": c["level"],
                    "name": c["name"],
                    "shared_tag": c["shared_tag"],
                    "bridge": c["bridge"],
                    "bio": c["bio"],
                    "confidence": c["confidence"],
                    "review_status": "pending",
                }
            )

    # unique ~25 bridges
    seen = set()
    review_items = []
    for item in all_review:
        key = (item["persona"], item["name"], item["bridge"])
        if key in seen:
            continue
        seen.add(key)
        review_items.append(item)
        if len(review_items) >= 30:
            break

    REVIEW_BRIDGES.write_text(
        json.dumps(
            {
                "instructions": "Human spot-check 20-30 bridges. Reject any without an honest history link.",
                "count": len(review_items),
                "items": review_items,
            },
            indent=2,
            ensure_ascii=False,
        )
        + "\n",
        encoding="utf-8",
    )
    print(f"wrote {REVIEW_BRIDGES} ({len(review_items)} bridges for spot-check)")
    print("DONE candidates.")


if __name__ == "__main__":
    main()
