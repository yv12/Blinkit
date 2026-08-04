import { describe, expect, it } from "vitest";
import { createEngine } from "../engine/index.js";
import { applyJustOrderedBridges, buildBasketFacts, justOrderedBridge } from "./orderFeedback.js";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
function loadJson(rel) {
  return JSON.parse(readFileSync(join(ROOT, rel), "utf8"));
}

describe("order feedback loop", () => {
  it("builds basket_facts and just-ordered bridges", () => {
    const facts = buildBasketFacts(
      [
        {
          product_id: "p1",
          name: "Yoga Bar Protein",
          category: "Energy Bars",
          top_category: "Snacks",
          ordered_at: 1,
        },
      ],
      { veg_only: true },
      "veg",
    );
    expect(facts.last_ordered_name).toMatch(/Yoga Bar/);
    expect(facts.veg_only).toBe(true);
    const bridge = justOrderedBridge("Yoga Bar Protein");
    expect(bridge.toLowerCase()).toContain("yoga bar");
    expect(bridge.length).toBeGreaterThanOrEqual(8);
  });

  it("stamps at least one deck bridge with the ordered item", () => {
    const cards = [
      { product_id: "a", bridge: "old bridge long enough", is_probe: false },
      { product_id: "b", bridge: "other bridge long enough", is_probe: false },
    ];
    applyJustOrderedBridges(cards, [{ name: "Milky Mist Paneer" }]);
    expect(cards.some((c) => /paneer/i.test(c.bridge))).toBe(true);
  });

  it("placeOrder appends history, refreshes deck, and cites the purchase", () => {
    const persona = loadJson("data/persona_yash.json");
    const candidates = loadJson("data/candidates_yash.json");
    const catalog = loadJson("data/catalog.json");
    const eng = createEngine({
      persona,
      candidates,
      catalog,
      timeWindow: "morning",
    });
    const beforeIds = eng.getDeck().cards.map((c) => c.product_id);
    const beforeHist = eng.getPersona().order_history.length;
    const card = eng.currentCard();
    expect(card).toBeTruthy();

    const res = eng.placeOrder({
      items: [
        {
          product_id: card.product_id,
          name: card.name,
          price: card.price,
          category: card.category,
          top_category: card.top_category,
          added_via: "top",
        },
      ],
      source: "checkout",
      bumpAccepted: true,
      rebuild: true,
    });

    expect(res.ok).toBe(true);
    expect(eng.getPersona().order_history.length).toBe(beforeHist + 1);
    expect(eng.getPersona().basket_facts?.last_ordered_id).toBe(card.product_id);
    expect(eng.getState().accepted_count).toBeGreaterThan(0);
    expect(eng.getState().consecutive_dismissals).toBe(0);

    const after = eng.getDeck().cards;
    expect(after.some((c) => /just (got|bought)|ordered|pairs with your fresh/i.test(c.bridge))).toBe(
      true,
    );
    expect(after.every((c) => c.product_id !== card.product_id)).toBe(true);
    const afterIds = after.map((c) => c.product_id);
    const same =
      beforeIds.length === afterIds.length && beforeIds.every((id, i) => id === afterIds[i]);
    expect(same).toBe(false);
  });

  it("top swipe triggers placeOrder write-back", () => {
    const persona = loadJson("data/persona_yash.json");
    const candidates = loadJson("data/candidates_yash.json");
    const catalog = loadJson("data/catalog.json");
    const eng = createEngine({
      persona,
      candidates,
      catalog,
      timeWindow: "morning",
    });
    const card = eng.currentCard();
    expect(card).toBeTruthy();
    const res = eng.swipeTop();
    expect(res.ok).toBe(true);
    expect(res.order?.ok).toBe(true);
    expect(eng.getState().cart.some((c) => c.product_id === card.product_id)).toBe(true);
    expect(eng.getPersona().order_history.some((h) => h.product_id === card.product_id)).toBe(true);
    expect(eng.getDeck().cards.some((c) => /just (got|bought)|ordered|pairs with/i.test(c.bridge))).toBe(
      true,
    );
  });

  it("after add-to-cart, next cards leave the ordered leaf category", () => {
    const persona = loadJson("data/persona_yash.json");
    const candidates = loadJson("data/candidates_yash.json");
    const catalog = loadJson("data/catalog.json");
    const eng = createEngine({
      persona,
      candidates,
      catalog,
      timeWindow: "morning",
    });

    // Prefer an Energy Bars card when present so the cross-aisle shift is measurable
    const deck = eng.getDeck().cards;
    const barIdx = deck.findIndex((c) => c.category === "Energy Bars");
    if (barIdx >= 0) eng.getState().deck_cursor = barIdx;

    const ordered = eng.currentCard();
    expect(ordered).toBeTruthy();
    const orderedCat = ordered.category;
    const beforeRemaining = eng
      .getDeck()
      .cards.slice(eng.getDeck().cursor + 1)
      .map((c) => c.product_id);

    const res = eng.swipeTop();
    expect(res.ok).toBe(true);
    expect(eng.getPersona().basket_facts?.last_ordered_category).toBe(orderedCat);

    const next = eng.getDeck().cards.slice(eng.getDeck().cursor, eng.getDeck().cursor + 4);
    expect(next.length).toBeGreaterThan(0);
    const sameLeaf = next.filter((c) => c.category === orderedCat).length;
    // Majority of the next hand should open a different aisle
    expect(sameLeaf).toBeLessThanOrEqual(Math.floor(next.length / 2));

    const afterIds = next.map((c) => c.product_id);
    const unchanged =
      beforeRemaining.length >= afterIds.length &&
      afterIds.every((id, i) => id === beforeRemaining[i]);
    expect(unchanged).toBe(false);
  });
});
