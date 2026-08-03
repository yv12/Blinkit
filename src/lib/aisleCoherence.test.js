import { describe, expect, it } from "vitest";
import {
  isBabyAisleProduct,
  isOffPersonaAisle,
  nameKeywordSupportedByAisle,
  productMatchesTag,
} from "./aisleCoherence.js";
import { isLadderProduct } from "./ladderBoost.js";

const babyMat = {
  id: "p00943",
  name: "Apex Piano Gym Baby Play Mat (0+ months)",
  category: "Baby Gear",
  top_category: "Baby Care",
  need_tags: ["baby"],
  goal_tags: ["baby_care"],
};

const gymGloves = {
  id: "p06346",
  name: "Lifelong Exercise Gym Gloves",
  category: "Sports Fitness",
  top_category: "Electronics & Appliances",
  need_tags: ["fitness"],
  goal_tags: ["fitness_gear"],
};

describe("aisle coherence", () => {
  it("treats baby play mat as baby, never as ladder", () => {
    expect(isBabyAisleProduct(babyMat)).toBe(true);
    expect(isLadderProduct(babyMat)).toBe(false);
    expect(nameKeywordSupportedByAisle(babyMat, /\bgym\b/i)).toBe(false);
  });

  it("still allows real gym gloves as ladder", () => {
    expect(isLadderProduct(gymGloves)).toBe(true);
  });

  it("does not match short mood tag 'gym' via product title", () => {
    expect(productMatchesTag(babyMat, "gym")).toBe(false);
    expect(productMatchesTag(gymGloves, "fitness")).toBe(true);
  });

  it("blocks Baby Care when fitness mood is active", () => {
    expect(
      isOffPersonaAisle(babyMat, {
        tagWeights: { protein: 3, fitness: 2 },
        resolvedGoal: "fitness",
        persona: { needs: ["protein"], goals: ["fitness"], order_history: [] },
      }),
    ).toBe(true);
  });

  it("blocks Baby Care on cold start with no baby signal", () => {
    expect(isOffPersonaAisle(babyMat, {})).toBe(true);
    expect(
      isOffPersonaAisle(babyMat, {
        tagWeights: { baby: 5 },
        catWeights: { "Baby Care": 5 },
        persona: { needs: ["protein"], goals: ["fitness"], order_history: [] },
      }),
    ).toBe(true);
  });

  it("allows Baby Care only when persona order history has baby", () => {
    expect(
      isOffPersonaAisle(babyMat, {
        tagWeights: { protein: 3 },
        persona: {
          needs: ["protein"],
          goals: ["fitness"],
          order_history: [
            {
              product_id: "p00651",
              name: "Baby wipes",
              category: "Baby Wipes",
              top_category: "Baby Care",
            },
          ],
        },
      }),
    ).toBe(false);
  });

  it("does not unlock Baby Care from swipe affinity alone", () => {
    expect(
      isOffPersonaAisle(babyMat, {
        tagWeights: { baby: 9, baby_care: 9 },
        catWeights: { "Baby Care": 9, "Baby Gear": 9 },
        persona: { needs: ["protein"], goals: ["fitness"], order_history: [] },
      }),
    ).toBe(true);
  });
});
