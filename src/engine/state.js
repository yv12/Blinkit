import { stageFromCounts } from "./constants.js";

/**
 * @param {object} persona
 * @param {object} [seed]
 */
export function createInitialState(persona, seed = {}) {
  const base = persona?.state || {};
  return {
    accepted_count: seed.accepted_count ?? base.accepted_count ?? 0,
    consecutive_dismissals: seed.consecutive_dismissals ?? base.consecutive_dismissals ?? 0,
    boldness_stage: seed.boldness_stage ?? base.boldness_stage ?? 0,
    retreat_debt: seed.retreat_debt ?? 0,
    retreat_next_deck: seed.retreat_next_deck ?? false,
    saved_list: [...(seed.saved_list ?? base.saved_list ?? [])],
    cart: [...(seed.cart ?? base.cart ?? [])],
    hidden_products: { ...(seed.hidden_products ?? base.hidden_products ?? {}) },
    category_left_counts: { ...(seed.category_left_counts ?? {}) },
    hand_category_lefts: { ...(seed.hand_category_lefts ?? {}) },
    backed_off_categories: new Set(seed.backed_off_categories ?? []),
    purchased_ids: new Set(seed.purchased_ids ?? []),
    right_swiped_ids: new Set(seed.right_swiped_ids ?? []),
    /** Once shown/swiped in this browser session — never re-deal (Tinder rule). */
    seen_product_ids: new Set(seed.seen_product_ids ?? []),
    category_weights: { ...(seed.category_weights ?? base.category_weights ?? {}) },
    /** need/goal tag affinity from swipes — drives mood ranking */
    tag_weights: { ...(seed.tag_weights ?? base.tag_weights ?? {}) },
    stock_overrides: { ...(seed.stock_overrides ?? {}) },
    price_overrides: { ...(seed.price_overrides ?? {}) },
    oos_saved_ids: new Set(seed.oos_saved_ids ?? []),
    ignored_sessions: seed.ignored_sessions ?? 0,
    home_card_suppressed: seed.home_card_suppressed ?? false,
    session_interacted: false,
    time_window: seed.time_window ?? "morning",
    deck: [],
    deck_cursor: 0,
    session_locked_window: null,
    undo: null,
    processing: false,
    pending_match: null,
    persona_id: persona?.id ?? "unknown",
  };
}

export function syncBoldnessStage(state) {
  state.boldness_stage = stageFromCounts(state.accepted_count, state.retreat_debt);
  return state.boldness_stage;
}

export function cloneStateSnapshot(state) {
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
    hand_category_lefts: { ...(state.hand_category_lefts || {}) },
    backed_off_categories: [...state.backed_off_categories],
    purchased_ids: [...state.purchased_ids],
    right_swiped_ids: [...state.right_swiped_ids],
    seen_product_ids: [...(state.seen_product_ids || [])],
    category_weights: { ...state.category_weights },
    tag_weights: { ...(state.tag_weights || {}) },
    deck_cursor: state.deck_cursor,
    deck: (state.deck || []).map((c) => ({ ...c })),
    oos_saved_ids: [...state.oos_saved_ids],
  };
}

export function restoreStateSnapshot(state, snap) {
  state.accepted_count = snap.accepted_count;
  state.consecutive_dismissals = snap.consecutive_dismissals;
  state.boldness_stage = snap.boldness_stage;
  state.retreat_debt = snap.retreat_debt;
  state.retreat_next_deck = snap.retreat_next_deck;
  state.saved_list = snap.saved_list.map((x) => ({ ...x }));
  state.cart = snap.cart.map((x) => ({ ...x }));
  state.hidden_products = { ...snap.hidden_products };
  state.category_left_counts = { ...snap.category_left_counts };
  state.hand_category_lefts = { ...(snap.hand_category_lefts || {}) };
  state.backed_off_categories = new Set(snap.backed_off_categories);
  state.purchased_ids = new Set(snap.purchased_ids);
  state.right_swiped_ids = new Set(snap.right_swiped_ids);
  state.seen_product_ids = new Set(snap.seen_product_ids || []);
  state.category_weights = { ...snap.category_weights };
  state.tag_weights = { ...(snap.tag_weights || {}) };
  state.deck_cursor = snap.deck_cursor;
  if (snap.deck) state.deck = snap.deck.map((c) => ({ ...c }));
  state.oos_saved_ids = new Set(snap.oos_saved_ids);
}
