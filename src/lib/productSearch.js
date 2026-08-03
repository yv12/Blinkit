/**
 * Client-side product search for ~250 SKUs — no Elasticsearch needed.
 * Token + substring scoring over name, brand, category, tags.
 */

import { hasRealLocalPhoto } from "./productImage.js";

function normalize(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s+]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokens(s) {
  return normalize(s)
    .split(" ")
    .filter((t) => t.length >= 2);
}

function haystack(product) {
  return normalize(
    [
      product.name,
      product.brand,
      product.category,
      product.top_category,
      product.subcategory,
      ...(product.need_tags || []),
      ...(product.goal_tags || []),
      ...(product.time_tags || []),
    ]
      .filter(Boolean)
      .join(" "),
  );
}

function scoreProduct(product, queryTokens, queryNorm) {
  if (!queryTokens.length) return 0;
  const name = normalize(product.name);
  const brand = normalize(product.brand);
  const cat = normalize(product.category || product.top_category);
  const hay = haystack(product);
  let score = 0;

  if (queryNorm && name.includes(queryNorm)) score += 40;
  if (queryNorm && brand && brand.includes(queryNorm)) score += 18;
  if (queryNorm && cat.includes(queryNorm)) score += 12;

  for (const t of queryTokens) {
    if (name.startsWith(t) || name.split(" ").some((w) => w.startsWith(t))) score += 14;
    else if (name.includes(t)) score += 8;
    if (brand.includes(t)) score += 6;
    if (cat.includes(t)) score += 5;
    if (hay.includes(t)) score += 3;
  }

  return score;
}

/**
 * @param {object[]} catalog
 * @param {string} query
 * @param {{ limit?: number, minScore?: number }} [opts]
 * @returns {{ product: object, score: number }[]}
 */
export function searchProducts(catalog, query, opts = {}) {
  const limit = opts.limit ?? 24;
  const minScore = opts.minScore ?? 6;
  const requireRealPhoto = opts.requireRealPhoto !== false;
  const queryNorm = normalize(query);
  const queryTokens = tokens(query);
  if (!queryTokens.length) return [];

  const photoGate =
    requireRealPhoto && (catalog || []).some((p) => hasRealLocalPhoto(p));

  const ranked = [];
  for (const product of catalog || []) {
    if (photoGate && !hasRealLocalPhoto(product)) continue;
    const score = scoreProduct(product, queryTokens, queryNorm);
    if (score >= minScore) ranked.push({ product, score });
  }
  ranked.sort((a, b) => b.score - a.score || String(a.product.name).localeCompare(b.product.name));
  return ranked.slice(0, limit);
}

/** Suggest autocomplete labels (product names + brands). */
export function suggestSearch(catalog, query, opts = {}) {
  const limit = opts.limit ?? 8;
  const hits = searchProducts(catalog, query, { limit: limit * 2, minScore: 8 });
  const out = [];
  const seen = new Set();
  for (const { product } of hits) {
    const label = String(product.name || "").split(",")[0].trim();
    const key = normalize(label);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push({
      label: label.length > 48 ? `${label.slice(0, 46)}…` : label,
      product_id: product.id,
      product,
    });
    if (out.length >= limit) break;
  }
  return out;
}

/**
 * Map free-text query → tag/category boosts for the recommendation engine.
 */
export function queryIntentSignals(catalog, query) {
  const queryTokens = tokens(query);
  const tagBoosts = {};
  const categoryBoosts = {};
  if (!queryTokens.length) {
    return { tokens: queryTokens, tagBoosts, categoryBoosts, topHit: null };
  }

  const hits = searchProducts(catalog, query, { limit: 5, minScore: 8 });
  const topHit = hits[0]?.product || null;

  for (const t of queryTokens) {
    tagBoosts[t] = (tagBoosts[t] || 0) + 0.8;
  }

  for (const { product } of hits) {
    const cat = product.category || product.top_category;
    if (cat) categoryBoosts[cat] = (categoryBoosts[cat] || 0) + 0.6;
    for (const tag of [...(product.need_tags || []), ...(product.goal_tags || [])]) {
      const key = String(tag).toLowerCase();
      tagBoosts[key] = (tagBoosts[key] || 0) + 0.5;
    }
  }

  if (topHit) {
    const cat = topHit.category || topHit.top_category;
    if (cat) categoryBoosts[cat] = (categoryBoosts[cat] || 0) + 1.2;
  }

  return { tokens: queryTokens, tagBoosts, categoryBoosts, topHit };
}
