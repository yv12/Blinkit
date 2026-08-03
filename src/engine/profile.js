/**
 * Per-user profile — account memory passed into every LLM call.
 * Spec: Docs/llm-recommendation-spec.md
 */

import { DIET, resolveDietMode } from "../lib/dietProfile.js";

export function createProfileFromPersona(persona, { catalogById = null, state = null } = {}) {
  const constraints = persona?.constraints || {};
  const diet = resolveDietMode(persona, state, catalogById);
  const hard = [];
  if (constraints.veg_only || diet.mode === DIET.VEG) hard.push("veg_only");
  if (diet.mode === DIET.EGGETARIAN) hard.push("eggetarian");
  if (constraints.price_sensitive) hard.push("price_sensitive_soft");

  const history = (persona?.order_history || []).map((h) => ({
    id: h.product_id || h.id,
    name: h.name,
    category: h.category,
    top_category: h.top_category,
    price: h.price,
  }));

  return {
    user_id: persona?.id || "unknown",
    history,
    hard_constraints: hard,
    diet_mode: diet.mode,
    diet_evidence: diet.evidence,
    excluded_categories: [...(constraints.distrusted_top_categories || [])],
    needs: [...(persona?.needs || [])],
    goal_hypotheses: [],
    resolved_goal: null,
    boldness_stage: persona?.state?.boldness_stage ?? 0,
    saved_list: [],
    cart: [],
    hidden_products: {},
    category_backoffs: {},
    evidence_log: [],
    cold_read_done: false,
  };
}

/** Sync swipe/engine state fields the LLM needs into the profile. */
export function syncProfileFromEngineState(profile, state, { persona = null, catalogById = null } = {}) {
  if (!profile || !state) return profile;
  profile.boldness_stage = state.boldness_stage ?? 0;
  profile.saved_list = (state.saved_list || []).map((s) => ({
    id: s.product_id,
    name: s.name,
    category: s.category,
  }));
  profile.cart = (state.cart || []).map((c) => ({
    id: c.product_id,
    name: c.name,
    price: c.price,
  }));
  profile.hidden_products = { ...(state.hidden_products || {}) };
  profile.category_backoffs = Object.fromEntries(
    [...(state.backed_off_categories || [])].map((c) => [c, true]),
  );
  if (persona) {
    const diet = resolveDietMode(persona, state, catalogById);
    profile.diet_mode = diet.mode;
    profile.diet_evidence = diet.evidence;
    const hard = new Set(profile.hard_constraints || []);
    hard.delete("veg_only");
    hard.delete("eggetarian");
    if (diet.mode === DIET.VEG) hard.add("veg_only");
    if (diet.mode === DIET.EGGETARIAN) hard.add("eggetarian");
    profile.hard_constraints = [...hard];
  }
  return profile;
}
