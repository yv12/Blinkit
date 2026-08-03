import fs from "fs";
import path from "path";

const MAX_PER_CATEGORY = 2;

const catalog = JSON.parse(fs.readFileSync("data/catalog.json", "utf8"));
const local = JSON.parse(fs.readFileSync("data/local_photos.json", "utf8"));
const imgDir = "public/images";
const realExt = new Set([".jpg", ".jpeg", ".png", ".webp"]);
const realFiles = new Set();
for (const f of fs.readdirSync(imgDir)) {
  const ext = path.extname(f).toLowerCase();
  if (realExt.has(ext)) realFiles.add(path.basename(f, ext));
}

function hasReal(id) {
  if (local[id] && !String(local[id]).includes(".svg")) return true;
  return realFiles.has(id);
}

const allMissing = catalog
  .filter((p) => !hasReal(p.id))
  .sort((a, b) => a.id.localeCompare(b.id));

const perCat = new Map();
const missing = [];
for (const p of allMissing) {
  const cat = p.category || p.top_category || "Uncategorized";
  const n = perCat.get(cat) || 0;
  if (n >= MAX_PER_CATEGORY) continue;
  perCat.set(cat, n + 1);
  missing.push(p);
}

const have = catalog.filter((p) => hasReal(p.id));

const lines = [
  "# Products missing real photos",
  "",
  "Cards + search show a real photo only when `public/images/<id>.jpg` (or `.webp` / `.png`) exists.",
  "",
  `**Have photo: ${have.length}** · **Missing (deduped): ${missing.length}** · max **${MAX_PER_CATEGORY} per category** (full missing pool: ${allMissing.length})`,
  "",
  "Same-category brand/flavour extras capped so you only download distinct category samples.",
  "",
  "## How to add",
  "",
  "1. Save each file into `public/images/` using the exact filename in the **file** column (copy-paste)",
  "2. Run `npm run sync-images`",
  "3. Hard-refresh the app",
  "",
  "## Missing list",
  "",
  "| # | file | brand | product | category |",
  "| --- | --- | --- | --- | --- |",
];

missing.forEach((p, i) => {
  const name = String(p.name || "").replace(/\|/g, "/");
  const file = `${p.id}.jpg`;
  lines.push(
    `| ${i + 1} | \`${file}\` | ${p.brand || ""} | ${name} | ${p.category || p.top_category || ""} |`,
  );
});

lines.push("");
lines.push(`## Already have photos (${have.length})`);
lines.push("");
have.forEach((p) => lines.push(`- \`${p.id}.jpg\` — ${p.name}`));

fs.writeFileSync("Docs/missing-product-images.md", lines.join("\n"));
fs.writeFileSync(
  "Docs/missing-product-images.json",
  JSON.stringify(
    missing.map((p) => ({
      id: p.id,
      file: `${p.id}.jpg`,
      name: p.name,
      brand: p.brand,
      category: p.category,
      top_category: p.top_category,
    })),
    null,
    2,
  ),
);
fs.writeFileSync(
  "Docs/missing-product-images.csv",
  "file,id,brand,name,category\n" +
    missing
      .map((p) =>
        [
          JSON.stringify(`${p.id}.jpg`),
          p.id,
          JSON.stringify(p.brand || ""),
          JSON.stringify(p.name || ""),
          JSON.stringify(p.category || ""),
        ].join(","),
      )
      .join("\n") +
    "\n",
);

console.log(
  `have ${have.length} · kept ${missing.length} · capped from ${allMissing.length} (max ${MAX_PER_CATEGORY}/category)`,
);
