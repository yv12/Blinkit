import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { buildHomeRails } from "./homeRails.js";
import {
  isBabyAisleProduct,
  isOffPersonaAisle,
} from "./aisleCoherence.js";
import { isLadderProduct } from "./ladderBoost.js";
import { hasRealLocalPhoto } from "./productImage.js";
import { expandCandidates } from "./expandCandidates.js";
import { buildAllowedList } from "../engine/allowedList.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const catalog = JSON.parse(readFileSync(join(ROOT, "data/catalog.json"), "utf8"));
const persona = JSON.parse(readFileSync(join(ROOT, "data/persona_yash.json"), "utf8"));
const candidates = JSON.parse(readFileSync(join(ROOT, "data/candidates_yash.json"), "utf8"));

describe("predeploy smoke", () => {
  const mat = catalog.find((p) => p.id === "p00943");

  it("keeps Piano Gym Baby Play Mat out of rails/deck even after baby affinity poison", () => {
    expect(isBabyAisleProduct(mat)).toBe(true);
    expect(isLadderProduct(mat)).toBe(false);
    expect(
      isOffPersonaAisle(mat, {
        tagWeights: { baby: 9, fitness: 5 },
        catWeights: { "Baby Care": 9 },
        persona,
      }),
    ).toBe(true);

    const hot = buildHomeRails({
      catalog,
      persona,
      state: {
        category_weights: {
          "Energy Bars": 5,
          "Baby Care": 9,
          "Baby Gear": 9,
        },
        tag_weights: { protein: 8, fitness: 6, baby: 9 },
        resolved_goal: "fitness",
        purchased_ids: [],
        cart: [],
        saved_list: [],
        right_swiped_ids: ["p00943"],
      },
    });

    const all = [...hot.topPicks, ...hot.somethingDifferent];
    expect(all.map((p) => p.product_id)).not.toContain("p00943");
    expect(all.every((p) => hasRealLocalPhoto(p.product_id))).toBe(true);
    expect(all.every((p) => !p.bridge)).toBe(true);
    const topIds = new Set(hot.topPicks.map((p) => p.product_id));
    expect(hot.somethingDifferent.every((p) => !topIds.has(p.product_id))).toBe(true);
  });

  it("does not expand or allow baby SKUs into discovery pool", () => {
    const pool = expandCandidates(candidates, catalog);
    expect(pool.some((c) => c.product_id === "p00943")).toBe(false);

    const catalogById = new Map(catalog.map((p) => [p.id, p]));
    const { allowed } = buildAllowedList({
      catalog,
      persona,
      state: {
        category_weights: { "Baby Care": 9 },
        tag_weights: { baby: 9, protein: 3 },
        purchased_ids: new Set(),
        right_swiped_ids: new Set(),
        seen_product_ids: new Set(),
        cart: [],
        saved_list: [],
      },
      catalogById,
    });
    expect(allowed.some((p) => p.id === "p00943")).toBe(false);
  });

  it("has a meaningful photo-backed catalog for deploy", () => {
    const withPhoto = catalog.filter((p) => hasRealLocalPhoto(p)).length;
    expect(withPhoto).toBeGreaterThanOrEqual(150);
    expect(withPhoto).toBeLessThan(catalog.length);
  });
});
