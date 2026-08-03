import { FREE_DELIVERY_THRESHOLD } from "../engine/constants.js";
import NudgeBanner from "./NudgeBanner.jsx";
import { nudgeBannerCopy } from "../lib/matchCopy.js";

export default function CartScreen({
  state,
  onRemove,
  deliveryMatch,
  nudge,
  onOpenNudge,
  onDismissNudge,
  onOpenDeliveryMatch,
}) {
  const cart = state?.cart || [];
  const total = state?.cart_total || 0;
  const remaining = Math.max(0, FREE_DELIVERY_THRESHOLD - total);
  const progress = Math.min(100, (total / FREE_DELIVERY_THRESHOLD) * 100);
  const unlocked = total >= FREE_DELIVERY_THRESHOLD;
  const showGapBanner =
    deliveryMatch && (!nudge || nudge.product_id !== deliveryMatch.product_id);

  return (
    <div className="screen cart-screen">
      <header className="screen-head">
        <h1>Cart</h1>
        <p>{cart.length ? `${cart.length} item${cart.length === 1 ? "" : "s"}` : "Empty for now"}</p>
      </header>

      <div className="delivery-bar">
        <div className="delivery-bar-track">
          <div className="delivery-bar-fill" style={{ width: `${progress}%` }} />
        </div>
        <p>
          {unlocked
            ? "Free delivery unlocked"
            : `₹${Math.ceil(remaining)} more for free delivery (₹${FREE_DELIVERY_THRESHOLD})`}
        </p>
      </div>

      {nudge ? (
        <NudgeBanner match={nudge} onOpen={onOpenNudge} onDismiss={onDismissNudge} />
      ) : null}

      {showGapBanner ? (
        <button
          type="button"
          className="gap-match-banner"
          onClick={onOpenDeliveryMatch}
        >
          Add <strong>{deliveryMatch.name}</strong> (₹{Math.round(deliveryMatch.price)}) and
          delivery is free.
          <span className="gap-hinglish">{nudgeBannerCopy(deliveryMatch)}</span>
        </button>
      ) : null}

      <div className="list-stack">
        {cart.length === 0 ? (
          <div className="empty-state">Top-swipe Discover cards to fill your cart.</div>
        ) : (
          cart.map((item) => (
            <article key={`${item.product_id}-${item.added_via}`} className="list-row">
              <img src={item.image_url} alt="" />
              <div className="list-row-body">
                <strong>{item.name}</strong>
                <span>₹{Math.round(item.price)}</span>
              </div>
              <button
                type="button"
                className="list-row-action"
                onClick={() => onRemove(item.product_id)}
              >
                Remove
              </button>
            </article>
          ))
        )}
      </div>

      <div className="cart-total-row">
        <span>Bill total</span>
        <strong>₹{Math.round(total)}</strong>
      </div>
    </div>
  );
}
