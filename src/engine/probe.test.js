import { describe, expect, it } from "vitest";
import {
  goalAffinity,
  needsProbeSlot,
  pickProbeCard,
  placeProbeInHand,
  probeDiscriminationScore,
} from "./probe.js";
import { createEngine } from "./index.js";
import { catalog, getPersonaBundle } from "../data/loadDemoData.js";
import { expandCandidates } from "../lib/expandCandidates.js";

describe("probe discrimination", () => {
  const creatine = {
    product_id: "cre1",
    name: "Wellcore Micronised Creatine",
    price: 499,
    level: "L3",
    goal_tags: ["muscle_gain", "fitness"],
    need_tags: ["supplements"],
  };
  const greenTea = {
    product_id: "tea1",
    name: "Lipton Lemongrass Ginger Green Tea Bags",
    price: 80,
    level: "L2",
    goal_tags: ["weight_loss", "wellness"],
    need_tags: ["wellness"],
  };
  const chips = {
    product_id: "ch1",
    name: "Lay's Magic Masala Chips",
    price: 20,
    level: "L2",
    goal_tags: ["snack"],
    need_tags: ["snack", "indulgence"],
  };

  it("leans creatine to muscle_gain and green tea to weight_loss", () => {
    expect(goalAffinity(creatine, "muscle_gain")).toBeGreaterThan(goalAffinity(creatine, "weight_loss"));
    expect(goalAffinity(greenTea, "weight_loss")).toBeGreaterThan(goalAffinity(greenTea, "muscle_gain"));
  });

  it("scores a clean discriminator above a vague snack", () => {
    const hypA = { goal: "muscle_gain", confidence: 0.55 };
    const hypB = { goal: "weight_loss", confidence: 0.45 };
    const dCre = probeDiscriminationScore(creatine, hypA, hypB, { lowPrice: false });
    const dTea = probeDiscriminationScore(greenTea, hypA, hypB, { lowPrice: true });
    const dChips = probeDiscriminationScore(chips, hypA, hypB, { lowPrice: true });
    expect(dTea.score).toBeGreaterThan(0);
    expect(dTea.probe_goal).toBe("weight_loss");
    expect(dCre.probe_goal).toBe("muscle_gain");
    expect(dTea.score).toBeGreaterThan(dChips.score);
  });

  it("needsProbeSlot while unresolved with two hyps", () => {
    expect(
      needsProbeSlot({
        resolved_goal: null,
        goal_hypotheses: [
          { goal: "fitness", confidence: 0.55 },
          { goal: "weight_loss", confidence: 0.45 },
        ],
        evidence_log: [],
      }),
    ).toBe(true);
    expect(
      needsProbeSlot({
        resolved_goal: "fitness",
        goal_hypotheses: [
          { goal: "fitness", confidence: 0.9 },
          { goal: "weight_loss", confidence: 0.2 },
        ],
      }),
    ).toBe(false);
  });

  it("places probe after two confirm cards", () => {
    const hand = placeProbeInHand(
      [
        { product_id: "a", name: "A" },
        { product_id: "b", name: "B" },
        { product_id: "c", name: "C" },
      ],
      { product_id: "p", name: "Probe", is_probe: true, probe_goal: "fitness" },
      { after: 2 },
    );
    expect(hand.map((c) => c.product_id)).toEqual(["a", "b", "p", "c"]);
  });

  it("picks a tagged probe from a mixed pool", () => {
    const probe = pickProbeCard([chips, greenTea, creatine], {
      resolved_goal: null,
      goal_hypotheses: [
        { goal: "muscle_gain", confidence: 0.52 },
        { goal: "weight_loss", confidence: 0.48 },
      ],
      evidence_log: [],
    }, { lowPrice: true });
    expect(probe).toBeTruthy();
    expect(probe.is_probe).toBe(true);
    expect(["muscle_gain", "weight_loss"]).toContain(probe.probe_goal);
    // Prefer cheap green tea over expensive creatine when lowPrice
    expect(probe.product_id).toBe("tea1");
  });
});

describe("engine deck probe slot", () => {
  it("injects one is_probe card in the opening yash hand", () => {
    const bundle = getPersonaBundle("yash");
    const eng = createEngine({
      persona: bundle.persona,
      candidates: expandCandidates(bundle.candidates, catalog),
      catalog,
      timeWindow: "morning",
    });
    const cards = eng.getDeck().cards;
    const probes = cards.filter((c) => c.is_probe);
    expect(probes.length).toBe(1);
    expect(probes[0].probe_goal).toBeTruthy();
    // Not first card — confirm aisle first, then ask
    expect(cards[0].is_probe).toBeFalsy();
    const profile = eng.getProfile();
    expect(profile.goal_hypotheses.length).toBeGreaterThanOrEqual(2);
    expect(profile.goal_hypotheses[0].goal).not.toBe(profile.goal_hypotheses[1].goal);
  });
});
