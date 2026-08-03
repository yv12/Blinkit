import { describe, expect, it } from "vitest";
import { searchProducts, suggestSearch, queryIntentSignals } from "./productSearch.js";

const CATALOG = [
  {
    id: "p1",
    name: "Yoga Bar 20g protein bar",
    brand: "Yoga Bar",
    category: "Energy Bars",
    top_category: "Snacks & Munchies",
    need_tags: ["protein"],
    goal_tags: ["fitness"],
    price: 99,
  },
  {
    id: "p2",
    name: "Lay's India's Magic Masala",
    brand: "Lay's",
    category: "Chips Crisps",
    top_category: "Snacks & Munchies",
    need_tags: ["snack"],
    goal_tags: ["craving"],
    price: 25,
  },
  {
    id: "p3",
    name: "Amul Fresh Malai Paneer",
    brand: "Amul",
    category: "Paneer Tofu",
    top_category: "Dairy & Breakfast",
    need_tags: ["protein"],
    goal_tags: ["cooking"],
    price: 90,
  },
];

describe("productSearch", () => {
  it("ranks protein bar above chips for protein query", () => {
    const hits = searchProducts(CATALOG, "protein bar");
    expect(hits[0].product.id).toBe("p1");
  });

  it("suggests product labels", () => {
    const s = suggestSearch(CATALOG, "paneer");
    expect(s.some((x) => x.product_id === "p3")).toBe(true);
  });

  it("builds intent tag boosts from query", () => {
    const sig = queryIntentSignals(CATALOG, "protein");
    expect(sig.tagBoosts.protein).toBeGreaterThan(0);
    expect(sig.topHit?.id).toBeTruthy();
  });
});
