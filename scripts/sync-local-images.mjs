/**
 * Copy real product photos from ./images into ./public/images (Vite),
 * write data/local_photos.json, and retarget image_url in catalog + candidates.
 *
 * Usage: node scripts/sync-local-images.mjs
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = path.join(ROOT, "images");
const DEST = path.join(ROOT, "public", "images");
const MANIFEST = path.join(ROOT, "data", "local_photos.json");

const PHOTO_RE = /^(p\d+)\.(jpe?g|png|webp)$/i;

function main() {
  fs.mkdirSync(DEST, { recursive: true });
  const map = {};

  for (const name of fs.readdirSync(SRC)) {
    const m = name.match(PHOTO_RE);
    if (!m) continue;
    const id = m[1].toLowerCase();
    const ext = m[2].toLowerCase().replace("jpeg", "jpg");
    const destName = `${id}.${ext === "jpeg" ? "jpg" : ext}`;
    fs.copyFileSync(path.join(SRC, name), path.join(DEST, destName));
    // Prefer jpg/png over webp if both somehow exist — first wins unless jpg arrives later
    if (!map[id] || ext === "jpg" || ext === "jpeg" || ext === "png") {
      map[id] = `/images/${destName}`;
    }
  }

  fs.writeFileSync(MANIFEST, `${JSON.stringify(map, null, 2)}\n`);
  console.log(`Synced ${Object.keys(map).length} photos → public/images + local_photos.json`);

  patchJson(path.join(ROOT, "data", "catalog.json"), map, (row) => row.id);
  for (const file of fs.readdirSync(path.join(ROOT, "data"))) {
    if (!/^candidates_.*\.json$/.test(file)) continue;
    patchJson(path.join(ROOT, "data", file), map, (row) => row.product_id || row.id);
  }
}

function patchJson(filePath, map, idOf) {
  if (!fs.existsSync(filePath)) return;
  const data = JSON.parse(fs.readFileSync(filePath, "utf8"));
  const rows = Array.isArray(data) ? data : data.products || data.candidates;
  if (!Array.isArray(rows)) return;
  let n = 0;
  for (const row of rows) {
    const id = idOf(row);
    if (id && map[id]) {
      if (row.image_url !== map[id]) {
        row.image_url = map[id];
        n += 1;
      }
    }
  }
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`);
  console.log(`  ${path.basename(filePath)}: updated ${n} image_url(s)`);
}

main();
