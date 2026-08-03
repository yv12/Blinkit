import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AnimatePresence,
  animate,
  motion,
  useMotionValue,
  useTransform,
} from "framer-motion";
import ProductCard from "./ProductCard.jsx";
import EndCard from "./EndCard.jsx";
import ActionButtons from "./ActionButtons.jsx";
import HeartBurst from "./HeartBurst.jsx";
import CartBadge from "./CartBadge.jsx";

const UNDO_MS = 5000;
const FLY_MS = 340;

function swipeThresholds() {
  const w = typeof window !== "undefined" ? window.innerWidth : 390;
  const h = typeof window !== "undefined" ? window.innerHeight : 700;
  return {
    x: Math.max(64, w * 0.22),
    y: Math.max(72, h * 0.12),
  };
}

function exitTarget(direction, width, height) {
  if (direction === "left") return { x: -width * 1.2, y: 40, rotate: -24, opacity: 0.2 };
  if (direction === "right") return { x: width * 1.2, y: 30, rotate: 24, opacity: 0.2 };
  return { x: 0, y: -height * 1.15, rotate: -6, opacity: 0.15 };
}

export default function SwipeDeck({
  deck,
  state,
  personaName,
  onSwipeLeft,
  onSwipeRight,
  onSwipeTop,
  onUndo,
  showHint,
  onHintSeen,
  embedded = false,
}) {
  const [busy, setBusy] = useState(false);
  const [exiting, setExiting] = useState(null);
  const [undoVisible, setUndoVisible] = useState(false);
  const [toast, setToast] = useState(null);
  const [heartOn, setHeartOn] = useState(false);
  const [heartKey, setHeartKey] = useState(0);
  const [cartBounce, setCartBounce] = useState(0);
  const [flyToCart, setFlyToCart] = useState(null);

  const cartRef = useRef(null);
  const stackRef = useRef(null);
  const topCardRef = useRef(null);
  const draggingRef = useRef(false);
  const undoTimer = useRef(null);
  const toastTimer = useRef(null);
  const heartTimer = useRef(null);

  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const rotate = useTransform(x, [-220, 0, 220], [-14, 0, 14]);
  const nopeOp = useTransform(x, [-140, -40, 0], [1, 0.4, 0]);
  const savedOp = useTransform(x, [0, 40, 140], [0, 0.4, 1]);
  const cartOp = useTransform(y, [0, -40, -120], [0, 0.35, 1]);

  const [stamp, setStamp] = useState({ nope: 0, saved: 0, cart: 0 });

  useEffect(() => {
    const unsubX = x.on("change", (vx) => {
      const vy = y.get();
      setStamp({
        nope: Math.min(1, Math.max(0, -vx / 120)),
        saved: Math.min(1, Math.max(0, vx / 120)),
        cart: Math.min(1, Math.max(0, -vy / 100)),
      });
    });
    const unsubY = y.on("change", (vy) => {
      const vx = x.get();
      setStamp({
        nope: Math.min(1, Math.max(0, -vx / 120)),
        saved: Math.min(1, Math.max(0, vx / 120)),
        cart: Math.min(1, Math.max(0, -vy / 100)),
      });
    });
    return () => {
      unsubX();
      unsubY();
    };
  }, [x, y]);

  useEffect(
    () => () => {
      clearTimeout(undoTimer.current);
      clearTimeout(toastTimer.current);
      clearTimeout(heartTimer.current);
    },
    [],
  );

  const remainingCards = useMemo(() => {
    if (!deck) return [];
    return deck.cards.slice(deck.cursor);
  }, [deck]);

  const topCard = remainingCards[0] || null;
  const behind = remainingCards.slice(1, 3);
  const done = !deck || deck.done;
  const total = deck?.cards?.length || 0;
  const index = Math.min((deck?.cursor || 0) + 1, Math.max(total, 1));
  const cartCount = state?.cart?.length || 0;

  // Block native scroll / pull-to-refresh while a card drag is active.
  useEffect(() => {
    const el = topCardRef.current;
    if (!el) return undefined;
    const onMove = (e) => {
      if (!draggingRef.current) return;
      e.preventDefault();
    };
    el.addEventListener("touchmove", onMove, { passive: false });
    return () => el.removeEventListener("touchmove", onMove);
  }, [topCard?.product_id]);

  const armUndo = useCallback(() => {
    clearTimeout(undoTimer.current);
    setUndoVisible(true);
    undoTimer.current = setTimeout(() => setUndoVisible(false), UNDO_MS);
  }, []);

  const showSavedToast = useCallback(() => {
    clearTimeout(toastTimer.current);
    setToast("Saved ❤️");
    toastTimer.current = setTimeout(() => setToast(null), 900);
  }, []);

  const burstHearts = useCallback(() => {
    clearTimeout(heartTimer.current);
    setHeartKey((k) => k + 1);
    setHeartOn(true);
    heartTimer.current = setTimeout(() => setHeartOn(false), 420);
  }, []);

  const launchCartArc = useCallback((card) => {
    const stackEl = stackRef.current;
    const cartEl = cartRef.current;
    if (!stackEl || !cartEl || !card) {
      setCartBounce((n) => n + 1);
      return;
    }
    const from = stackEl.getBoundingClientRect();
    const to = cartEl.getBoundingClientRect();
    setFlyToCart({
      card,
      from: {
        x: from.left + from.width / 2 - 36,
        y: from.top + from.height * 0.28,
      },
      to: {
        x: to.left + to.width / 2 - 36,
        y: to.top + to.height / 2 - 36,
      },
    });
  }, []);

  const commitSwipe = useCallback(
    async (direction) => {
      if (busy || done || !topCard) return;
      setBusy(true);
      onHintSeen?.();

      const width = stackRef.current?.offsetWidth || 360;
      const height = stackRef.current?.offsetHeight || 480;
      const card = topCard;

      let result;
      if (direction === "left") result = onSwipeLeft();
      else if (direction === "right") result = onSwipeRight();
      else result = onSwipeTop();

      if (!result?.ok) {
        setBusy(false);
        x.set(0);
        y.set(0);
        return;
      }

      setExiting({
        card,
        direction,
        target: exitTarget(direction, width, height),
      });
      x.set(0);
      y.set(0);
      setStamp({ nope: 0, saved: 0, cart: 0 });

      if (direction === "right") {
        burstHearts();
        showSavedToast();
      }
      if (direction === "top") {
        launchCartArc(card);
      }

      armUndo();

      await new Promise((r) => setTimeout(r, FLY_MS));
      setExiting(null);
      setBusy(false);
    },
    [
      busy,
      done,
      topCard,
      onHintSeen,
      onSwipeLeft,
      onSwipeRight,
      onSwipeTop,
      x,
      y,
      burstHearts,
      showSavedToast,
      launchCartArc,
      armUndo,
    ],
  );

  const snapHome = useCallback(() => {
    animate(x, 0, { type: "spring", stiffness: 420, damping: 32 });
    animate(y, 0, { type: "spring", stiffness: 420, damping: 32 });
  }, [x, y]);

  const handleDragEnd = useCallback(
    (_e, info) => {
      draggingRef.current = false;
      if (busy || done) return;
      const { offset, velocity } = info;
      const { x: thrX, y: thrY } = swipeThresholds();
      const goLeft = offset.x < -thrX || velocity.x < -800;
      const goRight = offset.x > thrX || velocity.x > 800;
      const goTop = offset.y < -thrY || velocity.y < -700;

      if (goTop && Math.abs(offset.y) > Math.abs(offset.x)) {
        commitSwipe("top");
      } else if (goLeft) {
        commitSwipe("left");
      } else if (goRight) {
        commitSwipe("right");
      } else {
        snapHome();
      }
    },
    [busy, done, commitSwipe, snapHome],
  );

  const handleUndo = useCallback(() => {
    if (busy || !undoVisible) return;
    const result = onUndo();
    if (result?.ok) {
      clearTimeout(undoTimer.current);
      setUndoVisible(false);
      setExiting(null);
      x.set(0);
      y.set(0);
    }
  }, [busy, undoVisible, onUndo, x, y]);

  return (
    <div className={`swipe-deck${embedded ? " embedded" : ""}`}>
      <header className="topbar">
        <div className="brand-lockup">
          {embedded ? (
            <>
              <div className="brand-sub">Discover · {personaName}</div>
              <div className="counter-chip" style={{ marginTop: 6, width: "fit-content" }}>
                {done ? "Done" : `${Math.min(index, total)} / ${total}`}
              </div>
            </>
          ) : (
            <>
              <div className="brand-name">blinkit</div>
              <div className="brand-sub">Discover · {personaName}</div>
            </>
          )}
        </div>
        <div className="topbar-right">
          {!embedded ? (
            <div className="counter-chip">
              {done ? "Done" : `${Math.min(index, total)} / ${total}`}
            </div>
          ) : null}
          <CartBadge count={cartCount} bounceKey={cartBounce} badgeRef={cartRef} />
        </div>
      </header>

      {!embedded ? (
        <div className="state-strip" aria-live="polite">
          <span className="state-pill">
            Stage <strong>{state?.boldness_stage ?? 0}</strong>
          </span>
          <span className="state-pill">
            Cart <strong>{cartCount}</strong>
          </span>
          <span className="state-pill">
            Saved <strong>{state?.saved_list?.length ?? 0}</strong>
          </span>
          <span className="state-pill">
            Hidden <strong>{Object.keys(state?.hidden_products || {}).length}</strong>
          </span>
        </div>
      ) : (
        <div className="state-strip compact" aria-live="polite">
          <span className="state-pill">
            Stage <strong>{state?.boldness_stage ?? 0}</strong>
          </span>
          <span className="state-pill">
            {state?.time_window?.replace("_", " ")}
          </span>
        </div>
      )}

      <section className="deck-stage">
        <p className="hint-line">
          {showHint
            ? "Skip left · Save right · Add up — or use the buttons"
            : "\u00a0"}
        </p>

        <div className="stack-area" ref={stackRef}>
          <HeartBurst active={heartOn} burstKey={heartKey} />

          {toast ? (
            <motion.div
              className="toast"
              initial={{ opacity: 0, y: 8, scale: 0.94 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0 }}
            >
              {toast}
            </motion.div>
          ) : null}

          {done ? (
            <div className="card-slot">
              <EndCard message={deck?.end_message} />
            </div>
          ) : (
            <>
              {behind
                .slice()
                .reverse()
                .map((card, i) => {
                  const depth = behind.length - i;
                  return (
                    <motion.div
                      key={card.product_id}
                      className="card-slot"
                      style={{
                        zIndex: depth,
                        pointerEvents: "none",
                      }}
                      initial={false}
                      animate={{
                        scale: 1 - depth * 0.045,
                        y: depth * 14,
                        opacity: 1 - depth * 0.08,
                      }}
                      transition={{ type: "spring", stiffness: 420, damping: 32 }}
                    >
                      <ProductCard card={card} />
                    </motion.div>
                  );
                })}

              <AnimatePresence>
                {exiting ? (
                  <motion.div
                    key={`exit-${exiting.card.product_id}`}
                    className="card-slot"
                    style={{ zIndex: 20 }}
                    initial={{ x: 0, y: 0, rotate: 0, opacity: 1 }}
                    animate={{
                      x: exiting.target.x,
                      y: exiting.target.y,
                      rotate: exiting.target.rotate,
                      opacity: exiting.target.opacity,
                    }}
                    transition={{ type: "spring", stiffness: 260, damping: 22, mass: 0.8 }}
                  >
                    <ProductCard
                      card={exiting.card}
                      stampOpacity={{
                        nope: exiting.direction === "left" ? 1 : 0,
                        saved: exiting.direction === "right" ? 1 : 0,
                        cart: exiting.direction === "top" ? 1 : 0,
                      }}
                    />
                  </motion.div>
                ) : null}
              </AnimatePresence>

              {topCard ? (
                <motion.div
                  ref={topCardRef}
                  key={topCard.product_id}
                  className="card-slot"
                  style={{
                    zIndex: 10,
                    x,
                    y,
                    rotate,
                    pointerEvents: busy || exiting ? "none" : "auto",
                    touchAction: "none",
                  }}
                  drag={!busy && !exiting}
                  dragConstraints={{ left: 0, right: 0, top: 0, bottom: 0 }}
                  dragElastic={0.9}
                  onDragStart={() => {
                    draggingRef.current = true;
                  }}
                  onDragEnd={handleDragEnd}
                  whileTap={{ cursor: "grabbing" }}
                  initial={{ scale: 0.96, opacity: 0, y: 18 }}
                  animate={{ scale: 1, opacity: 1, y: 0 }}
                  transition={{ type: "spring", stiffness: 380, damping: 28 }}
                >
                  <ProductCard
                    card={topCard}
                    stampOpacity={exiting ? { nope: 0, saved: 0, cart: 0 } : stamp}
                  />
                </motion.div>
              ) : null}
            </>
          )}
        </div>
      </section>

      <footer className="controls">
        <div className="undo-row">
          <button
            type="button"
            className="undo-btn"
            disabled={!undoVisible || busy}
            onClick={handleUndo}
          >
            ↺ Undo
          </button>
        </div>
        <ActionButtons
          disabled={busy || done}
          onSkip={() => commitSwipe("left")}
          onSave={() => commitSwipe("right")}
          onAdd={() => commitSwipe("top")}
        />
      </footer>

      <AnimatePresence>
        {flyToCart ? (
          <motion.div
            key={`fly-${flyToCart.card.product_id}-${cartBounce}`}
            className="flying-to-cart"
            initial={{
              left: flyToCart.from.x,
              top: flyToCart.from.y,
              scale: 1,
              opacity: 1,
              rotate: -8,
            }}
            animate={{
              left: flyToCart.to.x,
              top: flyToCart.to.y,
              scale: 0.35,
              opacity: 0.2,
              rotate: 18,
            }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.36, ease: [0.2, 0.8, 0.2, 1] }}
            onAnimationComplete={() => {
              setFlyToCart(null);
              setCartBounce((n) => n + 1);
            }}
          >
            <img src={flyToCart.card.image_url} alt="" />
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
