/**
 * Widen the swipe pool to the full catalog so every Blinkit SKU can appear,
 * while frozen candidates_*.json stay preferred seeds (higher confidence).
 * Only photo-backed SKUs are added — no broken SVG placeholders in the deck.
 */
import { hasRealLocalPhoto, productImageUrl } from "./productImage.js";
import { ensureTinderBio } from "./tinderBio.js";
import { guessLadderLevel, isLadderProduct } from "./ladderBoost.js";
import { isBabyAisleProduct } from "./aisleCoherence.js";

function guessLevel(p) {
  const ladder = guessLadderLevel(p);
  if (ladder) return ladder;
  const blob = `${p.name || ""} ${(p.need_tags || []).join(" ")} ${(p.goal_tags || []).join(" ")} ${p.top_category || ""}`.toLowerCase();
  if (/whey|protein shake|soy beverage|creatine|multivitamin|gym|scale|shaker|resistance|glove/.test(blob)) {
    return /creatine|vitamin|scale|gym|shaker|resistance|glove/.test(blob) ? "L3" : "L2";
  }
  if (/tea|sleep|chamomile|melatonin|zzquil/.test(blob)) return "L4";
  if (isLadderProduct(p)) return "L3";
  return "L2";
}

/**
 * @param {object[]} seed frozen / persona candidates
 * @param {object[]} catalog full Blinkit catalog
 * @param {{ maxExtra?: number, requireRealPhoto?: boolean }} [opts]
 */
export function expandCandidates(
  seed = [],
  catalog = [],
  { maxExtra = Number.POSITIVE_INFINITY, requireRealPhoto = true } = {},
) {
  const out = [];
  const seen = new Set();
  const photoMode = requireRealPhoto && catalog.some((p) => hasRealLocalPhoto(p));

  for (const c of seed) {
    const id = c.product_id || c.id;
    if (!id || seen.has(id)) continue;
    // Never seed Baby Care into discovery for anyone — catalog fill also blocked
    if (isBabyAisleProduct(c)) continue;
    if (photoMode && !hasRealLocalPhoto(id)) continue;
    seen.add(id);
    out.push({
      ...c,
      bio: ensureTinderBio(c),
      image_url: productImageUrl(c, c.image_url || c.image),
    });
  }

  let added = 0;
  // Never cold-fill Baby Care — only appear if a curated seed already included them
  const ordered = [...catalog].filter((p) => {
    if (requireRealPhoto && !hasRealLocalPhoto(p)) return false;
    if (isBabyAisleProduct(p)) return false;
    return true;
  });

  for (const p of ordered) {
    if (added >= maxExtra) break;
    const id = p.id;
    if (!id || seen.has(id)) continue;

    const level = guessLevel(p);
    const ladder = isLadderProduct(p);
    out.push({
      product_id: id,
      name: p.name,
      category: p.category,
      top_category: p.top_category,
      price: p.price,
      level,
      shared_tag:
        (p.goal_tags && p.goal_tags[0]) ||
        (p.need_tags && p.need_tags[0]) ||
        (ladder ? "fitness" : "discovery"),
      tag_type: ladder ? "goal" : "need",
      bridge: ladder
        ? "Same fitness direction — next aisle up the ladder (gear / electronics)."
        : "Based on what you just swiped — this is a different aisle that still fits the vibe.",
      bio: ensureTinderBio(p),
      confidence: ladder ? 0.62 : 0.55,
      veg_flag: p.veg_flag !== false,
      time_tags: p.time_tags || ["anytime"],
      need_tags: p.need_tags || [],
      goal_tags: p.goal_tags || [],
      image_url: productImageUrl(p),
      in_stock: p.in_stock !== false,
    });
    seen.add(id);
    added += 1;
  }

  return out;
}
