/**
 * LLM Call 1 — Cold read: competing goal hypotheses from order history.
 */

import { llmChatJson } from "./llmClient.js";

const SYSTEM = `You infer grocery shopping needs and COMPETING goal hypotheses from order history.
Rules:
- Output 2-3 competing goals WITH confidence (0-1) and evidence item names from history.
- Never output a single conclusion as fact.
- hard_constraints: include veg_only if history looks all-veg.
- needs: short tags like protein, breakfast, snack, wellness, household.
JSON only:
{
  "needs": ["protein"],
  "hard_constraints": ["veg_only"],
  "goal_hypotheses": [
    {"goal": "weight_loss", "confidence": 0.55, "evidence": ["Skyr", "protein bar"]},
    {"goal": "muscle_gain", "confidence": 0.45, "evidence": ["paneer"]}
  ]
}`;

export async function runColdRead(profile) {
  const history = (profile?.history || []).map((h) => ({
    name: h.name,
    category: h.category,
    price: h.price,
  }));

  const result = await llmChatJson({
    system: SYSTEM,
    user: JSON.stringify({ history }),
    temperature: 0.2,
    timeoutMs: 5000,
  });

  if (!result.ok) {
    return { ok: false, reason: result.reason, profile };
  }

  const data = result.data || {};
  const needs = Array.isArray(data.needs) ? data.needs.map(String) : profile.needs;
  const hard = Array.isArray(data.hard_constraints)
    ? data.hard_constraints.map(String)
    : profile.hard_constraints;
  let hyps = Array.isArray(data.goal_hypotheses) ? data.goal_hypotheses : [];
  hyps = hyps
    .filter((h) => h && h.goal)
    .slice(0, 3)
    .map((h) => ({
      goal: String(h.goal),
      confidence: clamp01(Number(h.confidence) || 0.5),
      evidence: Array.isArray(h.evidence) ? h.evidence.map(String) : [],
    }));

  // Must be competing — if model returns one, synthesize a counter-hypothesis
  if (hyps.length === 1) {
    const only = hyps[0];
    const alt =
      only.goal === "weight_loss"
        ? "muscle_gain"
        : only.goal === "muscle_gain"
          ? "weight_loss"
          : "fitness";
    hyps.push({
      goal: alt,
      confidence: clamp01(1 - only.confidence),
      evidence: only.evidence.slice(0, 2),
    });
  }
  if (hyps.length === 0) {
    hyps = [
      { goal: "weight_loss", confidence: 0.52, evidence: history.slice(0, 2).map((h) => h.name) },
      { goal: "muscle_gain", confidence: 0.48, evidence: history.slice(0, 2).map((h) => h.name) },
    ];
  }

  profile.needs = needs.length ? needs : profile.needs;
  profile.hard_constraints = [...new Set([...(profile.hard_constraints || []), ...hard])];
  profile.goal_hypotheses = hyps;
  profile.resolved_goal = null;
  profile.cold_read_done = true;
  return { ok: true, profile, ms: result.ms };
}

function clamp01(n) {
  return Math.max(0, Math.min(1, n));
}

function alternateGoal(primary) {
  if (primary === "weight_loss") return "muscle_gain";
  if (primary === "muscle_gain") return "weight_loss";
  if (primary === "fitness") return "weight_loss";
  return "fitness";
}

/** Deterministic cold read when LLM unavailable (keeps demo moving). */
export function coldReadFallback(profile, persona) {
  const needs = [...(persona?.needs || profile.needs || ["protein"])];
  const goals = [...(persona?.goals || ["fitness"])];
  const evidence = (profile.history || []).slice(0, 4).map((h) => h.name);
  const primary = String(goals[0] || "fitness");
  let secondary = String(goals[1] || alternateGoal(primary));
  if (secondary === primary) secondary = alternateGoal(primary);
  profile.needs = needs;
  // Competing hyps from persona goals — probes need two distinct labels.
  profile.goal_hypotheses = [
    { goal: primary, confidence: 0.55, evidence },
    { goal: secondary, confidence: 0.45, evidence: evidence.slice(0, 2) },
  ];
  profile.cold_read_done = true;
  profile.resolved_goal = null;
  return { ok: true, profile, reason: "fallback_cold_read" };
}
