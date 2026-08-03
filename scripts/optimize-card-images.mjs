/**
 * Build small card thumbs (160px WebP) into public/images/thumbs/
 * Usage: node scripts/optimize-card-images.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC_DIRS = [path.join(ROOT, "images"), path.join(ROOT, "public", "images")];
const OUT = path.join(ROOT, "public", "images", "thumbs");
const MANIFEST = path.join(ROOT, "data", "card_thumbs.json");

fs.mkdirSync(OUT, { recursive: true });
const map = {};
const seen = new Set();

for (const dir of SRC_DIRS) {
  if (!fs.existsSync(dir)) continue;
  for (const name of fs.readdirSync(dir)) {
    const m = name.match(/^(p\d+)\.(jpe?g|png|webp)$/i);
    if (!m) continue;
    const id = m[1].toLowerCase();
    if (seen.has(id)) continue;
    seen.add(id);
    const outName = `${id}.webp`;
    const outPath = path.join(OUT, outName);
    await sharp(path.join(dir, name))
      .rotate()
      .resize(160, 160, { fit: "inside", withoutEnlargement: true })
      .webp({ quality: 72, effort: 4 })
      .toFile(outPath);
    map[id] = `/images/thumbs/${outName}`;
    console.log("thumb", id, fs.statSync(outPath).size, "bytes");
  }
}

fs.writeFileSync(MANIFEST, `${JSON.stringify(map, null, 2)}\n`);
console.log(`Wrote ${Object.keys(map).length} thumbs → ${OUT}`);
