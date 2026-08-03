"""Generate simple product SVGs for the vanilla demo catalog."""
from pathlib import Path

OUT = Path(__file__).resolve().parents[1] / "images"

# id -> (bg, accent, initials, label)
PRODUCTS = {
    "whey-protein": ("#E3F2FD", "#1565C0", "WP", "Whey protein"),
    "rolled-oats": ("#FFF8E1", "#F9A825", "OA", "Rolled oats"),
    "toned-milk": ("#E8F5E9", "#2E7D32", "ML", "Toned milk"),
    "yoga-bar": ("#FFF3E0", "#EF6C00", "YB", "Yoga Bar"),
    "peanut-butter": ("#EFEBE9", "#6D4C41", "PB", "Peanut butter"),
    "roasted-chana": ("#FBE9E7", "#D84315", "RC", "Roasted chana"),
    "kitchen-scale": ("#ECEFF1", "#455A64", "KS", "Kitchen scale"),
    "resistance-bands": ("#FCE4EC", "#C2185B", "RB", "Resistance bands"),
    "water-bottle": ("#E0F7FA", "#00838F", "WB", "Water bottle"),
    "brown-bread": ("#FFF3E0", "#E65100", "BB", "Brown bread"),
    "amul-butter": ("#FFFDE7", "#F9A825", "AB", "Amul butter"),
    "cold-drink": ("#E8EAF6", "#3949AB", "CD", "Cold drink"),
    "atta": ("#FFF8E1", "#FF8F00", "AT", "Atta 5kg"),
    "tata-salt": ("#E3F2FD", "#0277BD", "TS", "Tata salt"),
    "dishwash": ("#E0F2F1", "#00695C", "DW", "Dishwash"),
    "containers": ("#F3E5F5", "#7B1FA2", "CT", "Containers"),
    "fridge-bottles": ("#E1F5FE", "#0288D1", "FB", "Fridge bottles"),
    "mop": ("#E8F5E9", "#558B2F", "MP", "Microfiber mop"),
    "ice-cream": ("#FCE4EC", "#AD1457", "IC", "Ice cream"),
    "bourbon": ("#EFEBE9", "#5D4037", "BN", "Bourbon"),
    "chips": ("#FFF3E0", "#EF6C00", "CH", "Potato chips"),
    "ramyeon": ("#FFEBEE", "#C62828", "KR", "Ramyeon"),
    "nutella": ("#EFEBE9", "#4E342E", "NT", "Nutella"),
    "popcorn-maker": ("#FFF8E1", "#F57F17", "PM", "Popcorn maker"),
    "soda-syrup": ("#E8EAF6", "#303F9F", "SS", "Soda syrup"),
    "fairy-lights": ("#FFFDE7", "#FBC02D", "FL", "Fairy lights"),
}


def svg(bg, accent, initials, label):
    safe = label.replace("&", "&amp;")
    return f"""<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600" viewBox="0 0 600 600">
  <rect width="600" height="600" fill="{bg}"/>
  <circle cx="300" cy="230" r="90" fill="{accent}" opacity="0.15"/>
  <text x="300" y="250" text-anchor="middle" font-family="Georgia, serif" font-size="64" fill="{accent}" font-weight="700">{initials}</text>
  <text x="300" y="400" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif" font-size="28" fill="{accent}" font-weight="700">{safe}</text>
</svg>
"""


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    for pid, meta in PRODUCTS.items():
        (OUT / f"{pid}.svg").write_text(svg(*meta), encoding="utf-8")
        print("wrote", pid)
    print(f"done → {OUT} ({len(PRODUCTS)} files)")


if __name__ == "__main__":
    main()
