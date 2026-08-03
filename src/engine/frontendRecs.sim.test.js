/**
 * Frontend-path recommendation simulation (persona yash → engine → rails → nudge).
 * Run: npm test -- --run src/engine/frontendRecs.sim.test.js
 */
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { createEngine } from "./index.js";
import { expandCandidates } from "../lib/expandCandidates.js";
import { buildHomeRails } from "../lib/homeRails.js";
import { isLadderProduct } from "../lib/ladderBoost.js";
import { lookupStaticNudge } from "../lib/nudgeLlm.js";
import { catalog, getPersonaBundle } from "../data/loadDemoData.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");

const LIKE =
  /protein|whey|skyr|paneer|creatine|oats|shaker|scale|glove|resistance|gym|curd|yogurt|egg|multivitamin|fitness/i;
const DISLIKE = /chips|maggi|cola|lay'?s|kurkure|namkeen|biscuit|cookie|noodles|harpic|cleaner/i;

function cardBrief(c) {
  if (!c) return null;
  return {
    id: c.product_id,
    name: String(c.name || "").split(",")[0].trim().slice(0, 48),
    cat: c.category,
    top: c.top_category,
    level: c.level,
    price: Math.round(c.price || 0),
    tags: [...new Set([...(c.need_tags || []), ...(c.goal_tags || [])])].slice(0, 4),
    ladder: isLadderProduct(c),
  };
}

function decideAction(card) {
  const blob = `${card.name} ${card.category} ${(card.need_tags || []).join(" ")}`;
  if (DISLIKE.test(blob) && !LIKE.test(blob)) return "left";
  if (LIKE.test(blob)) return card.price && card.price < 120 ? "top" : "right";
  if (isLadderProduct(card)) return "right";
  return "left";
}

function topWeights(weights, n = 8) {
  return Object.entries(weights || {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([k, v]) => ({ key: k, w: Math.round(v * 100) / 100 }));
}

function seenCount(st) {
  const s = st.seen_product_ids;
  if (!s) return 0;
  if (typeof s.size === "number") return s.size;
  return Array.isArray(s) ? s.length : 0;
}

function runScenario(name, { timeWindow = "morning", policy = decideAction, maxSwipes = 24 } = {}) {
  const bundle = getPersonaBundle("yash");
  const candidates = expandCandidates(bundle.candidates, catalog);
  const eng = createEngine({
    persona: bundle.persona,
    candidates,
    catalog,
    timeWindow,
  });

  const coldDeck = eng.getDeck().cards.map(cardBrief);
  const log = [];
  let ladderFirstAt = null;

  for (let i = 0; i < maxSwipes; i++) {
    if (eng.getDeck().done) {
      eng.rebuildDeck?.() || eng.newSession?.();
    }
    const card = eng.currentCard();
    if (!card) break;
    const brief = cardBrief(card);
    if (brief.ladder && ladderFirstAt == null) ladderFirstAt = i + 1;
    const action = policy(card);
    let result;
    if (action === "left") result = eng.swipeLeft();
    else if (action === "top") result = eng.swipeTop();
    else result = eng.swipeRight();
    log.push({ n: i + 1, action, ...brief, ok: !!result?.ok });
  }

  const st = eng.getState();
  const rails = buildHomeRails({ catalog, persona: bundle.persona, state: st });
  const deckView = eng.getDeck();
  const nextHand = deckView.cards.slice(deckView.cursor, deckView.cursor + 8).map(cardBrief);

  const saved = st.saved_list?.[0];
  let nudge = null;
  if (saved) {
    const drop = eng.simulatePriceDrop(saved.product_id);
    const match = drop?.match;
    if (match) {
      const copy = lookupStaticNudge(match);
      const amount =
        match.old_price != null && match.price != null
          ? Math.round(Number(match.old_price) - Number(match.price))
          : null;
      nudge = {
        product_id: match.product_id,
        name: String(match.name || "").split(",")[0].trim(),
        chip: amount != null ? `Price drop ₹${amount}` : "Price drop",
        body: copy.body,
        cta: "Add to cart",
        source: copy.source,
      };
    }
  }

  return {
    name,
    timeWindow,
    poolSize: candidates.length,
    coldDeck,
    swipes: log,
    summary: {
      swipes: log.length,
      left: log.filter((x) => x.action === "left").length,
      right: log.filter((x) => x.action === "right").length,
      top: log.filter((x) => x.action === "top").length,
      uniqueSeen: seenCount(st),
      ladderFirstAt,
      ladderInLog: log.filter((x) => x.ladder).map((x) => ({ id: x.id, name: x.name, at: x.n })),
      boldness: st.boldness_stage,
      resolvedGoal: st.resolved_goal,
      cartCount: (st.cart || []).length,
      savedCount: (st.saved_list || []).length,
      topCategories: topWeights(st.category_weights, 6),
      topTags: topWeights(st.tag_weights, 8),
    },
    rails: {
      learned: rails.learned,
      reason: rails.reason,
      topPicks: rails.topPicks.map((p) => ({
        id: p.product_id,
        name: p.name,
        price: p.price,
        ladder: !!p.ladder,
      })),
      somethingDifferent: rails.somethingDifferent.map((p) => ({
        id: p.product_id,
        name: p.name,
        price: p.price,
        ladder: !!p.ladder,
      })),
    },
    nextHandAfterSwipes: nextHand,
    sampleNudge: nudge,
  };
}

describe("frontend recommendation simulation", () => {
  it("runs yash morning path and writes report", () => {
    const bundle = getPersonaBundle("yash");
    const fitnessPath = runScenario("fitness_path_morning", { maxSwipes: 28 });
    const rejectPath = runScenario("reject_heavy", {
      maxSwipes: 16,
      policy: () => "left",
    });
    const cartPath = runScenario("cart_heavy_protein", {
      maxSwipes: 20,
      policy: (card) => {
        const blob = `${card.name} ${card.category}`;
        if (DISLIKE.test(blob) && !LIKE.test(blob)) return "left";
        if (LIKE.test(blob) || isLadderProduct(card)) return "top";
        return "left";
      },
    });

    const report = {
      generatedAt: new Date().toISOString(),
      frontendInputs: {
        personaId: "yash",
        timeWindow: "morning",
        vegOnly: bundle.persona.constraints.veg_only,
        priceSensitive: bundle.persona.constraints.price_sensitive,
        needs: bundle.persona.needs,
        goals: bundle.persona.goals,
        orderHistoryCount: bundle.persona.order_history.length,
        seedCandidates: bundle.candidates.length,
        expandedPool: fitnessPath.poolSize,
        catalogSize: catalog.length,
      },
      scenarios: [fitnessPath, rejectPath, cartPath],
    };

    writeFileSync(join(ROOT, "Docs/sim-frontend-recs.json"), JSON.stringify(report, null, 2));

    // Sanity checks for MVP finalisation
    expect(fitnessPath.coldDeck.length).toBeGreaterThan(0);
    expect(fitnessPath.coldDeck.every((c) => !c.ladder)).toBe(true);
    expect(fitnessPath.summary.swipes).toBeGreaterThan(10);
    // Live order write-back syncs boldness on top-swipe, so ladder can unlock earlier
    expect(fitnessPath.summary.ladderFirstAt).toBeGreaterThan(0);
    expect(fitnessPath.rails.learned).toBe(true);
    expect(fitnessPath.rails.somethingDifferent.some((p) => p.ladder)).toBe(true);
    expect(
      fitnessPath.rails.somethingDifferent.every(
        (p) => !/ice cream|cornetto|sundae/i.test(p.name),
      ),
    ).toBe(true);
    expect(rejectPath.rails.somethingDifferent.every((p) => !p.ladder)).toBe(true);
    expect(fitnessPath.sampleNudge?.cta).toBe("Add to cart");
    // No product repeats in swipe log
    const ids = fitnessPath.swipes.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);

    // Expose key lines in vitest output
    console.log("\n=== FRONTEND REC SIM (fitness_path_morning) ===");
    console.log("Cold deck:", fitnessPath.coldDeck.map((c) => c.name).join(" | "));
    console.log(
      "Actions:",
      fitnessPath.swipes.map((s) => `${s.n}:${s.action[0]} ${s.name}${s.ladder ? " [L]" : ""}`).join("\n  "),
    );
    console.log("Ladder first at swipe:", fitnessPath.summary.ladderFirstAt);
    console.log(
      "Top picks:",
      fitnessPath.rails.topPicks.map((p) => p.name).join(" · "),
    );
    console.log(
      "Something different:",
      fitnessPath.rails.somethingDifferent.map((p) => `${p.name}${p.ladder ? " [ladder]" : ""}`).join(" · "),
    );
    console.log("Nudge:", fitnessPath.sampleNudge);
  });
});
