/**
 * CODE pre-filter: 60–100 catalog items the LLM may choose from.
 * Spec: llm-recommendation-spec.md Call 2 input #1
 */

import { LOW_PRICE_MAX, STAGE_SLOTS } from "./constants.js";
import { allowsDietProduct, resolveDietMode } from "../lib/dietProfile.js";
import { hasRealLocalPhoto } from "../lib/productImage.js";
import { isOffPersonaAisle } from "../lib/aisleCoherence.js";

const CROSS_BANNED_IF_SEEN = new Set([
  "Curd Yogurt",
  "Paneer Tofu",
  "Energy Bars",
  "Bread Pav",
  "Chips Crisps",
  "Bhujia Namkeen",
  "Soft Drinks",
  "Oats",
]);

/**
 * @returns {{ allowed: object[], byId: Map<string, object> }}
 */
export function buildAllowedList({
  catalog = [],
  persona,
  state,
  catalogById,
  profile = null,
  maxItems = 250,
  requireRealPhoto = true,
} = {}) {
  const histIds = new Set((persona?.order_history || []).map((h) => h.product_id || h.id));
  const histCats = new Set((persona?.order_history || []).map((h) => h.category));
  const distrust = new Set(persona?.constraints?.distrusted_top_categories || []);
  const dietMode = profile?.diet_mode || resolveDietMode(persona, state, catalogById).mode;
  const vegOnly = dietMode === "veg" || !!persona?.constraints?.veg_only;
  const stage = state?.boldness_stage ?? 0;
  const slots = STAGE_SLOTS[stage] || STAGE_SLOTS[0];
  const lowPrice = !!slots.lowPrice || !!state?.retreat_next_deck;
  const now = Date.now();
  const tagWeights = state?.tag_weights || {};
  const catWeights = state?.category_weights || {};
  const resolved = profile?.resolved_goal;
  const photoGate =
    requireRealPhoto && catalog.some((x) => hasRealLocalPhoto(x));

  const scored = [];
  for (const p of catalog) {
    const id = p.id;
    if (!id || histIds.has(id)) continue;
    if (state?.purchased_ids?.has?.(id)) continue;
    if (state?.right_swiped_ids?.has?.(id)) continue;
    if (state?.seen_product_ids?.has?.(id)) continue;
    if (state?.cart?.some?.((c) => c.product_id === id)) continue;
    if (state?.saved_list?.some?.((c) => c.product_id === id)) continue;
    if (state?.hidden_products?.[id] && state.hidden_products[id] > now) continue;
    if (state?.backed_off_categories?.has?.(p.category)) continue;
    if (distrust.has(p.top_category)) continue;
    if (!allowsDietProduct(dietMode, p)) continue;
    if (vegOnly && p.veg_flag === false) continue;

    let inStock = p.in_stock !== false;
    if (state?.stock_overrides && Object.prototype.hasOwnProperty.call(state.stock_overrides, id)) {
      inStock = !!state.stock_overrides[id];
    }
    if (!inStock) continue;
    // Discovery only shows SKUs with real photos (no broken SVG placeholders)
    if (photoGate && !hasRealLocalPhoto(p)) continue;
    // Baby Care / similar aisles only when the user has that intent
    if (
      isOffPersonaAisle(p, {
        tagWeights,
        catWeights,
        resolvedGoal: resolved,
        persona,
      })
    ) {
      continue;
    }

    // Stage-0 low-price band is a soft preference for ranking, not a hard cut —
    // so the full catalog stays reachable as mood learning progresses.
    const pricey = lowPrice && (p.price || 0) > LOW_PRICE_MAX;

    // Prefer true new categories for L2 pool; still allow L3/L4 gear in seen tops
    const newCat = !histCats.has(p.category);
    const sameTypeBan = CROSS_BANNED_IF_SEEN.has(p.category) && histCats.has(p.category);
    if (sameTypeBan) continue;

    const tags = `${(p.need_tags || []).join(" ")} ${(p.goal_tags || []).join(" ")} ${p.name}`.toLowerCase();
    let score = 0;
    if (newCat) score += 3;
    for (const n of persona?.needs || []) if (tags.includes(String(n).toLowerCase())) score += 2;
    for (const g of persona?.goals || []) if (tags.includes(String(g).toLowerCase())) score += 2;
    if (/protein|whey|shake|vitamin|weigh|gym|creatine|chamomile|scale|shaker/.test(tags)) score += 2;
    if (lowPrice && !pricey) score += Math.max(0, 2 - (p.price || 0) / 100);
    if (pricey) score -= 1.5;

    // Learned mood from swipes
    score += (catWeights[p.category] || 0) * 0.5;
    score += (catWeights[p.top_category] || 0) * 0.2;
    for (const t of [...(p.need_tags || []), ...(p.goal_tags || [])]) {
      score += (tagWeights[String(t).toLowerCase()] || 0) * 0.4;
    }
    if (resolved && tags.includes(String(resolved).toLowerCase())) score += 3;
    for (const h of profile?.goal_hypotheses || []) {
      const g = String(h.goal || "").toLowerCase();
      if (g && tags.includes(g)) score += (Number(h.confidence) || 0.5) * 1.5;
    }
    // Explore untouched aisles so dislikes/likes keep updating
    if (!(p.category in catWeights)) score += 0.4;

    scored.push({ score, price: p.price || 0, p });
  }

  scored.sort((a, b) => b.score - a.score || a.price - b.price);
  const picked = scored.slice(0, maxItems).map(({ p }) => ({
    id: p.id,
    name: p.name,
    category: p.category,
    top_category: p.top_category,
    price: state?.price_overrides?.[p.id] ?? p.price,
    need_tags: p.need_tags || [],
    goal_tags: p.goal_tags || [],
    time_tags: p.time_tags || [],
    veg_flag: p.veg_flag !== false,
    image_url: p.image_url,
    new_category: !histCats.has(p.category),
  }));

  const byId = new Map(picked.map((x) => [x.id, x]));
  // Enrich from full catalog for validation later
  for (const p of catalog) {
    if (!byId.has(p.id) && catalogById?.has?.(p.id)) {
      /* keep allowed-only map */
    }
  }
  return { allowed: picked, byId };
}
