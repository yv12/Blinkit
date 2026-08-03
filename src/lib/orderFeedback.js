/**
 * Live order → recommendation write-back helpers.
 * Bridges must visibly cite the just-ordered item for the demo.
 */

export function shortOrderName(name = "") {
  const cut = String(name).split(",")[0].trim();
  return cut.length > 36 ? `${cut.slice(0, 34)}…` : cut;
}

/**
 * L0 basket facts derived from live order_history.
 */
export function buildBasketFacts(orderHistory = [], constraints = {}, dietMode = null) {
  const hist = Array.isArray(orderHistory) ? orderHistory : [];
  const categories = [...new Set(hist.map((h) => h.category).filter(Boolean))];
  const top_categories = [...new Set(hist.map((h) => h.top_category).filter(Boolean))];
  const recent = [...hist].slice(-5);
  const last = hist[hist.length - 1] || null;
  return {
    item_count: hist.length,
    categories,
    top_categories,
    recent_categories: [...new Set(recent.map((h) => h.category).filter(Boolean))],
    last_ordered_id: last?.product_id || last?.id || null,
    last_ordered_name: last?.name || null,
    last_ordered_at: last?.ordered_at || null,
    last_ordered_ids: recent.map((h) => h.product_id || h.id).filter(Boolean),
    last_ordered_names: recent.map((h) => shortOrderName(h.name)).filter(Boolean),
    veg_only: !!constraints.veg_only,
    diet_mode: dietMode || (constraints.veg_only ? "veg" : null),
  };
}

const BRIDGE_TEMPLATES = [
  (a) => `Since you just got ${a}, try this next.`,
  (a) => `Pairs with your fresh ${a} order.`,
  (a) => `Because you ordered ${a} — cross-aisle pick.`,
  (a) => `Just bought ${a}? This is the natural follow-up.`,
];

export function justOrderedBridge(anchorName, candidate = null, index = 0) {
  const a = shortOrderName(anchorName) || "that";
  const fn = BRIDGE_TEMPLATES[index % BRIDGE_TEMPLATES.length];
  let line = fn(a);
  if (candidate?.category && anchorName) {
    const cat = String(candidate.category);
    if (!line.toLowerCase().includes(cat.toLowerCase().slice(0, 8))) {
      // keep short; template already cites the order
    }
  }
  if (line.length < 8) line = `Since you just got ${a}, try this.`;
  return line;
}

/**
 * Rewrite bridges on a fresh deck so ≥1 card cites the just-ordered item.
 * Prefers first non-probe card; also stamps 2nd card when multiple ordered.
 */
export function applyJustOrderedBridges(cards = [], orderedItems = []) {
  if (!cards?.length || !orderedItems?.length) return cards;
  const primary = orderedItems[orderedItems.length - 1];
  const anchor = primary?.name || "your order";
  let stamped = 0;
  for (let i = 0; i < cards.length; i++) {
    const card = cards[i];
    if (!card || card.is_probe) continue;
    if (stamped === 0 || (stamped < 2 && i < 4)) {
      card.bridge = justOrderedBridge(anchor, card, stamped);
      card.just_ordered_anchor = shortOrderName(anchor);
      stamped += 1;
    }
    if (stamped >= 2) break;
  }
  if (stamped === 0 && cards[0]) {
    cards[0].bridge = justOrderedBridge(anchor, cards[0], 0);
    cards[0].just_ordered_anchor = shortOrderName(anchor);
  }
  return cards;
}

/** Soft score boost for cross-sell from last order categories/tags. */
export function lastOrderAffinityBoost(product, basketFacts) {
  if (!product || !basketFacts?.last_ordered_id) return 0;
  let boost = 0;
  const recent = new Set(basketFacts.recent_categories || []);
  const tops = new Set(basketFacts.top_categories || []);
  // Prefer a *new* category vs the last order (cross-sell), but same top-level goal aisle
  if (product.category && recent.has(product.category)) boost -= 0.8;
  if (product.top_category && tops.has(product.top_category)) boost += 1.1;
  if (product.category && (basketFacts.categories || []).includes(product.category)) boost += 0.35;
  return boost;
}
