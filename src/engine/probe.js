/**
 * Active-learning probe slot — one card per hand that splits competing goals.
 * Left vs right/top on this card teaches the persona; allocator stays deterministic.
 */

import { LOW_PRICE_MAX } from "./constants.js";
import { isLadderProduct } from "../lib/ladderBoost.js";
import { shouldProbe, topHypotheses } from "./hypothesis.js";

/** Lexical / tag signals that pull a card toward a goal. */
const GOAL_SIGNALS = {
  weight_loss: {
    re: /isolate|green tea|chamomile|zero.?cal|diet|skyr|low.?fat|low.?cal|high protein plain|multivitamin|supradyn|centrum/i,
    tags: ["weight_loss", "wellness", "diet"],
  },
  muscle_gain: {
    re: /mass|gainer|creatine|peanut|calorie|biozyme|gold standard|whey protein/i,
    tags: ["muscle_gain", "fitness", "supplements"],
  },
  fitness: {
    re: /whey|creatine|protein|resistance|gym|shaker|scale|weigh|glove|oats|skyr|paneer/i,
    tags: ["fitness", "protein", "fitness_gear"],
  },
  wellness: {
    re: /vitamin|green tea|chamomile|wellness|sleep|zzquil/i,
    tags: ["wellness", "sleep"],
  },
  snack: {
    re: /chips|namkeen|kurkure|lay'?s|cola|biscuit|cookie|maggi|noodle/i,
    tags: ["snack", "indulgence"],
  },
};

function cardBlob(c) {
  return [
    c.name,
    c.category,
    c.shared_tag,
    ...(c.need_tags || []),
    ...(c.goal_tags || []),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

/** Name/aisle only — used for lexical probe cues (tags alone are too noisy). */
function nameCatBlob(c) {
  return `${c.name || ""} ${c.category || ""} ${c.top_category || ""}`.toLowerCase();
}

/** 0–1 affinity of a card to a goal label. */
export function goalAffinity(card, goal) {
  if (!card || !goal) return 0;
  const g = String(goal).toLowerCase();
  const blob = cardBlob(card);
  const tags = new Set(
    [...(card.need_tags || []), ...(card.goal_tags || []), card.shared_tag]
      .filter(Boolean)
      .map((t) => String(t).toLowerCase()),
  );

  let score = 0;
  // Soft tag overlap — most catalog rows inherit persona goals, so keep this weak
  if (tags.has(g)) score += 0.25;
  if (blob.includes(g.replace(/_/g, " ")) || blob.includes(g)) score += 0.15;

  const sig = GOAL_SIGNALS[g];
  let lexical = false;
  if (sig) {
    const surface = nameCatBlob(card);
    if (sig.re.test(surface)) {
      score += 0.55;
      lexical = true;
    }
    for (const t of sig.tags) {
      if (tags.has(t)) score += 0.15;
    }
  }

  // Tag-only affinity without a name/aisle cue is too noisy for probes
  if (!lexical && score < 0.5) score *= 0.5;

  return Math.max(0, Math.min(1, score));
}

/**
 * Probe while goals are unresolved — always early in a session, then when hyps are close.
 */
export function needsProbeSlot(profile) {
  if (!profile || profile.resolved_goal) return false;
  const hyps = topHypotheses(profile, 2);
  if (hyps.length < 2) return false;
  const evidence = profile.evidence_log?.length || 0;
  if (evidence < 5) return true;
  return shouldProbe(profile);
}

/**
 * Score how well a card discriminates hypA vs hypB.
 * @returns {{ score: number, probe_goal: string|null }}
 */
export function probeDiscriminationScore(card, hypA, hypB, { lowPrice = true } = {}) {
  if (!card || !hypA || !hypB) return { score: 0, probe_goal: null };
  const a = goalAffinity(card, hypA.goal);
  const b = goalAffinity(card, hypB.goal);
  const separation = Math.abs(a - b);
  const strength = Math.max(a, b);
  // Must lean one way — both/neither teaches little
  if (separation < 0.28 || strength < 0.35) return { score: 0, probe_goal: null };

  const probe_goal = a >= b ? hypA.goal : hypB.goal;
  const winnerSig = GOAL_SIGNALS[String(probe_goal).toLowerCase()];
  const lexicalHit = !!winnerSig && winnerSig.re.test(nameCatBlob(card));
  // Reject tag-only "probes" (would steal morning-window winners, etc.)
  if (!lexicalHit) return { score: 0, probe_goal: null };

  let score = separation * 2.2 + strength;
  const price = Number(card.price) || 0;
  if (lowPrice && price > 0 && price <= LOW_PRICE_MAX) score += 0.55;
  else if (lowPrice && price > LOW_PRICE_MAX) score -= 0.35;
  if (isLadderProduct(card)) score -= 0.8; // probes are grocery/persona, not gear
  if ((card.level || "L2") === "L2") score += 0.15;
  if ((card.level || "") === "L4") score -= 0.4;

  return { score, probe_goal };
}

/**
 * Pick one discriminator card from the eligible pool.
 * @returns {object|null} candidate with probe_goal + is_probe
 */
export function pickProbeCard(eligible, profile, { lowPrice = true, used = new Set() } = {}) {
  if (!needsProbeSlot(profile)) return null;
  const [hypA, hypB] = topHypotheses(profile, 2);
  if (!hypA || !hypB) return null;

  let best = null;
  let bestScore = 0;
  for (const c of eligible || []) {
    if (!c?.product_id || used.has(c.product_id)) continue;
    if (isLadderProduct(c)) continue;
    const { score, probe_goal } = probeDiscriminationScore(c, hypA, hypB, { lowPrice });
    if (score > bestScore) {
      bestScore = score;
      best = { ...c, probe_goal, is_probe: true };
    }
  }
  return bestScore > 0 ? best : null;
}

/** Insert probe after 1–2 confirm cards so the hand opens familiar, then asks. */
export function placeProbeInHand(deck, probe, { after = 2 } = {}) {
  if (!probe) return deck || [];
  const rest = (deck || []).filter((c) => c.product_id !== probe.product_id);
  const idx = Math.min(Math.max(0, after), rest.length);
  return [...rest.slice(0, idx), probe, ...rest.slice(idx)];
}
