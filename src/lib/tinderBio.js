/**
 * Short Tinder-style taglines for product cards — first-person, cheeky, one line.
 * Not a product name. Not a shopping essay.
 */

const BY_VIBE = {
  protein: [
    "20g protein. Zero excuses.",
    "Here for gains, not games.",
    "Gym bag essential. Swipe right if you lift.",
    "Protein first. Small talk later.",
    "Looking for a PR, not a situationship.",
  ],
  fitness: [
    "Cardio optional. Consistency isn't.",
    "Training days only. Rest days soft.",
    "Will match if you show up.",
    "Main character energy, gym edition.",
  ],
  snack: [
    "Midnight craving? Say less.",
    "Not looking for forever — just the next bite.",
    "Crunchy. Unbothered. In your cart.",
    "Snack personality. Commit if you dare.",
  ],
  sweet: [
    "Sweet tooth, soft launch.",
    "Dessert before dinner. I said what I said.",
    "Sugar and spice. Mostly sugar.",
  ],
  drink: [
    "Hydration station. Flirt responsibly.",
    "Cold, quick, no small talk.",
    "Sip first. Decide later.",
  ],
  tea: [
    "Soft nights. Softer exits.",
    "Chamomile energy. Leave your drama at the door.",
    "Here to unwind, not to argue.",
  ],
  breakfast: [
    "Morning person (after coffee).",
    "Breakfast club. Membership: one swipe.",
    "Start the day like you mean it.",
  ],
  dairy: [
    "High protein, low drama.",
    "Creamy. Reliable. Always in the fridge.",
    "Dairy aisle regular. Own it.",
  ],
  bread: [
    "Carb curious. Soft launch.",
    "Toast-worthy. That's the bio.",
    "Fresh out the bag. Hot take.",
  ],
  wellness: [
    "Daily dose of 'I tried'.",
    "Wellness arc unlocked.",
    "Small habit. Big main character energy.",
  ],
  sleep: [
    "9pm bedtime. Don't text.",
    "Sleep maxxing. Swipe if you get it.",
    "Quiet hours start now.",
  ],
  cleaning: [
    "Clean girl / clean boy era.",
    "Sparkle is a personality.",
    "Tidying up — vibe check passed.",
  ],
  gear: [
    "Level-up aisle. Not another snack.",
    "Gear check. Gains pending.",
    "From fridge to fitness floor.",
    "Serious tools for a serious streak.",
  ],
  electronics: [
    "Smart upgrade. Soft launch.",
    "Not dairy. Still daily.",
    "Plug in. Level up.",
    "Cross-aisle curiosity, charged.",
  ],
  discovery: [
    "New aisle, who dis?",
    "Not your usual. That's the point.",
    "Cross-category curiosity.",
    "Here to change your cart, not your life… maybe both.",
    "Swipe if you're bored of the same 5 SKUs.",
  ],
};

function hashId(id = "") {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return h;
}

function pickVibe(product) {
  const blob = [
    product?.name,
    product?.category,
    product?.top_category,
    product?.shared_tag,
    ...(product?.need_tags || []),
    ...(product?.goal_tags || []),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (/weigh|scale|glove|resistance|shaker|sports fitness/.test(blob)) return "gear";
  if (/electron|earphone|watch|charger|cable|trimmer|appliance|keyboard/.test(blob)) {
    return "electronics";
  }
  if (/whey|protein|paneer|skyr|greek|shake|bar/.test(blob)) return "protein";
  if (/gym|creatine|fitness|workout/.test(blob)) return "fitness";
  if (/chip|namkeen|bhujia|crisp|snack|popcorn/.test(blob)) return "snack";
  if (/chocolate|cookie|biscuit|ice cream|dessert|sweet|candy/.test(blob)) return "sweet";
  if (/tea|chamomile|sleep|melatonin/.test(blob)) return "tea";
  if (/juice|soda|water|beverage|drink|lassi|coffee/.test(blob)) return "drink";
  if (/oat|cereal|breakfast|muesli/.test(blob)) return "breakfast";
  if (/milk|curd|yogurt|butter|cheese|dairy/.test(blob)) return "dairy";
  if (/bread|pav|loaf|bun|bakery/.test(blob)) return "bread";
  if (/vitamin|supplement|wellness|pharma/.test(blob)) return "wellness";
  if (/clean|detergent|dish|floor|wipe/.test(blob)) return "cleaning";
  if (/sleep|night/.test(blob)) return "sleep";
  return "discovery";
}

/** True if bio looks like a truncated product name, not a tagline. */
export function looksLikeProductName(bio, productName) {
  const b = String(bio || "").trim().toLowerCase();
  if (!b) return true;
  const n = String(productName || "").trim().toLowerCase();
  if (!n) return false;
  if (b === n || n.startsWith(b) || b.startsWith(n.slice(0, 20))) return true;
  // Brand-heavy / too noun-y
  if (b.length > 40) return true;
  if (/\b(rs|₹|ml|g protein|pack of)\b/i.test(b)) return true;
  return false;
}

/**
 * Stable Tinder-style tagline for a product.
 */
export function tinderBio(product) {
  const vibe = pickVibe(product);
  const lines = BY_VIBE[vibe] || BY_VIBE.discovery;
  const idx = hashId(product?.product_id || product?.id || product?.name || "") % lines.length;
  return lines[idx];
}

/** Prefer existing cheeky bio; replace name-dumps. */
export function ensureTinderBio(product) {
  const existing = product?.bio;
  if (existing && !looksLikeProductName(existing, product?.name)) {
    return String(existing).trim();
  }
  return tinderBio(product);
}
