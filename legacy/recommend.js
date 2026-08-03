/* ============================================================
   recommend.js — ladder / slot policy shared by every screen
   Photos only (./images/pXXXX.jpg) — no SVG product tiles.
   ============================================================ */

export const DAILY_LIMIT = 3;
export const FREE_DELIVERY_THRESHOLD = 99;
export const PERSONA_KEY = "swipe_persona";

/** Real product photos (served from /images at repo root or Vite public/). */
const PHOTOS = {
  p01267: "/images/p01267.jpg",
  p01340: "/images/p01340.jpg",
  p01371: "/images/p01371.jpg",
  p01916: "/images/p01916.jpg",
  p01961: "/images/p01961.jpg",
  p02057: "/images/p02057.jpg",
  p02062: "/images/p02062.jpg",
  p02104: "/images/p02104.jpg",
  p02580: "/images/p02580.jpg",
  p02591: "/images/p02591.jpg",
  p02629: "/images/p02629.jpg",
  p03022: "/images/p03022.jpg",
  p03886: "/images/p03886.jpg",
  p03901: "/images/p03901.jpg",
  p03913: "/images/p03913.jpg",
  p03917: "/images/p03917.jpg",
  p04110: "/images/p04110.jpg",
  p04339: "/images/p04339.jpg",
  p05746: "/images/p05746.jpg",
  p05997: "/images/p05997.jpg",
  p05999: "/images/p05999.jpg",
  p06339: "/images/p06339.jpg",
  p06346: "/images/p06346.jpg",
  p06348: "/images/p06348.jpg",
  p06349: "/images/p06349.jpg",
  p06352: "/images/p06352.jpg",
  p07026: "/images/p07026.jpg",
  p08035: "/images/p08035.webp",
  p90012: "/images/p90012.jpg",
};

function img(id) {
  if (PHOTOS[id]) return PHOTOS[id];
  return `/images/${id}.jpg`;
}

function p(id, name, price, cat, extra = {}) {
  return { id, product_id: id, name, price, cat, image: img(id), ...extra };
}

/** Hardcoded persona ladders (L2 / L3 / L4). Bios are English on UI; nudges stay Hinglish. */
export const PERSONAS = {
  yash: {
    id: "yash",
    name: "Yash",
    blurb: "High protein + zero sugar → cut / gym ladder",
    /* Basket = order history items that have real photos (Skyr, Coke, paneer…). */
    basket: [
      p("p01916", "Milky Mist Skyr High Protein Plain Yogurt", 65, "Dairy & Breakfast"),
      p("p02062", "Milky Mist Low Fat High Protein Paneer", 120, "Dairy & Breakfast"),
      p("p90012", "Baker's Loaf Harvest Gold High Protein Bread", 72, "Bakery & Biscuits"),
      p("p01961", "Yoga Bar Premium Golden Rolled Oats", 230, "Dairy & Breakfast"),
      p("p02629", "Yoga Bar 20g Protein Bar (Coffee Rush)", 99, "Snacks & Munchies"),
      p("p02580", "RiteBite Max Protein 10g Bar (Choco Almond)", 80, "Snacks & Munchies"),
      p("p02591", "SuperYou Chocolate Wafer Protein Bar", 205, "Snacks & Munchies"),
      p("p05999", "Lay's India's Magic Masala Potato Chips", 25, "Snacks & Munchies"),
      p("p05997", "Bingo Mad Angles Achaari Masti Crisps", 19, "Snacks & Munchies"),
      p("p05746", "Let's Try Signature Chana Dal Namkeen", 57, "Snacks & Munchies"),
      p("p04339", "Coca-Cola Diet Coke 750ml (Pack of 6)", 36, "Beverages"),
      p("p03022", "Harpic Disinfectant Bathroom Cleaner (Lemon)", 163, "Home & Cleaning"),
    ],
    catalog: {
      L2: [
        p("p01267", "Amul Protein Blueberry Shake", 60, "Protein drinks", {
          mrp: 75,
          bio: '"Protein shake aisle — not another Skyr."',
          bridge: "paneer + Skyr, new category",
        }),
        p("p03913", "MuscleBlaze whey sachets", 799, "Supplements", {
          mrp: 999,
          bio: '"Supplements aisle, not dairy."',
          bridge: "high-protein habit → whey",
        }),
      ],
      L3: [
        p("p07026", "Boldfit digital weighing scale", 458, "Fitness", {
          mrp: 599,
          bio: '"Measure the cut — new category."',
          bridge: "protein → weight loss",
        }),
        p("p04110", "Supradyn daily multivitamin", 68, "Pharma", {
          mrp: 120,
          bio: '"Micros, not more curd."',
          bridge: "cut diet → vitamins",
        }),
        p("p03901", "Centrum Men Multivitamin", 199, "Pharma", {
          mrp: 299,
          bio: '"Daily micros for the cut."',
          bridge: "cut diet → vitamins",
        }),
        p("p03917", "Nutrabay micronized creatine", 449, "Supplements", {
          mrp: 599,
          bio: '"Training stack, not another bar."',
          bridge: "gym goal",
        }),
        p("p06346", "Lifelong gym gloves", 399, "Fitness", {
          mrp: 499,
          bio: '"Gym aisle, not snacks."',
          bridge: "fitness goal",
        }),
        p("p06352", "Cosco resistance band", 249, "Fitness", {
          mrp: 399,
          bio: '"Home workouts, zero excuses."',
          bridge: "fitness goal",
        }),
        p("p08035", "MuscleBlaze gym shaker", 299, "Fitness", {
          mrp: 399,
          bio: '"Shake aisle — whey needs a home."',
          bridge: "protein routine",
        }),
        p("p06348", "Boldfit gym gallon bottle 2L", 349, "Fitness", {
          mrp: 449,
          bio: '"Hydration for long sessions."',
          bridge: "fitness goal",
        }),
      ],
      L4: [
        p("p03886", "Vicks ZzzQuil sleep gummies", 299, "Wellness", {
          mrp: 399,
          bio: '"Recovery aisle after training days."',
          bridge: "lifestyle halo",
        }),
        p("p01340", "Vahdam chamomile mint green tea", 249, "Tea", {
          mrp: 349,
          bio: '"Wind-down tea, not another snack."',
          bridge: "recovery",
        }),
      ],
    },
  },

  fitness: {
    id: "fitness",
    name: "Fitness (Akash)",
    blurb: "Whey, oats, milk — protein ladder",
    basket: [
      p("p03913", "MuscleBlaze whey sachets", 799, "Dairy & Breakfast"),
      p("p01961", "Yoga Bar rolled oats 1kg", 230, "Dairy & Breakfast"),
      p("p01267", "Amul Protein Blueberry Shake", 60, "Dairy & Breakfast"),
    ],
    catalog: {
      L2: [
        p("p02629", "Yoga Bar 20g protein bar", 99, "Energy bars", {
          mrp: 120,
          bio: '"Coffee rush, no added sugar."',
          bridge: "whey protein",
        }),
        p("p02580", "RiteBite Max Protein bar", 80, "Energy bars", {
          mrp: 99,
          bio: '"Protein, grab-and-go."',
          bridge: "oats",
        }),
        p("p05746", "Let's Try chana dal namkeen", 57, "Snacks", {
          mrp: 75,
          bio: '"Protein, no fridge needed."',
          bridge: "whey protein",
        }),
      ],
      L3: [
        p("p07026", "Boldfit digital weighing scale", 458, "Kitchen", {
          mrp: 599,
          bio: '"I measure. You eat."',
          bridge: "protein routine",
        }),
        p("p06352", "Cosco resistance band", 249, "Fitness", {
          mrp: 399,
          bio: '"Home workouts, zero excuses."',
          bridge: "protein routine",
        }),
      ],
      L4: [
        p("p08035", "MuscleBlaze gym shaker", 299, "Lifestyle", {
          mrp: 399,
          bio: '"All-day hydration buddy."',
          bridge: "fitness lifestyle",
        }),
      ],
    },
  },
  household: {
    id: "household",
    name: "Household",
    blurb: "Bread, staples, cleaning — home ladder",
    basket: [
      p("p90012", "Baker's Loaf high-protein bread", 72, "Bakery"),
      p("p02104", "Harvest Gold Atta whole wheat bread", 45, "Bakery"),
      p("p02057", "Amul Fresh Malai Paneer", 90, "Dairy & Breakfast"),
      p("p04339", "Coca-Cola Diet Coke", 36, "Drinks"),
    ],
    catalog: {
      L2: [
        p("p03022", "Harpic bathroom cleaner", 163, "Cleaning", {
          mrp: 199,
          bio: '"After dinner, the sink waits."',
          bridge: "home rhythm",
        }),
        p("p05746", "Let's Try chana namkeen", 57, "Snacks", {
          mrp: 75,
          bio: '"Pantry snack that lasts."',
          bridge: "staples",
        }),
        p("p05999", "Lay's Magic Masala", 25, "Snacks", {
          mrp: 30,
          bio: '"Evening crunch sorted."',
          bridge: "treats",
        }),
      ],
      L3: [
        p("p07026", "Boldfit weighing scale", 458, "Storage", {
          mrp: 599,
          bio: '"Portion control at home."',
          bridge: "monthly staples",
        }),
        p("p06348", "Boldfit gallon bottle 2L", 349, "Storage", {
          mrp: 449,
          bio: '"Make room for cold drinks."',
          bridge: "cold drinks",
        }),
      ],
      L4: [
        p("p01371", "Flurys chamomile herbal tea", 299, "Lifestyle", {
          mrp: 399,
          bio: '"Running a home is a sport too."',
          bridge: "household rhythm",
        }),
      ],
    },
  },
  explorer: {
    id: "explorer",
    name: "Explorer",
    blurb: "Snacks, drinks, treats — explorer ladder",
    basket: [
      p("p05999", "Lay's India's Magic Masala", 25, "Snacks"),
      p("p04339", "Coca-Cola Diet Coke", 36, "Drinks"),
      p("p02629", "Yoga Bar protein bar", 99, "Snacks"),
    ],
    catalog: {
      L2: [
        p("p05997", "Bingo Mad Angles crisps", 19, "Snacks", {
          mrp: 25,
          bio: '"A step up from biscuits."',
          bridge: "chips",
        }),
        p("p05746", "Let's Try chana dal", 57, "Snacks", {
          mrp: 75,
          bio: '"Late-night plan with a cold drink."',
          bridge: "cold drinks",
        }),
        p("p02591", "SuperYou wafer protein bar", 205, "Snacks", {
          mrp: 249,
          bio: '"Sweet-ish, still protein."',
          bridge: "treats",
        }),
      ],
      L3: [
        p("p01267", "Amul Protein Blueberry Shake", 60, "Drinks", {
          mrp: 75,
          bio: '"Movie night fuel."',
          bridge: "snack evenings",
        }),
        p("p03886", "Vicks ZzzQuil sleep gummies", 299, "Wellness", {
          mrp: 399,
          bio: '"Treats, then lights out."',
          bridge: "evenings",
        }),
      ],
      L4: [
        p("p01340", "Vahdam chamomile mint tea", 249, "Lifestyle", {
          mrp: 349,
          bio: '"Treats deserve a little calm."',
          bridge: "explorer vibes",
        }),
      ],
    },
  },
};

export function getPersonaId() {
  try {
    const id = localStorage.getItem(PERSONA_KEY);
    /* Older demos defaulted to fitness/Akash — migrate to your real orders. */
    if (!id || id === "fitness") {
      localStorage.setItem(PERSONA_KEY, "yash");
      return "yash";
    }
    return PERSONAS[id] ? id : "yash";
  } catch {
    return "yash";
  }
}

export function setPersonaId(id) {
  try {
    localStorage.setItem(PERSONA_KEY, id);
  } catch {
    /* ignore */
  }
}

export function getPersona() {
  return PERSONAS[getPersonaId()] || PERSONAS.yash;
}

export function createState(personaId = getPersonaId()) {
  return {
    personaId,
    played: 0,
    savedCount: 0,
    cartCount: 0,
    acceptedCount: 0,
    consecutiveDismissals: 0,
    unlockedMaxLevel: 3,
    unlockedMax: 3,
    idx: { L2: 0, L3: 0, L4: 0 },
    turn: 0,
    forceL2: false,
    current: null,
    saved: [],
    cart: [],
    cartTotal: 0,
    freeDeliveryThreshold: FREE_DELIVERY_THRESHOLD,
    lastOrderDelivered: false,
    daysSinceOpen: 0,
    seen: [],
    backgroundSentToday: 0,
    inAppShownThisSession: 0,
    onAddToCart: null,
  };
}

export function pickLevel(state) {
  if (state.forceL2) {
    state.forceL2 = false;
    return 2;
  }
  const unlocked = state.unlockedMaxLevel ?? state.unlockedMax ?? 3;
  if (unlocked >= 4 && state.turn % 4 === 3) return 4;
  if (state.turn % 3 === 2) return 3;
  return 2;
}

export function nextCard(state, catalog) {
  const lvl = pickLevel(state);
  state.turn++;
  const key = "L" + lvl;
  const pool = catalog[key];
  const item = pool[state.idx[key] % pool.length];
  state.idx[key]++;
  const card = Object.assign({ level: lvl }, item);
  state.current = card;
  return card;
}

/**
 * Apply a swipe. kind: "skip" | "save" | "add"
 * UI toasts are English; Hinglish is reserved for nudges/notifications.
 */
export function applySwipe(state, kind) {
  const card = state.current;
  if (!card) return { toast: "", finished: true };

  if (kind === "skip") {
    state.consecutiveDismissals++;
    if (state.consecutiveDismissals >= 2) {
      state.forceL2 = true;
      state.consecutiveDismissals = 0;
    }
    state.played++;
    if (card.name && !state.seen.includes(card.name)) state.seen.push(card.name);
    return {
      toast: "Okay, moving on",
      finished: state.played >= DAILY_LIMIT,
      accepted: false,
    };
  }

  state.consecutiveDismissals = 0;
  state.acceptedCount++;
  if (state.acceptedCount >= 3) {
    state.unlockedMaxLevel = 4;
    state.unlockedMax = 4;
  }

  if (kind === "save") {
    state.savedCount++;
    state.saved.push({ ...card });
    state.played++;
    if (card.name && !state.seen.includes(card.name)) state.seen.push(card.name);
    return {
      toast: "Saved. We'll tell you if the price drops",
      finished: state.played >= DAILY_LIMIT,
      accepted: true,
    };
  }

  state.cartCount++;
  state.cart.push({ ...card });
  state.cartTotal += card.price;
  state.played++;
  if (card.name && !state.seen.includes(card.name)) state.seen.push(card.name);
  if (typeof state.onAddToCart === "function") state.onAddToCart(card);
  return {
    toast: "Added to cart",
    finished: state.played >= DAILY_LIMIT,
    accepted: true,
  };
}

/** Order-tracking variant: up = add to this order. */
export function applySwipeOrder(state, kind) {
  const result = applySwipe(state, kind);
  if (kind === "add") {
    result.toast = "Added to this order";
  }
  return result;
}

export { PHOTOS, img };
