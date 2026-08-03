import { isBabyAisleProduct, nameKeywordSupportedByAisle } from "./aisleCoherence.js";

/**
 * Cross-aisle "ladder" products — electronics, fitness gear, scales, etc.
 * When swipes lean fitness/protein/wellness, these should surface in rails + decks.
 */

const LADDER_TOP = new Set(["Electronics & Appliances", "Pharma & Wellness", "Kitchen & Dining"]);

/** Adult fitness / gear tokens — never used alone without aisle support.
 *  Do NOT include "protein" — food SKUs ("Protein Bar") must not count as ladder gear.
 */
const LADDER_NAME =
  /\b(weigh(?:ing)?|scale|shaker|glove|resistance|band|massag(?:e|er)?|earphone|earbuds|watch|charger|cable|trimmer|blender|cooling pad|keyboard|adapter|dumbbell|kettlebell)\b/i;

/** Snack / food aisles — never ladder even if name mentions gym/protein. */
const FOOD_LADDER_BLOCK =
  /energy bars|chips|crisps|cookies|biscuits|namkeen|popcorn|makhana|ice cream|soft drinks|noodles|oats|curd|yogurt|milk|bread|eggs|chocolate|candies|tea|coffee/i;

const MOOD_TAGS = new Set([
  "protein",
  "fitness",
  "fitness_gear",
  "weight_loss",
  "muscle_gain",
  "wellness",
  "gym",
  "supplements",
]);

export { isBabyAisleProduct } from "./aisleCoherence.js";

export function isLadderProduct(p) {
  if (!p) return false;
  // Structured baby aisle / baby tags / baby title cues
  if (isBabyAisleProduct(p)) return false;

  const top = p.top_category || "";
  const cat = p.category || "";
  const tags = `${(p.need_tags || []).join(" ")} ${(p.goal_tags || []).join(" ")}`.toLowerCase();

  // Protein bars / snacks are Top-picks food — not cross-aisle ladder gear
  if (FOOD_LADDER_BLOCK.test(cat) || FOOD_LADDER_BLOCK.test(top)) return false;

  if (top === "Electronics & Appliances") return true;
  if (/sports fitness|appliances|electronic accessories|audio accessories|bottles flasks/i.test(cat)) {
    return (
      nameKeywordSupportedByAisle(p, LADDER_NAME) ||
      /fitness|fitness_gear|electronics|weight_loss/.test(tags)
    );
  }
  // Name keywords only count when category/tags agree (aisle coherence)
  if (nameKeywordSupportedByAisle(p, LADDER_NAME)) return true;
  if (/fitness_gear|electronics/.test(tags)) return true;
  return false;
}

/**
 * Positive mood from swipe affinity (and optional persona baseline).
 * Pass persona=null to measure learned swipe mood only — used to gate ladder unlock.
 */
export function moodStrength(tagWeights = {}, persona = null, resolvedGoal = null) {
  let s = 0;
  for (const [tag, w] of Object.entries(tagWeights)) {
    if (MOOD_TAGS.has(String(tag).toLowerCase()) && w > 0) s += w;
  }
  if (resolvedGoal && /fitness|weight|muscle|wellness/.test(String(resolvedGoal))) s += 2;
  for (const g of persona?.goals || []) {
    if (/fitness|weight|muscle/.test(String(g).toLowerCase())) s += 0.5;
  }
  for (const n of persona?.needs || []) {
    if (/protein|fitness/.test(String(n).toLowerCase())) s += 0.4;
  }
  return s;
}

/** Learned swipe mood only — ignores persona goals/needs. */
export function learnedFitnessMood(tagWeights = {}, resolvedGoal = null) {
  return moodStrength(tagWeights, null, resolvedGoal);
}

/** Ladder unlock after the user has actually liked fitness/protein (not cold start). */
export function ladderUnlocked(tagWeights = {}, resolvedGoal = null, { minMood = 0.8 } = {}) {
  return learnedFitnessMood(tagWeights, resolvedGoal) >= minMood;
}

/**
 * Extra score so ladder SKUs rise when swipes lean protein/fitness —
 * demo beat: Skyr → whey → scale / gloves (not shaker on card #1).
 */
export function ladderAffinityBoost(p, { tagWeights = {}, persona = null, resolvedGoal = null } = {}) {
  if (!isLadderProduct(p)) return 0;
  // Gate on learned swipes — persona goals alone must not pull gear into Stage 0.
  const learned = learnedFitnessMood(tagWeights, resolvedGoal);
  if (learned <= 0) return 0;

  const mood = moodStrength(tagWeights, persona, resolvedGoal);
  let boost = 1.2 + Math.min(mood, 4) * 0.45;
  const blob = `${p.name} ${(p.need_tags || []).join(" ")} ${(p.goal_tags || []).join(" ")}`.toLowerCase();
  if (/weigh|scale|glove|resistance|shaker|fitness/.test(blob)) boost += 1.1;
  if (/earphone|watch|charger|cable|trimmer/.test(blob)) boost += 0.55;
  if (LADDER_TOP.has(p.top_category)) boost += 0.25;
  return boost;
}

/** Soft dessert / ice-cream filler — keep out of fitness “Something different”. */
export function isIndulgenceFiller(p) {
  if (!p) return false;
  const blob = `${p.name || ""} ${p.category || ""} ${p.top_category || ""}`.toLowerCase();
  return /ice cream|frozen dessert|cornetto|sundae|kulfi|chocolate magic|butterscotch bliss/i.test(blob);
}

export function guessLadderLevel(p) {
  if (!isLadderProduct(p)) return null;
  const blob = `${p.name || ""}`.toLowerCase();
  if (/tea|sleep|chamomile|melatonin|zzz/.test(blob)) return "L4";
  // Gear / electronics sit on the boldness ladder (L3), not snack L2
  return "L3";
}
