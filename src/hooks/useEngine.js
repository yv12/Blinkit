import { useCallback, useRef, useState } from "react";
import { createEngine } from "../engine/index.js";
import { catalog, DEFAULT_PERSONA_ID, getPersonaBundle } from "../data/loadDemoData.js";

function snapshot(engine) {
  return {
    deck: engine.getDeck(),
    state: engine.getState(),
    current: engine.currentCard(),
    profile: engine.getProfile?.() || null,
  };
}

export function useEngine(initialPersonaId = DEFAULT_PERSONA_ID) {
  const engineRef = useRef(null);
  const [personaId, setPersonaId] = useState(initialPersonaId);
  const [deck, setDeck] = useState(null);
  const [state, setState] = useState(null);
  const [current, setCurrent] = useState(null);
  const [profile, setProfile] = useState(null);
  const [ready, setReady] = useState(false);
  const [sessionKey, setSessionKey] = useState(0);
  const [deckSource, setDeckSource] = useState("fallback");
  const [llmBusy, setLlmBusy] = useState(false);

  const applyEngine = useCallback((eng, id) => {
    engineRef.current = eng;
    if (id) setPersonaId(id);
    const next = snapshot(eng);
    setDeck(next.deck);
    setState(next.state);
    setCurrent(next.current);
    setProfile(next.profile);
    setDeckSource(next.state?.deck_source || "fallback");
    setReady(true);
    setSessionKey((k) => k + 1);
    return eng;
  }, []);

  const sync = useCallback(() => {
    const eng = engineRef.current;
    if (!eng) return;
    const next = snapshot(eng);
    setDeck(next.deck);
    setState(next.state);
    setCurrent(next.current);
    setProfile(next.profile);
    setDeckSource(next.state?.deck_source || "fallback");
  }, []);

  const init = useCallback(
    (id = personaId, timeWindow = "morning") => {
      const bundle = getPersonaBundle(id);
      const eng = createEngine({
        persona: bundle.persona,
        candidates: bundle.candidates,
        catalog,
        timeWindow,
      });
      applyEngine(eng, id);
      // Upgrade to LLM deck in background; frozen already showing
      setLlmBusy(true);
      eng
        .rebuildDeckAsync()
        .then(() => sync())
        .finally(() => setLlmBusy(false));
      return eng;
    },
    [personaId, applyEngine, sync],
  );

  const ensure = useCallback(() => {
    if (!engineRef.current) init();
    return engineRef.current;
  }, [init]);

  const run = useCallback(
    (fn, { bumpSession = false } = {}) => {
      const eng = ensure();
      if (!eng) return { ok: false, reason: "no_engine" };
      const result = fn(eng);
      sync();
      if (bumpSession) setSessionKey((k) => k + 1);
      return result;
    },
    [ensure, sync],
  );

  const newSession = useCallback(async () => {
    const eng = ensure();
    if (!eng) return { ok: false, reason: "no_engine" };
    setLlmBusy(true);
    try {
      const result = await eng.newSessionAsync();
      sync();
      setSessionKey((k) => k + 1);
      return result;
    } finally {
      setLlmBusy(false);
    }
  }, [ensure, sync]);

  const switchPersona = useCallback(
    (id) => {
      const bundle = getPersonaBundle(id);
      const currentEng = engineRef.current;
      const timeWindow = currentEng?.getState()?.time_window || "morning";
      let eng;
      if (currentEng) {
        eng = currentEng.switchPersona(bundle.persona, bundle.candidates, catalog);
      } else {
        eng = createEngine({
          persona: bundle.persona,
          candidates: bundle.candidates,
          catalog,
          timeWindow,
        });
      }
      applyEngine(eng, id);
      setLlmBusy(true);
      eng
        .rebuildDeckAsync()
        .then(() => sync())
        .finally(() => setLlmBusy(false));
      return eng;
    },
    [applyEngine, sync],
  );

  return {
    ready,
    personaId,
    deck,
    state,
    current,
    profile,
    sessionKey,
    deckSource,
    llmBusy,
    init,
    sync,
    engine: engineRef,
    swipeLeft: () => run((e) => e.swipeLeft()),
    swipeRight: () => run((e) => e.swipeRight()),
    swipeTop: () => run((e) => e.swipeTop()),
    undo: () => run((e) => e.undo()),
    newSession,
    setTimeWindow: (window) => run((e) => e.setTimeWindow(window)),
    switchPersona,
    markPurchased: (productId) => run((e) => e.markPurchased(productId)),
    removeFromCart: (productId) => run((e) => e.removeFromCart(productId)),
    setStock: (productId, inStock) => run((e) => e.setStock(productId, inStock)),
    simulatePriceDrop: (productId, newPrice) =>
      run((e) => e.simulatePriceDrop(productId, newPrice)),
    checkFreeDeliveryMatch: () => run((e) => e.checkFreeDeliveryMatch()),
    dismissMatch: () => run((e) => e.dismissMatch()),
    reopenMatch: (productId, reason) => run((e) => e.reopenMatch(productId, reason)),
    acceptMatch: () => run((e) => e.acceptMatch()),
    setForceFallback: (on) => run((e) => e.setForceFallback(on)),
    resetHypotheses: () => run((e) => e.resetHypotheses()),
    peekCurrent: () => engineRef.current?.currentCard() ?? null,
    getCandidates: () => getPersonaBundle(personaId).candidates,
  };
}
