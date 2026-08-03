/**
 * One-shot build step: pull product front images from Open Food Facts.
 *
 * Source of truth: data/catalog.json (already extracted; shared by this script + app).
 * Runtime must NEVER call Open Food Facts — this script runs manually.
 *
 * OFF docs (https://openfoodfacts.github.io/openfoodfacts-server/api/):
 * - Full-text search is only via legacy GET /cgi/search.pl (v2/v3 have no text search).
 * - Search rate limit: 10 req/min/IP — we go slower: 1 req/sec.
 * - Custom User-Agent is required.
 * - Verified response shape: { count, page, page_size, products: [{ code, product_name, brands, image_front_url }] }
 *
 * Usage:
 *   node scripts/fetch-images.mjs
 *   node scripts/fetch-images.mjs --limit 5
 *   node scripts/fetch-images.mjs --force   # re-fetch even if barcode exists
 */

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const CATALOG_PATH = path.join(ROOT, "data", "catalog.json");
const IMG_DIR = path.join(ROOT, "img");
const ATTRIBUTION_PATH = path.join(ROOT, "ATTRIBUTION.md");

const USER_AGENT = "BlinkitCrushDemo/1.0 (student project)";
const SEARCH_URL = "https://world.openfoodfacts.org/cgi/search.pl";
const OFF_PRODUCT_URL = (code) => `https://world.openfoodfacts.org/product/${code}`;
/**
 * OFF docs: search is capped at 10 req/min/IP (≈6s). Image CDN GETs are lighter;
 * we still serialize everything and keep ≥1s between any two HTTP calls.
 * Spec asked for 1 req/sec; we slow searches further so we are not banned (503s).
 */
const MIN_GAP_MS = 1000;
const SEARCH_GAP_MS = 6500;
const MATCH_THRESHOLD = 0.42;
const PAGE_SIZE = 5;

const args = new Set(process.argv.slice(2));
const FORCE = args.has("--force");
const limitArg = process.argv.find((a, i, arr) => arr[i - 1] === "--limit");
const LIMIT = limitArg ? Number(limitArg) : Infinity;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

let lastRequestAt = 0;
async function rateLimitedFetch(url, init = {}, { gapMs = MIN_GAP_MS } = {}) {
  const wait = gapMs - (Date.now() - lastRequestAt);
  if (wait > 0) await sleep(wait);
  lastRequestAt = Date.now();
  const res = await fetch(url, {
    ...init,
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "application/json,image/*,*/*",
      ...(init.headers || {}),
    },
  });
  return res;
}

function slugify(id, name) {
  const base = String(id || name || "product")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return base || "product";
}

function normalize(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokens(text) {
  const stop = new Set([
    "the", "and", "with", "from", "for", "pack", "of", "ml", "g", "kg", "ltr",
    "litre", "liter", "pcs", "pc", "unit", "units", "made", "only", "a", "an",
  ]);
  return normalize(text)
    .split(" ")
    .filter((t) => t.length > 1 && !stop.has(t) && !/^\d+$/.test(t));
}

/** Extra words that usually mean a different product form. */
const FORM_WORDS = new Set([
  "chips", "crisps", "juice", "powder", "sauce", "candy", "bar", "wafer",
  "soap", "shampoo", "oil", "ghee", "butter", "cream", "yogurt", "curd",
  "noodles", "pasta", "frozen", "ice", "drink", "cola", "biscuit", "cookie",
]);

/** Token Jaccard + brand bonus. Returns 0..1. */
function scoreMatch(ourName, ourBrand, offName, offBrands) {
  const aTokens = tokens(ourName);
  const bTokens = tokens(offName);
  const a = new Set(aTokens);
  const b = new Set(bTokens);
  if (!a.size || !b.size) return 0;

  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  const union = a.size + b.size - inter;
  let score = union ? inter / union : 0;

  const brand = normalize(ourBrand);
  const offBrand = normalize(offBrands);
  if (brand && offBrand && (offBrand.includes(brand) || brand.includes(offBrand))) {
    score += 0.22;
  }

  const ours = normalize(ourName);
  const theirs = normalize(offName);
  if (theirs === ours) score += 0.2;
  else if (theirs.includes(ours) || ours.includes(theirs)) score += 0.1;

  // Penalty if almost no overlap on meaningful tokens
  if (inter < 2 && a.size >= 3) score *= 0.55;

  // Penalize form drift: OFF adds chips/juice/etc. when our name has none of those
  const ourForms = aTokens.filter((t) => FORM_WORDS.has(t));
  const offForms = bTokens.filter((t) => FORM_WORDS.has(t));
  if (!ourForms.length && offForms.length) score -= 0.28;
  if (ourForms.length && offForms.length && !ourForms.some((f) => offForms.includes(f))) {
    score -= 0.18;
  }

  // Short generic names (e.g. "Banana") need a near-exact OFF name
  if (aTokens.length <= 2) {
    const coverage = inter / a.size;
    if (coverage < 1 || b.size > a.size + 1) score -= 0.25;
  }

  return Math.max(0, Math.min(1, score));
}

async function searchOpenFoodFacts(searchTerms, { indiaOnly = true } = {}) {
  const url = new URL(SEARCH_URL);
  url.searchParams.set("search_terms", searchTerms);
  url.searchParams.set("search_simple", "1");
  url.searchParams.set("action", "process");
  url.searchParams.set("json", "1");
  url.searchParams.set("page_size", String(PAGE_SIZE));
  url.searchParams.set("fields", "code,product_name,brands,image_front_url");
  if (indiaOnly) url.searchParams.set("countries_tags_en", "india");

  let lastErr;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await rateLimitedFetch(url, {}, { gapMs: SEARCH_GAP_MS });
      const ctype = res.headers.get("content-type") || "";
      if (res.status === 503 || res.status === 429) {
        lastErr = new Error(`OFF search HTTP ${res.status}`);
        await sleep(SEARCH_GAP_MS * (attempt + 1));
        continue;
      }
      if (!res.ok || !ctype.includes("json")) {
        const snippet = (await res.text()).slice(0, 120);
        throw new Error(`OFF search HTTP ${res.status}: ${snippet}`);
      }
      const data = await res.json();
      return Array.isArray(data.products) ? data.products : [];
    } catch (err) {
      lastErr = err;
      if (attempt < 3) await sleep(SEARCH_GAP_MS * (attempt + 1));
    }
  }
  throw lastErr || new Error("OFF search failed");
}

async function pickBestMatch(product) {
  const query = [product.brand, product.name].filter(Boolean).join(" ").trim() || product.name;
  let products = [];
  try {
    products = await searchOpenFoodFacts(query, { indiaOnly: true });
  } catch (err) {
    return { skip: true, reason: `search error: ${err.message}` };
  }

  // India filter can be empty for niche SKUs — one careful global retry
  if (!products.length) {
    try {
      products = await searchOpenFoodFacts(query, { indiaOnly: false });
    } catch (err) {
      return { skip: true, reason: `search error: ${err.message}` };
    }
  }

  if (!products.length) {
    return { skip: true, reason: "no OFF results" };
  }

  let best = null;
  for (const p of products) {
    if (!p?.code || !p?.image_front_url) continue;
    const score = scoreMatch(product.name, product.brand, p.product_name, p.brands);
    if (!best || score > best.score) {
      best = { product: p, score };
    }
  }

  if (!best) {
    return { skip: true, reason: "results had no image_front_url" };
  }
  if (best.score < MATCH_THRESHOLD) {
    return {
      skip: true,
      reason: `best score ${best.score.toFixed(2)} < ${MATCH_THRESHOLD} ("${best.product.product_name}")`,
    };
  }
  return { skip: false, match: best.product, score: best.score };
}

async function downloadAndResize(imageUrl, destPath) {
  const res = await rateLimitedFetch(imageUrl);
  if (!res.ok) throw new Error(`image HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  await sharp(buf)
    .rotate()
    .resize({ width: 400, withoutEnlargement: true })
    .jpeg({ quality: 82, mozjpeg: true })
    .toFile(destPath);
}

async function main() {
  const raw = await fs.readFile(CATALOG_PATH, "utf8");
  const catalog = JSON.parse(raw);
  if (!Array.isArray(catalog)) {
    throw new Error("data/catalog.json must be a JSON array of products");
  }

  await fs.mkdir(IMG_DIR, { recursive: true });

  const attributed = [];
  const skipped = [];
  let matched = 0;
  let alreadyHad = 0;

  const worklist = catalog.slice(0, Number.isFinite(LIMIT) ? LIMIT : catalog.length);
  console.log(`Fetching images for ${worklist.length}/${catalog.length} products…`);
  console.log(
    `OFF: ${SEARCH_URL} · UA: ${USER_AGENT} · search gap: ${SEARCH_GAP_MS}ms · download gap: ${MIN_GAP_MS}ms · threshold: ${MATCH_THRESHOLD}`,
  );

  for (let i = 0; i < worklist.length; i++) {
    const product = worklist[i];
    const label = `[${i + 1}/${worklist.length}] ${product.id} — ${product.name}`;

    if (product.barcode && product.image_url && !String(product.image_url).endsWith(".svg") && !FORCE) {
      alreadyHad++;
      console.log(`  skip (already has barcode/image): ${label}`);
      attributed.push({
        name: product.name,
        barcode: product.barcode,
        url: OFF_PRODUCT_URL(product.barcode),
        local: product.image_url,
      });
      continue;
    }

    const result = await pickBestMatch(product);
    if (result.skip) {
      skipped.push({ id: product.id, name: product.name, reason: result.reason });
      console.log(`  SKIP ${label}\n         → ${result.reason}`);
      continue;
    }

    const { match, score } = result;
    const slug = slugify(product.id, product.name);
    const filename = `${slug}.jpg`;
    const dest = path.join(IMG_DIR, filename);
    const localPath = `/img/${filename}`;

    try {
      await downloadAndResize(match.image_front_url, dest);
    } catch (err) {
      skipped.push({ id: product.id, name: product.name, reason: `download failed: ${err.message}` });
      console.log(`  SKIP ${label}\n         → download failed: ${err.message}`);
      continue;
    }

    product.barcode = String(match.code);
    product.image_url = localPath;
    product.off_product_name = match.product_name || "";
    product.off_brands = match.brands || "";
    product.off_match_score = Number(score.toFixed(3));

    matched++;
    attributed.push({
      name: product.name,
      barcode: product.barcode,
      url: OFF_PRODUCT_URL(product.barcode),
      local: localPath,
      score,
    });
    console.log(`  OK   ${label}\n         → ${match.product_name} (${match.code}) score=${score.toFixed(2)}`);
  }

  // Write full catalog (in-place updates on shared objects)
  await fs.writeFile(CATALOG_PATH, JSON.stringify(catalog, null, 2) + "\n", "utf8");

  const lines = [
    "# Image attribution — Open Food Facts",
    "",
    "Product images were downloaded once at build time from [Open Food Facts](https://world.openfoodfacts.org/).",
    "Images are licensed under [Creative Commons Attribution-ShareAlike](https://creativecommons.org/licenses/by-sa/3.0/).",
    "Database contents: [ODbL / DbCL](https://opendatacommons.org/licenses/odbl/).",
    "",
    "This app does **not** call Open Food Facts at runtime.",
    "",
    "| Product | Barcode | Open Food Facts | Local path |",
    "| --- | --- | --- | --- |",
  ];
  for (const row of attributed) {
    const name = String(row.name).replace(/\|/g, "\\|");
    lines.push(`| ${name} | ${row.barcode} | ${row.url} | \`${row.local}\` |`);
  }
  if (!attributed.length) {
    lines.push("| _(none matched yet)_ | | | |");
  }
  lines.push("");
  await fs.writeFile(ATTRIBUTION_PATH, lines.join("\n"), "utf8");

  // Summary
  const reasons = new Map();
  for (const s of skipped) {
    const key = s.reason.split(":")[0].trim();
    reasons.set(key, (reasons.get(key) || 0) + 1);
  }

  console.log("\n========== SUMMARY ==========");
  console.log(`Matched & downloaded : ${matched}`);
  console.log(`Already had image    : ${alreadyHad}`);
  console.log(`Skipped              : ${skipped.length}`);
  if (reasons.size) {
    console.log("Skip reasons:");
    for (const [reason, n] of [...reasons.entries()].sort((a, b) => b[1] - a[1])) {
      console.log(`  ${n}× ${reason}`);
    }
  }
  console.log(`Wrote ${path.relative(ROOT, CATALOG_PATH)}`);
  console.log(`Wrote ${path.relative(ROOT, ATTRIBUTION_PATH)}`);
  console.log(`Images in ${path.relative(ROOT, IMG_DIR)}/`);
  console.log("=============================\n");

  if (skipped.length) {
    console.log("Skipped products:");
    for (const s of skipped) {
      console.log(`  - ${s.id}: ${s.name} — ${s.reason}`);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
