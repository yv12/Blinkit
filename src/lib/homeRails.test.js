import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { buildHomeRails } from "./homeRails.js";
import { isLadderProduct } from "./ladderBoost.js";
import { hasRealLocalPhoto } from "./productImage.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const catalog = JSON.parse(readFileSync(join(ROOT, "data/catalog.json"), "utf8"));
const persona = JSON.parse(readFileSync(join(ROOT, "data/persona_yash.json"), "utf8"));

describe("home rails ladder", () => {
  it("flags weighing scale / gloves / electronics as ladder", () => {
    const scale = catalog.find((p) => p.id === "p07026");
    const gloves = catalog.find((p) => p.id === "p06346");
    const buds = catalog.find((p) => p.id === "p06995");
    expect(isLadderProduct(scale)).toBe(true);
    expect(isLadderProduct(gloves)).toBe(true);
    expect(isLadderProduct(buds)).toBe(true);
  });

  it("does not treat Piano Gym Baby Play Mat as fitness ladder", () => {
    const mat = catalog.find((p) => p.id === "p00943");
    expect(mat).toBeTruthy();
    expect(isLadderProduct(mat)).toBe(false);

    const cold = buildHomeRails({ catalog, persona, state: null });
    expect(cold.topPicks.map((i) => i.product_id)).not.toContain("p00943");
    expect(cold.somethingDifferent.map((i) => i.product_id)).not.toContain("p00943");

    const rails = buildHomeRails({
      catalog,
      persona,
      state: {
        category_weights: { "Protein And Workout Supplements": 4 },
        tag_weights: { protein: 5, fitness: 4, gym: 3 },
        resolved_goal: "fitness",
        purchased_ids: [],
        cart: [],
      },
    });
    const ids = [
      ...rails.topPicks.map((i) => i.product_id),
      ...rails.somethingDifferent.map((i) => i.product_id),
    ];
    expect(ids).not.toContain("p00943");
  });

  it("surfaces ladder SKUs in Something different after fitness likes", () => {
    const rails = buildHomeRails({
      catalog,
      persona,
      state: {
        category_weights: { "Protein And Workout Supplements": 2 },
        tag_weights: { protein: 3, fitness: 2.5 },
        resolved_goal: "fitness",
        purchased_ids: [],
        cart: [],
      },
    });
    const ladder = rails.somethingDifferent.filter((i) => i.ladder);
    expect(ladder.length).toBeGreaterThanOrEqual(2);
    const names = rails.somethingDifferent.map((i) => i.name).join(" ").toLowerCase();
    expect(/weigh|scale|glove|resistance|shaker|earphone|watch|charger/i.test(names)).toBe(true);
    expect(/cornetto|ice cream|sundae|butterscotch bliss/i.test(names)).toBe(false);
  });

  it("does not force electronics ladder after all-left / negative mood", () => {
    const rails = buildHomeRails({
      catalog,
      persona,
      state: {
        category_weights: { "Bottles Flasks": -1.2 },
        tag_weights: { fitness: -2.4, protein: -1.2, fitness_gear: -2.4 },
        purchased_ids: [],
        cart: [],
      },
    });
    const ladder = rails.somethingDifferent.filter((i) => i.ladder);
    expect(ladder.length).toBe(0);
  });

  it("reshuffles Top picks after fitness/protein swipes vs cold start", () => {
    const cold = buildHomeRails({ catalog, persona, state: null });
    const hot = buildHomeRails({
      catalog,
      persona,
      state: {
        category_weights: {
          "Protein And Workout Supplements": 8,
          "Energy Bars": 5,
          "Chips Crisps": -4,
        },
        tag_weights: { protein: 10, fitness: 12, snack: -5, craving: -3 },
        resolved_goal: "fitness",
        purchased_ids: [],
        cart: [],
        saved_list: [],
        right_swiped_ids: [],
      },
    });
    expect(hot.learned).toBe(true);
    const coldIds = cold.topPicks.map((p) => p.product_id);
    const hotIds = hot.topPicks.map((p) => p.product_id);
    const overlap = hotIds.filter((id) => coldIds.includes(id)).length;
    // Rail must visibly move — not the same 8 tiles
    expect(overlap).toBeLessThan(6);
    expect(hot.reason.toLowerCase()).toMatch(/liked|lean|ladder|swipe/);
    const hotBlob = hot.topPicks.map((p) => `${p.name} ${p.category}`).join(" ").toLowerCase();
    expect(/protein|whey|creatine|bar|fitness|gym/i.test(hotBlob)).toBe(true);
  });

  it("does not treat protein bars as ladder gear", () => {
    const bar = catalog.find((p) => p.id === "p02590");
    const band = catalog.find((p) => p.id === "p06352");
    expect(isLadderProduct(bar)).toBe(false);
    expect(isLadderProduct(band)).toBe(true);
  });

  it("keeps Top picks and Something different disjoint, photo-backed only", () => {
    const rails = buildHomeRails({
      catalog,
      persona,
      state: {
        category_weights: { "Energy Bars": 5, "Protein And Workout Supplements": 4 },
        tag_weights: { protein: 8, fitness: 6 },
        resolved_goal: "fitness",
        basket_facts: { last_ordered_name: "Vahdam Chamomile Mint Citrus Green Tea Bags" },
        purchased_ids: [],
        cart: [],
        saved_list: [],
        right_swiped_ids: [],
      },
    });
    const topIds = rails.topPicks.map((p) => p.product_id);
    const diffIds = rails.somethingDifferent.map((p) => p.product_id);
    expect(topIds.filter((id) => diffIds.includes(id))).toEqual([]);
    for (const item of [...rails.topPicks, ...rails.somethingDifferent]) {
      expect(hasRealLocalPhoto(item.product_id)).toBe(true);
      expect(item.bridge).toBeFalsy();
      expect(String(item.image)).not.toMatch(/\.svg$/i);
    }
  });
});
