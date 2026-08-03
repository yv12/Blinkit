import { describe, expect, it } from "vitest";
import { lookupStaticNudge, USE_LLM_NUDGES } from "./nudgeLlm.js";

describe("static nudges.json", () => {
  it("defaults USE_LLM_NUDGES to false in test env", () => {
    expect(USE_LLM_NUDGES).toBe(false);
  });

  it("looks up by product id without rewriting", () => {
    const copy = lookupStaticNudge({
      product_id: "p07026",
      name: "Boldfit Prime Digital Weighing Machine",
    });
    expect(copy.source).toBe("static");
    expect(copy.title).toBe("Sach bolungi");
    expect(copy.body).toContain("Boldfit Digital Weighing Machine");
    expect(copy.cta).toBe("Dekho");
  });

  it("uses _default and replaces {product_name}", () => {
    const copy = lookupStaticNudge({
      product_id: "p_missing_xyz",
      name: "Mystery Snack Pack",
    });
    expect(copy.source).toBe("static_default");
    expect(copy.body).toContain("Mystery Snack Pack");
    expect(copy.body).not.toContain("{product_name}");
  });
});
