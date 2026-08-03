/**
 * Local image helpers for the static HTML demo.
 * Real photos only — never use .svg product tiles.
 */

import { PHOTOS } from "./recommend.js";

export function productImageUrl(product) {
  if (!product) return svgTileDataUri("?", "Product");
  const id = product.product_id || product.id;
  if (id && PHOTOS[id]) return PHOTOS[id];

  const url = product.image_url || product.image;
  if (url && /\.(jpe?g|png|webp)$/i.test(url)) return url;
  if (url && String(url).includes("/images/p") && /\.(jpe?g|png|webp)$/i.test(url)) {
    return url;
  }
  /* Strip legacy .svg paths → try matching photo id */
  if (url) {
    const m = String(url).match(/(p\d+)\.(?:svg|jpe?g|png|webp)/i);
    if (m && PHOTOS[m[1]]) return PHOTOS[m[1]];
  }

  const name = product.name || "Product";
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() || "")
    .join("");
  return svgTileDataUri(initials || "?", name);
}

export function svgTileDataUri(initials, label) {
  const safeInit = escapeXml(String(initials).slice(0, 3));
  const safeLabel = escapeXml(String(label).slice(0, 42));
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="0 0 400 400">
  <rect width="400" height="400" fill="#ECEFF1"/>
  <circle cx="200" cy="160" r="70" fill="#455A64" opacity="0.12"/>
  <text x="200" y="175" text-anchor="middle" font-family="Georgia, serif" font-size="48" fill="#455A64" font-weight="700">${safeInit}</text>
  <text x="200" y="290" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif" font-size="18" fill="#455A64" font-weight="600">${safeLabel}</text>
</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function escapeXml(s) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
