/**
 * Home-page recommendation rails driven by swipe affinity.
 * Frequently bought stays order-history; these rails change as the user swipes.
 * Something different deliberately surfaces cross-aisle ladder SKUs
 * (electronics, scale, gloves, shaker…) when mood leans fitness/protein.
 */

import { productImageUrl, hasRealLocalPhoto } from "./productImage.js";
import {
  isOffPersonaAisle,
  isBabyAisleProduct,
  userInterestedInBaby,
  productMatchesTag,
} from "./aisleCoherence.js";
import {
  isIndulgenceFiller,
  isLadderProduct,
  ladderAffinityBoost,
  ladderUnlocked,
  learnedFitnessMood,
} from "./ladderBoost.js";
import { allowsDietProduct, resolveDietMode } from "./dietProfile.js";
import { lastOrderAffinityBoost, shortOrderName } from "./orderFeedback.js";

function shortName(name = "") {
  return String(name).split(",")[0].trim();
}

function topEntries(weights = {}, n = 5) {
  return Object.entries(weights)
    .filter(([, w]) => Number(w) > 0.01)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n);
}

function scoreProduct(p, ctx) {
  const {
    catWeights = {},
    tagWeights = {},
    resolvedGoal = null,
    persona = null,
    learned = false,
  } = ctx;
  let score = 0;

  // Hard block incompatible aisles (Baby Care without baby intent, etc.)
  if (isOffPersonaAisle(p, { tagWeights, catWeights, resolvedGoal, persona })) {
    return -100;
  }

  // Swipe affinity — once learned, this must dominate persona baseline
  const catMul = learned ? 2.4 : 0.55;
  const tagMul = learned ? 2.1 : 0.45;
  score += (catWeights[p.category] || 0) * catMul;
  score += (catWeights[p.top_category] || 0) * (learned ? 1.1 : 0.2);

  const tags = [...(p.need_tags || []), ...(p.goal_tags || [])].map((t) =>
    String(t).toLowerCase(),
  );
  for (const t of tags) {
    score += (tagWeights[t] || 0) * tagMul;
  }

  // Structured match only — never score from a short keyword sitting in the title
  if (resolvedGoal && productMatchesTag(p, resolvedGoal)) {
    score += learned ? 4 : 2.5;
  }

  if (learned) {
    for (const [tag, w] of topEntries(tagWeights, 4)) {
      if (w < 0.5) continue;
      if (productMatchesTag(p, tag)) score += Math.min(w, 6) * 0.55;
    }
    for (const [cat, w] of topEntries(catWeights, 3)) {
      if (w < 0.5) continue;
      if (p.category === cat || p.top_category === cat) score += Math.min(w, 6) * 0.35;
    }
    for (const [tag, w] of Object.entries(tagWeights)) {
      if (w >= -0.2) continue;
      if (productMatchesTag(p, tag)) score += w * 1.4;
    }
    for (const [cat, w] of Object.entries(catWeights)) {
      if (w >= -0.2) continue;
      if (p.category === cat || p.top_category === cat) score += w * 1.2;
    }
  }

  const personaMul = learned ? 0.12 : 0.4;
  for (const n of persona?.needs || []) {
    if (productMatchesTag(p, n)) score += personaMul;
  }
  for (const g of persona?.goals || []) {
    if (productMatchesTag(p, g)) score += personaMul;
  }

  score += ladderAffinityBoost(p, { tagWeights, persona, resolvedGoal });
  score += lastOrderAffinityBoost(p, persona?.basket_facts || ctx.basketFacts || null);
  if (!isLadderProduct(p)) score -= (Number(p.price) || 0) / (learned ? 12000 : 8000);
  return score;
}

function toRailItem(p, extra = {}) {
  return {
    product_id: p.id || p.product_id,
    name: shortName(p.name),
    price: Math.round(p.price || 0),
    category: p.category,
    top_category: p.top_category,
    image: productImageUrl(p),
    image_url: productImageUrl(p),
    ladder: isLadderProduct(p),
    bridge: extra.bridge || null,
  };
}

function takeUnique(scored, n, predicate = () => true, { maxPerCategory = Infinity } = {}) {
  const out = [];
  const have = new Set();
  const perCat = new Map();
  for (const x of scored) {
    if (out.length >= n) break;
    if (!predicate(x)) continue;
    const id = x.p.id || x.p.product_id;
    if (have.has(id)) continue;
    const cat = x.p.category || "other";
    const nCat = perCat.get(cat) || 0;
    if (nCat >= maxPerCategory) continue;
    out.push(toRailItem(x.p));
    have.add(id);
    perCat.set(cat, nCat + 1);
  }
  return out;
}

/**
 * @returns {{
 *   learned: boolean,
 *   topPicks: object[],
 *   somethingDifferent: object[],
 *   reason: string
 * }}
 */
export function buildHomeRails({
  catalog = [],
  persona = null,
  state = null,
  topLimit = 8,
  diffLimit = 8,
} = {}) {
  const histIds = new Set((persona?.order_history || []).map((h) => h.product_id || h.id));
  const histCats = new Set((persona?.order_history || []).map((h) => h.category));
  const histTops = new Set((persona?.order_history || []).map((h) => h.top_category));
  const catWeights = state?.category_weights || {};
  const tagWeights = state?.tag_weights || {};
  const resolvedGoal = state?.resolved_goal || null;
  const dietMode = resolveDietMode(persona, state, null).mode;
  const basketFacts = state?.basket_facts || persona?.basket_facts || null;
  const lastOrderName = basketFacts?.last_ordered_name || state?.last_order?.items?.slice(-1)[0]?.name;
  const blocked = new Set([
    ...histIds,
    ...(state?.purchased_ids || []),
    ...(state?.cart || []).map((c) => c.product_id),
    // Already saved — Top picks should show “what next”, not the same hearted SKUs
    ...(state?.saved_list || []).map((c) => c.product_id),
    ...(state?.right_swiped_ids || []),
  ]);

  const learned =
    Object.values(catWeights).some((v) => Math.abs(v) > 0.01) ||
    Object.values(tagWeights).some((v) => Math.abs(v) > 0.01) ||
    !!resolvedGoal ||
    !!lastOrderName;

  const ctx = { catWeights, tagWeights, resolvedGoal, persona, learned, basketFacts };

  const scored = (catalog || [])
    .filter((p) => {
      const id = p.id || p.product_id;
      if (!id || blocked.has(id)) return false;
      if (persona?.constraints?.veg_only && p.veg_flag === false) return false;
      if (!allowsDietProduct(dietMode, p)) return false;
      if (p.in_stock === false) return false;
      // Only surface products that have a real local photo
      if (!hasRealLocalPhoto(p)) return false;
      // Absolute baby block for non-baby personas (ignore swipe affinity)
      if (isBabyAisleProduct(p) && !userInterestedInBaby({ persona })) return false;
      // Drop mood-incompatible / baby-without-intent aisles before ranking
      if (isOffPersonaAisle(p, { tagWeights, catWeights, resolvedGoal, persona })) return false;
      return true;
    })
    .map((p) => ({ p, score: scoreProduct(p, ctx) }))
    .sort((a, b) => b.score - a.score || (a.p.price || 0) - (b.p.price || 0));

  const fitnessMood = learnedFitnessMood(tagWeights, resolvedGoal);
  const showLadder = ladderUnlocked(tagWeights, resolvedGoal);

  // Broad needs ride along on protein bars ("snack") — don't let that pull chips into Top picks
  const BROAD_TAGS = new Set([
    "snack",
    "cooking",
    "convenience",
    "household",
    "staples",
    "breakfast",
    "beverages",
    "hydration",
    "indulgence",
    "craving",
  ]);
  const likedTags = topEntries(tagWeights, 8)
    .map(([t]) => t.toLowerCase())
    .filter((t) => !BROAD_TAGS.has(t));
  const likedTagSet = new Set(likedTags);
  // Use fine categories only — top_category like "Snacks & Munchies" would pull chips
  // in after energy-bar likes.
  const likedCats = new Set(
    topEntries(catWeights, 8)
      .map(([c]) => c)
      .filter((c) => !String(c).includes(" & ") && !String(c).includes(" and ")),
  );

  // Top picks: must match a positively swiped aisle or structured tag once learned
  const topPicks = takeUnique(
    scored,
    topLimit,
    (x) => {
      if (!learned) return true;
      const tags = [...(x.p.need_tags || []), ...(x.p.goal_tags || [])].map((t) =>
        String(t).toLowerCase(),
      );
      const matchesLike =
        likedCats.has(x.p.category) ||
        tags.some((t) => likedTagSet.has(t)) ||
        likedTags.some((t) => productMatchesTag(x.p, t));
      if (matchesLike && x.score > 0) return true;
      // Ladder gear belongs in Something different — keep Top picks on liked aisles
      return false;
    },
    { maxPerCategory: learned ? 2 : 3 },
  );
  const topPickIds = new Set(topPicks.map((i) => i.product_id));

  // Something different = cross-aisle; ladder only when fitness mood is earned
  const cross = scored.filter((x) => {
    const id = x.p.id || x.p.product_id;
    if (topPickIds.has(id)) return false;
    if (isLadderProduct(x.p)) return showLadder;
    return !histTops.has(x.p.top_category);
  });
  const ladderSlots = showLadder ? Math.min(4, diffLimit) : 0;
  const ladderFirst = takeUnique(
    cross.filter((x) => isLadderProduct(x.p)).sort((a, b) => b.score - a.score),
    ladderSlots,
    () => true,
    { maxPerCategory: 2 },
  );
  const have = new Set(ladderFirst.map((i) => i.product_id));
  const rest = takeUnique(
    cross,
    diffLimit - ladderFirst.length,
    (x) => {
      const id = x.p.id || x.p.product_id;
      if (have.has(id) || topPickIds.has(id)) return false;
      if (!showLadder && isLadderProduct(x.p)) return false;
      if (fitnessMood > 0 && isIndulgenceFiller(x.p)) return false;
      return !histCats.has(x.p.category);
    },
  );
  let somethingDifferent = [...ladderFirst, ...rest];

  if (somethingDifferent.length < diffLimit) {
    const more = takeUnique(scored, diffLimit, (x) => {
      const id = x.p.id || x.p.product_id;
      if (somethingDifferent.some((d) => d.product_id === id)) return false;
      if (topPickIds.has(id)) return false;
      if (!showLadder && isLadderProduct(x.p)) return false;
      if (fitnessMood > 0 && isIndulgenceFiller(x.p)) return false;
      return true;
    });
    somethingDifferent = [...somethingDifferent, ...more].slice(0, diffLimit);
  }

  const topTag = Object.entries(tagWeights).sort((a, b) => b[1] - a[1])[0];
  const topCat = Object.entries(catWeights).sort((a, b) => b[1] - a[1])[0];
  const ladderCount = somethingDifferent.filter((i) => i.ladder).length;
  let reason = learned
    ? ladderCount
      ? `Ladder unlocked · ${ladderCount} cross-aisle picks`
      : resolvedGoal
        ? `Swipes lean ${resolvedGoal.replace(/_/g, " ")}`
        : topTag && topTag[1] > 0
          ? `Because you liked ${topTag[0]}${topCat && topCat[1] > 0 ? ` · ${topCat[0]}` : ""}`
          : "Updated from your swipes"
    : "Swipe above — these rails will shift";

  if (lastOrderName) {
    reason = `Just ordered ${shortOrderName(lastOrderName)} — picks refreshed`;
  }

  return {
    learned,
    topPicks,
    somethingDifferent,
    reason,
    last_order_name: lastOrderName ? shortOrderName(lastOrderName) : null,
  };
}

