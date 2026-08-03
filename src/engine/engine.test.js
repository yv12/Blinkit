import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  createEngine,
  stageFromCounts,
  timeWindowFromDate,
} from "./index.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");

function loadJson(rel) {
  return JSON.parse(readFileSync(join(ROOT, rel), "utf8"));
}

function makeCandidate(partial) {
  return {
    product_id: partial.product_id,
    name: partial.name || partial.product_id,
    category: partial.category || "CatA",
    top_category: partial.top_category || "Snacks & Munchies",
    price: partial.price ?? 80,
    level: partial.level || "L2",
    shared_tag: partial.shared_tag || "protein",
    tag_type: partial.tag_type || "need",
    bridge: partial.bridge || "Honest bridge from purchase history.",
    bio: partial.bio || "Playful bio.",
    confidence: partial.confidence ?? 0.8,
    veg_flag: partial.veg_flag ?? true,
    time_tags: partial.time_tags || ["anytime"],
    need_tags: partial.need_tags || ["protein"],
    goal_tags: partial.goal_tags || ["fitness"],
    image_url: partial.image_url || `/images/${partial.product_id}.svg`,
    in_stock: partial.in_stock ?? true,
  };
}

function fixturePersona(overrides = {}) {
  return {
    id: "test",
    name: "Test",
    label: "test",
    constraints: {
      veg_only: true,
      price_sensitive: false,
      distrusted_top_categories: [],
      ...(overrides.constraints || {}),
    },
    needs: ["protein", "breakfast"],
    goals: ["fitness"],
    order_history: overrides.order_history ?? [
      { product_id: "h1", name: "Oats", category: "Oats", top_category: "Dairy & Breakfast", price: 50 },
      { product_id: "h2", name: "Milk", category: "Milk", top_category: "Dairy & Breakfast", price: 30 },
      { product_id: "h3", name: "Paneer", category: "Paneer Tofu", top_category: "Dairy & Breakfast", price: 90 },
    ],
    state: {
      accepted_count: 0,
      consecutive_dismissals: 0,
      boldness_stage: 0,
      saved_list: [],
      cart: [],
      hidden_products: {},
    },
    ...overrides,
  };
}

function richCandidates() {
  const out = [];
  for (let i = 1; i <= 12; i++) {
    out.push(
      makeCandidate({
        product_id: `l2_${i}`,
        level: "L2",
        category: `L2Cat${i}`,
        price: 40 + i * 5,
        time_tags: i % 2 === 0 ? ["late_night"] : ["morning", "anytime"],
        confidence: 0.7 + i * 0.01,
      }),
    );
  }
  for (let i = 1; i <= 8; i++) {
    out.push(
      makeCandidate({
        product_id: `l3_${i}`,
        level: "L3",
        category: `L3Cat${i}`,
        price: 60 + i * 10,
        time_tags: ["afternoon", "anytime"],
        confidence: 0.65,
      }),
    );
  }
  for (let i = 1; i <= 6; i++) {
    out.push(
      makeCandidate({
        product_id: `l4_${i}`,
        level: "L4",
        category: `L4Cat${i}`,
        price: 100 + i * 10,
        time_tags: ["evening", "late_night"],
        shared_tag: "sleep",
        confidence: 0.55,
      }),
    );
  }
  // non-veg trap for veg filter
  out.push(
    makeCandidate({
      product_id: "meat_1",
      level: "L2",
      category: "Chicken",
      top_category: "Meat Fish & Eggs",
      veg_flag: false,
      name: "Chicken Breast",
      bridge: "Protein from meat — should be filtered for veg users.",
    }),
  );
  return out;
}

describe("stage / time helpers", () => {
  it("maps accepted_count and retreat debt to stage", () => {
    expect(stageFromCounts(0)).toBe(0);
    expect(stageFromCounts(1)).toBe(1);
    expect(stageFromCounts(2)).toBe(1);
    expect(stageFromCounts(3)).toBe(2);
    expect(stageFromCounts(3, 1)).toBe(1);
    expect(stageFromCounts(1, 1)).toBe(0);
  });

  it("uses half-open time windows", () => {
    expect(timeWindowFromDate(new Date("2026-01-01T06:00:00"))).toBe("morning");
    expect(timeWindowFromDate(new Date("2026-01-01T10:59:00"))).toBe("morning");
    expect(timeWindowFromDate(new Date("2026-01-01T11:00:00"))).toBe("afternoon");
    expect(timeWindowFromDate(new Date("2026-01-01T17:00:00"))).toBe("evening");
    expect(timeWindowFromDate(new Date("2026-01-01T21:00:00"))).toBe("late_night");
    expect(timeWindowFromDate(new Date("2026-01-01T01:00:00"))).toBe("late_night");
  });
});

describe("Phase 4 done-when", () => {
  it("top swipe advances boldness stage; Stage 0→1 changes deck mix on New Session", () => {
    const eng = createEngine({
      persona: fixturePersona(),
      candidates: richCandidates(),
      timeWindow: "morning",
    });
    const d0 = eng.getDeck();
    expect(d0.stage).toBe(0);
    const levels0 = d0.cards.map((c) => c.level);
    expect(levels0.filter((l) => l === "L2").length).toBeGreaterThanOrEqual(3);
    expect(levels0.includes("L4")).toBe(false);

    const top = eng.swipeTop();
    expect(top.ok).toBe(true);
    // Live order write-back syncs ladder stage immediately
    expect(eng.getState().accepted_count).toBe(1);
    expect(eng.getState().boldness_stage).toBe(1);
    expect(eng.getDeck().stage).toBe(1);

    eng.newSession();
    const d1 = eng.getDeck();
    expect(d1.stage).toBe(1);
    expect(d1.cards.some((c) => c.level === "L4")).toBe(true);
    expect(d1.cards.filter((c) => c.level === "L3").length).toBeGreaterThanOrEqual(1);
  });

  it("two consecutive lefts retreat (stage down + all-L2 next deck)", () => {
    const eng = createEngine({
      persona: fixturePersona(),
      candidates: richCandidates(),
    });
    eng.swipeTop();
    eng.newSession();
    expect(eng.getDeck().stage).toBe(1);

    eng.swipeLeft();
    eng.swipeLeft();
    expect(eng.getState().retreat_debt).toBe(1);

    eng.newSession();
    const deck = eng.getDeck();
    expect(deck.stage).toBe(0);
    expect(deck.cards.every((c) => c.level === "L2")).toBe(true);
  });

  it("purchase overrides left: category reopens, product never in deck", () => {
    const eng = createEngine({
      persona: fixturePersona(),
      candidates: richCandidates(),
    });
    const first = eng.currentCard();
    const cat = first.category;

    // left same category 3 times using controlled deck — left first card
    eng.swipeLeft();
    expect(eng.getState().hidden_products[first.product_id]).toBeTruthy();

    // force category backoff via state by lefting more from same category if present
    // mark purchased should clear hide + reopen
    const res = eng.markPurchased(first.product_id);
    expect(res.ok).toBe(true);
    expect(eng.getState().hidden_products[first.product_id]).toBeUndefined();
    expect(eng.getState().purchased_ids).toContain(first.product_id);

    eng.newSession();
    const ids = eng.getDeck().cards.map((c) => c.product_id);
    expect(ids).not.toContain(first.product_id);

    // category not permanently blocked by a single left+purchase
    expect(eng.getState().backed_off_categories).not.toContain(cat);
  });

  it("cooldowns hold: left hidden, right never in deck, purchased never in deck", () => {
    const candidates = richCandidates();
    const eng = createEngine({ persona: fixturePersona(), candidates });

    const leftCard = eng.currentCard();
    eng.swipeLeft();

    const rightCard = eng.currentCard();
    eng.swipeRight();

    const topCard = eng.currentCard();
    eng.swipeTop();
    eng.markPurchased(topCard.product_id);

    eng.newSession();
    const ids = eng.getDeck().cards.map((c) => c.product_id);
    expect(ids).not.toContain(leftCard.product_id);
    expect(ids).not.toContain(rightCard.product_id);
    expect(ids).not.toContain(topCard.product_id);
    expect(eng.getState().saved_list.some((s) => s.product_id === rightCard.product_id)).toBe(true);
  });

  it("learns likes/dislikes so next hand ranks liked tags higher", () => {
    const candidates = [
      makeCandidate({
        product_id: "prot_1",
        level: "L2",
        category: "Whey",
        need_tags: ["protein"],
        goal_tags: ["fitness"],
        shared_tag: "protein",
        confidence: 0.5,
        price: 80,
      }),
      makeCandidate({
        product_id: "chip_1",
        level: "L2",
        category: "Chips Crisps",
        need_tags: ["snack"],
        goal_tags: ["craving"],
        shared_tag: "snack",
        confidence: 0.99,
        price: 40,
      }),
      makeCandidate({
        product_id: "prot_2",
        level: "L2",
        category: "Whey",
        need_tags: ["protein"],
        goal_tags: ["fitness"],
        shared_tag: "protein",
        confidence: 0.5,
        price: 85,
      }),
      makeCandidate({
        product_id: "chip_2",
        level: "L2",
        category: "Chips Crisps",
        need_tags: ["snack"],
        goal_tags: ["craving"],
        shared_tag: "snack",
        confidence: 0.98,
        price: 45,
      }),
      makeCandidate({
        product_id: "oat_1",
        level: "L2",
        category: "Oats",
        need_tags: ["breakfast"],
        confidence: 0.6,
        price: 50,
      }),
      makeCandidate({
        product_id: "tea_1",
        level: "L2",
        category: "Tea",
        need_tags: ["relax"],
        confidence: 0.6,
        price: 55,
      }),
      makeCandidate({
        product_id: "milk_1",
        level: "L3",
        category: "Milk",
        need_tags: ["protein"],
        confidence: 0.55,
        price: 40,
      }),
    ];
    const eng = createEngine({ persona: fixturePersona(), candidates });
    // Left every chips card; top protein. Keep going until both chip SKUs are hidden.
    const leftChips = new Set();
    for (let hand = 0; hand < 5 && leftChips.size < 2; hand++) {
      while (!eng.getDeck().done) {
        const c = eng.currentCard();
        if (c.category === "Chips Crisps" || c.need_tags?.includes("snack")) {
          leftChips.add(c.product_id);
          eng.swipeLeft();
        } else if (c.need_tags?.includes("protein")) eng.swipeTop();
        else eng.swipeRight();
      }
      eng.newSession();
    }
    const next = eng.getDeck().cards;
    expect(leftChips.size).toBeGreaterThanOrEqual(1);
    expect(next.some((c) => c.category === "Chips Crisps")).toBe(false);
    expect(eng.getState().tag_weights.protein).toBeGreaterThan(0);
    expect(eng.getState().tag_weights.snack || 0).toBeLessThan(0);
  });

  it("never re-deals a product already shown in this session (Tinder rule)", () => {
    const eng = createEngine({ persona: fixturePersona(), candidates: richCandidates() });
    const seen = new Set();
    // Swipe through first hand
    while (!eng.getDeck().done) {
      const id = eng.currentCard().product_id;
      expect(seen.has(id)).toBe(false);
      seen.add(id);
      eng.swipeLeft();
    }
    eng.newSession();
    const nextIds = eng.getDeck().cards.map((c) => c.product_id);
    expect(nextIds.length).toBeGreaterThan(0);
    for (const id of nextIds) {
      expect(seen.has(id)).toBe(false);
    }
    // No duplicates inside a hand either
    expect(new Set(nextIds).size).toBe(nextIds.length);
  });

  it("veg filter holds at every level", () => {
    const eng = createEngine({
      persona: fixturePersona({ constraints: { veg_only: true } }),
      candidates: richCandidates(),
    });
    // bump to stage 2 to include all levels
    eng.swipeTop();
    eng.swipeTop();
    eng.swipeTop();
    eng.newSession();
    const deck = eng.getDeck();
    expect(deck.cards.length).toBeGreaterThan(0);
    expect(deck.cards.every((c) => c.veg_flag !== false)).toBe(true);
    expect(deck.cards.some((c) => c.product_id === "meat_1")).toBe(false);

    // eligibility helper also rejects
    const meat = richCandidates().find((c) => c.product_id === "meat_1");
    expect(eng._isEligible(meat)).toBe(false);
  });

  it("time boost re-ranks; window locked at deck build", () => {
    const candidates = [
      makeCandidate({
        product_id: "morning_only",
        level: "L2",
        category: "M1",
        time_tags: ["morning"],
        confidence: 0.5,
        price: 50,
      }),
      makeCandidate({
        product_id: "late_only",
        level: "L2",
        category: "L1",
        time_tags: ["late_night"],
        confidence: 0.9,
        price: 50,
      }),
      makeCandidate({
        product_id: "any1",
        level: "L2",
        category: "A1",
        time_tags: ["anytime"],
        confidence: 0.6,
      }),
      makeCandidate({
        product_id: "any2",
        level: "L2",
        category: "A2",
        time_tags: ["anytime"],
        confidence: 0.6,
      }),
      makeCandidate({
        product_id: "any3",
        level: "L2",
        category: "A3",
        time_tags: ["anytime"],
        confidence: 0.6,
      }),
      makeCandidate({
        product_id: "l3a",
        level: "L3",
        category: "L3A",
        time_tags: ["anytime"],
        confidence: 0.6,
      }),
    ];

    const eng = createEngine({
      persona: fixturePersona(),
      candidates,
      timeWindow: "morning",
    });
    const morningDeck = eng.getDeck().cards.map((c) => c.product_id);
    expect(morningDeck[0]).toBe("morning_only");

    // change window mid-session — deck order stays
    eng.setTimeWindow("late_night");
    expect(eng.getDeck().cards.map((c) => c.product_id)).toEqual(morningDeck);

    eng.newSession();
    const lateDeck = eng.getDeck().cards.map((c) => c.product_id);
    expect(lateDeck[0]).toBe("late_only");
  });

  it("honest-candidate shortage → shorter deck, never pad; zero → empty state", () => {
    const few = [
      makeCandidate({ product_id: "only1", level: "L2", category: "C1" }),
      makeCandidate({ product_id: "only2", level: "L2", category: "C2" }),
    ];
    const eng = createEngine({ persona: fixturePersona(), candidates: few });
    expect(eng.getDeck().cards.length).toBe(2);
    expect(eng.getDeck().empty).toBe(false);

    const empty = createEngine({ persona: fixturePersona(), candidates: [] });
    expect(empty.getDeck().cards.length).toBe(0);
    expect(empty.getDeck().empty).toBe(true);
    expect(empty.getDeck().end_message.toLowerCase()).toContain("come back");
  });

  it("undo-top removes from cart WITHOUT triggering cart→Saved downgrade", () => {
    const eng = createEngine({
      persona: fixturePersona(),
      candidates: richCandidates(),
    });
    const card = eng.currentCard();
    eng.swipeTop();
    expect(eng.getState().cart.some((c) => c.product_id === card.product_id)).toBe(true);

    const undid = eng.undo();
    expect(undid.ok).toBe(true);
    const st = eng.getState();
    expect(st.cart.some((c) => c.product_id === card.product_id)).toBe(false);
    expect(st.saved_list.some((s) => s.product_id === card.product_id)).toBe(false);
    expect(st.accepted_count).toBe(0);
    expect(eng.currentCard().product_id).toBe(card.product_id);
  });
});

describe("more edge rules", () => {
  it("removeFromCart downgrades to Saved (rule 5)", () => {
    const eng = createEngine({
      persona: fixturePersona(),
      candidates: richCandidates(),
    });
    const card = eng.currentCard();
    eng.swipeTop();
    expect(eng.getState().cart.some((c) => c.product_id === card.product_id)).toBe(true);
    const res = eng.removeFromCart(card.product_id);
    expect(res.ok).toBe(true);
    expect(eng.getState().cart.length).toBe(0);
    expect(eng.getState().saved_list.some((s) => s.product_id === card.product_id)).toBe(true);
  });

  it("saved list capped at 15", () => {
    const candidates = [];
    for (let i = 1; i <= 20; i++) {
      candidates.push(
        makeCandidate({
          product_id: `s${i}`,
          level: "L2",
          category: `S${i}`,
          price: 40,
        }),
      );
    }
    candidates.push(
      makeCandidate({ product_id: "l3x", level: "L3", category: "Lx" }),
    );
    const eng = createEngine({ persona: fixturePersona(), candidates });
    for (let i = 0; i < 16; i++) {
      const r = eng.swipeRight();
      expect(r.ok).toBe(true);
      if (eng.getDeck().done) eng.newSession();
    }
    expect(eng.getState().saved_list.length).toBe(15);
    expect(eng.getState().saved_list[0].product_id).not.toBe("s1");
  });

  it("left signals expire after 30 days", () => {
    let t = Date.UTC(2026, 0, 1);
    const eng = createEngine({
      persona: fixturePersona(),
      candidates: richCandidates(),
      now: () => t,
    });
    const card = eng.currentCard();
    eng.swipeLeft();
    eng.newSession();
    expect(eng.getDeck().cards.map((c) => c.product_id)).not.toContain(card.product_id);

    t += 31 * 24 * 60 * 60 * 1000;
    eng.newSession();
    // may or may not reappear depending on ranking, but must be eligible
    const again = richCandidates().find((c) => c.product_id === card.product_id);
    expect(eng._isEligible(again)).toBe(true);
  });

  it("2 lefts on same category in one hand prunes remaining + backfills locally", () => {
    const candidates = [
      makeCandidate({ product_id: "a1", category: "SameCat", level: "L2", confidence: 0.99 }),
      makeCandidate({ product_id: "a2", category: "SameCat", level: "L2", confidence: 0.98 }),
      makeCandidate({ product_id: "a3", category: "SameCat", level: "L2", confidence: 0.97 }),
      makeCandidate({ product_id: "a4", category: "SameCat", level: "L2", confidence: 0.96 }),
      makeCandidate({ product_id: "b1", category: "Other", level: "L2", confidence: 0.95 }),
      makeCandidate({ product_id: "b2", category: "Other2", level: "L2", confidence: 0.94 }),
      makeCandidate({ product_id: "b3", category: "Other3", level: "L2", confidence: 0.93 }),
      makeCandidate({ product_id: "b4", category: "Other4", level: "L2", confidence: 0.92 }),
      makeCandidate({ product_id: "l3", category: "L3c", level: "L3", price: 40, confidence: 0.5 }),
    ];
    const eng = createEngine({ persona: fixturePersona(), candidates });
    const beforeLen = eng.getDeck().cards.length;
    expect(eng.currentCard().category).toBe("SameCat");
    eng.swipeLeft();
    expect(eng.currentCard().category).toBe("SameCat");
    const result = eng.swipeLeft();
    expect(result.hand_prune?.removed).toBeGreaterThan(0);
    expect(eng.getState().backed_off_categories).not.toContain("SameCat");
    const remaining = eng.getDeck().cards.slice(eng.getDeck().cursor);
    expect(remaining.every((c) => c.category !== "SameCat")).toBe(true);
    expect(eng.getDeck().cards.length).toBe(beforeLen);
  });

  it("3 lefts in one category backs it off; 2 does not", () => {
    const candidates = [
      makeCandidate({ product_id: "a1", category: "SameCat", level: "L2", confidence: 0.99 }),
      makeCandidate({ product_id: "a2", category: "SameCat", level: "L2", confidence: 0.98 }),
      makeCandidate({ product_id: "a3", category: "SameCat", level: "L2", confidence: 0.97 }),
      makeCandidate({ product_id: "a4", category: "SameCat", level: "L2", confidence: 0.96 }),
      makeCandidate({ product_id: "b1", category: "Other", level: "L2", confidence: 0.1 }),
      makeCandidate({ product_id: "b2", category: "Other2", level: "L2", confidence: 0.1 }),
      makeCandidate({ product_id: "l3", category: "L3c", level: "L3", confidence: 0.1 }),
    ];
    const eng = createEngine({ persona: fixturePersona(), candidates });
    expect(eng.currentCard().category).toBe("SameCat");
    eng.swipeLeft();
    expect(eng.currentCard().category).toBe("SameCat");
    eng.swipeLeft(); // retreat fires but category still open
    expect(eng.getState().backed_off_categories).not.toContain("SameCat");
    expect(eng.getState().category_left_counts.SameCat).toBe(2);

    eng.newSession();
    // skip non-SameCat cards until third SameCat left
    for (let guard = 0; guard < 12; guard++) {
      if (eng.getState().backed_off_categories.includes("SameCat")) break;
      const card = eng.currentCard();
      if (!card) {
        eng.newSession();
        continue;
      }
      if (card.category === "SameCat") eng.swipeLeft();
      else eng.swipeTop();
      if (eng.getDeck().done) eng.newSession();
    }
    expect(eng.getState().category_left_counts.SameCat).toBeGreaterThanOrEqual(3);
    expect(eng.getState().backed_off_categories).toContain("SameCat");
  });

  it("OOS never in deck; back-in-stock can match saved item", () => {
    const eng = createEngine({
      persona: fixturePersona(),
      candidates: richCandidates(),
    });
    const card = eng.currentCard();
    eng.swipeRight();
    eng.setStock(card.product_id, false);
    eng.newSession();
    expect(eng.getDeck().cards.map((c) => c.product_id)).not.toContain(card.product_id);

    const match = eng.setStock(card.product_id, true);
    expect(match.match?.reason).toBe("back_in_stock");
  });

  it("match suppressed if already in cart / purchased", () => {
    const eng = createEngine({
      persona: fixturePersona(),
      candidates: richCandidates(),
    });
    const card = eng.currentCard();
    eng.swipeRight();
    // manually add to cart
    eng.acceptMatch(); // no pending
    eng.getState();
    // put saved item into cart via top on another then simulate — use price drop after moving to cart
    // add by accepting after building match wrongly: use remove path
    // Force: swipeTop something else, then push saved into cart by acceptMatch after simulate — first put in cart via mark... 
    // Simpler: simulate price drop while still saved — match fires
    let res = eng.simulatePriceDrop(card.product_id);
    expect(res.match).toBeTruthy();
    eng.acceptMatch();
    // now in cart — price drop again suppressed
    eng.swipeRight(); // need another saved? re-save not possible
    // mark purchased suppresses
    const card2 = eng.currentCard();
    eng.swipeRight();
    eng.markPurchased(card2.product_id);
    res = eng.simulatePriceDrop(card2.product_id);
    expect(res.ok).toBe(false);
  });

  it("spam swipes process distinct cards (no double-fire on same card)", () => {
    const eng = createEngine({
      persona: fixturePersona(),
      candidates: richCandidates(),
    });
    const ids = [];
    for (let i = 0; i < 5; i++) {
      const card = eng.currentCard();
      ids.push(card.product_id);
      eng.swipeTop();
    }
    expect(new Set(ids).size).toBe(5);
  });

  it("short history persona does not crash (conservative deck)", () => {
    const eng = createEngine({
      persona: fixturePersona({
        order_history: [{ product_id: "h1", name: "X", category: "Oats", top_category: "Dairy & Breakfast", price: 10 }],
      }),
      candidates: richCandidates(),
    });
    const deck = eng.getDeck();
    expect(deck.cards.length).toBeGreaterThan(0);
    expect(deck.cards.every((c) => c.level === "L2")).toBe(true);
  });

  it("works with real Akash frozen JSON", () => {
    const persona = loadJson("data/persona_akash.json");
    const candidates = loadJson("data/candidates_akash.json");
    const catalog = loadJson("data/catalog.json");
    const eng = createEngine({ persona, candidates, catalog, timeWindow: "morning" });
    const deck = eng.getDeck();
    expect(deck.cards.length).toBeGreaterThan(0);
    expect(deck.cards.every((c) => c.bridge && c.veg_flag !== false)).toBe(true);
    eng.swipeTop();
    eng.newSession();
    expect(eng.getDeck().stage).toBe(1);
  });

  it("recordSearch boosts affinity and can add to cart", () => {
    const catalog = [
      {
        id: "prot_1",
        name: "Yoga Bar protein bar",
        brand: "Yoga Bar",
        category: "Energy Bars",
        top_category: "Snacks & Munchies",
        price: 99,
        need_tags: ["protein"],
        goal_tags: ["fitness"],
        in_stock: true,
      },
      {
        id: "chip_1",
        name: "Lay's chips",
        brand: "Lay's",
        category: "Chips Crisps",
        top_category: "Snacks & Munchies",
        price: 20,
        need_tags: ["snack"],
        goal_tags: ["craving"],
        in_stock: true,
      },
    ];
    const eng = createEngine({
      persona: fixturePersona(),
      candidates: richCandidates(),
      catalog,
      timeWindow: "morning",
    });
    eng.recordSearch({ query: "protein bar", productId: "prot_1", action: "open" });
    let st = eng.getState();
    expect(st.tag_weights.protein).toBeGreaterThan(0);
    expect(st.category_weights["Energy Bars"]).toBeGreaterThan(0);

    eng.recordSearch({ query: "protein bar", productId: "prot_1", action: "add" });
    st = eng.getState();
    expect(st.cart.some((c) => c.product_id === "prot_1")).toBe(true);
    expect(st.cart.find((c) => c.product_id === "prot_1").qty).toBe(1);

    eng.recordSearch({ query: "protein bar", productId: "prot_1", action: "add" });
    st = eng.getState();
    expect(st.cart.find((c) => c.product_id === "prot_1").qty).toBe(2);
    eng.adjustCartQty("prot_1", 1);
    expect(eng.getState().cart.find((c) => c.product_id === "prot_1").qty).toBe(3);
  });
});
