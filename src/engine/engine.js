import {
  CATEGORY_BACKOFF_LEFTS,
  FREE_DELIVERY_GAP,
  FREE_DELIVERY_THRESHOLD,
  HAND_CATEGORY_LEFT_PRUNE,
  LEFT_HIDE_DAYS,
  MS_PER_DAY,
  SAVED_LIST_CAP,
  timeWindowFromDate,
} from "./constants.js";
import { buildDeck, cartTotal, isEligible, rankScore } from "./allocator.js";
import {
  cloneStateSnapshot,
  createInitialState,
  restoreStateSnapshot,
  syncBoldnessStage,
} from "./state.js";
import { createProfileFromPersona, syncProfileFromEngineState } from "./profile.js";
import { buildAllowedList } from "./allowedList.js";
import { validateAndFinalizeDeck } from "./validateDeck.js";
import { runColdRead, coldReadFallback } from "./coldRead.js";
import { generateDeckWithLlm, deckCacheKey } from "./deckLlm.js";
import { applyEvidence, decayEvidence } from "./hypothesis.js";
import { getRuntimeLlmConfig } from "./llmClient.js";
import { productImageUrl } from "../lib/productImage.js";
import { expandCandidates } from "../lib/expandCandidates.js";
import { ensureTinderBio } from "../lib/tinderBio.js";
import { isLadderProduct, ladderUnlocked } from "../lib/ladderBoost.js";
import { queryIntentSignals } from "../lib/productSearch.js";
import { resolveDietMode } from "../lib/dietProfile.js";
import {
  applyJustOrderedBridges,
  buildBasketFacts,
} from "../lib/orderFeedback.js";

function catalogIndex(catalog = []) {
  return new Map(catalog.map((p) => [p.id, p]));
}

/** Update category + tag affinity from a swipe / search (mood / likes / dislikes). */
function applyAffinity(state, card, kind) {
  if (!card) return;
  const delta =
    kind === "top"
      ? 2
      : kind === "search"
        ? 1.5
        : kind === "search_query"
          ? 0.8
          : kind === "right"
            ? 1
            : -1.2;
  if (card.category) {
    state.category_weights[card.category] = (state.category_weights[card.category] || 0) + delta;
  }
  if (card.top_category) {
    state.category_weights[card.top_category] =
      (state.category_weights[card.top_category] || 0) + delta * 0.4;
  }
  state.tag_weights = state.tag_weights || {};
  for (const t of [...(card.need_tags || []), ...(card.goal_tags || []), card.shared_tag].filter(Boolean)) {
    const key = String(t).toLowerCase();
    state.tag_weights[key] = (state.tag_weights[key] || 0) + delta;
  }
}

/** Add or increment a cart line (qty). Returns the line. */
function upsertCartLine(state, line) {
  const existing = state.cart.find((c) => c.product_id === line.product_id);
  if (existing) {
    existing.qty = Math.max(1, Number(existing.qty) || 1) + 1;
    return { line: existing, created: false };
  }
  const created = { ...line, qty: 1 };
  state.cart.push(created);
  return { line: created, created: true };
}

function asCard(candidate) {
  return {
    product_id: candidate.product_id,
    name: candidate.name,
    category: candidate.category,
    top_category: candidate.top_category,
    price: candidate.price,
    level: candidate.level,
    shared_tag: candidate.shared_tag,
    tag_type: candidate.tag_type,
    bridge: candidate.bridge,
    bio: ensureTinderBio(candidate),
    confidence: candidate.confidence,
    veg_flag: candidate.veg_flag,
    time_tags: [...(candidate.time_tags || [])],
    need_tags: [...(candidate.need_tags || [])],
    goal_tags: [...(candidate.goal_tags || [])],
    image_url: productImageUrl(candidate),
    in_stock: candidate.in_stock !== false,
    is_probe: !!candidate.is_probe,
    probe_goal: candidate.probe_goal || null,
  };
}

/**
 * Recommendation engine — rules sandwich.
 * Primary: runtime LLM deck. Fallback: frozen candidates_*.json (always).
 */
export function createEngine({
  persona: personaInput,
  candidates,
  catalog = [],
  now = () => Date.now(),
  timeWindow = null,
  /** Optional session restore: category/tag weights, cart, seen ids, etc. */
  affinity = null,
} = {}) {
  if (!personaInput) throw new Error("persona required");
  if (!Array.isArray(candidates)) throw new Error("candidates required");

  // Full catalog in the pool — frozen seeds stay preferred; swipes teach mood.
  const pool = expandCandidates(candidates, catalog);
  const catalogById = catalogIndex(catalog);
  // Mutable persona so live orders write back into order_history / basket_facts
  let persona = {
    ...personaInput,
    order_history: [...(personaInput.order_history || [])].map((h) => ({ ...h })),
    basket_facts: personaInput.basket_facts ? { ...personaInput.basket_facts } : null,
    constraints: { ...(personaInput.constraints || {}) },
  };
  if (affinity?.order_history?.length) {
    persona.order_history = affinity.order_history.map((h) => ({ ...h }));
  }
  if (affinity?.basket_facts) {
    persona.basket_facts = { ...affinity.basket_facts };
  }
  const state = createInitialState(persona, {
    time_window: timeWindow || "morning",
    ...(affinity || {}),
  });
  state.basket_facts = persona.basket_facts;
  state.last_order = affinity?.last_order || null;
  let profile = createProfileFromPersona(persona, { catalogById, state });
  if (affinity?.resolved_goal) profile.resolved_goal = affinity.resolved_goal;
  // Sync path (no live LLM): seed competing goals so probe slots can build persona.
  if (!profile.cold_read_done) {
    coldReadFallback(profile, persona);
  }
  const deckCache = new Map();
  let lastDeckSource = "fallback";
  let forceFallback = false;

  function currentNow() {
    return typeof now === "function" ? now() : now;
  }

  function markSeen(productId) {
    if (!productId) return;
    state.seen_product_ids.add(productId);
  }

  /**
   * Never re-deal prior hand cards.
   * Skip on cold init (cursor 0, no interaction) so the seed deck isn't burned
   * before the user sees it when LLM upgrades on load.
   */
  function retireCurrentHand() {
    if (!state.session_interacted) {
      for (let i = 0; i < state.deck_cursor; i++) {
        markSeen(state.deck[i]?.product_id);
      }
      return;
    }
    for (const c of state.deck || []) {
      markSeen(c.product_id);
    }
  }

  function eligibilityCtx() {
    return {
      state,
      persona,
      catalogById,
      now: currentNow(),
      dietMode: profile?.diet_mode || resolveDietMode(persona, state, catalogById).mode,
    };
  }

  function rankScoreFor(c) {
    const window = state.session_locked_window || state.time_window || "morning";
    return rankScore(c, state, window, profile);
  }

  /** If the session burned the whole catalog, clear browse memory and redeal. */
  function recoverIfEmptyDeck(cards) {
    if (cards.length > 0) return cards;
    if (!state.seen_product_ids?.size) return cards;
    state.seen_product_ids.clear();
    return buildDeck({
      candidates: pool,
      persona,
      catalogById,
      state,
      now: currentNow(),
      profile,
    }).map(asCard);
  }

  /** Frozen candidate path — always available. */
  function rebuildDeckFallback() {
    expireHidden();
    retireCurrentHand();
    syncBoldnessStage(state);
    state.session_locked_window = state.time_window;
    let cards = buildDeck({
      candidates: pool,
      persona,
      catalogById,
      state,
      now: currentNow(),
      profile,
    }).map(asCard);
    cards = recoverIfEmptyDeck(cards);
    state.deck = cards;
    state.deck_cursor = 0;
    state.session_interacted = false;
    state.undo = null;
    state.retreat_next_deck = false;
    state.hand_category_lefts = {};
    lastDeckSource = "fallback";
    return getDeck();
  }

  /**
   * Local hand rule (no LLM): after HAND_CATEGORY_LEFT_PRUNE lefts on a category
   * in this hand, drop remaining same-category cards and backfill from frozen candidates.
   */
  function pruneCategoryFromHand(category) {
    if (!category) return { removed: 0, backfilled: 0 };
    const head = state.deck.slice(0, state.deck_cursor + 1);
    const tail = state.deck.slice(state.deck_cursor + 1);
    const keptTail = tail.filter((c) => c.category !== category);
    const removed = tail.length - keptTail.length;
    if (removed === 0) {
      state.deck = [...head, ...keptTail];
      return { removed: 0, backfilled: 0 };
    }

    const targetLen = state.deck.length;
    const used = new Set([...head, ...keptTail].map((c) => c.product_id));
    const fill = [];
    const allowLadder = ladderUnlocked(state.tag_weights || {}, state.resolved_goal);
    const ranked = [...pool]
      .filter(
        (c) =>
          c.category !== category &&
          !used.has(c.product_id) &&
          isEligible(c, eligibilityCtx()) &&
          (allowLadder || !isLadderProduct(c)),
      )
      .sort(
        (a, b) =>
          rankScoreFor(b) - rankScoreFor(a),
      );

    for (const c of ranked) {
      if (head.length + keptTail.length + fill.length >= targetLen) break;
      fill.push(asCard(c));
      used.add(c.product_id);
    }

    state.deck = [...head, ...keptTail, ...fill];
    return { removed, backfilled: fill.length };
  }

  /** Sync alias used by existing call sites / tests. */
  function rebuildDeck() {
    return rebuildDeckFallback();
  }

  /**
   * LLM sandwich: cold read (once) → allowed list → LLM deck → validate.
   * On any failure → frozen fallback silently.
   */
  async function rebuildDeckAsync() {
    expireHidden();
    retireCurrentHand();
    syncBoldnessStage(state);
    decayEvidence(profile, currentNow());
    syncProfileFromEngineState(profile, state, { persona, catalogById });
    state.session_locked_window = state.time_window;

    const cfg = getRuntimeLlmConfig();
    if (forceFallback || !cfg.enabled) {
      // Hand already retired above — build only (avoid double retire).
      syncBoldnessStage(state);
      state.session_locked_window = state.time_window;
      let cards = buildDeck({
        candidates: pool,
        persona,
        catalogById,
        state,
        now: currentNow(),
        profile,
      }).map(asCard);
      cards = recoverIfEmptyDeck(cards);
      state.deck = cards;
      state.deck_cursor = 0;
      state.session_interacted = false;
      state.undo = null;
      state.retreat_next_deck = false;
      state.hand_category_lefts = {};
      lastDeckSource = "fallback";
      return getDeck();
    }

    const cacheKey = deckCacheKey(profile, state, state.time_window);
    if (deckCache.has(cacheKey)) {
      const fresh = deckCache
        .get(cacheKey)
        .filter((c) => isEligible(c, eligibilityCtx()))
        .map(asCard);
      if (fresh.length >= 3) {
        state.deck = fresh;
        state.deck_cursor = 0;
        state.session_interacted = false;
        state.undo = null;
        state.retreat_next_deck = false;
        state.hand_category_lefts = {};
        lastDeckSource = "cache";
        return getDeck();
      }
      deckCache.delete(cacheKey);
    }

    if (!profile.cold_read_done) {
      const cold = await runColdRead(profile);
      if (!cold.ok) coldReadFallback(profile, persona);
    }

    const { allowed, byId: allowedById } = buildAllowedList({
      catalog,
      persona,
      state,
      catalogById,
      profile,
      maxItems: Math.max(catalog.length || 0, pool.length, 90),
    });

    const llm = await generateDeckWithLlm({
      profile,
      allowed,
      state,
      timeWindow: state.time_window,
    });

    let finalized;
    try {
      finalized = validateAndFinalizeDeck({
        llmCards: llm.ok ? llm.cards : [],
        allowedById,
        persona,
        candidates: pool,
        catalogById,
        state,
        now: currentNow(),
        profile,
      });
    } catch (err) {
      console.warn("[engine] validateAndFinalizeDeck failed — frozen fallback", err);
      return rebuildDeckFallback();
    }

    let cards = finalized.cards.map(asCard);
    cards = recoverIfEmptyDeck(cards);
    state.deck = cards;
    state.deck_cursor = 0;
    state.session_interacted = false;
    state.undo = null;
    state.retreat_next_deck = false;
    state.hand_category_lefts = {};
    lastDeckSource = finalized.source;
    if (cards.length) {
      deckCache.set(cacheKey, cards.map((c) => ({ ...c })));
    }
    return getDeck();
  }

  function expireHidden() {
    const t = currentNow();
    for (const [id, until] of Object.entries(state.hidden_products)) {
      if (until <= t) {
        delete state.hidden_products[id];
        // Left cooldown ended — product may return on a later visit
        state.seen_product_ids.delete(id);
      }
    }
  }

  function currentCard() {
    if (state.deck_cursor >= state.deck.length) return null;
    return state.deck[state.deck_cursor];
  }

  function getDeck() {
    return {
      cards: state.deck.slice(),
      cursor: state.deck_cursor,
      remaining: Math.max(0, state.deck.length - state.deck_cursor),
      empty: state.deck.length === 0,
      done: state.deck_cursor >= state.deck.length,
      stage: state.boldness_stage,
      time_window: state.session_locked_window || state.time_window,
      end_message:
        state.deck.length === 0
          ? "Nothing honest to show right now — come back tomorrow."
          : "That's it for today — come back tomorrow.",
    };
  }

  function beginAction(card) {
    if (state.processing) return { ok: false, reason: "busy" };
    if (!card) return { ok: false, reason: "no_card" };
    state.processing = true;
    state.session_interacted = true;
    state.undo = {
      snapshot: cloneStateSnapshot(state),
      card: { ...card },
      at: currentNow(),
    };
    return { ok: true };
  }

  function endAction(result) {
    if (result?.card?.product_id) markSeen(result.card.product_id);
    state.processing = false;
    state.deck_cursor += 1;
    // Mid-hand: drop any later duplicate of a card already shown
    const seen = state.seen_product_ids;
    if (state.deck_cursor < state.deck.length) {
      state.deck = [
        ...state.deck.slice(0, state.deck_cursor),
        ...state.deck.slice(state.deck_cursor).filter((c) => !seen.has(c.product_id)),
      ];
    }
    return result;
  }

  function pushSaved(card) {
    state.saved_list = state.saved_list.filter((x) => x.product_id !== card.product_id);
    state.saved_list.push({
      product_id: card.product_id,
      name: card.name,
      price: card.price,
      category: card.category,
      top_category: card.top_category,
      image_url: card.image_url,
      bio: card.bio,
      saved_at: currentNow(),
    });
    while (state.saved_list.length > SAVED_LIST_CAP) state.saved_list.shift();
  }

  function swipeLeft() {
    const card = currentCard();
    const gate = beginAction(card);
    if (!gate.ok) return gate;

    const hideUntil = currentNow() + LEFT_HIDE_DAYS * MS_PER_DAY;
    state.hidden_products[card.product_id] = hideUntil;
    state.consecutive_dismissals += 1;

    const cat = card.category;
    state.category_left_counts[cat] = (state.category_left_counts[cat] || 0) + 1;
    if (state.category_left_counts[cat] >= CATEGORY_BACKOFF_LEFTS) {
      state.backed_off_categories.add(cat);
    }

    state.hand_category_lefts = state.hand_category_lefts || {};
    state.hand_category_lefts[cat] = (state.hand_category_lefts[cat] || 0) + 1;
    let handPrune = null;
    if (state.hand_category_lefts[cat] >= HAND_CATEGORY_LEFT_PRUNE) {
      handPrune = pruneCategoryFromHand(cat);
    }

    if (state.consecutive_dismissals >= 2) {
      state.retreat_debt += 1;
      syncBoldnessStage(state);
      state.retreat_next_deck = true;
      state.consecutive_dismissals = 0;
    }

    applyAffinity(state, card, "left");
    applyEvidence(profile, "left", card);
    return endAction({
      ok: true,
      action: "left",
      card,
      stage: state.boldness_stage,
      hand_prune: handPrune,
    });
  }

  function swipeRight() {
    const card = currentCard();
    const gate = beginAction(card);
    if (!gate.ok) return gate;

    state.consecutive_dismissals = 0;
    state.right_swiped_ids.add(card.product_id);
    pushSaved(card);
    applyAffinity(state, card, "right");
    applyEvidence(profile, "right", card);

    return endAction({ ok: true, action: "right", card, saved_list: state.saved_list.slice() });
  }

  function swipeTop() {
    const card = currentCard();
    const gate = beginAction(card);
    if (!gate.ok) return gate;

    state.consecutive_dismissals = 0;
    // Always add to cart on swipe-up
    upsertCartLine(state, {
      product_id: card.product_id,
      name: card.name,
      price: card.price,
      category: card.category,
      top_category: card.top_category,
      image_url: card.image_url,
      added_via: "top",
    });
    applyAffinity(state, card, "top");
    applyEvidence(profile, "top", card);

    // Live rec write-back (history + rails) — keep the cart line
    const order = placeOrder({
      items: [
        {
          product_id: card.product_id,
          name: card.name,
          price: card.price,
          category: card.category,
          top_category: card.top_category,
          image_url: card.image_url,
          qty: 1,
          added_via: "top",
        },
      ],
      source: "top_swipe",
      bumpAccepted: true,
      rebuild: true,
      keepInCart: true,
    });
    // placeOrder rebuilt deck at cursor 0; endAction will +1 — park at -1
    state.deck_cursor = -1;

    return endAction({
      ok: true,
      action: "top",
      card,
      cart_count: state.cart.length,
      stage: state.boldness_stage,
      order,
    });
  }

  /**
   * Undo last swipe. Undoing top removes from cart WITHOUT Saved downgrade.
   */
  function undo() {
    if (!state.undo) return { ok: false, reason: "no_undo" };
    const { snapshot, card } = state.undo;
    // Move cursor back to the undone card
    const idx = state.deck.findIndex((c) => c.product_id === card.product_id);
    restoreStateSnapshot(state, snapshot);
    if (idx >= 0) state.deck_cursor = idx;
    state.undo = null;
    state.processing = false;
    return { ok: true, card };
  }

  function newSession() {
    if (!state.session_interacted) {
      state.ignored_sessions += 1;
      if (state.ignored_sessions >= 3) state.home_card_suppressed = true;
    } else {
      state.ignored_sessions = 0;
    }
    syncBoldnessStage(state);
    return { ok: true, deck: rebuildDeckFallback(), stage: state.boldness_stage };
  }

  async function newSessionAsync() {
    if (!state.session_interacted) {
      state.ignored_sessions += 1;
      if (state.ignored_sessions >= 3) state.home_card_suppressed = true;
    } else {
      state.ignored_sessions = 0;
    }
    syncBoldnessStage(state);
    const deck = await rebuildDeckAsync();
    return { ok: true, deck, stage: state.boldness_stage, source: lastDeckSource };
  }

  function setTimeWindow(window) {
    state.time_window = window;
    return { ok: true, time_window: window };
  }

  function setTimeWindowFromDate(date) {
    return setTimeWindow(timeWindowFromDate(date));
  }

  /**
   * Write-back loop: order → order_history + basket_facts → rebuild deck/rails.
   * @param {{ keepInCart?: boolean }} [opts] — top-swipe keeps the cart line; checkout clears it.
   */
  function placeOrder({
    items = null,
    source = "checkout",
    bumpAccepted = false,
    rebuild = true,
    keepInCart = false,
  } = {}) {
    const lines = (items && items.length ? items : state.cart.map((c) => ({ ...c }))).filter(
      (l) => l?.product_id,
    );
    if (!lines.length) return { ok: false, reason: "empty_cart" };

    const ts = currentNow();
    const appended = [];
    const touchedIds = new Set();

    for (const line of lines) {
      const id = line.product_id;
      touchedIds.add(id);
      const catItem = catalogById.get(id);
      const cand = pool.find((c) => c.product_id === id);

      // Checkout after swipe-up: already in order_history — don't duplicate
      const alreadyRecorded = persona.order_history.some((h) => h.product_id === id);
      if (alreadyRecorded && source === "checkout") {
        continue;
      }

      const entry = {
        product_id: id,
        name: line.name || cand?.name || catItem?.name,
        category: line.category || cand?.category || catItem?.category,
        top_category: line.top_category || cand?.top_category || catItem?.top_category,
        price: line.price ?? cand?.price ?? catItem?.price,
        unit: line.unit || catItem?.unit || "",
        qty: Math.max(1, Number(line.qty) || 1),
        ordered_at: ts,
        source,
        added_via: line.added_via || source,
      };
      persona.order_history.push(entry);
      appended.push(entry);

      state.purchased_ids.add(id);
      delete state.hidden_products[id];

      const cardLike = {
        product_id: id,
        name: entry.name,
        category: entry.category,
        top_category: entry.top_category,
        need_tags: cand?.need_tags || catItem?.need_tags || [],
        goal_tags: cand?.goal_tags || catItem?.goal_tags || [],
        shared_tag: cand?.shared_tag,
      };
      applyEvidence(profile, "purchase", cardLike);
      if (source !== "top_swipe") {
        // top-swipe already applied affinity in swipeTop
        applyAffinity(state, cardLike, "top");
      }

      if (entry.category && state.category_left_counts[entry.category]) {
        state.category_left_counts[entry.category] = Math.max(
          0,
          state.category_left_counts[entry.category] - 1,
        );
        if (state.category_left_counts[entry.category] < CATEGORY_BACKOFF_LEFTS) {
          state.backed_off_categories.delete(entry.category);
        }
      }
    }

    if (!keepInCart) {
      state.cart = state.cart.filter((c) => !touchedIds.has(c.product_id));
    } else {
      // Ensure swipe-up lines stay / appear in cart
      for (const line of lines) {
        if (!state.cart.some((c) => c.product_id === line.product_id)) {
          upsertCartLine(state, {
            product_id: line.product_id,
            name: line.name,
            price: line.price,
            category: line.category,
            top_category: line.top_category,
            image_url: line.image_url,
            added_via: line.added_via || "top",
          });
        }
      }
    }
    state.saved_list = state.saved_list.filter((c) => !touchedIds.has(c.product_id));
    state.pending_match = null;

    state.consecutive_dismissals = 0;
    if (bumpAccepted) {
      state.accepted_count += Math.max(1, appended.length || lines.length);
    } else if (source === "checkout") {
      const fromRec = appended.filter((a) => a.added_via === "top" || a.added_via === "match");
      if (fromRec.length) state.accepted_count += fromRec.length;
    }
    syncBoldnessStage(state);

    const diet = resolveDietMode(persona, state, catalogById);
    persona.basket_facts = buildBasketFacts(
      persona.order_history,
      persona.constraints,
      diet.mode,
    );
    state.basket_facts = persona.basket_facts;
    if (appended.length) {
      state.last_order = { at: ts, source, items: appended.map((a) => ({ ...a })) };
    }

    profile.history = persona.order_history.map((h) => ({
      id: h.product_id || h.id,
      name: h.name,
      category: h.category,
      top_category: h.top_category,
      price: h.price,
    }));
    syncProfileFromEngineState(profile, state, { persona, catalogById });
    deckCache.clear();

    let deck = null;
    if (rebuild && (appended.length || source === "checkout")) {
      const preserveUndo = state.undo;
      deck = rebuildDeckFallback();
      state.undo = preserveUndo;
      const bridgeItems = appended.length
        ? appended
        : lines.map((l) => ({ name: l.name, product_id: l.product_id }));
      applyJustOrderedBridges(state.deck, bridgeItems);
    }

    return {
      ok: true,
      source,
      ordered: appended,
      basket_facts: persona.basket_facts,
      last_order: state.last_order,
      stage: state.boldness_stage,
      accepted_count: state.accepted_count,
      diet_mode: diet.mode,
      cart_count: state.cart.length,
      deck,
    };
  }

  async function placeOrderAsync(opts = {}) {
    const result = placeOrder({ ...opts, rebuild: true });
    if (!result.ok) return result;
    try {
      await rebuildDeckAsync();
      applyJustOrderedBridges(state.deck, result.ordered);
    } catch {
      /* keep fallback deck with bridges */
    }
    return {
      ...result,
      deck: getDeck(),
      source_deck: lastDeckSource,
    };
  }

  /**
   * Explicit search intent (Instagram/Reels-style strong signal).
   * @param {{ query?: string, productId?: string|null, action?: 'submit'|'open'|'add'|'typeahead' }} opts
   */
  function recordSearch({ query = "", productId = null, action = "submit" } = {}) {
    const q = String(query || "").trim();
    const signals = queryIntentSignals([...catalogById.values()], q);
    state.tag_weights = state.tag_weights || {};
    state.category_weights = state.category_weights || {};
    state.last_search = { query: q, product_id: productId || null, action, at: currentNow() };

    // Typeahead alone is a light dwell signal — skip heavy boosts
    const light = action === "typeahead";
    const weightScale = light ? 0.25 : 1;

    for (const [tag, boost] of Object.entries(signals.tagBoosts)) {
      state.tag_weights[tag] = (state.tag_weights[tag] || 0) + boost * weightScale;
    }
    for (const [cat, boost] of Object.entries(signals.categoryBoosts)) {
      state.category_weights[cat] = (state.category_weights[cat] || 0) + boost * weightScale;
    }

    let cardLike = null;
    const id = productId || signals.topHit?.id || null;
    if (id) {
      const cand = pool.find((c) => c.product_id === id);
      const item = catalogById.get(id);
      if (cand || item) {
        cardLike = {
          product_id: id,
          name: cand?.name || item?.name,
          category: cand?.category || item?.category,
          top_category: cand?.top_category || item?.top_category,
          price: cand?.price ?? item?.price,
          image_url: productImageUrl(cand || item),
          need_tags: cand?.need_tags || item?.need_tags || [],
          goal_tags: cand?.goal_tags || item?.goal_tags || [],
          shared_tag: cand?.shared_tag,
          query_tags: signals.tokens,
        };
      }
    }

    if (light) {
      return {
        ok: true,
        action: "search_typeahead",
        query: q,
        product_id: id,
      };
    }

    if (cardLike && (action === "open" || action === "add" || productId)) {
      applyAffinity(state, cardLike, "search");
      applyEvidence(profile, "search", cardLike);
      if (action === "add") {
        const { created, line } = upsertCartLine(state, {
          product_id: cardLike.product_id,
          name: cardLike.name,
          price: cardLike.price,
          category: cardLike.category,
          top_category: cardLike.top_category,
          image_url: cardLike.image_url,
          added_via: "search",
        });
        if (created) {
          state.accepted_count += 1;
          applyAffinity(state, cardLike, "top");
          applyEvidence(profile, "top", cardLike);
        }
        syncProfileFromEngineState(profile, state, { persona, catalogById });
        deckCache.clear();
        return {
          ok: true,
          action: "search_add",
          query: q,
          product_id: cardLike.product_id,
          qty: line.qty,
          resolved_goal: profile.resolved_goal,
          cart_count: state.cart.reduce((n, c) => n + (Number(c.qty) || 1), 0),
        };
      }
    } else if (q) {
      // Query-only submit: soft card from tokens so goals still move
      const synthetic = {
        product_id: null,
        name: q,
        goal_tags: signals.tokens,
        need_tags: signals.tokens,
        query_tags: signals.tokens,
        category: signals.topHit?.category,
        top_category: signals.topHit?.top_category,
      };
      applyAffinity(state, synthetic, "search_query");
      applyEvidence(profile, "search_query", synthetic);
    }

    syncProfileFromEngineState(profile, state, { persona, catalogById });
    deckCache.clear();

    return {
      ok: true,
      action: `search_${action}`,
      query: q,
      product_id: cardLike?.product_id || null,
      resolved_goal: profile.resolved_goal,
      cart_count: state.cart.length,
    };
  }

  /**
   * Purchase via search — overrides left signal, product never returns to deck.
   */
  function markPurchased(productId) {
    const id = productId;
    delete state.hidden_products[id];
    state.purchased_ids.add(id);

    // Reopen category if it was backed off solely due to this product's lefts —
    // simplify: decrement category left count for that product's category if known
    const cand = pool.find((c) => c.product_id === id);
    const catItem = catalogById.get(id);
    const category = cand?.category || catItem?.category;
    const cardLike = {
      product_id: id,
      name: cand?.name || catItem?.name,
      goal_tags: cand?.goal_tags || catItem?.goal_tags || [],
      shared_tag: cand?.shared_tag,
    };
    // Purchase evidence; contradict resolved branch if clearly opposite tree
    const name = String(cardLike.name || "").toLowerCase();
    const contradict =
      !!profile.resolved_goal &&
      ((profile.resolved_goal === "weight_loss" && /gainer|mass gain/.test(name)) ||
        (profile.resolved_goal === "muscle_gain" && /isolate|zero sugar|diet coke|green tea/.test(name)));
    applyEvidence(profile, "purchase", cardLike, { contradict });

    if (category) {
      if (state.category_left_counts[category]) {
        state.category_left_counts[category] = Math.max(
          0,
          state.category_left_counts[category] - 1,
        );
      }
      if ((state.category_left_counts[category] || 0) < CATEGORY_BACKOFF_LEFTS) {
        state.backed_off_categories.delete(category);
      }
    }

    state.cart = state.cart.filter((c) => c.product_id !== id);
    state.saved_list = state.saved_list.filter((c) => c.product_id !== id);
    state.pending_match = null;
    return { ok: true, product_id: id, category };
  }

  /**
   * Remove from cart before checkout → Saved (rule 5).
   * Not used by undo.
   */
  function removeFromCart(productId, { asUndo = false } = {}) {
    const item = state.cart.find((c) => c.product_id === productId);
    if (!item) return { ok: false, reason: "not_in_cart" };
    state.cart = state.cart.filter((c) => c.product_id !== productId);
    if (!asUndo) {
      pushSaved({
        ...item,
        bio: item.bio || "",
      });
      state.right_swiped_ids.add(productId);
    }
    return { ok: true, saved: !asUndo, saved_list: state.saved_list.slice() };
  }

  /** Change qty on a cart line. delta −1 at qty 1 removes (→ Saved). */
  function adjustCartQty(productId, delta = 1) {
    const item = state.cart.find((c) => c.product_id === productId);
    if (!item) return { ok: false, reason: "not_in_cart" };
    const next = Math.max(0, (Number(item.qty) || 1) + Number(delta || 0));
    if (next <= 0) return removeFromCart(productId);
    item.qty = next;
    return { ok: true, qty: item.qty, product_id: productId };
  }

  function setStock(productId, inStock) {
    state.stock_overrides[productId] = !!inStock;
    if (!inStock) {
      const saved = state.saved_list.find((s) => s.product_id === productId);
      if (saved) state.oos_saved_ids.add(productId);
      return { ok: true, in_stock: false, match: null };
    }

    // back in stock match if it was a saved OOS item
    if (state.oos_saved_ids.has(productId) || state.saved_list.some((s) => s.product_id === productId)) {
      state.oos_saved_ids.delete(productId);
      const match = buildMatch(productId, "back_in_stock");
      return { ok: true, in_stock: true, match };
    }
    return { ok: true, in_stock: true, match: null };
  }

  function simulatePriceDrop(productId, newPrice) {
    const saved = state.saved_list.find((s) => s.product_id === productId);
    if (!saved) return { ok: false, reason: "not_saved" };
    const oldPrice = saved.price;
    const price = newPrice != null ? Number(newPrice) : Math.max(1, Math.round(saved.price * 0.8));
    state.price_overrides[productId] = price;
    saved.price = price;
    const match = buildMatch(productId, "price_drop", { old_price: oldPrice });
    return { ok: true, price, match };
  }

  function buildMatch(productId, reason, extra = {}) {
    if (state.purchased_ids.has(productId)) return null;
    if (state.cart.some((c) => c.product_id === productId)) return null;
    const saved = state.saved_list.find((s) => s.product_id === productId);
    const cand = pool.find((c) => c.product_id === productId);
    if (!saved && !cand) return null;
    const match = {
      product_id: productId,
      reason,
      name: saved?.name || cand?.name,
      category: saved?.category || cand?.category,
      top_category: saved?.top_category || cand?.top_category,
      level: cand?.level || "L2",
      need_tags: cand?.need_tags || [],
      goal_tags: cand?.goal_tags || [],
      shared_tag: cand?.shared_tag,
      price: state.price_overrides[productId] ?? saved?.price ?? cand?.price,
      old_price: extra.old_price,
      image_url: saved?.image_url || cand?.image_url,
      bio: saved?.bio || cand?.bio,
    };
    state.pending_match = match;
    return match;
  }

  function checkFreeDeliveryMatch() {
    const total = cartTotal(state);
    const remaining = FREE_DELIVERY_THRESHOLD - total;
    if (remaining <= 0 || remaining > FREE_DELIVERY_GAP) {
      return { ok: true, match: null, cart_total: total, remaining: Math.max(0, remaining) };
    }
    const inCartOrBought = (id) =>
      state.purchased_ids.has(id) || state.cart.some((c) => c.product_id === id);
    const hidden = (id) => {
      const until = state.hidden_products?.[id];
      return until != null && until > currentNow();
    };

    // Prefer a saved (right-swiped) filler — that's the product story.
    const savedFit = state.saved_list.find((s) => {
      if (inCartOrBought(s.product_id) || hidden(s.product_id)) return false;
      const price = state.price_overrides[s.product_id] ?? s.price;
      return price > 0 && price <= remaining + 0.01;
    });
    if (savedFit) {
      const match = buildMatch(savedFit.product_id, "free_delivery_gap");
      return { ok: true, match, cart_total: total, remaining };
    }

    // MVP fallback: cheapest pool item that closes the gap (so cart always has a story)
    const poolFit = [...pool]
      .filter((c) => {
        if (inCartOrBought(c.product_id) || hidden(c.product_id)) return false;
        const price = state.price_overrides[c.product_id] ?? c.price;
        return price > 0 && price <= remaining + 0.01;
      })
      .sort(
        (a, b) =>
          (state.price_overrides[a.product_id] ?? a.price) -
          (state.price_overrides[b.product_id] ?? b.price),
      )[0];
    if (!poolFit) return { ok: true, match: null, cart_total: total, remaining };
    const match = buildMatch(poolFit.product_id, "free_delivery_gap");
    return { ok: true, match, cart_total: total, remaining };
  }

  function dismissMatch() {
    state.pending_match = null;
    return { ok: true };
  }

  /** Re-open a dismissed match (still suppressed if in cart / purchased). */
  function reopenMatch(productId, reason = "price_drop") {
    const match = buildMatch(productId, reason);
    return { ok: !!match, match };
  }

  function acceptMatch() {
    const match = state.pending_match;
    if (!match) return { ok: false, reason: "no_match" };
    const saved = state.saved_list.find((s) => s.product_id === match.product_id);
    // add to cart from saved
    state.saved_list = state.saved_list.filter((s) => s.product_id !== match.product_id);
    upsertCartLine(state, {
      product_id: match.product_id,
      name: match.name,
      price: match.price,
      category: saved?.category || match.category,
      top_category: saved?.top_category || match.top_category,
      image_url: match.image_url,
      added_via: "match",
    });
    state.pending_match = null;
    return { ok: true, cart_count: state.cart.length };
  }

  function switchPersona(nextPersona, nextCandidates, nextCatalog = catalog) {
    // discard in-progress deck; do not apply unswiped signals
    const eng = createEngine({
      persona: nextPersona,
      candidates: nextCandidates,
      catalog: nextCatalog,
      now,
      timeWindow: state.time_window,
    });
    // preserve only time window; persona state comes from next persona
    eng.setTimeWindow(state.time_window);
    eng.newSession();
    return eng;
  }

  function getState() {
    return {
      accepted_count: state.accepted_count,
      consecutive_dismissals: state.consecutive_dismissals,
      boldness_stage: state.boldness_stage,
      retreat_debt: state.retreat_debt,
      retreat_next_deck: state.retreat_next_deck,
      saved_list: state.saved_list.map((x) => ({ ...x })),
      cart: state.cart.map((x) => ({ ...x })),
      hidden_products: { ...state.hidden_products },
      category_left_counts: { ...state.category_left_counts },
      backed_off_categories: [...state.backed_off_categories],
      purchased_ids: [...state.purchased_ids],
      right_swiped_ids: [...state.right_swiped_ids],
      seen_product_ids: [...state.seen_product_ids],
      category_weights: { ...state.category_weights },
      tag_weights: { ...(state.tag_weights || {}) },
      home_card_suppressed: state.home_card_suppressed,
      ignored_sessions: state.ignored_sessions,
      time_window: state.time_window,
      pending_match: state.pending_match ? { ...state.pending_match } : null,
      processing: state.processing,
      cart_total: cartTotal(state),
      deck_source: lastDeckSource,
      resolved_goal: profile.resolved_goal,
      diet_mode: profile.diet_mode || "veg",
      basket_facts: state.basket_facts ? { ...state.basket_facts } : null,
      last_order: state.last_order
        ? {
            at: state.last_order.at,
            source: state.last_order.source,
            items: (state.last_order.items || []).map((i) => ({ ...i })),
          }
        : null,
      goal_hypotheses: (profile.goal_hypotheses || []).map((h) => ({ ...h })),
      force_fallback: forceFallback,
    };
  }

  function getProfile() {
    return {
      ...profile,
      goal_hypotheses: (profile.goal_hypotheses || []).map((h) => ({
        ...h,
        evidence: [...(h.evidence || [])],
      })),
      history: (profile.history || []).map((h) => ({ ...h })),
    };
  }

  function setForceFallback(on) {
    forceFallback = !!on;
    deckCache.clear();
    return { ok: true, force_fallback: forceFallback };
  }

  function resetHypotheses() {
    profile.resolved_goal = null;
    profile.cold_read_done = false;
    profile.goal_hypotheses = [];
    profile.evidence_log = [];
    deckCache.clear();
    return { ok: true };
  }

  // Seed first deck from frozen fallback (sync, crash-safe). LLM upgrades on newSessionAsync/initAsync.
  rebuildDeckFallback();

  return {
    swipeLeft,
    swipeRight,
    swipeTop,
    undo,
    newSession,
    newSessionAsync,
    rebuildDeckAsync,
    setTimeWindow,
    setTimeWindowFromDate,
    markPurchased,
    recordSearch,
    placeOrder,
    placeOrderAsync,
    getPersona: () => ({
      ...persona,
      order_history: persona.order_history.map((h) => ({ ...h })),
      basket_facts: persona.basket_facts ? { ...persona.basket_facts } : null,
    }),
    removeFromCart,
    adjustCartQty,
    setStock,
    simulatePriceDrop,
    checkFreeDeliveryMatch,
    dismissMatch,
    reopenMatch,
    acceptMatch,
    switchPersona,
    getDeck,
    getState,
    getProfile,
    setForceFallback,
    resetHypotheses,
    currentCard,
    /** test helper */
    _isEligible(candidate) {
      return isEligible(candidate, {
        state,
        persona,
        catalogById,
        now: currentNow(),
        dietMode: profile?.diet_mode,
      });
    },
    /** test helper: seed stale left */
    _seedHidden(productId, hideUntil) {
      state.hidden_products[productId] = hideUntil;
    },
  };
}

export { buildDeck, isEligible, cartTotal } from "./allocator.js";
export {
  FREE_DELIVERY_THRESHOLD,
  STAGE_SLOTS,
  stageFromCounts,
  timeWindowFromDate,
} from "./constants.js";
