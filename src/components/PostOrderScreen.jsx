import { useEffect, useState } from "react";
import SwipeDeck from "./SwipeDeck.jsx";

function formatCountdown(totalSec) {
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export default function PostOrderScreen({
  deck,
  state,
  personaName,
  sessionKey,
  showHint,
  onHintSeen,
  onSwipeLeft,
  onSwipeRight,
  onSwipeTop,
  onUndo,
  deckSource,
  llmBusy,
}) {
  const [seconds, setSeconds] = useState(8 * 60 + 24);

  useEffect(() => {
    const id = setInterval(() => {
      setSeconds((s) => (s > 0 ? s - 1 : 0));
    }, 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="screen post-order-screen">
      <div className="order-banner">
        <div className="order-banner-top">
          <span className="order-check">✓</span>
          <div>
            <strong>Order confirmed</strong>
            <p>Arriving in {formatCountdown(seconds)}</p>
          </div>
        </div>
        <p className="order-prompt">While your order arrives, see what we found for you.</p>
        <p className="order-engine-meta">
          {llmBusy
            ? "Recommendation engine · updating deck…"
            : `Recommendation engine · ${deckSource || state?.deck_source || "fallback"}`}
          {state?.resolved_goal ? ` · goal: ${state.resolved_goal}` : ""}
        </p>
      </div>

      <div className="post-order-deck">
        <SwipeDeck
          key={sessionKey}
          deck={deck}
          state={state}
          personaName={personaName}
          embedded
          showHint={showHint}
          onHintSeen={onHintSeen}
          onSwipeLeft={onSwipeLeft}
          onSwipeRight={onSwipeRight}
          onSwipeTop={onSwipeTop}
          onUndo={onUndo}
        />
      </div>
    </div>
  );
}
