/**
 * Aisle coherence — stop “keyword in name” false positives.
 *
 * Rule of thumb (Reels-style relevance):
 * 1. Prefer structured fields: top_category, category, need_tags, goal_tags
 * 2. Never let a short token in the product TITLE alone decide relevance
 * 3. Hard-block aisles that conflict with the user’s learned mood
 */

const BABY_NAME =
  /baby|infant|toddler|newborn|0\+\s*months|months\)|play\s*mat|diaper|wipes/i;

/** Hard exclude — never treat baby aisle as fitness ladder. */
export function isBabyAisleProduct(p) {
  if (!p) return false;
  const top = String(p.top_category || "");
  const cat = String(p.category || "");
  const tags = `${(p.need_tags || []).join(" ")} ${(p.goal_tags || []).join(" ")}`.toLowerCase();
  if (/baby care/i.test(top) || /^baby\b/i.test(cat)) return true;
  if (/\bbaby\b|baby_care|infant/.test(tags)) return true;
  if (BABY_NAME.test(p.name || "")) return true;
  return false;
}

/** Mood families → aisles that are almost never relevant unless user liked them. */
export const MOOD_BLOCKED_TOP = {
  fitness: new Set([
    "Baby Care",
    "Pet Care",
    "Toys & Games",
    "Stationery",
  ]),
  protein: new Set(["Baby Care", "Pet Care", "Toys & Games"]),
  wellness: new Set(["Baby Care", "Pet Care"]),
  cooking: new Set(["Baby Care", "Toys & Games"]),
};

const FITNESS_MOOD_TAGS = new Set([
  "protein",
  "fitness",
  "fitness_gear",
  "weight_loss",
  "muscle_gain",
  "gym",
  "supplements",
  "wellness",
]);

/** Tags that are safe to echo in names (long / brand-like). Short mood tags are not. */
const NAME_SAFE_TAG_MIN_LEN = 6;

export function productTagSet(p) {
  return new Set(
    [...(p?.need_tags || []), ...(p?.goal_tags || []), p?.shared_tag]
      .filter(Boolean)
      .map((t) => String(t).toLowerCase()),
  );
}

/**
 * Does this product structurally match a liked tag?
 * Tags/categories only — title substring matching is opt-in for long tags.
 */
export function productMatchesTag(p, tag, { allowName = false } = {}) {
  const t = String(tag || "")
    .toLowerCase()
    .trim();
  if (!t) return false;
  if (productTagSet(p).has(t)) return true;
  const cat = String(p?.category || "").toLowerCase();
  const top = String(p?.top_category || "").toLowerCase();
  if (cat === t || top === t) return true;
  if (cat.includes(t) && t.length >= 5) return true;

  if (!allowName || t.length < NAME_SAFE_TAG_MIN_LEN) return false;
  const name = String(p?.name || "").toLowerCase();
  const esc = t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  try {
    return new RegExp(`(?:^|[^a-z0-9])${esc}(?:[^a-z0-9]|$)`).test(name);
  } catch {
    return false;
  }
}

export function inferActiveMoods({ tagWeights = {}, resolvedGoal = null } = {}) {
  const moods = new Set();
  if (resolvedGoal) {
    const g = String(resolvedGoal).toLowerCase();
    if (/fitness|muscle|weight/.test(g)) moods.add("fitness");
    if (/protein/.test(g)) moods.add("protein");
    if (/wellness|health/.test(g)) moods.add("wellness");
    if (/cook|meal|kitchen/.test(g)) moods.add("cooking");
  }
  for (const [tag, w] of Object.entries(tagWeights)) {
    if (Number(w) < 0.8) continue;
    const t = String(tag).toLowerCase();
    if (FITNESS_MOOD_TAGS.has(t)) {
      moods.add("fitness");
      if (t === "protein") moods.add("protein");
      if (t === "wellness") moods.add("wellness");
    }
  }
  return moods;
}

function userLikedAisle(p, { tagWeights = {}, catWeights = {} } = {}) {
  const top = p?.top_category;
  const cat = p?.category;
  if (top && (catWeights[top] || 0) > 0.5) return true;
  if (cat && (catWeights[cat] || 0) > 0.5) return true;
  for (const t of productTagSet(p)) {
    if ((tagWeights[t] || 0) > 0.5) return true;
  }
  return false;
}

/**
 * Baby Care is opt-in only via persona identity / purchase history.
 * Swipe affinity alone must NEVER unlock baby — a mistaken right-swipe
 * on "Piano Gym Baby Play Mat" used to poison Top picks.
 */
export function userInterestedInBaby({ persona = null } = {}) {
  for (const n of [...(persona?.needs || []), ...(persona?.goals || [])]) {
    if (/baby|infant|toddler|newborn/i.test(String(n))) return true;
  }
  for (const h of persona?.order_history || []) {
    if (isBabyAisleProduct(h)) return true;
    if (/baby care/i.test(String(h.top_category || ""))) return true;
    if (/^baby\b/i.test(String(h.category || ""))) return true;
  }
  return false;
}

/**
 * True when this SKU’s aisle conflicts with learned mood
 * (e.g. Baby Care while user is on a fitness path).
 * Baby Care is always blocked unless the persona has baby intent.
 */
export function isOffPersonaAisle(p, ctx = {}) {
  if (!p) return false;

  // Baby Care: opt-in via persona only — ignore mood / swipe affinity entirely
  if (isBabyAisleProduct(p)) {
    return !userInterestedInBaby(ctx);
  }

  if (userLikedAisle(p, ctx)) return false;

  const moods = inferActiveMoods(ctx);
  if (!moods.size) return false;

  const top = p.top_category || "";
  for (const mood of moods) {
    const blocked = MOOD_BLOCKED_TOP[mood];
    if (blocked?.has(top)) return true;
  }
  return false;
}

/**
 * Ladder / gear name hits are only valid when aisle or tags agree.
 * Prevents "Piano Gym Baby Play Mat" from looking like gym gear.
 */
export function nameKeywordSupportedByAisle(p, nameRe) {
  if (!p || !nameRe?.test?.(p.name || "")) return false;
  const top = String(p.top_category || "");
  const cat = String(p.category || "");
  const tags = [...productTagSet(p)].join(" ");
  // Gear aisles only — "protein" / "wellness" tags on food must NOT unlock ladder names
  const aisleOk =
    /Electronics|Pharma|Sports|Fitness|Kitchen|Appliances|Bottles|Audio/i.test(`${top} ${cat}`) ||
    /fitness_gear|electronics/.test(tags);
  return aisleOk;
}
