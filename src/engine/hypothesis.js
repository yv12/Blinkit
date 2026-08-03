/**
 * Hypothesis → Probe → Resolve → Branch (code-owned confidence).
 * Spec: llm-recommendation-spec.md
 */

export const RESOLVE_THRESHOLD = 0.75;
export const PROBE_GAP = 0.2;
export const HALF_LIFE_DAYS = 90;

const DELTA = {
  top: 0.2,
  right: 0.1,
  left: -0.15,
  purchase: 0.35,
  contradict_purchase: -0.35,
  /** Explicit typed search → open/submit product (stronger than right, near top). */
  search: 0.25,
  /** Raw query submit without a product click. */
  search_query: 0.12,
};

/** Should this deck include probe cards? */
export function shouldProbe(profile) {
  if (!profile || profile.resolved_goal) return false;
  const hyps = [...(profile.goal_hypotheses || [])].sort(
    (a, b) => (b.confidence || 0) - (a.confidence || 0),
  );
  if (hyps.length < 2) return false;
  return Math.abs((hyps[0].confidence || 0) - (hyps[1].confidence || 0)) <= PROBE_GAP;
}

export function topHypotheses(profile, n = 2) {
  return [...(profile?.goal_hypotheses || [])]
    .sort((a, b) => (b.confidence || 0) - (a.confidence || 0))
    .slice(0, n);
}

/**
 * Apply swipe/purchase/search evidence to hypotheses.
 * @param {'top'|'right'|'left'|'purchase'|'search'|'search_query'} kind
 * @param {{ product_id?: string, name?: string, goal_tags?: string[], shared_tag?: string, probe_goal?: string, need_tags?: string[] }} card
 */
export function applyEvidence(profile, kind, card, { contradict = false } = {}) {
  if (!profile) return profile;
  const now = Date.now();
  const delta = contradict ? DELTA.contradict_purchase : DELTA[kind] || 0;
  const cardGoals = new Set(
    [
      card?.probe_goal,
      ...(card?.goal_tags || []),
      ...(card?.need_tags || []),
      card?.shared_tag,
      ...(card?.query_tags || []),
    ]
      .filter(Boolean)
      .map((g) => String(g).toLowerCase()),
  );

  profile.evidence_log = profile.evidence_log || [];
  profile.evidence_log.push({
    at: now,
    kind: contradict ? "contradict_purchase" : kind,
    product_id: card?.product_id,
    name: card?.name,
    goals: [...cardGoals],
    delta,
  });

  for (const h of profile.goal_hypotheses || []) {
    const g = String(h.goal || "").toLowerCase();
    const related =
      cardGoals.has(g) ||
      [...cardGoals].some((cg) => g.includes(cg) || cg.includes(g)) ||
      (card?.probe_goal && String(card.probe_goal).toLowerCase() === g);
    if (!related && !contradict) continue;

    let conf = Number(h.confidence) || 0;
    if (contradict && profile.resolved_goal === h.goal) {
      conf += DELTA.contradict_purchase;
    } else if (related) {
      conf += delta;
    }
    h.confidence = clamp01(conf);
    h.evidence = h.evidence || [];
    if (card?.name) h.evidence.push(card.name);
  }

  // Resolve
  const sorted = [...(profile.goal_hypotheses || [])].sort(
    (a, b) => (b.confidence || 0) - (a.confidence || 0),
  );
  const top = sorted[0];
  if (top && top.confidence >= RESOLVE_THRESHOLD) {
    profile.resolved_goal = top.goal;
  }

  // Unresolve if resolved goal dropped
  if (profile.resolved_goal) {
    const cur = (profile.goal_hypotheses || []).find((h) => h.goal === profile.resolved_goal);
    if (!cur || cur.confidence < RESOLVE_THRESHOLD - 0.05) {
      profile.resolved_goal = null;
    }
  }

  return profile;
}

/** Soft decay all evidence (call on New Session). */
export function decayEvidence(profile, now = Date.now()) {
  if (!profile?.evidence_log?.length) return profile;
  const half = HALF_LIFE_DAYS * 24 * 60 * 60 * 1000;
  for (const h of profile.goal_hypotheses || []) {
    let conf = Number(h.confidence) || 0;
    // Gentle session decay toward 0.5 when unresolved
    if (!profile.resolved_goal) {
      conf = conf * 0.98 + 0.5 * 0.02;
    }
    // Age evidence log
    const related = (profile.evidence_log || []).filter((e) =>
      (e.goals || []).some((g) => String(g).toLowerCase() === String(h.goal).toLowerCase()),
    );
    for (const e of related) {
      const age = Math.max(0, now - (e.at || now));
      const factor = Math.pow(0.5, age / half);
      // already applied deltas historically; decay only nudges confidence slightly
      conf = 0.5 + (conf - 0.5) * (0.85 + 0.15 * factor);
    }
    h.confidence = clamp01(conf);
  }
  return profile;
}

function clamp01(n) {
  return Math.max(0, Math.min(1, n));
}

/** Branch hint string injected into deck LLM prompt. */
export function branchInstruction(profile) {
  const g = profile?.resolved_goal;
  if (!g) {
    const hyps = topHypotheses(profile, 2);
    if (hyps.length >= 2) {
      return (
        `PROBE MODE: competing goals (${hyps.map((h) => `${h.goal}:${(h.confidence || 0).toFixed(2)}`).join(" vs ")}). ` +
        `Include ONE cheap discriminator card that leans to exactly one goal. Tag it with probe_goal. ` +
        `Runtime also injects a deterministic probe slot — do not flood the deck with probes.`
      );
    }
    return "Goals unresolved — keep recommendations balanced; prefer cheap exploratory L2/L3.";
  }
  const trees = {
    weight_loss:
      "RESOLVED GOAL weight_loss: prefer whey isolate / high-protein low-cal, shaker, green tea/chamomile, food or body scale, multivitamins. Avoid mass gainers.",
    muscle_gain:
      "RESOLVED GOAL muscle_gain: prefer mass gainer / calorie-dense protein, creatine, peanut butter, larger shaker. Avoid hard diet/zero-cal framing.",
    fitness:
      "RESOLVED GOAL fitness: training + protein ladder — whey, creatine, resistance gear, scale, recovery tea.",
  };
  return trees[g] || `RESOLVED GOAL ${g}: bias the deck toward that product tree.`;
}
