/**
 * Yash ladder = CROSS-CATEGORY only.
 * L2: same need (protein / low-sugar), category NEVER in order history.
 * L3: fitness / weight_loss goal, different need (train, measure, micros).
 * Never recommend another curd/yogurt/bar/bread/chips brand — that's not discovery.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const catalog = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "catalog.json"), "utf8"));
const persona = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "persona_yash.json"), "utf8"));
const byId = new Map(catalog.map((p) => [p.id, p]));

const histIds = new Set(persona.order_history.map((h) => h.product_id));
const histCats = new Set(persona.order_history.map((h) => h.category));

function card(id, level, shared_tag, tag_type, bridge, bio, confidence) {
  const p = byId.get(id);
  if (!p) throw new Error(`Missing catalog product ${id}`);
  if (histIds.has(id)) throw new Error(`${id} is already in order history`);
  if (level === "L2" && histCats.has(p.category)) {
    throw new Error(`L2 ${id} category "${p.category}" already in history — not cross-category`);
  }
  return {
    product_id: p.id,
    name: p.name,
    category: p.category,
    top_category: p.top_category,
    price: p.price,
    level,
    shared_tag,
    tag_type,
    bridge,
    bio,
    confidence,
    veg_flag: p.veg_flag !== false,
    time_tags: p.time_tags || ["anytime"],
    need_tags: p.need_tags || [],
    goal_tags: p.goal_tags || [],
    image_url: p.image_url || `/images/${p.id}.svg`,
    in_stock: true,
  };
}

const CROSS_PROTEIN =
  "You buy Milky Mist high-protein paneer, Skyr, and protein bars every week — this is protein too, but a category you never open.";
const CROSS_CUT =
  "Coke Zero + high protein reads as a cut — this is a low-sugar find outside snacks and dairy.";
const GYM =
  "High-protein reorders usually mean training or cutting — this is the gym aisle, not another yogurt.";
const VITAMIN =
  "Protein-heavy cut diets often miss micros — multivitamins are a different need from dairy and bars.";
const SCALE =
  "You're stacking protein to manage weight — a scale is a new category that makes that goal measurable.";
const RECOVERY =
  "After protein-heavy training days, recovery is one hop further — not another snack.";

const candidates = [
  // L2 — NEW categories only (not Curd, Paneer, Energy Bars, Bread, Chips, Soft Drinks…)
  card(
    "p01267",
    "L2",
    "protein",
    "need",
    CROSS_PROTEIN,
    "Protein shake aisle — not another Skyr.",
    0.93,
  ),
  card(
    "p01419",
    "L2",
    "protein",
    "need",
    CROSS_PROTEIN,
    "Plant protein drink. New shelf, same need.",
    0.9,
  ),
  card(
    "p03913",
    "L2",
    "protein",
    "need",
    CROSS_PROTEIN,
    "Whey sachets — supplements aisle, not dairy.",
    0.92,
  ),
  card(
    "p03937",
    "L2",
    "protein",
    "need",
    CROSS_PROTEIN,
    "ON whey. Cross-category protein step-up.",
    0.9,
  ),
  card(
    "p01091",
    "L2",
    "snack",
    "need",
    CROSS_CUT,
    "Sugar-free mint from Sweet Tooth — not chips.",
    0.82,
  ),

  // L3 — different need: measure / micros / train / hydrate gear
  card("p07026", "L3", "weight_loss", "goal", SCALE, "Smart scale. New category. Track the cut.", 0.91),
  card("p04110", "L3", "wellness", "goal", VITAMIN, "Daily multi — micros, not more curd.", 0.88),
  card("p03901", "L3", "wellness", "goal", VITAMIN, "Men's multivitamin for the protein-cut routine.", 0.87),
  card("p06352", "L3", "fitness", "goal", GYM, "Resistance band. Train side of the protein goal.", 0.86),
  card("p06346", "L3", "fitness", "goal", GYM, "Gym gloves — accessories aisle.", 0.84),
  card("p06339", "L3", "fitness", "goal", GYM, "Wrist strap for heavier pulls.", 0.83),
  card("p06349", "L3", "fitness", "goal", GYM, "Gym apparel. Still not dairy.", 0.8),
  card("p08035", "L3", "fitness", "goal", GYM, "Shaker bottle for whey days.", 0.85),
  card("p06348", "L3", "fitness", "goal", GYM, "2L gym bottle. Hydration gear.", 0.82),
  card("p03917", "L3", "fitness", "goal", GYM, "Creatine — training need, not another protein snack.", 0.84),
  card("p03914", "L3", "fitness", "goal", GYM, "Micronised creatine for session weeks.", 0.83),

  // L4 — lifestyle halo
  card("p01371", "L4", "sleep", "halo", RECOVERY, "Chamomile wind-down. New aisle.", 0.7),
  card("p01340", "L4", "sleep", "halo", RECOVERY, "Herbal tea for recovery nights.", 0.68),
  card("p03886", "L4", "sleep", "halo", RECOVERY, "Sleep support after late workouts.", 0.66),
];

candidates.sort((a, b) => {
  const lvl = { L2: 0, L3: 1, L4: 2 };
  return lvl[a.level] - lvl[b.level] || b.confidence - a.confidence || a.price - b.price;
});

// Guardrail print
for (const c of candidates.filter((x) => x.level === "L2")) {
  if (histCats.has(c.category)) {
    throw new Error(`BUG: L2 still in history category ${c.category}: ${c.name}`);
  }
}

fs.writeFileSync(
  path.join(ROOT, "data", "candidates_yash.json"),
  JSON.stringify(candidates, null, 2) + "\n",
);

const levels = candidates.reduce((a, c) => {
  a[c.level] = (a[c.level] || 0) + 1;
  return a;
}, {});
console.log("Wrote cross-category candidates_yash.json", candidates.length, levels);
console.log("History categories blocked for L2:", [...histCats].join(", "));
console.log(
  candidates.map((c) => `${c.level} [${c.category}] ${c.name.slice(0, 48)}`).join("\n"),
);
