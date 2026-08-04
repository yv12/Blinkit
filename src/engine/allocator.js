import {
  FREE_DELIVERY_THRESHOLD,
  LOW_PRICE_MAX,
  RETREAT_SLOTS,
  STAGE_SLOTS,
} from "./constants.js";
import {
  isLadderProduct,
  ladderAffinityBoost,
  ladderUnlocked,
} from "../lib/ladderBoost.js";
import { isOffPersonaAisle, isBabyAisleProduct } from "../lib/aisleCoherence.js";
import { allowsDietProduct, resolveDietMode } from "../lib/dietProfile.js";
import { lastOrderAffinityBoost } from "../lib/orderFeedback.js";
import { pickProbeCard, placeProbeInHand } from "./probe.js";

function effectivePrice(candidate, state) {
  const id = candidate.product_id;
  if (state.price_overrides[id] != null) return state.price_overrides[id];
  return Number(candidate.price) || 0;
}

function effectiveInStock(candidate, catalogById, state) {
  const id = candidate.product_id;
  if (Object.prototype.hasOwnProperty.call(state.stock_overrides, id)) {
    return !!state.stock_overrides[id];
  }
  const cat = catalogById.get(id);
  if (cat && Object.prototype.hasOwnProperty.call(cat, "in_stock")) {
    return !!cat.in_stock;
  }
  return candidate.in_stock !== false;
}

/**
 * @param {object} candidate
 * @param {object} ctx
 */
export function isEligible(candidate, ctx) {
  const { state, persona, catalogById, now } = ctx;
  const id = candidate.product_id;

  if (!candidate.bridge || String(candidate.bridge).trim().length < 8) return false;
  if (!effectiveInStock(candidate, catalogById, state)) return false;
  if (state.purchased_ids.has(id)) return false;
  if (state.right_swiped_ids.has(id)) return false;
  if (state.seen_product_ids?.has?.(id)) return false;
  if (state.cart.some((c) => c.product_id === id)) return false;
  if (state.saved_list.some((c) => c.product_id === id)) return false;

  const hideUntil = state.hidden_products[id];
  if (hideUntil != null && hideUntil > now) return false;

  const constraints = persona?.constraints || {};
  const dietMode =
    ctx.dietMode ||
    resolveDietMode(persona, state, catalogById).mode;
  if (!allowsDietProduct(dietMode, candidate)) return false;
  // Legacy flag still honored for strict veg_only personas
  if (constraints.veg_only && candidate.veg_flag === false) return false;

  const distrust = new Set(constraints.distrusted_top_categories || []);
  if (distrust.has(candidate.top_category)) return false;

  if (state.backed_off_categories.has(candidate.category)) return false;

  return true;
}

function timeMatchRank(candidate, window) {
  const tags = candidate.time_tags || [];
  if (tags.includes(window)) return 2; // exact window beats anytime
  if (tags.includes("anytime")) return 1;
  return 0;
}

function matchesTime(candidate, window) {
  return timeMatchRank(candidate, window) > 0;
}

/**
 * Rank by time window + learned likes/dislikes (category + tags) + goal mood.
 * Exploration: slight boost for untouched categories so the engine keeps learning.
 */
export function rankScore(candidate, state, window, profile = null) {
  let score = Number(candidate.confidence) || 0.5;
  score += timeMatchRank(candidate, window) * 1.5;

  const catW = state.category_weights?.[candidate.category] || 0;
  score += catW * 0.4;

  const topW = state.category_weights?.[candidate.top_category] || 0;
  score += topW * 0.15;

  const tagWeights = state.tag_weights || {};
  for (const t of [...(candidate.need_tags || []), ...(candidate.goal_tags || []), candidate.shared_tag].filter(Boolean)) {
    const key = String(t).toLowerCase();
    score += (tagWeights[key] || 0) * 0.35;
  }

  // Mood from resolved / leading goal hypotheses
  const hyps = profile?.goal_hypotheses || [];
  const resolved = profile?.resolved_goal;
  if (resolved) {
    const blob = `${(candidate.goal_tags || []).join(" ")} ${(candidate.need_tags || []).join(" ")} ${candidate.shared_tag || ""}`.toLowerCase();
    if (blob.includes(String(resolved).toLowerCase())) score += 1.2;
  } else {
    for (const h of hyps) {
      const g = String(h.goal || "").toLowerCase();
      if (!g) continue;
      const blob = `${(candidate.goal_tags || []).join(" ")} ${candidate.shared_tag || ""}`.toLowerCase();
      if (blob.includes(g) || g.includes(blob.split(" ")[0] || "___")) {
        score += (Number(h.confidence) || 0.5) * 0.8;
      }
    }
  }

  // Keep exploring aisles the user hasn't voted on yet
  if (catW === 0) score += 0.12;

  // Fitness/protein mood → pull scale, gloves, electronics up the deck
  score += ladderAffinityBoost(candidate, {
    tagWeights: state.tag_weights || {},
    persona: profile?.needs ? { needs: profile.needs, goals: profile.goals || [] } : null,
    resolvedGoal: profile?.resolved_goal || null,
  });

  // Live order write-back: reshuffle toward sibling / new categories
  score += lastOrderAffinityBoost(candidate, state.basket_facts);

  // Drop mood-incompatible aisles from deck ranking (hard demote)
  if (
    isOffPersonaAisle(candidate, {
      tagWeights: state.tag_weights || {},
      catWeights: state.category_weights || {},
      resolvedGoal: profile?.resolved_goal || null,
      persona: profile
        ? { needs: profile.needs, goals: profile.goals || [], order_history: [] }
        : null,
    })
  ) {
    score -= 100;
  }

  if (!isLadderProduct(candidate)) {
    score -= (effectivePrice(candidate, state) || 0) / 10000;
  }
  score -= (candidate.product_id || "").charCodeAt(candidate.product_id.length - 1) / 1e6;
  return score;
}

function pickForLevel(pool, level, count, state, window, lowPrice, used, profile, { allowLadder = true } = {}) {
  let list = pool.filter((c) => c.level === level && !used.has(c.product_id));
  if (!allowLadder) {
    list = list.filter((c) => !isLadderProduct(c));
  }
  if (lowPrice) {
    // Stage-0 price band for snacks; ladder only when unlocked by swipes
    const cheap = list.filter(
      (c) => (allowLadder && isLadderProduct(c)) || effectivePrice(c, state) <= LOW_PRICE_MAX,
    );
    if (cheap.length) list = cheap;
  }
  list.sort((a, b) => rankScore(b, state, window, profile) - rankScore(a, state, window, profile));
  const picked = [];
  for (const c of list) {
    if (picked.length >= count) break;
    picked.push(c);
    used.add(c.product_id);
  }
  return picked;
}

/**
 * Build a deterministic deck for the current persona state.
 * Window is locked at build time (caller sets session_locked_window).
 */
export function buildDeck({ candidates, persona, catalogById, state, now, profile = null }) {
  const window = state.session_locked_window || state.time_window || "morning";
  const shortHistory = (persona?.order_history?.length ?? 0) < 3;

  const eligible = candidates.filter((c) => {
    if (isBabyAisleProduct(c) || isBabyAisleProduct(catalogById?.get?.(c.product_id))) {
      return false;
    }
    return isEligible(c, {
      state,
      persona,
      catalogById,
      now,
      dietMode: profile?.diet_mode,
    });
  });

  let slots;
  if (state.retreat_next_deck || shortHistory) {
    slots = { ...RETREAT_SLOTS };
    if (shortHistory) slots = { L2: 5, L3: 0, L4: 0, lowPrice: true };
  } else {
    const stage = state.boldness_stage;
    slots = { ...(STAGE_SLOTS[stage] || STAGE_SLOTS[0]) };
  }

  const used = new Set();
  const deck = [];
  // Cold Stage-0: grocery protein first. Ladder gear waits until fitness likes land.
  const allowLadder = ladderUnlocked(state.tag_weights || {}, state.resolved_goal || profile?.resolved_goal);
  const pickOpts = { allowLadder };

  // Active-learning: reserve one discriminator before filling confirm slots
  const probe = pickProbeCard(eligible, profile, {
    lowPrice: !!slots.lowPrice,
    used,
  });
  if (probe) used.add(probe.product_id);

  const targetCount = (slots.L2 || 0) + (slots.L3 || 0) + (slots.L4 || 0);
  // Leave room for the probe so hand length stays on budget
  const fillBudget = Math.max(0, targetCount - (probe ? 1 : 0));

  // Fill preferred levels first
  for (const level of ["L4", "L3", "L2"]) {
    const want = slots[level] || 0;
    if (want <= 0) continue;
    const need = Math.min(want, fillBudget - deck.length);
    if (need <= 0) break;
    deck.push(
      ...pickForLevel(eligible, level, need, state, window, slots.lowPrice, used, profile, pickOpts),
    );
  }

  // Backfill downward only: L4→L3→L2
  if (deck.length < fillBudget) {
    for (const level of ["L3", "L2"]) {
      if (deck.length >= fillBudget) break;
      const need = fillBudget - deck.length;
      deck.push(
        ...pickForLevel(eligible, level, need, state, window, slots.lowPrice, used, profile, pickOpts),
      );
    }
  }

  // Re-rank confirm cards: exact window > anytime > other (probe placed after)
  deck.sort((a, b) => {
    const ta = timeMatchRank(a, window);
    const tb = timeMatchRank(b, window);
    if (tb !== ta) return tb - ta;
    return rankScore(b, state, window, profile) - rankScore(a, state, window, profile);
  });

  const withProbe = placeProbeInHand(deck, probe, { after: Math.min(2, deck.length) });

  // Never pad — shorter deck / empty is OK
  return withProbe.map((c) => ({
    ...c,
    price: effectivePrice(c, state),
    in_stock: effectiveInStock(c, catalogById, state),
    is_probe: !!c.is_probe,
    probe_goal: c.probe_goal || null,
  }));
}

export function cartTotal(state) {
  return state.cart.reduce((sum, item) => {
    const qty = Math.max(1, Number(item.qty) || 1);
    return sum + (Number(item.price) || 0) * qty;
  }, 0);
}

export function freeDeliveryGap(state) {
  const total = cartTotal(state);
  return Math.max(0, FREE_DELIVERY_THRESHOLD - total);
}
