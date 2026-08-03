/**
 * Hard-coded nudge anti-spam (spec).
 * Priority: free_delivery_gap(2) > price_drop(1) > back_in_stock(3) > late_night(5) > post_delivery(4)
 */

const PRIORITY = {
  free_delivery_gap: 2,
  price_drop: 1,
  back_in_stock: 3,
  late_night_craving: 5,
  post_delivery: 4,
};

const MS_DAY = 24 * 60 * 60 * 1000;

export function createNudgeGate() {
  let lastAt = 0;
  let lastReason = null;
  const mutedItems = new Set();
  const ignoreCount = new Map();

  return {
    /** @returns {boolean} whether this trigger may fire */
    allow(reason, productId, now = Date.now()) {
      if (productId && mutedItems.has(productId)) return false;
      if (reason === "post_delivery" && lastReason === "muted_deck") return false;
      if (now - lastAt < MS_DAY) return false;
      return true;
    },
    pickBetter(a, b) {
      if (!a) return b;
      if (!b) return a;
      return (PRIORITY[a.reason] ?? 99) <= (PRIORITY[b.reason] ?? 99) ? a : b;
    },
    recordFire(reason, now = Date.now()) {
      lastAt = now;
      lastReason = reason;
    },
    recordIgnore(productId) {
      if (!productId) return;
      const n = (ignoreCount.get(productId) || 0) + 1;
      ignoreCount.set(productId, n);
      if (n >= 2) mutedItems.add(productId);
    },
    muteDeckPullbacks() {
      lastReason = "muted_deck";
    },
  };
}
