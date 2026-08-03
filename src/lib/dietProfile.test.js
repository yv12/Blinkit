import { describe, expect, it } from "vitest";
import {
  DIET,
  allowsDietProduct,
  classifyFoodDiet,
  inferDietMode,
} from "./dietProfile.js";

const paneer = {
  id: "p1",
  name: "Milky Mist Paneer",
  category: "Paneer Tofu",
  top_category: "Dairy & Breakfast",
  veg_flag: true,
};
const eggs = {
  id: "p2",
  name: "Table White Eggs",
  category: "Eggs",
  top_category: "Meat Fish & Eggs",
  veg_flag: false,
};
const chicken = {
  id: "p3",
  name: "Licious Chicken Curry Cut",
  category: "Chicken",
  top_category: "Meat Fish & Eggs",
  veg_flag: false,
};
const prawns = {
  id: "p4",
  name: "ITC Master Chef Large Prawns",
  category: "Fish Seafood",
  top_category: "Meat Fish & Eggs",
  veg_flag: false,
};
const cake = {
  id: "p5",
  name: "Chocolate Truffle Cake",
  category: "Cakes",
  top_category: "Bakery & Biscuits",
  veg_flag: true,
};
const petFood = {
  id: "p6",
  name: "HUFT Dog Food Classic Chicken",
  category: "Dog Food",
  top_category: "Pet Care",
  veg_flag: false,
};

describe("dietProfile", () => {
  it("classifies veg / egg / nonveg / ignore pet", () => {
    expect(classifyFoodDiet(paneer)).toBe("veg");
    expect(classifyFoodDiet(eggs)).toBe("egg");
    expect(classifyFoodDiet(chicken)).toBe("nonveg");
    expect(classifyFoodDiet(prawns)).toBe("nonveg");
    expect(classifyFoodDiet(cake)).toBe("egg");
    expect(classifyFoodDiet(petFood)).toBe(null);
  });

  it("infers veg from dairy/protein history", () => {
    const { mode } = inferDietMode({
      persona: {
        constraints: { veg_only: true },
        order_history: [paneer],
      },
    });
    expect(mode).toBe(DIET.VEG);
  });

  it("eggs/cake → eggetarian when not veg_only locked", () => {
    const { mode } = inferDietMode({
      persona: {
        constraints: { veg_only: false },
        order_history: [paneer, eggs],
      },
    });
    expect(mode).toBe(DIET.EGGETARIAN);
  });

  it("chicken/prawns → nonveg", () => {
    const { mode } = inferDietMode({
      persona: {
        constraints: { veg_only: false },
        order_history: [paneer, chicken],
      },
    });
    expect(mode).toBe(DIET.NONVEG);
  });

  it("veg_only lock stays veg even if eggs in history", () => {
    const { mode } = inferDietMode({
      persona: {
        constraints: { veg_only: true },
        order_history: [eggs, chicken],
      },
    });
    expect(mode).toBe(DIET.VEG);
  });

  it("pet chicken food does not unlock nonveg", () => {
    const { mode } = inferDietMode({
      persona: {
        constraints: { veg_only: false },
        order_history: [paneer, petFood],
      },
    });
    expect(mode).toBe(DIET.VEG);
  });

  it("veg pet owner stays veg after dog/cat chicken buys, but can still get pet SKUs", () => {
    const sheba = {
      id: "p7",
      name: "Sheba Melty Creamy Cat Treat Chicken & Whitefish",
      category: "Cat Needs",
      top_category: "Pet Care",
      veg_flag: false,
    };
    const { mode, evidence } = inferDietMode({
      persona: {
        constraints: { veg_only: true },
        order_history: [paneer, petFood, sheba],
      },
    });
    expect(mode).toBe(DIET.VEG);
    expect(evidence.every((e) => e.kind !== "nonveg")).toBe(true);
    // Pet aisle stays visible for veg shoppers (not a human-food violation)
    expect(allowsDietProduct(DIET.VEG, petFood)).toBe(true);
    expect(allowsDietProduct(DIET.VEG, sheba)).toBe(true);
    expect(allowsDietProduct(DIET.VEG, chicken)).toBe(false);
  });

  it("allowsDietProduct asymmetry", () => {
    expect(allowsDietProduct(DIET.VEG, chicken)).toBe(false);
    expect(allowsDietProduct(DIET.VEG, eggs)).toBe(false);
    expect(allowsDietProduct(DIET.VEG, paneer)).toBe(true);
    expect(allowsDietProduct(DIET.EGGETARIAN, eggs)).toBe(true);
    expect(allowsDietProduct(DIET.EGGETARIAN, chicken)).toBe(false);
    expect(allowsDietProduct(DIET.NONVEG, chicken)).toBe(true);
    expect(allowsDietProduct(DIET.NONVEG, paneer)).toBe(true);
  });
});
