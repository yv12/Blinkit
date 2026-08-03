/**
 * LLM Call 2 — Deck generation from allowed list + profile + stage instructions.
 */

import { STAGE_SLOTS, RETREAT_SLOTS } from "./constants.js";
import { llmChatJson } from "./llmClient.js";
import { branchInstruction, shouldProbe, topHypotheses } from "./hypothesis.js";

const SYSTEM = `You pick cross-category grocery recommendations for a Blinkit-style swipe deck.
Rules sandwich: you may ONLY choose product_id values from the allowed list.
L2 = same need, NEW category (never same aisle as history categories).
L3 = same goal, different need (gym gear, vitamins, scale, creatine…).
L4 = lifestyle halo (recovery/sleep) only when stage allows.
Every card needs anchor_items from the user's real history and an honest bridge.
Output JSON ONLY: {"cards":[{"product_id":"...","level":"L2","anchor_items":["..."],"bridge":"...","bio":"...","probe_goal":null}]}`;

export async function generateDeckWithLlm({
  profile,
  allowed,
  state,
  timeWindow,
} = {}) {
  const stage = state?.boldness_stage ?? profile?.boldness_stage ?? 0;
  const slots = state?.retreat_next_deck ? RETREAT_SLOTS : STAGE_SLOTS[stage] || STAGE_SLOTS[0];
  const histCats = [...new Set((profile?.history || []).map((h) => h.category))];

  const deckInstructions = [
    `Stage ${stage}: build about ${slots.L2}×L2 + ${slots.L3}×L3 + ${slots.L4}×L4.`,
    slots.lowPrice ? "Prefer low price band (cheap probes / Stage 0)." : "Higher price band allowed.",
    branchInstruction(profile),
    shouldProbe(profile)
      ? `Probes for: ${topHypotheses(profile, 2)
          .map((h) => h.goal)
          .join(", ")}`
      : "",
  ]
    .filter(Boolean)
    .join(" ");

  const compactAllowed = (allowed || []).slice(0, 80).map((p) => ({
    id: p.id,
    name: String(p.name || "").slice(0, 60),
    cat: p.category,
    price: p.price,
    new_cat: !!p.new_category,
    needs: (p.need_tags || []).slice(0, 3),
    goals: (p.goal_tags || []).slice(0, 2),
  }));

  const user = {
    history: (profile?.history || []).slice(0, 14).map((h) => ({
      name: h.name,
      cat: h.category,
    })),
    hard_constraints: profile?.hard_constraints || [],
    excluded_categories: profile?.excluded_categories || [],
    needs: profile?.needs || [],
    goal_hypotheses: profile?.goal_hypotheses || [],
    resolved_goal: profile?.resolved_goal,
    boldness_stage: stage,
    recent_lefts: state?.consecutive_dismissals || 0,
    category_backoffs: Object.keys(profile?.category_backoffs || {}),
    saved_list: (profile?.saved_list || []).map((s) => s.name),
    time_window: timeWindow || state?.time_window || "morning",
    history_categories_blocked_for_L2: histCats,
    deck_instructions: deckInstructions,
    allowed,
    allowed_compact: compactAllowed,
  };

  // Prefer compact payload
  const payload = { ...user, allowed: undefined };

  const result = await llmChatJson({
    system: SYSTEM,
    user: JSON.stringify(payload),
    temperature: 0.35,
    timeoutMs: 5000,
  });

  if (!result.ok) {
    return { ok: false, reason: result.reason, cards: [], ms: result.ms };
  }

  const data = result.data;
  const cards = Array.isArray(data) ? data : data?.cards || data?.items || [];
  return { ok: true, cards, ms: result.ms };
}

/** Cache key per spec */
export function deckCacheKey(profile, state, timeWindow) {
  return [
    profile?.user_id || "u",
    state?.boldness_stage ?? 0,
    timeWindow || state?.time_window || "morning",
    profile?.resolved_goal || "unresolved",
    state?.retreat_next_deck ? "retreat" : "normal",
  ].join("|");
}
