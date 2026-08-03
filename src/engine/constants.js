/** @typedef {'morning'|'afternoon'|'evening'|'late_night'} TimeWindow */

export const FREE_DELIVERY_THRESHOLD = 99;
/** Cart must be within this many ₹ of the free-delivery threshold to fire a match. */
export const FREE_DELIVERY_GAP = 70;
export const LEFT_HIDE_DAYS = 30;
export const SAVED_LIST_CAP = 15;
export const CATEGORY_BACKOFF_LEFTS = 3;
/** Within one hand: this many lefts on a category → drop remaining same-cat cards + local backfill */
export const HAND_CATEGORY_LEFT_PRUNE = 2;
export const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Slot targets by boldness stage. Retreat overrides to all-L2. */
export const STAGE_SLOTS = {
  0: { L2: 4, L3: 1, L4: 0, lowPrice: true },
  1: { L2: 3, L3: 2, L4: 1, lowPrice: false },
  2: { L2: 2, L3: 2, L4: 2, lowPrice: false },
};

export const RETREAT_SLOTS = { L2: 5, L3: 0, L4: 0, lowPrice: true };

export const LOW_PRICE_MAX = 150;

/**
 * Half-open windows from the spec.
 * morning 06→11, afternoon 11→17, evening 17→21, late_night 21→02.
 * @param {Date} date
 * @returns {TimeWindow}
 */
export function timeWindowFromDate(date) {
  const minutes = date.getHours() * 60 + date.getMinutes();
  if (minutes >= 6 * 60 && minutes < 11 * 60) return "morning";
  if (minutes >= 11 * 60 && minutes < 17 * 60) return "afternoon";
  if (minutes >= 17 * 60 && minutes < 21 * 60) return "evening";
  return "late_night";
}

/**
 * Map cumulative top-swipes to stage, then apply retreat debt.
 * @param {number} acceptedCount
 * @param {number} retreatDebt
 */
export function stageFromCounts(acceptedCount, retreatDebt = 0) {
  const base = acceptedCount >= 3 ? 2 : acceptedCount >= 1 ? 1 : 0;
  return Math.max(0, base - retreatDebt);
}
