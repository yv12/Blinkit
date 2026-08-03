/**
 * CODE validation after every LLM deck response — before rendering.
 * Spec: llm-recommendation-spec.md Validation 1–5
 */

import { STAGE_SLOTS, RETREAT_SLOTS, LOW_PRICE_MAX } from "./constants.js";
import { buildDeck, isEligible } from "./allocator.js";
import { ensureTinderBio } from "../lib/tinderBio.js";
import { needsProbeSlot, pickProbeCard, placeProbeInHand } from "./probe.js";
import { allowsDietProduct, resolveDietMode } from "../lib/dietProfile.js";

const HISTORY_NAME_NORM = (s) =>
  String(s || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

function historyNames(persona) {
  return (persona?.order_history || []).map((h) => HISTORY_NAME_NORM(h.name));
}

function anchorInHistory(anchor, histNames) {
  const a = HISTORY_NAME_NORM(anchor);
  if (!a) return false;
  return histNames.some((h) => h.includes(a) || a.includes(h) || h.split(" ").some((w) => w.length > 3 && a.includes(w)));
}

/**
 * Validate LLM cards; drop violators; backfill from frozen candidates if mix is short.
 * @returns {{ cards: object[], source: 'llm'|'fallback'|'llm+fallback', drops: string[] }}
 */
export function validateAndFinalizeDeck({
  llmCards = [],
  allowedById,
  persona,
  candidates,
  catalogById,
  state,
  now = Date.now(),
  profile = null,
} = {}) {
  const drops = [];
  const histNames = historyNames(persona);
  const dietMode = profile?.diet_mode || resolveDietMode(persona, state, catalogById).mode;
  const vegOnly = dietMode === "veg" || !!persona?.constraints?.veg_only;
  const distrust = new Set(persona?.constraints?.distrusted_top_categories || []);
  const stage = state?.boldness_stage ?? 0;
  const slots = state?.retreat_next_deck ? RETREAT_SLOTS : STAGE_SLOTS[stage] || STAGE_SLOTS[0];

  const valid = [];
  for (const raw of llmCards || []) {
    const id = raw.product_id || raw.id;
    if (!id || !allowedById?.has?.(id)) {
      drops.push(`not_allowed:${id}`);
      continue;
    }
    const allowed = allowedById.get(id);
    const cat = catalogById?.get?.(id);
    const anchors = raw.anchor_items || raw.anchors || [];
    if (!Array.isArray(anchors) || anchors.length === 0) {
      drops.push(`no_anchors:${id}`);
      continue;
    }
    if (!anchors.every((a) => anchorInHistory(a, histNames))) {
      drops.push(`bad_anchor:${id}`);
      continue;
    }
    if (!raw.bridge || String(raw.bridge).trim().length < 8) {
      drops.push(`no_bridge:${id}`);
      continue;
    }
    if (!allowsDietProduct(dietMode, cat || allowed)) {
      drops.push(`diet:${id}`);
      continue;
    }
    if (vegOnly && (allowed.veg_flag === false || cat?.veg_flag === false)) {
      drops.push(`veg:${id}`);
      continue;
    }
    if (
      !isEligible(
        { ...allowed, product_id: id, bridge: raw.bridge || allowed.bridge },
        { state, persona, catalogById, now, dietMode },
      )
    ) {
      drops.push(`ineligible:${id}`);
      continue;
    }
    const top = allowed.top_category || cat?.top_category;
    if (top && distrust.has(top)) {
      drops.push(`distrust:${id}`);
      continue;
    }
    // Stage-0 / retreat: prefer cheap cards; only hard-drop expensive probe-tagged items
    if (
      slots.lowPrice &&
      (raw.probe_goal || String(raw.level || "").toUpperCase() === "L3") &&
      (allowed.price || 0) > LOW_PRICE_MAX
    ) {
      drops.push(`price:${id}`);
      continue;
    }

    valid.push({
      product_id: id,
      name: allowed.name || cat?.name || raw.name,
      category: allowed.category || cat?.category,
      top_category: top,
      price: allowed.price ?? cat?.price,
      level: raw.level || "L2",
      shared_tag: raw.shared_tag || "protein",
      tag_type: raw.tag_type || "need",
      bridge: String(raw.bridge).trim(),
      bio: ensureTinderBio({
        ...allowed,
        product_id: id,
        name: allowed.name || cat?.name || raw.name,
        bio: raw.bio,
        need_tags: allowed.need_tags || cat?.need_tags,
        goal_tags: allowed.goal_tags || cat?.goal_tags,
        shared_tag: raw.shared_tag,
      }),
      confidence: Number(raw.confidence) || 0.75,
      veg_flag: allowed.veg_flag !== false,
      time_tags: allowed.time_tags || cat?.time_tags || ["anytime"],
      need_tags: allowed.need_tags || cat?.need_tags || [],
      goal_tags: allowed.goal_tags || cat?.goal_tags || [],
      image_url: allowed.image_url || cat?.image_url,
      in_stock: true,
      anchor_items: anchors,
      source: "llm",
      is_probe: !!raw.probe_goal || !!raw.is_probe,
      probe_goal: raw.probe_goal || null,
    });
  }

  // Enforce level mix — keep valid, backfill from frozen allocator
  const need = { L2: slots.L2, L3: slots.L3, L4: slots.L4 };
  const picked = [];
  const used = new Set();
  for (const lvl of ["L2", "L3", "L4"]) {
    const pool = valid.filter((c) => c.level === lvl && !used.has(c.product_id));
    for (const c of pool) {
      if (picked.filter((x) => x.level === lvl).length >= need[lvl]) break;
      picked.push(c);
      used.add(c.product_id);
    }
  }

  let source = picked.length ? "llm" : "fallback";
  const short = ["L2", "L3", "L4"].some(
    (lvl) => picked.filter((c) => c.level === lvl).length < need[lvl],
  );

  if (short || picked.length === 0) {
    const frozen = buildDeck({
      candidates,
      persona,
      catalogById,
      state,
      now,
      profile,
    });
    for (const c of frozen) {
      if (used.has(c.product_id)) continue;
      const lvl = c.level || "L2";
      const have = picked.filter((x) => x.level === lvl).length;
      if (have >= need[lvl]) continue;
      picked.push({ ...c, source: "fallback" });
      used.add(c.product_id);
      source = picked.some((x) => x.source === "llm") ? "llm+fallback" : "fallback";
    }
  }

  // Order by stage mix preference
  let order = [];
  for (const lvl of ["L2", "L3", "L4"]) {
    order.push(...picked.filter((c) => c.level === lvl));
  }

  // Guarantee one persona-building probe when goals are unresolved
  if (needsProbeSlot(profile) && !order.some((c) => c.is_probe || c.probe_goal)) {
    const probe = pickProbeCard(candidates, profile, {
      lowPrice: !!slots.lowPrice,
      used: new Set(order.map((c) => c.product_id)),
    });
    if (probe) {
      // Keep hand size — drop last non-L2 if needed
      if (order.length >= (slots.L2 || 0) + (slots.L3 || 0) + (slots.L4 || 0)) {
        order = order.slice(0, -1);
      }
      order = placeProbeInHand(order, { ...probe, source: probe.source || "probe" }, { after: 2 });
    }
  } else if (order.some((c) => c.is_probe || c.probe_goal)) {
    const probeIdx = order.findIndex((c) => c.is_probe || c.probe_goal);
    const probe = { ...order[probeIdx], is_probe: true };
    order = placeProbeInHand(
      order.filter((_, i) => i !== probeIdx),
      probe,
      { after: 2 },
    );
  }

  return { cards: order, source, drops };
}
