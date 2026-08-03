import { describe, expect, it } from "vitest";
import { validateAndFinalizeDeck } from "./validateDeck.js";
import { applyEvidence, shouldProbe, RESOLVE_THRESHOLD } from "./hypothesis.js";
import { createEngine } from "./index.js";
import { validateNudgeCopy, hasBannedWords, defaultNudgeCopy } from "../lib/nudgeLlm.js";

function persona() {
  return {
    id: "akash",
    name: "Akash",
    constraints: { veg_only: true, distrusted_top_categories: [] },
    needs: ["protein"],
    goals: ["fitness"],
    order_history: [
      { product_id: "h1", name: "Oats", category: "Oats", top_category: "Dairy & Breakfast", price: 50 },
      { product_id: "h2", name: "Paneer", category: "Paneer Tofu", top_category: "Dairy & Breakfast", price: 90 },
    ],
    state: { boldness_stage: 0, accepted_count: 0, consecutive_dismissals: 0, saved_list: [], cart: [], hidden_products: {} },
  };
}

function cand(partial) {
  return {
    product_id: partial.product_id,
    name: partial.name || partial.product_id,
    category: partial.category || `Cat_${partial.product_id}`,
    top_category: partial.top_category || "Sports Nutrition",
    price: partial.price ?? 99,
    level: partial.level || "L2",
    shared_tag: "protein",
    tag_type: "need",
    bridge: partial.bridge || "You buy oats and paneer — this is protein too.",
    bio: "Bio",
    confidence: 0.8,
    veg_flag: true,
    time_tags: ["anytime"],
    need_tags: ["protein"],
    goal_tags: partial.goal_tags || ["muscle_gain"],
    image_url: "/x.svg",
    in_stock: true,
  };
}

function deckState(extra = {}) {
  return {
    boldness_stage: 0,
    retreat_next_deck: false,
    stock_overrides: {},
    price_overrides: {},
    hidden_products: {},
    purchased_ids: new Set(),
    right_swiped_ids: new Set(),
    backed_off_categories: new Set(),
    category_left_counts: {},
    category_weights: {},
    cart: [],
    saved_list: [],
    time_window: "morning",
    session_locked_window: "morning",
    ...extra,
  };
}

describe("validateAndFinalizeDeck", () => {
  it("drops cards with anchors not in history", () => {
    const allowedById = new Map([
      ["p1", { id: "p1", name: "Whey", category: "Whey", top_category: "Sports Nutrition", price: 80, veg_flag: true }],
    ]);
    const catalogById = allowedById;
    const candidates = [
      cand({ product_id: "f1", level: "L2", category: "C1" }),
      cand({ product_id: "f2", level: "L2", category: "C2" }),
      cand({ product_id: "f3", level: "L2", category: "C3" }),
      cand({ product_id: "f4", level: "L2", category: "C4" }),
      cand({ product_id: "f5", level: "L3", category: "C5", price: 60 }),
    ];
    const result = validateAndFinalizeDeck({
      llmCards: [
        {
          product_id: "p1",
          level: "L2",
          anchor_items: ["Dragon fruit smoothie"],
          bridge: "Honest sounding but fake anchor.",
          bio: "x",
        },
      ],
      allowedById,
      persona: persona(),
      candidates,
      catalogById,
      state: deckState(),
    });
    expect(result.drops.some((d) => d.startsWith("bad_anchor"))).toBe(true);
    expect(result.cards.every((c) => c.product_id !== "p1")).toBe(true);
    expect(result.source === "fallback" || result.source === "llm+fallback").toBe(true);
  });

  it("keeps honest-anchor LLM cards", () => {
    const allowedById = new Map([
      ["p1", { id: "p1", name: "Whey", category: "Whey", top_category: "Sports Nutrition", price: 80, veg_flag: true }],
    ]);
    const candidates = [
      cand({ product_id: "f1", level: "L2", category: "C1" }),
      cand({ product_id: "f2", level: "L2", category: "C2" }),
      cand({ product_id: "f3", level: "L2", category: "C3" }),
      cand({ product_id: "f4", level: "L2", category: "C4" }),
      cand({ product_id: "f5", level: "L3", category: "C5", price: 60 }),
    ];
    const result = validateAndFinalizeDeck({
      llmCards: [
        {
          product_id: "p1",
          level: "L2",
          anchor_items: ["Oats", "Paneer"],
          bridge: "You buy oats and paneer every week — grab-and-go protein.",
          bio: "20g protein",
        },
      ],
      allowedById,
      persona: persona(),
      candidates,
      catalogById: allowedById,
      state: deckState(),
    });
    expect(result.cards.some((c) => c.product_id === "p1")).toBe(true);
    expect(["llm", "llm+fallback"]).toContain(result.source);
  });
});

describe("hypothesis resolve", () => {
  it("resolves at 0.75 after strong evidence", () => {
    const profile = {
      goal_hypotheses: [
        { goal: "muscle_gain", confidence: 0.6, evidence: [] },
        { goal: "weight_loss", confidence: 0.55, evidence: [] },
      ],
      resolved_goal: null,
      evidence_log: [],
    };
    expect(shouldProbe(profile)).toBe(true);
    applyEvidence(profile, "top", {
      name: "Mass Gainer",
      goal_tags: ["muscle_gain"],
      probe_goal: "muscle_gain",
    });
    expect(profile.goal_hypotheses[0].confidence).toBeGreaterThanOrEqual(0.75);
    expect(profile.resolved_goal).toBe("muscle_gain");
    expect(profile.resolved_goal === null || profile.goal_hypotheses[0].confidence >= RESOLVE_THRESHOLD).toBe(true);
  });
});

describe("engine frozen fallback", () => {
  it("serves frozen deck when force fallback is on", async () => {
    const p = persona();
    const candidates = [
      cand({ product_id: "f1", level: "L2", category: "C1" }),
      cand({ product_id: "f2", level: "L2", category: "C2" }),
      cand({ product_id: "f3", level: "L2", category: "C3" }),
      cand({ product_id: "f4", level: "L2", category: "C4" }),
      cand({ product_id: "f5", level: "L3", category: "C5", price: 60 }),
    ];
    const eng = createEngine({ persona: p, candidates, catalog: [] });
    eng.setForceFallback(true);
    const deck = await eng.rebuildDeckAsync();
    expect(deck.cards.length).toBeGreaterThan(0);
    expect(eng.getState().deck_source).toBe("fallback");
  });
});

describe("nudge validation", () => {
  it("rejects banned words and long copy", () => {
    expect(hasBannedWords("sexy deal tonight")).toBe(true);
    expect(validateNudgeCopy({ title: "ok", body: "fine short body here" }).ok).toBe(true);
    expect(
      validateNudgeCopy({
        title: "one two three four five six seven",
        body: "short",
      }).ok,
    ).toBe(false);
    const d = defaultNudgeCopy({ reason: "price_drop", name: "Whey", price: 99 });
    expect(d.title && d.body).toBeTruthy();
  });
});
