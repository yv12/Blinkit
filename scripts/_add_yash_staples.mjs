import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function ensureSvg(id, label) {
  for (const dir of ["public/images", "dist/images"]) {
    const abs = path.join(ROOT, dir);
    fs.mkdirSync(abs, { recursive: true });
    const fp = path.join(abs, `${id}.svg`);
    if (fs.existsSync(fp)) continue;
    const init = String(label)
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w[0] || "")
      .join("")
      .toUpperCase();
    const safe = String(label).slice(0, 32).replace(/[<>&]/g, "");
    fs.writeFileSync(
      fp,
      `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600" viewBox="0 0 600 600">
  <rect width="600" height="600" fill="#FFF8E1"/>
  <circle cx="300" cy="230" r="90" fill="#F9A825" opacity="0.2"/>
  <text x="300" y="250" text-anchor="middle" font-family="Georgia, serif" font-size="56" fill="#F57F17" font-weight="700">${init}</text>
  <text x="300" y="400" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif" font-size="20" fill="#F57F17" font-weight="700">${safe}</text>
</svg>
`,
    );
  }
}

const catalogPath = path.join(ROOT, "data", "catalog.json");
const personaPath = path.join(ROOT, "data", "persona_yash.json");
const candidatesPath = path.join(ROOT, "data", "candidates_yash.json");

const catalog = JSON.parse(fs.readFileSync(catalogPath, "utf8"));
const byId = new Map(catalog.map((p) => [p.id, p]));

const staples = [
  {
    id: "p02062",
    name: "Milky Mist Low Fat High Protein Paneer",
    brand: "Milky Mist",
    category: "Paneer Tofu",
    top_category: "Dairy & Breakfast",
    subcategory: "Paneer Tofu",
    price: 120,
    mrp: 160,
    unit: "200 g",
    need_tags: ["protein", "breakfast", "cooking"],
    goal_tags: ["fitness", "weight_loss"],
    time_tags: ["morning", "evening", "anytime"],
  },
  {
    // Not in Blinkit scrape under this exact SKU — kept as your ordered item for MVP history
    id: "p90012",
    name: "Baker's Loaf Harvest Gold - High Protein Bread",
    brand: "Harvest Gold",
    category: "Bread Pav",
    top_category: "Bakery & Biscuits",
    subcategory: "Bread Pav",
    price: 72,
    mrp: 95,
    unit: "350 g",
    need_tags: ["protein", "breakfast", "staples"],
    goal_tags: ["fitness", "weight_loss"],
    time_tags: ["morning", "afternoon"],
  },
];

for (const s of staples) {
  ensureSvg(s.id, s.brand || s.name);
  if (byId.has(s.id)) {
    Object.assign(byId.get(s.id), {
      name: s.name,
      brand: s.brand,
      price: s.price,
      mrp: s.mrp,
      unit: s.unit,
      need_tags: s.need_tags,
      goal_tags: s.goal_tags,
      time_tags: s.time_tags,
    });
  } else {
    const row = {
      ...s,
      image_url: `/images/${s.id}.svg`,
      in_stock: true,
      veg_flag: true,
    };
    catalog.push(row);
    byId.set(s.id, row);
  }
}

fs.writeFileSync(catalogPath, JSON.stringify(catalog, null, 2) + "\n");

const persona = JSON.parse(fs.readFileSync(personaPath, "utf8"));
const history = persona.order_history || [];

function upsertHistory(entry) {
  const idx = history.findIndex(
    (h) =>
      h.product_id === entry.product_id ||
      /paneer/i.test(h.name) && /paneer/i.test(entry.name) ||
      (/bread/i.test(h.name) && /harvest gold|baker/i.test(h.name) && /bread/i.test(entry.name)),
  );
  // Prefer replacing Amul paneer proxy / Harvest Gold atta proxy
  if (entry.product_id === "p02062") {
    const amulIdx = history.findIndex((h) => h.product_id === "p02057" || /amul.*paneer/i.test(h.name));
    if (amulIdx >= 0) {
      history[amulIdx] = entry;
      return;
    }
  }
  if (entry.product_id === "p90012") {
    const breadIdx = history.findIndex(
      (h) => h.product_id === "p02104" || /harvest gold.*bread|protein bread/i.test(h.name),
    );
    if (breadIdx >= 0) {
      history[breadIdx] = entry;
      return;
    }
  }
  if (idx >= 0) history[idx] = entry;
  else history.unshift(entry);
}

upsertHistory({
  product_id: "p02062",
  name: "Milky Mist Low Fat High Protein Paneer",
  category: "Paneer Tofu",
  top_category: "Dairy & Breakfast",
  price: 120,
  unit: "200 g",
});

upsertHistory({
  product_id: "p90012",
  name: "Baker's Loaf Harvest Gold - High Protein Bread",
  category: "Bread Pav",
  top_category: "Bakery & Biscuits",
  price: 72,
  unit: "350 g",
});

persona.order_history = history;
fs.writeFileSync(personaPath, JSON.stringify(persona, null, 2) + "\n");

// Keep them out of recommendation deck (already purchased)
const histIds = new Set(persona.order_history.map((h) => h.product_id));
let candidates = JSON.parse(fs.readFileSync(candidatesPath, "utf8"));
candidates = candidates.filter((c) => !histIds.has(c.product_id));

// Refresh bridges to name these staples
const stapleBridge =
  "You usually reorder Milky Mist high-protein paneer and Baker's Loaf high-protein bread — this fits the same protein-cut habit.";
for (const c of candidates) {
  if (c.level === "L2" && (c.shared_tag === "protein" || /protein|whey/i.test(c.name))) {
    c.bridge = stapleBridge;
  }
}
fs.writeFileSync(candidatesPath, JSON.stringify(candidates, null, 2) + "\n");

console.log("Added staples to catalog + persona history");
console.log(
  "History paneer/bread:",
  persona.order_history
    .filter((h) => /paneer|bread|baker/i.test(h.name))
    .map((h) => `${h.product_id} ${h.name}`),
);
console.log("Candidates left:", candidates.length);
