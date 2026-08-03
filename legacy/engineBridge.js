/**
 * Bridge: legacy HTML swipe UI → real recommendation engine (src/engine).
 * Frozen candidates_*.json are the fallback; LLM upgrades when API key is present.
 */

import { createEngine } from "../src/engine/index.js";
import { catalog, getPersonaBundle, DEFAULT_PERSONA_ID } from "../src/data/loadDemoData.js";
import { productImageUrl, cardImageUrl } from "../src/lib/productImage.js";
import { expandCandidates } from "./expandCandidates.js";

/** Soft session cap — cover the demo catalog (~257) with room to extend. */
export const SWIPE_SESSION_CAP = 300;
/** Most hand extensions are local (frozen); every Nth may call LLM. */
export const EXTEND_LLM_EVERY = 3;

const AFFINITY_KEY = "blinkit-swipe-affinity";

let engine = null;
let personaId = DEFAULT_PERSONA_ID;
let busy = false;
let extendCount = 0;
const listeners = new Set();

function loadAffinity(id) {
  try {
    const raw = sessionStorage.getItem(AFFINITY_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (data?.personaId !== id) return null;
    // Scrub baby aisle poison from older sessions (false "Piano Gym" likes)
    if (data.category_weights) {
      delete data.category_weights["Baby Care"];
      delete data.category_weights["Baby Gear"];
    }
    if (data.tag_weights) {
      for (const t of ["baby", "baby_care", "infant", "toddler", "newborn"]) {
        delete data.tag_weights[t];
      }
    }
    if (Array.isArray(data.right_swiped_ids)) {
      data.right_swiped_ids = data.right_swiped_ids.filter((x) => x !== "p00943");
    }
    if (Array.isArray(data.saved_list)) {
      data.saved_list = data.saved_list.filter((x) => (x.product_id || x.id) !== "p00943");
    }
    return data;
  } catch {
    return null;
  }
}

function saveAffinity() {
  if (!engine) return;
  try {
    const st = engine.getState();
    const profile = engine.getProfile?.() || {};
    sessionStorage.setItem(
      AFFINITY_KEY,
      JSON.stringify({
        personaId,
        category_weights: st.category_weights || {},
        tag_weights: st.tag_weights || {},
        resolved_goal: st.resolved_goal || profile.resolved_goal || null,
        accepted_count: st.accepted_count,
        boldness_stage: st.boldness_stage,
        saved_list: st.saved_list || [],
        cart: st.cart || [],
        right_swiped_ids: st.right_swiped_ids || [],
        purchased_ids: st.purchased_ids || [],
        seen_product_ids: st.seen_product_ids || [],
        order_history: engine.getPersona?.()?.order_history || [],
        basket_facts: st.basket_facts || null,
        last_order: st.last_order || null,
      }),
    );
  } catch {
    /* ignore */
  }
}

function personaCandidates(id) {
  const bundle = getPersonaBundle(id);
  return {
    persona: bundle.persona,
    // Engine also expands; pass seeds — full catalog is merged inside createEngine.
    candidates: expandCandidates(bundle.candidates, catalog),
  };
}

function emit() {
  saveAffinity();
  const snap = snapshot();
  for (const fn of listeners) fn(snap);
}

export function onEngineChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function snapshot() {
  if (!engine) return null;
  const st = engine.getState();
  const card = engine.currentCard();
  const livePersona = engine.getPersona?.() || null;
  return {
    personaId,
    persona: livePersona,
    deck: engine.getDeck(),
    state: st,
    current: card
      ? {
          ...card,
          image: productImageUrl(card),
          image_full: productImageUrl(card),
          image_thumb: cardImageUrl(card),
          cat: card.category || card.top_category,
          mrp: Math.round((card.price || 0) * 1.2),
        }
      : null,
    deckSource: st.deck_source,
    llmBusy: busy,
  };
}

/** Live cart, or persisted affinity cart when engine isn't mounted yet. */
export function getCartItems() {
  if (engine) return engine.getState().cart || [];
  try {
    const raw = sessionStorage.getItem(AFFINITY_KEY);
    if (!raw) return [];
    const data = JSON.parse(raw);
    return Array.isArray(data?.cart) ? data.cart : [];
  } catch {
    return [];
  }
}

export async function initEngine(id = DEFAULT_PERSONA_ID, timeWindow = "morning") {
  personaId = id;
  extendCount = 0;
  const { persona, candidates } = personaCandidates(id);
  const saved = loadAffinity(id);
  engine = createEngine({
    persona,
    candidates,
    catalog,
    timeWindow,
    affinity: saved
      ? {
          accepted_count: saved.accepted_count,
          boldness_stage: saved.boldness_stage,
          saved_list: saved.saved_list || [],
          cart: saved.cart || [],
          category_weights: saved.category_weights || {},
          tag_weights: saved.tag_weights || {},
          right_swiped_ids: saved.right_swiped_ids || [],
          purchased_ids: saved.purchased_ids || [],
          seen_product_ids: saved.seen_product_ids || [],
          resolved_goal: saved.resolved_goal || null,
          order_history: saved.order_history || null,
          basket_facts: saved.basket_facts || null,
          last_order: saved.last_order || null,
        }
      : null,
  });
  emit();
  busy = true;
  emit();
  try {
    await engine.rebuildDeckAsync();
  } catch (err) {
    console.warn("[engineBridge] rebuildDeckAsync failed — force frozen deck", err);
    try {
      engine.setForceFallback?.(true);
      await engine.rebuildDeckAsync();
    } catch (err2) {
      console.warn("[engineBridge] frozen rebuild also failed", err2);
    }
  } finally {
    busy = false;
    emit();
  }
  // Stale sessionStorage can burn the whole catalog — wipe browse memory once
  if (!snapshot()?.current) {
    try {
      sessionStorage.removeItem(AFFINITY_KEY);
    } catch {
      /* ignore */
    }
    engine = createEngine({ persona, candidates, catalog, timeWindow });
    emit();
  }
  return snapshot();
}

/**
 * Top up the hand when the current deck runs out.
 * Uses swipe evidence already stored on the profile.
 * Mostly frozen/local rebuilds; every Nth hand asks the LLM.
 */
export async function extendHand({ forceLlm = false } = {}) {
  if (!engine) return null;
  extendCount += 1;
  const useLlm = forceLlm || extendCount % EXTEND_LLM_EVERY === 0;
  busy = true;
  emit();
  try {
    if (useLlm) {
      await engine.newSessionAsync();
    } else {
      engine.newSession();
    }
  } finally {
    busy = false;
    emit();
  }
  return snapshot();
}

/** Explicit “smarter picks from my swipes” — always tries LLM then fallback. */
export async function nextHandFromSwipes() {
  return extendHand({ forceLlm: true });
}

export function peekUpcomingImages(limit = 4) {
  if (!engine) return [];
  const deck = engine.getDeck();
  const cards = deck.cards || [];
  const cursor = deck.cursor || 0;
  return cards
    .slice(cursor, cursor + limit)
    .map((c) => productImageUrl(c, c.image_url))
    .filter(Boolean);
}

export function getEngine() {
  return engine;
}

export function simulatePriceDrop(productId, newPrice) {
  if (!engine) return { ok: false, reason: "no_engine" };
  const result = engine.simulatePriceDrop(productId, newPrice);
  emit();
  return result;
}

export function checkFreeDeliveryMatch() {
  if (!engine) return { ok: false, match: null };
  const result = engine.checkFreeDeliveryMatch();
  emit();
  return result;
}

export function acceptMatch() {
  if (!engine) return { ok: false, reason: "no_engine" };
  const result = engine.acceptMatch();
  emit();
  return result;
}

export function dismissMatch() {
  if (!engine) return { ok: false, reason: "no_engine" };
  const result = engine.dismissMatch();
  emit();
  return result;
}

export function removeFromCart(productId) {
  if (engine) {
    const result = engine.removeFromCart(productId);
    emit();
    return result;
  }
  // Persist-only path when browsing pages that never called initEngine.
  try {
    const raw = sessionStorage.getItem(AFFINITY_KEY);
    if (!raw) return { ok: false, reason: "no_cart" };
    const data = JSON.parse(raw);
    const before = data.cart?.length || 0;
    data.cart = (data.cart || []).filter((c) => c.product_id !== productId);
    if (data.cart.length === before) return { ok: false, reason: "not_in_cart" };
    sessionStorage.setItem(AFFINITY_KEY, JSON.stringify(data));
    for (const fn of listeners) fn(null);
    return { ok: true };
  } catch {
    return { ok: false, reason: "storage" };
  }
}

export async function adjustCartQty(productId, delta = 1) {
  await ensureEngine();
  if (!engine) return { ok: false, reason: "no_engine" };
  const result = engine.adjustCartQty(productId, delta);
  emit();
  return result;
}

/** Units in cart for one product (0 if absent). */
export function cartQtyFor(productId) {
  const item = getCartItems().find((c) => c.product_id === productId);
  return item ? Math.max(1, Number(item.qty) || 1) : 0;
}

/** Ensure engine is warm (search page / secondary screens). */
export async function ensureEngine(id = personaId || DEFAULT_PERSONA_ID) {
  if (engine) return snapshot();
  return initEngine(id);
}

/** Checkout / cart commit — live order write-back + deck refresh. */
export async function placeOrder(opts = {}) {
  await ensureEngine();
  if (!engine) return { ok: false, reason: "no_engine" };
  busy = true;
  emit();
  let result;
  try {
    result = await engine.placeOrderAsync({
      source: opts.source || "checkout",
      items: opts.items || null,
      bumpAccepted: opts.bumpAccepted ?? false,
    });
  } finally {
    busy = false;
    emit();
  }
  return result;
}

/**
 * Record typed search as a strong recommendation signal.
 * @param {{ query?: string, productId?: string|null, action?: 'submit'|'open'|'add'|'typeahead' }} opts
 */
export async function recordSearch(opts = {}) {
  await ensureEngine();
  if (!engine) return { ok: false, reason: "no_engine" };
  const result = engine.recordSearch(opts);
  emit();
  return result;
}

/** Map legacy swipe kinds → engine actions */
export function swipe(kind) {
  if (!engine) return { ok: false, reason: "no_engine" };
  let result;
  if (kind === "skip") result = engine.swipeLeft();
  else if (kind === "save") result = engine.swipeRight();
  else if (kind === "add") result = engine.swipeTop();
  else return { ok: false, reason: "bad_kind" };

  const toast =
    kind === "skip"
      ? "Okay, moving on"
      : kind === "save"
        ? "Saved. We'll tell you if the price drops"
        : "Added to cart";

  emit();
  const deck = engine.getDeck();
  return {
    ok: result?.ok !== false,
    toast,
    finished: deck.done || deck.empty,
    accepted: kind !== "skip",
    result,
    order: result?.order || null,
  };
}

export async function newSession() {
  if (!engine) return null;
  busy = true;
  emit();
  try {
    await engine.newSessionAsync();
  } finally {
    busy = false;
    emit();
  }
  return snapshot();
}

export async function switchPersona(id) {
  const { persona, candidates } = personaCandidates(id);
  personaId = id;
  if (!engine) return initEngine(id);
  engine = engine.switchPersona(persona, candidates, catalog);
  emit();
  busy = true;
  emit();
  try {
    await engine.rebuildDeckAsync();
  } finally {
    busy = false;
    emit();
  }
  return snapshot();
}
