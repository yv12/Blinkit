/**
 * Diet profile from order history — veg / eggetarian / non-veg.
 *
 * Frustration asymmetry:
 * - Veg user seeing chicken/fish → bad
 * - Non-veg user seeing paneer → fine
 *
 * Evidence ladder (strongest wins):
 *   meat/fish/chicken/prawns → nonveg
 *   eggs / egg-cake          → eggetarian
 *   otherwise                → veg
 */

export const DIET = {
  VEG: "veg",
  EGGETARIAN: "eggetarian",
  NONVEG: "nonveg",
};

const PET_TOP = /pet care/i;
const PET_PRODUCT =
  /\b(pet|dog|cat|puppy|kitten|canine|feline|aquarium|litter|meow|whiskas|sheba|pedigree|drools|huft|royal canin|fish food|bird food|pet food)\b/i;
const EGG_CAT = /^eggs?$/i;
const MEAT_TOP = /meat fish/i;

const MEAT_RE =
  /\b(chicken|mutton|meat|fish|prawn|seafood|salami|sausage|ham|bacon|keema|lamb|pork|beef|rohu|pomfret|non[\s-]?veg|turkey|duck)\b/i;

const EGG_RE = /\b(eggs?|eggetarian)\b/i;
const CAKE_RE = /\b(cake|pastry|muffin|brownie|donut|doughnut|croissant|waffle)\b/i;
const EGGLESS_RE = /\b(eggless|egg[\s-]?free|100%\s*veg)\b/i;

/** Pet aisle / pet-named SKUs — never count toward human diet. */
export function isPetProduct(item) {
  if (!item) return false;
  const top = String(item.top_category || "");
  const cat = String(item.category || "");
  const name = String(item.name || "");
  if (PET_TOP.test(top)) return true;
  if (/^cat needs$|^dog |^pet /i.test(cat)) return true;
  if (PET_PRODUCT.test(`${name} ${cat}`)) return true;
  return false;
}

/**
 * Classify a catalog/history item for human diet.
 * @returns {'veg'|'egg'|'nonveg'|null} null = ignore (pet food, non-food)
 */
export function classifyFoodDiet(item) {
  if (!item) return null;
  const top = String(item.top_category || "");
  const cat = String(item.category || "");
  const name = String(item.name || "");
  const blob = `${name} ${cat} ${top}`.toLowerCase();

  // Edge case: veg human + dog/cat — chicken pet food must NOT flip diet to nonveg
  if (isPetProduct(item)) return null;

  // Electronics, baby gear, household — ignore for diet
  if (
    /electronics|appliances|baby care|household|beauty|personal care|pharmacy|pharma/i.test(top) &&
    !MEAT_TOP.test(top)
  ) {
    return null;
  }

  // Eggs aisle / egg in product name (do NOT use top_category — "Meat Fish & Eggs" false-positives)
  if (EGG_CAT.test(cat)) return "egg";
  if (EGG_RE.test(name) && !MEAT_RE.test(name)) return "egg";
  if (CAKE_RE.test(`${name} ${cat}`) && !EGGLESS_RE.test(blob)) return "egg";

  if (MEAT_RE.test(blob) || /chicken|fish seafood|sausage salami/i.test(cat)) return "nonveg";
  if (item.veg_flag === false) {
    if (EGG_CAT.test(cat) || (EGG_RE.test(name) && !MEAT_RE.test(name))) return "egg";
    return "nonveg";
  }
  return "veg";
}

function dietRank(mode) {
  if (mode === DIET.NONVEG) return 2;
  if (mode === DIET.EGGETARIAN) return 1;
  return 0;
}

/**
 * Infer diet mode from past orders (+ optional live cart/purchases).
 * @param {{
 *   persona?: object,
 *   historyItems?: object[],
 *   extras?: object[],
 *   catalogById?: Map|Record<string, object>
 * }} opts
 */
export function inferDietMode({
  persona = null,
  historyItems = null,
  extras = [],
  catalogById = null,
} = {}) {
  const lockedVeg = !!persona?.constraints?.veg_only;
  const hist = historyItems || persona?.order_history || [];
  const lookup = (raw) => {
    if (!raw) return null;
    const id = raw.product_id || raw.id;
    if (catalogById) {
      const hit =
        typeof catalogById.get === "function" ? catalogById.get(id) : catalogById[id];
      if (hit) return { ...hit, ...raw };
    }
    return raw;
  };

  let mode = DIET.VEG;
  const evidence = [];

  for (const raw of [...hist, ...(extras || [])]) {
    const item = lookup(raw);
    const kind = classifyFoodDiet(item);
    if (!kind) continue;
    evidence.push({ id: item.product_id || item.id, name: item.name, kind });
    if (kind === "nonveg") mode = DIET.NONVEG;
    else if (kind === "egg" && dietRank(mode) < 1) mode = DIET.EGGETARIAN;
  }

  // Explicit persona lock: never recommend egg/meat even if history is noisy
  if (lockedVeg) mode = DIET.VEG;

  return {
    mode,
    locked_veg: lockedVeg,
    evidence,
  };
}

/**
 * Hard filter: may this product be recommended to this diet mode?
 */
export function allowsDietProduct(dietMode, product) {
  const kind = classifyFoodDiet(product);
  if (!kind || kind === "veg") return true;
  if (dietMode === DIET.NONVEG) return true;
  if (dietMode === DIET.EGGETARIAN) return kind === "egg";
  // veg
  return false;
}

/** Resolve diet for engine/rails from persona + live state. */
export function resolveDietMode(persona, state = null, catalogById = null) {
  const extras = [];
  if (state?.cart) extras.push(...state.cart);
  if (state?.purchased_ids) {
    for (const id of state.purchased_ids) {
      extras.push(
        typeof catalogById?.get === "function"
          ? catalogById.get(id) || { id }
          : { id },
      );
    }
  }
  return inferDietMode({ persona, extras, catalogById });
}
