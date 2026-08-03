import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const mdPath = path.join(root, "Docs", "missing-product-images.md");
const md = fs.readFileSync(mdPath, "utf8");

const haveSection = md.split("## Already have photos")[1] || "";
const haveLines = haveSection
  .split(/\r?\n/)
  .filter((l) => l.startsWith("- `"))
  .map((l) => l.trim());

const rows = [];
for (const line of md.split(/\r?\n/)) {
  if (!line.startsWith("|") || line.includes("---") || line.includes("| #")) continue;
  const cells = line
    .split("|")
    .map((c) => c.trim())
    .filter((_, i, a) => i > 0 && i < a.length - 1);
  if (cells.length < 5) continue;
  const [num, fileCell, brand, product, category] = cells;
  const struck = /~~/.test(line);
  const clean = (s) => String(s || "").replace(/~~/g, "").trim();
  const file = clean(fileCell).replace(/`/g, "");
  if (!file.endsWith(".jpg")) continue;
  rows.push({
    struck,
    id: file.replace(/\.jpg$/, ""),
    file,
    brand: clean(brand),
    product: clean(product),
    category: clean(category),
  });
}

const kept = [];
const perCat = new Map();
const droppedStruck = [];
const droppedCap = [];

for (const r of rows) {
  if (r.struck) {
    droppedStruck.push(r);
    continue;
  }
  if (!r.category) continue;
  const n = perCat.get(r.category) || 0;
  if (n >= 2) {
    droppedCap.push(r);
    continue;
  }
  perCat.set(r.category, n + 1);
  kept.push(r);
}

const pad = (s, w) => {
  const t = String(s);
  return t.length >= w ? t : t + " ".repeat(w - t.length);
};

const esc = (s) => String(s).replace(/\|/g, "\\|");

const tableRows = kept.map((r, i) => {
  const n = i + 1;
  return (
    `| ${pad(n, 7)} | ${pad("`" + r.file + "`", 12)} | ${pad(esc(r.brand), 17)} | ${pad(esc(r.product), 91)} | ${esc(r.category)} |`
  );
});

const out = `# Products missing real photos

Cards + search show a real photo only when \`public/images/<id>.jpg\` (or \`.webp\` / \`.png\`) exists.

**Have photo: ${haveLines.length}** · **Missing (deduped): ${kept.length}** · max **2 per category**

Struck-out / same-category extras removed so you only download distinct category samples.

## How to add

1. Save each file into \`public/images/\` using the exact filename in the **file** column (copy-paste)
2. Run \`npm run sync-images\`
3. Hard-refresh the app

## Missing list


| #       | file         | brand             | product                                                                                     | category                        |
| ------- | ------------ | ----------------- | ------------------------------------------------------------------------------------------- | ------------------------------- |
${tableRows.join("\n")}


## Already have photos (${haveLines.length})

${haveLines.join("\n")}
`;

fs.writeFileSync(mdPath, out);

const csv = [
  "file,id,brand,product,category",
  ...kept.map(
    (r) =>
      `"${r.file}","${r.id}","${r.brand.replace(/"/g, '""')}","${r.product.replace(/"/g, '""')}","${r.category.replace(/"/g, '""')}"`
  ),
].join("\n");
fs.writeFileSync(path.join(root, "Docs", "missing-product-images.csv"), csv + "\n");
fs.writeFileSync(
  path.join(root, "Docs", "missing-product-images.json"),
  JSON.stringify(kept, null, 2)
);

console.log(
  JSON.stringify(
    {
      parsed: rows.length,
      droppedStruck: droppedStruck.length,
      droppedCap: droppedCap.length,
      kept: kept.length,
      categories: perCat.size,
    },
    null,
    2
  )
);
console.log(
  "dropped by cap (sample):",
  droppedCap.slice(0, 8).map((r) => `${r.category} · ${r.product.slice(0, 40)}`)
);
