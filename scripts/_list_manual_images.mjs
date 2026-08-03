import fs from "node:fs";

const c = JSON.parse(fs.readFileSync("data/catalog.json", "utf8"));
const rows = c.map((p, i) => ({
  n: i + 1,
  id: p.id,
  name: p.name,
  brand: p.brand || "",
  category: p.top_category || p.category || "",
  has_image: !!(p.barcode && p.image_url && !String(p.image_url).endsWith(".svg")),
  suggested_file: `img/${p.id}.jpg`,
  search: [p.brand, p.name].filter(Boolean).join(" "),
}));
const missing = rows.filter((r) => !r.has_image);
const have = rows.filter((r) => r.has_image);

const esc = (s) => String(s).replace(/\|/g, "/");
const md = [
  "# Manual image download list",
  "",
  "Save each photo as the **suggested file** path (JPG, about 400px wide).",
  "Then set that product `image_url` in `data/catalog.json` to `/img/<id>.jpg`.",
  "",
  `## Already have a real image (${have.length})`,
  "",
  ...have.map((r) => `- \`${r.id}\` — ${r.name}`),
  "",
  `## Need image (${missing.length})`,
  "",
  "| # | id | brand | name | category | save as | search query |",
  "| --- | --- | --- | --- | --- | --- | --- |",
  ...missing.map(
    (r) =>
      `| ${r.n} | ${r.id} | ${esc(r.brand)} | ${esc(r.name)} | ${esc(r.category)} | \`${r.suggested_file}\` | ${esc(r.search)} |`,
  ),
  "",
];
fs.writeFileSync("Docs/manual-image-list.md", md.join("\n"));

const csv = [
  "id,brand,name,category,save_as,search_query",
  ...missing.map((r) =>
    [r.id, r.brand, r.name, r.category, r.suggested_file, r.search]
      .map((x) => `"${String(x).replace(/"/g, '""')}"`)
      .join(","),
  ),
].join("\n");
fs.writeFileSync("Docs/manual-image-list.csv", csv + "\n");

console.log(`have ${have.length}, missing ${missing.length}`);
console.log("wrote Docs/manual-image-list.md");
console.log("wrote Docs/manual-image-list.csv");
