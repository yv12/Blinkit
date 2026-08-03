import { useEffect, useRef, useState } from "react";
import { AnimatePresence } from "framer-motion";
import { useEngine } from "./hooks/useEngine.js";
import { getPersonaBundle } from "./data/loadDemoData.js";
import SwipeDeck from "./components/SwipeDeck.jsx";
import HomeScreen from "./components/HomeScreen.jsx";
import PostOrderScreen from "./components/PostOrderScreen.jsx";
import CartScreen from "./components/CartScreen.jsx";
import SavedList from "./components/SavedList.jsx";
import BottomNav from "./components/BottomNav.jsx";
import DemoControls from "./components/DemoControls.jsx";
import MatchTakeover from "./components/MatchTakeover.jsx";
import LockScreenNudge from "./components/LockScreenNudge.jsx";
import { createNudgeGate } from "./lib/nudgeAntiSpam.js";
import "./styles/screens.css";
import "./styles/match.css";
import "./styles/lockscreen.css";

const HINT_KEY = "blinkit-discover-hint-seen";

export default function App() {
  const engine = useEngine("yash");
  const nudgeGate = useRef(createNudgeGate()).current;
  const [screen, setScreen] = useState("post-order");
  const [demoOpen, setDemoOpen] = useState(false);
  const [takeoverOpen, setTakeoverOpen] = useState(false);
  const [lockScreenOn, setLockScreenOn] = useState(false);
  const [lockNudge, setLockNudge] = useState(null);
  const [nudge, setNudge] = useState(null);
  const [hintSeen, setHintSeen] = useState(() => {
    try {
      return localStorage.getItem(HINT_KEY) === "1";
    } catch {
      return false;
    }
  });

  useEffect(() => {
    engine.init("yash", "morning");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const personaBundle = getPersonaBundle(engine.personaId);
  const personaName = personaBundle.persona.name;
  const candidates = personaBundle.candidates;

  const markHintSeen = () => {
    if (hintSeen) return;
    setHintSeen(true);
    try {
      localStorage.setItem(HINT_KEY, "1");
    } catch {
      /* ignore */
    }
  };

  const presentMatch = async (match) => {
    if (!match) return false;
    // Demo panel always presents; gate still tracks fires / muted items for dismissals.
    nudgeGate.recordFire(match.reason);

    const { buildNudgeCopy } = await import("./lib/nudgeLlm.js");
    const history = personaBundle.persona?.order_history || [];
    const copy = await buildNudgeCopy(match, {
      personaName,
      // late_night + filmy = spiciest tier in nudge_prompt.md
      timeWindow: "late_night",
      resolvedGoal: engine.state?.resolved_goal,
      needs: personaBundle.persona?.needs,
      goals: personaBundle.persona?.goals,
      orderHistory: history,
      bridgeItem: history[0]?.name || "",
      ladderLevel: match.level || "L2",
      toneSetting: "filmy",
      feeGapRemaining:
        match.reason === "free_delivery_gap"
          ? Math.max(0, 99 - (engine.state?.cart_total || 0))
          : undefined,
    });

    const enriched = {
      ...match,
      title: copy.title,
      body: copy.body,
      cta: copy.cta,
    };
    setNudge(enriched);

    if (lockScreenOn) {
      setLockNudge(enriched);
      setDemoOpen(false);
      return true;
    }
    setTakeoverOpen(true);
    setDemoOpen(false);
    return true;
  };

  const clearNudge = () => setNudge(null);

  const handleDismissMatch = () => {
    const match = engine.state?.pending_match || nudge;
    if (match?.product_id) nudgeGate.recordIgnore(match.product_id);
    engine.dismissMatch();
    setTakeoverOpen(false);
    // keep nudge banner so user can reopen (unless they clear it)
  };

  const handleAcceptMatch = () => {
    if (!engine.state?.pending_match && nudge) {
      engine.reopenMatch(nudge.product_id, nudge.reason);
    }
    const result = engine.acceptMatch();
    if (result?.ok) {
      setTakeoverOpen(false);
      clearNudge();
      setScreen("cart");
    }
  };

  const handleOpenNudge = () => {
    if (!nudge) return;
    const result = engine.reopenMatch(nudge.product_id, nudge.reason);
    if (result?.match) {
      setNudge(result.match);
      setTakeoverOpen(true);
    } else {
      // suppressed (already in cart / purchased)
      clearNudge();
    }
  };

  const refreshDeliveryMatch = ({ openTakeover = false } = {}) => {
    const result = engine.checkFreeDeliveryMatch();
    if (result?.match) {
      setNudge(result.match);
      if (openTakeover) {
        setTakeoverOpen(true);
        setDemoOpen(false);
      }
    }
    return result?.match || null;
  };

  const handleRemoveFromCart = (productId) => {
    engine.removeFromCart(productId);
    refreshDeliveryMatch({ openTakeover: true });
  };

  const handleScreenChange = (next) => {
    setScreen(next);
    if (next === "cart") {
      refreshDeliveryMatch({ openTakeover: true });
    }
  };

  const handleSimulatePriceDrop = (productId) => {
    const result = engine.simulatePriceDrop(productId);
    if (result?.match) presentMatch(result.match);
    return result;
  };

  const handleToggleStock = (productId, inStock) => {
    const result = engine.setStock(productId, inStock);
    if (result?.match) presentMatch(result.match);
    return result;
  };

  /** MVP: auto-show nudges after save / add — no Demo panel required. */
  const priceDropTimers = useRef(new Map());

  const handleSwipeRight = () => {
    const before = engine.current;
    const result = engine.swipeRight();
    const id = before?.product_id || result?.card?.product_id;
    if (id) {
      if (priceDropTimers.current.has(id)) clearTimeout(priceDropTimers.current.get(id));
      const t = setTimeout(() => {
        priceDropTimers.current.delete(id);
        handleSimulatePriceDrop(id);
      }, 8000);
      priceDropTimers.current.set(id, t);
    }
    return result;
  };

  const handleSwipeTop = () => {
    const result = engine.swipeTop();
    // Let cart state settle, then fire free-delivery match when in range
    setTimeout(() => {
      refreshDeliveryMatch({ openTakeover: true });
    }, 600);
    return result;
  };

  if (!engine.ready || !engine.deck || !engine.state) {
    return (
      <div className="app-shell">
        <div className="phone" style={{ placeContent: "center", textAlign: "center" }}>
          <div className="brand-name">blinkit</div>
          <p className="brand-sub" style={{ marginTop: 8 }}>
            Shuffling your deck…
          </p>
        </div>
      </div>
    );
  }

  const deckProps = {
    deck: engine.deck,
    state: engine.state,
    personaName,
    sessionKey: `${engine.personaId}-${engine.sessionKey}`,
    showHint: !hintSeen,
    onHintSeen: markHintSeen,
    onSwipeLeft: engine.swipeLeft,
    onSwipeRight: handleSwipeRight,
    onSwipeTop: handleSwipeTop,
    onUndo: engine.undo,
    deckSource: engine.deckSource,
    llmBusy: engine.llmBusy,
  };

  const activeMatch = engine.state.pending_match || nudge;
  const showBanner = Boolean(nudge) && !takeoverOpen;

  return (
    <div className="app-shell">
      <div className="phone has-nav">
        <button
          type="button"
          className="demo-fab"
          aria-label="Open demo controls"
          onClick={() => setDemoOpen(true)}
        >
          Demo
        </button>

        <div className="screen-host">
          {screen === "home" ? (
            <HomeScreen
              persona={personaBundle.persona}
              deck={engine.deck}
              state={engine.state}
              suppressed={engine.state.home_card_suppressed}
              onOpenDeck={() => setScreen("discover")}
              nudge={showBanner ? nudge : null}
              onOpenNudge={handleOpenNudge}
              onDismissNudge={clearNudge}
            />
          ) : null}

          {screen === "post-order" ? <PostOrderScreen {...deckProps} /> : null}

          {screen === "discover" ? (
            <SwipeDeck key={deckProps.sessionKey} {...deckProps} />
          ) : null}

          {screen === "saved" ? (
            <SavedList
              state={engine.state}
              onOpenDiscover={() => setScreen("discover")}
              nudge={showBanner ? nudge : null}
              onOpenNudge={handleOpenNudge}
              onDismissNudge={clearNudge}
            />
          ) : null}

          {screen === "cart" ? (
            <CartScreen
              state={engine.state}
              onRemove={handleRemoveFromCart}
              deliveryMatch={
                nudge?.reason === "free_delivery_gap" ? nudge : null
              }
              nudge={showBanner ? nudge : null}
              onOpenNudge={handleOpenNudge}
              onDismissNudge={clearNudge}
              onOpenDeliveryMatch={() => {
                if (nudge?.reason === "free_delivery_gap") handleOpenNudge();
                else refreshDeliveryMatch({ openTakeover: true });
              }}
            />
          ) : null}
        </div>

        <BottomNav
          screen={screen}
          cartCount={engine.state.cart.length}
          savedCount={engine.state.saved_list.length}
          onChange={handleScreenChange}
        />

        <DemoControls
          open={demoOpen}
          onClose={() => setDemoOpen(false)}
          personaId={engine.personaId}
          timeWindow={engine.state.time_window}
          state={engine.state}
          candidates={candidates}
          deckSource={engine.deckSource}
          llmBusy={engine.llmBusy}
          lockScreenOn={lockScreenOn}
          onSwitchPersona={(id) => {
            engine.switchPersona(id);
            clearNudge();
            setTakeoverOpen(false);
            setLockNudge(null);
            setScreen("post-order");
          }}
          onSetTimeWindow={engine.setTimeWindow}
          onNewSession={async () => {
            await engine.newSession();
          }}
          onSimulatePriceDrop={handleSimulatePriceDrop}
          onMarkPurchased={engine.markPurchased}
          onToggleStock={handleToggleStock}
          onForceFallback={engine.setForceFallback}
          onResetHypotheses={() => {
            engine.resetHypotheses();
          }}
          onToggleLockScreen={(on) => {
            setLockScreenOn(!!on);
            if (!on) setLockNudge(null);
          }}
        />

        <AnimatePresence>
          {lockScreenOn && lockNudge ? (
            <LockScreenNudge
              key={`lock-${lockNudge.product_id}-${lockNudge.reason}`}
              nudge={lockNudge}
              onOpen={() => {
                setLockNudge(null);
                setLockScreenOn(false);
                handleOpenNudge();
              }}
              onDismiss={() => setLockNudge(null)}
            />
          ) : null}
        </AnimatePresence>

        <AnimatePresence>
          {takeoverOpen && activeMatch && !lockScreenOn ? (
            <MatchTakeover
              key={`${activeMatch.product_id}-${activeMatch.reason}`}
              match={activeMatch}
              personaName={personaName}
              onAccept={handleAcceptMatch}
              onClose={handleDismissMatch}
            />
          ) : null}
        </AnimatePresence>
      </div>
    </div>
  );
}
