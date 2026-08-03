import { catalog } from "../data/loadDemoData.js";
import NudgeBanner from "./NudgeBanner.jsx";
import { productImageUrl } from "../lib/productImage.js";
import { buildHomeRails } from "../lib/homeRails.js";

const CATEGORIES = [
  "Dairy",
  "Snacks",
  "Breakfast",
  "Drinks",
  "Cleaning",
  "Bakery",
  "Organic",
  "More",
];

function imageFor(productId) {
  const hit = catalog.find((p) => p.id === productId);
  return productImageUrl(productId, hit?.image_url);
}

function Rail({ title, subtitle, items, badge }) {
  return (
    <section className="home-rail">
      <div className="home-rail-head">
        <div>
          <h2>{title}</h2>
          {subtitle ? <p className="home-rail-sub">{subtitle}</p> : null}
        </div>
        {badge ? <span className="home-rail-badge">{badge}</span> : null}
      </div>
      <div className="home-rail-track">
        {items.map((item) => (
          <div key={item.product_id} className="home-rail-item">
            <div className="home-rail-img">
              <img src={item.image || imageFor(item.product_id)} alt="" />
            </div>
            <p>{item.name}</p>
            <strong>₹{Math.round(item.price)}</strong>
          </div>
        ))}
      </div>
    </section>
  );
}

export default function HomeScreen({
  persona,
  deck,
  state,
  suppressed,
  onOpenDeck,
  nudge,
  onOpenNudge,
  onDismissNudge,
}) {
  const history = (persona?.order_history || [])
    .filter((item) => productImageUrl(item.product_id).startsWith("/images/"))
    .slice(0, 12);
  const teaser = !deck?.done && deck?.cards?.[deck.cursor];
  const teaserImg = teaser ? productImageUrl(teaser) : null;

  const rails = buildHomeRails({
    catalog,
    persona,
    state,
    topLimit: 8,
    diffLimit: 8,
  });

  return (
    <div className="screen home-screen">
      <header className="home-header">
        <div className="home-eta">
          <span className="home-eta-time">8 mins</span>
          <span className="home-eta-place">Home · Indiranagar</span>
        </div>
        <div className="home-search" role="search">
          <span className="home-search-icon">⌕</span>
          <span>Search “paneer” or “oats”</span>
        </div>
      </header>

      {nudge ? (
        <NudgeBanner match={nudge} onOpen={onOpenNudge} onDismiss={onDismissNudge} />
      ) : null}

      <div className="home-cats">
        {CATEGORIES.map((c) => (
          <div key={c} className="home-cat">
            <div className="home-cat-bubble" />
            <span>{c}</span>
          </div>
        ))}
      </div>

      <section className="home-promo">
        {suppressed || !teaser ? (
          <div className="home-promo-shrunk">
            <p>Discover is resting — come back after a few sessions.</p>
          </div>
        ) : (
          <button type="button" className="home-promo-card" onClick={onOpenDeck}>
            <div className="home-promo-copy">
              <span className="home-promo-kicker">For you · Discover</span>
              <strong>{teaser.name}</strong>
              <span className="home-promo-bio">“{teaser.bio || teaser.bridge}”</span>
              <span className="home-promo-cta">Swipe to explore →</span>
            </div>
            <img src={teaserImg} alt="" />
          </button>
        )}
      </section>

      <section className="home-freq">
        <div className="home-rail-head">
          <div>
            <h2>Frequently bought</h2>
            <p className="home-rail-sub">Your usuals — swipe sideways</p>
          </div>
          <span>compact</span>
        </div>
        <div className="home-freq-carousel" aria-label="Frequently bought">
          {history.slice(0, 8).map((item) => (
            <div key={item.product_id} className="home-freq-slide">
              <div className="home-freq-img">
                <img src={imageFor(item.product_id)} alt="" />
              </div>
              <p>{item.name}</p>
              <strong>₹{Math.round(item.price)}</strong>
            </div>
          ))}
        </div>
      </section>

      <Rail
        title="Top picks for you"
        subtitle={
          rails.learned
            ? "Picks that match what you just liked"
            : "Swipe in Discover — this rail personalizes"
        }
        items={rails.topPicks}
        badge={rails.reason}
      />

      <Rail
        title="Something different"
        subtitle={
          rails.learned
            ? "Cross-category aisles you haven’t ordered, tuned by swipes"
            : "Cross-category ideas — shifts with your mood"
        }
        items={rails.somethingDifferent}
      />
    </div>
  );
}
