import { useMemo, useState } from "react";
import { PERSONAS } from "../data/loadDemoData.js";

const TIME_WINDOWS = [
  { id: "morning", label: "Morning" },
  { id: "afternoon", label: "Afternoon" },
  { id: "evening", label: "Evening" },
  { id: "late_night", label: "Late night" },
];

export default function DemoControls({
  open,
  onClose,
  personaId,
  timeWindow,
  state,
  candidates,
  deckSource,
  llmBusy,
  onSwitchPersona,
  onSetTimeWindow,
  onNewSession,
  onSimulatePriceDrop,
  onMarkPurchased,
  onToggleStock,
  onForceFallback,
  onResetHypotheses,
  onToggleLockScreen,
  lockScreenOn,
}) {
  const [log, setLog] = useState("");
  const [priceTarget, setPriceTarget] = useState("");
  const [purchaseTarget, setPurchaseTarget] = useState("");
  const [stockTarget, setStockTarget] = useState("");

  const savedOptions = state?.saved_list || [];
  const hiddenIds = Object.keys(state?.hidden_products || {});

  const purchaseOptions = useMemo(() => {
    const byId = new Map();
    for (const c of candidates || []) {
      byId.set(c.product_id, { id: c.product_id, name: c.name });
    }
    for (const id of hiddenIds) {
      if (!byId.has(id)) {
        const hit = (candidates || []).find((c) => c.product_id === id);
        byId.set(id, { id, name: hit?.name || id });
      }
    }
    return [...byId.values()].slice(0, 40);
  }, [candidates, hiddenIds]);

  const stockOptions = useMemo(() => {
    const opts = [];
    for (const s of savedOptions) {
      opts.push({ id: s.product_id, name: `${s.name} (saved)` });
    }
    for (const c of (candidates || []).slice(0, 20)) {
      if (!opts.some((o) => o.id === c.product_id)) {
        opts.push({ id: c.product_id, name: c.name });
      }
    }
    return opts;
  }, [savedOptions, candidates]);

  if (!open) return null;

  const note = (msg) => setLog(msg);

  return (
    <div className="demo-overlay" role="dialog" aria-label="Demo controls">
      <button type="button" className="demo-backdrop" aria-label="Close" onClick={onClose} />
      <div className="demo-panel">
        <header className="demo-panel-head">
          <div>
            <h2>Demo controls</h2>
            <p>
              Stage {state?.boldness_stage ?? 0}
              {" · "}
              deck: {deckSource || state?.deck_source || "fallback"}
              {llmBusy ? " · LLM…" : ""}
              {state?.resolved_goal ? ` · goal: ${state.resolved_goal}` : " · goal: probing"}
            </p>
          </div>
          <button type="button" className="demo-close" onClick={onClose}>
            Close
          </button>
        </header>

        <section className="demo-section">
          <h3>Persona</h3>
          <div className="demo-chips">
            {Object.keys(PERSONAS).map((id) => (
              <button
                key={id}
                type="button"
                className={`demo-chip${personaId === id ? " active" : ""}`}
                onClick={() => {
                  onSwitchPersona(id);
                  note(`Switched to ${PERSONAS[id].persona.name} — fresh deck`);
                }}
              >
                {PERSONAS[id].persona.name}
              </button>
            ))}
          </div>
        </section>

        <section className="demo-section">
          <h3>Time window</h3>
          <div className="demo-chips">
            {TIME_WINDOWS.map((w) => (
              <button
                key={w.id}
                type="button"
                className={`demo-chip${timeWindow === w.id ? " active" : ""}`}
                onClick={() => {
                  onSetTimeWindow(w.id);
                  note(`Time set to ${w.label}. Press New Session to rebuild.`);
                }}
              >
                {w.label}
              </button>
            ))}
          </div>
        </section>

        <section className="demo-section">
          <h3>Session</h3>
          <button
            type="button"
            className="demo-primary"
            onClick={async () => {
              note("New Session — LLM sandwich (fallback if API fails)…");
              await onNewSession();
              note("New Session done");
            }}
          >
            New Session
          </button>
        </section>

        <section className="demo-section">
          <h3>LLM / fallback</h3>
          <div className="demo-row">
            <button
              type="button"
              className={`demo-chip${state?.force_fallback ? " active" : ""}`}
              onClick={() => {
                const next = !state?.force_fallback;
                onForceFallback?.(next);
                note(next ? "Force fallback ON — frozen candidates only" : "Force fallback OFF — LLM allowed");
              }}
            >
              Force fallback
            </button>
            <button
              type="button"
              className="demo-secondary"
              onClick={() => {
                onResetHypotheses?.();
                note("Hypotheses reset — cold read + probing resume on next session");
              }}
            >
              Reset hypotheses
            </button>
          </div>
          {state?.goal_hypotheses?.length ? (
            <p className="demo-log" style={{ marginTop: 8 }}>
              {state.goal_hypotheses
                .map((h) => `${h.goal}:${(h.confidence ?? 0).toFixed(2)}`)
                .join(" · ")}
            </p>
          ) : null}
        </section>

        <section className="demo-section">
          <h3>Lock screen</h3>
          <button
            type="button"
            className={`demo-chip${lockScreenOn ? " active" : ""}`}
            onClick={() => onToggleLockScreen?.(!lockScreenOn)}
          >
            {lockScreenOn ? "Lock screen ON" : "Show lock screen"}
          </button>
          <p className="demo-log" style={{ marginTop: 8 }}>
            Fire a match trigger while ON to see the simulated push.
          </p>
        </section>

        <section className="demo-section">
          <h3>Simulate price drop</h3>
          <select
            value={priceTarget}
            onChange={(e) => setPriceTarget(e.target.value)}
          >
            <option value="">Select saved item…</option>
            {savedOptions.map((s) => (
              <option key={s.product_id} value={s.product_id}>
                {s.name} · ₹{Math.round(s.price)}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="demo-secondary"
            disabled={!priceTarget}
            onClick={() => {
              const result = onSimulatePriceDrop(priceTarget);
              note(
                result?.match
                  ? `It's a Match! Price drop — ${result.match.name}`
                  : result?.ok
                    ? "Price updated (match suppressed — already in cart/purchased)"
                    : result?.reason || "Failed",
              );
            }}
          >
            Drop price ~20%
          </button>
        </section>

        <section className="demo-section">
          <h3>Mark purchased via search</h3>
          <select
            value={purchaseTarget}
            onChange={(e) => setPurchaseTarget(e.target.value)}
          >
            <option value="">Select product…</option>
            {purchaseOptions.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="demo-secondary"
            disabled={!purchaseTarget}
            onClick={() => {
              const result = onMarkPurchased(purchaseTarget);
              note(
                result?.ok
                  ? `Purchased ${purchaseTarget} — left signal cleared, product stays out of deck`
                  : "Failed",
              );
            }}
          >
            Mark purchased
          </button>
        </section>

        <section className="demo-section">
          <h3>Stock toggle</h3>
          <select value={stockTarget} onChange={(e) => setStockTarget(e.target.value)}>
            <option value="">Select product…</option>
            {stockOptions.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <div className="demo-row">
            <button
              type="button"
              className="demo-secondary"
              disabled={!stockTarget}
              onClick={() => {
                const result = onToggleStock(stockTarget, false);
                note(result?.ok ? "Marked out of stock" : "Failed");
              }}
            >
              OOS
            </button>
            <button
              type="button"
              className="demo-secondary"
              disabled={!stockTarget}
              onClick={() => {
                const result = onToggleStock(stockTarget, true);
                note(
                  result?.match
                    ? `It's a Match! Back in stock — ${result.match.name}`
                    : result?.ok
                      ? "Back in stock (no match / suppressed)"
                      : "Failed",
                );
              }}
            >
              In stock
            </button>
          </div>
        </section>

        {log ? <p className="demo-log">{log}</p> : null}
      </div>
    </div>
  );
}
