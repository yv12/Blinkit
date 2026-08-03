import { productImageUrl } from "../lib/productImage.js";

export default function ProductCard({
  card,
  eta = "11 mins away",
  stampOpacity = { nope: 0, saved: 0, cart: 0 },
}) {
  if (!card) return null;
  const src = productImageUrl(card);

  return (
    <article className="product-card">
      <div className="card-photo">
        <img
          src={src}
          alt={card.name}
          draggable={false}
          onError={(e) => {
            const el = e.currentTarget;
            const id = card.product_id || card.id;
            const step = el.dataset.fallback || "";
            if (!step && id) {
              el.dataset.fallback = "svg";
              el.src = `/images/${id}.svg`;
              return;
            }
            if (step === "tile") return;
            el.dataset.fallback = "tile";
            const initials = (card.name || "?")
              .split(/\s+/)
              .filter(Boolean)
              .slice(0, 2)
              .map((w) => w[0]?.toUpperCase() || "")
              .join("");
            const label = String(card.name || "Product").slice(0, 42);
            const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400"><rect width="400" height="400" fill="#ECEFF1"/><text x="200" y="175" text-anchor="middle" font-family="Georgia,serif" font-size="48" fill="#455A64">${initials}</text><text x="200" y="290" text-anchor="middle" font-family="Segoe UI,Arial,sans-serif" font-size="16" fill="#455A64">${label.replace(/[<&]/g, "")}</text></svg>`;
            el.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
          }}
        />
        <span className="card-eta">{eta}</span>
        <span className="card-level">{card.level}</span>
        <div className="swipe-stamp nope" style={{ opacity: stampOpacity.nope }}>
          Nope
        </div>
        <div className="swipe-stamp saved" style={{ opacity: stampOpacity.saved }}>
          Saved
        </div>
        <div className="swipe-stamp cart" style={{ opacity: stampOpacity.cart }}>
          Cart
        </div>
      </div>
      <div className="card-body">
        <h2 className="card-name">{card.name}</h2>
        <div className="card-price-row">
          <span className="card-price">₹{Math.round(card.price)}</span>
          <span className="card-category">{card.category || card.top_category}</span>
        </div>
        <p className="card-bio">“{card.bio || "New aisle, who dis?"}”</p>
      </div>
    </article>
  );
}
