"""
Phase 2 — Image fetch (build-time, parallel-safe)
- Read data/subset.csv
- If remote image_url exists, download into public/images/{id}.{ext}
- Otherwise generate a local SVG placeholder (no network)
- Rewrite subset.csv local_image to the actual local path
"""

from __future__ import annotations

import csv
import re
import urllib.error
import urllib.request
from collections import Counter
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SUBSET = ROOT / "data" / "subset.csv"
IMG_DIR = ROOT / "public" / "images"

USER_AGENT = "BlinkitTinderDiscovery/0.1 (phase2 build-time image fetch)"
TIMEOUT = 12
MAX_WORKERS = 8

# Category → accent color for placeholders
COLORS = {
    "Dairy & Breakfast": ("#E8F5E9", "#2E7D32"),
    "Snacks & Munchies": ("#FFF3E0", "#EF6C00"),
    "Beverages": ("#E3F2FD", "#1565C0"),
    "Instant & Frozen": ("#E0F7FA", "#00838F"),
    "Grocery Staples": ("#FFF8E1", "#F9A825"),
    "Bakery & Biscuits": ("#FBE9E7", "#D84315"),
    "Sweet Tooth": ("#FCE4EC", "#C2185B"),
    "Home & Cleaning": ("#E8EAF6", "#3949AB"),
    "Pharma & Wellness": ("#E0F2F1", "#00695C"),
    "Fruits & Vegetables": ("#F1F8E9", "#558B2F"),
    "Meat Fish & Eggs": ("#FFEBEE", "#C62828"),
    "Personal Care": ("#F3E5F5", "#6A1B9A"),
    "Kitchen & Dining": ("#EFEBE9", "#5D4037"),
    "Electronics & Appliances": ("#ECEFF1", "#455A64"),
    "Baby Care": ("#FFF3E0", "#FB8C00"),
    "Beauty": ("#FCE4EC", "#AD1457"),
    "Pet Care": ("#EFEBE9", "#6D4C41"),
}


def svg_placeholder(product_id: str, name: str, top_category: str, price: str) -> str:
    bg, fg = COLORS.get(top_category, ("#F5F5F5", "#424242"))
    initials = "".join(w[0] for w in re.findall(r"[A-Za-z0-9]+", name)[:2]).upper() or "P"
    safe_name = (
        name.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
    )
    # wrap long names
    display = safe_name if len(safe_name) <= 36 else safe_name[:33] + "…"
    return f"""<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600" viewBox="0 0 600 600">
  <rect width="600" height="600" fill="{bg}"/>
  <circle cx="300" cy="230" r="90" fill="{fg}" opacity="0.15"/>
  <text x="300" y="250" text-anchor="middle" font-family="Georgia, serif" font-size="64" fill="{fg}" font-weight="700">{initials}</text>
  <text x="300" y="380" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif" font-size="22" fill="{fg}">{display}</text>
  <text x="300" y="420" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif" font-size="18" fill="{fg}" opacity="0.75">{top_category}</text>
  <text x="300" y="470" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif" font-size="28" fill="{fg}" font-weight="700">₹{price}</text>
  <text x="300" y="560" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif" font-size="12" fill="{fg}" opacity="0.45">{product_id}</text>
</svg>
"""


def ext_from_url(url: str) -> str:
    path = url.split("?", 1)[0].lower()
    for ext in (".png", ".jpg", ".jpeg", ".webp", ".gif"):
        if path.endswith(ext):
            return ".jpg" if ext == ".jpeg" else ext
    return ".jpg"


def download(url: str, dest: Path) -> bool:
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:
            data = resp.read()
        if len(data) < 200:
            return False
        dest.write_bytes(data)
        return True
    except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError, OSError):
        return False


def process_row(row: dict[str, str]) -> tuple[str, str, str]:
    """Returns (id, local_image path for web, status)."""
    pid = row["id"]
    IMG_DIR.mkdir(parents=True, exist_ok=True)
    remote = (row.get("image_url") or "").strip()

    if remote.startswith("http"):
        ext = ext_from_url(remote)
        dest = IMG_DIR / f"{pid}{ext}"
        if dest.exists() and dest.stat().st_size > 200:
            return pid, f"/images/{pid}{ext}", "cached-remote"
        if download(remote, dest):
            return pid, f"/images/{pid}{ext}", "downloaded"
        # fall through to placeholder

    dest = IMG_DIR / f"{pid}.svg"
    dest.write_text(
        svg_placeholder(pid, row["name"], row["top_category"], row.get("price") or "0"),
        encoding="utf-8",
    )
    return pid, f"/images/{pid}.svg", "placeholder"


def main() -> None:
    if not SUBSET.exists():
        raise SystemExit(f"Missing {SUBSET}. Run phase2_build_subset_personas.py first.")

    with SUBSET.open(encoding="utf-8", newline="") as f:
        rows = list(csv.DictReader(f))

    results: dict[str, str] = {}
    stats: Counter[str] = Counter()

    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as pool:
        futures = {pool.submit(process_row, row): row["id"] for row in rows}
        for fut in as_completed(futures):
            pid, local, status = fut.result()
            results[pid] = local
            stats[status] += 1

    fields = list(rows[0].keys())
    if "local_image" not in fields:
        fields.append("local_image")

    with SUBSET.open("w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=fields)
        w.writeheader()
        for row in rows:
            row["local_image"] = results[row["id"]]
            w.writerow(row)

    files = list(IMG_DIR.glob("*"))
    print("=== Phase 2 image fetch ===")
    for k, v in sorted(stats.items()):
        print(f"  {k:16s}: {v}")
    print(f"  images on disk : {len(files)} in {IMG_DIR}")
    print(f"  subset updated : {SUBSET}")

    if len(files) < len(rows):
        raise SystemExit(f"FAIL: expected >= {len(rows)} image files, found {len(files)}")
    print()
    print("DONE: images land under /public/images.")


if __name__ == "__main__":
    main()
