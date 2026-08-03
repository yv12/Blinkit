/* Shared Blinkit hero: address, search rotation, category logo carousel */
/* Aisle browse uses real product photos only (no SVG tiles). */

import { PHOTOS } from "./recommend.js";

export const ADDR = "HOME · 103/2 Vasundhara, sector 5";

export const SEARCH_PHRASES = [
  'Search "Health Snacks"',
  'Search "House Party"',
  'Search "Morning chai"',
  'Search "Protein bars"',
  'Search "Fresh fruits"',
  'Search "Pharmacy"',
];

export const TAB_CATS = [
  { name: "All", logo: "◎", on: true },
  { name: "Rakhi", logo: "🎀" },
  { name: "Electronics", logo: "🔌" },
  { name: "Beauty", logo: "💄" },
  { name: "Pharmacy", logo: "💊" },
  { name: "Decor", logo: "🕯️" },
  { name: "Snacks", logo: "🍿" },
  { name: "Dairy", logo: "🥛" },
  { name: "Organic", logo: "🌿" },
];

function photo(id, name, price, cat) {
  return {
    id,
    name,
    price,
    cat,
    image: PHOTOS[id] || `./images/${id}.jpg`,
  };
}

/** Browse catalog keyed by tab name — photo products only. */
export const CATEGORY_PRODUCTS = {
  Rakhi: [
    photo("p01340", "Vahdam chamomile mint tea (gift vibe)", 249, "Rakhi"),
    photo("p03886", "Vicks ZzzQuil sleep gummies", 299, "Rakhi"),
    photo("p02629", "Yoga Bar protein bar gift", 99, "Rakhi"),
    photo("p05746", "Let's Try chana namkeen pack", 57, "Rakhi"),
  ],
  Electronics: [
    photo("p07026", "Boldfit digital weighing scale", 458, "Electronics"),
    photo("p06352", "Cosco resistance band", 249, "Electronics"),
    photo("p08035", "MuscleBlaze gym shaker", 299, "Electronics"),
    photo("p06348", "Boldfit gym gallon bottle 2L", 349, "Electronics"),
  ],
  Beauty: [
    photo("p04110", "Supradyn daily multivitamin", 68, "Beauty"),
    photo("p03901", "Centrum Men Multivitamin", 199, "Beauty"),
    photo("p03886", "Vicks ZzzQuil sleep gummies", 299, "Beauty"),
    photo("p01371", "Flurys chamomile herbal tea", 299, "Beauty"),
  ],
  Pharmacy: [
    photo("p04110", "Supradyn daily multivitamin", 68, "Pharmacy"),
    photo("p03901", "Centrum Men Multivitamin", 199, "Pharmacy"),
    photo("p03886", "Vicks ZzzQuil melatonin gummies", 299, "Pharmacy"),
    photo("p03917", "Nutrabay micronized creatine", 449, "Pharmacy"),
  ],
  Decor: [
    photo("p01340", "Vahdam chamomile mint tea", 249, "Decor"),
    photo("p01371", "Flurys chamomile infusion", 299, "Decor"),
    photo("p06348", "Boldfit gallon bottle", 349, "Decor"),
    photo("p08035", "MuscleBlaze shaker", 299, "Decor"),
  ],
  Snacks: [
    photo("p05999", "Lay's India's Magic Masala", 25, "Snacks"),
    photo("p05997", "Bingo Mad Angles Achaari Masti", 19, "Snacks"),
    photo("p05746", "Let's Try chana dal namkeen", 57, "Snacks"),
    photo("p02629", "Yoga Bar 20g protein bar", 99, "Snacks"),
    photo("p02580", "RiteBite Max Protein bar", 80, "Snacks"),
    photo("p02591", "SuperYou wafer protein bar", 205, "Snacks"),
  ],
  Dairy: [
    photo("p01916", "Milky Mist Skyr High Protein", 65, "Dairy"),
    photo("p02062", "Milky Mist High Protein Paneer", 120, "Dairy"),
    photo("p02057", "Amul Fresh Malai Paneer", 90, "Dairy"),
    photo("p01961", "Yoga Bar rolled oats", 230, "Dairy"),
    photo("p01267", "Amul Protein Blueberry Shake", 60, "Dairy"),
    photo("p90012", "Baker's Loaf high-protein bread", 72, "Dairy"),
  ],
  Organic: [
    photo("p01961", "Yoga Bar gluten-free oats", 230, "Organic"),
    photo("p02104", "Harvest Gold atta wheat bread", 45, "Organic"),
    photo("p01340", "Vahdam chamomile mint tea", 249, "Organic"),
    photo("p01371", "Flurys pure chamomile tea", 299, "Organic"),
  ],
};

/** Products for a tab category. "All" returns a flat mix across tabs. */
export function productsForCategory(name = "All") {
  if (!name || name === "All") {
    return Object.values(CATEGORY_PRODUCTS).flat();
  }
  return CATEGORY_PRODUCTS[name] || [];
}

const CART_SVG = `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 5h2l1.5 10h11L21 7H7"/><circle cx="10" cy="19" r="1.4" fill="currentColor" stroke="none"/><circle cx="17" cy="19" r="1.4" fill="currentColor" stroke="none"/></svg>`;

/**
 * @param {HTMLElement} host  element to replace / fill with <header class="hero">
 */
export function mountHero(host, opts = {}) {
  const {
    etaLabel = "Blinkit in",
    eta = "13 minutes",
    etaId = "",
    showSearch = true,
    showTabs = true,
    showCart = true,
    activeTab = "All",
    onTabSelect = null,
    navigateTabs = undefined,
  } = opts;

  const etaAttr = etaId ? ` id="${etaId}"` : "";
  const search = showSearch
    ? `<form class="searchbar" action="./search.html" method="get" role="search" data-search-form>
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#1F1F1F" stroke-width="2.6" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>
        <input
          type="search"
          name="q"
          data-search-input
          data-search-ph
          enterkeyhint="search"
          autocomplete="off"
          spellcheck="false"
          placeholder="${SEARCH_PHRASES[0].replace(/^Search\s+/, "").replace(/"/g, "")}"
          value="${String(opts.searchValue || "").replace(/"/g, "&quot;")}"
          aria-label="Search products"
        />
      </form>`
    : "";

  const tabs = showTabs
    ? `<nav class="tabs" data-tabs aria-label="Categories"></nav>`
    : "";

  const cart = showCart
    ? `<button type="button" class="hero-cart" data-cart-btn aria-label="Cart, empty">
        ${CART_SVG}
        <span class="hero-cart-count" data-cart-count hidden>0</span>
      </button>`
    : "";

  host.outerHTML = `<header class="hero">
    <div class="hero-top">
      <div class="hero-top-text">
        <div class="eta-label">${etaLabel}</div>
        <div class="eta"${etaAttr}>${eta}</div>
      </div>
      ${cart}
    </div>
    <div class="addr">${ADDR}</div>
    ${search}
    ${tabs}
  </header>`;

  const hero = document.querySelector(".hero");
  if (showSearch) {
    const input = hero.querySelector("[data-search-input]");
    if (input && !opts.searchValue) startSearchRotation(input);
  }
  if (showTabs) {
    mountTabs(hero.querySelector("[data-tabs]"), {
      active: activeTab,
      onSelect: onTabSelect,
      navigate: navigateTabs,
    });
  }
  return hero;
}

export function startSearchRotation(el) {
  if (!el) return;
  let i = 0;
  const apply = () => {
    const phrase = SEARCH_PHRASES[i];
    const bare = phrase.replace(/^Search\s+/i, "").replace(/"/g, "");
    if (el.tagName === "INPUT") el.placeholder = bare;
    else el.textContent = phrase;
  };
  apply();
  setInterval(() => {
    i = (i + 1) % SEARCH_PHRASES.length;
    apply();
  }, 2400);
}

export function mountTabs(el, opts = {}) {
  if (!el) return;
  const { active = "All", onSelect = null, navigate = !onSelect } = opts;

  el.innerHTML = TAB_CATS.map(
    (t) => `
    <div class="tab-item${t.name === active ? " on" : ""}" role="button" tabindex="0" data-cat="${t.name}">
      <div class="logo" aria-hidden="true">${t.logo}</div>
      <span>${t.name}</span>
    </div>
  `,
  ).join("");

  el.querySelectorAll(".tab-item").forEach((item) => {
    const select = () => {
      const name = item.dataset.cat || "All";
      el.querySelectorAll(".tab-item").forEach((x) => x.classList.toggle("on", x === item));
      if (onSelect) onSelect(name);
      else if (navigate) {
        const q = name === "All" ? "" : `?cat=${encodeURIComponent(name)}`;
        location.href = `./category.html${q}`;
      }
    };
    item.addEventListener("click", select);
    item.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        select();
      }
    });
  });
}
