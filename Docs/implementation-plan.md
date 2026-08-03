# implementation-plan.md — Build phases

Source for recommendation architecture: `Docs/llm-recommendation-spec.md` (supersedes offline-only flow in `architecture.md`).  
Frozen `candidates_*.json` from Phase 3 remain the **automatic fallback** when the runtime LLM fails, times out (>5s), or rate-limits.

Each phase: tasks → files → "done when". Build in order. Cuttable phases marked.

## Phase 1 — Data cleaning (Python) ✅
Tasks: dedupe CSV (name+unit, keep first); map 295 categories → top-level via mapping.json; output catalog_clean.csv + counts.
Done when: catalog_clean.csv has 0 dupes, every row has a top_category, counts print.

## Phase 2 — Subset + personas (Python) ✅
Tasks: build persona_*.json (10–15 history items); select ~250-product demo subset; image fetch into `/public/images`.
Done when: persona files valid; subset.csv ~250 rows; images under `/public/images`.

## Phase 3 — Offline tagging + frozen fallback candidates (Python + LLM, once) ✅
Tasks: tag subset → catalog.json; generate `candidates_*.json` (L2/L3/L4, bridge, bio, confidence). These files are the **fallback deck**, not the primary runtime brain.
Done when: catalog.json tagged; ≥3 candidate files exist; spot-check of bridges passes.

## Phase 4 — Deterministic core engine (JS module + tests) ✅ / extend
Tasks: allocator + state + edge rules (boldness stages, cooldowns, veg, time window lock, undo, purchase override). Keep UI-independent and unit-tested.
Done when: existing engine tests still pass; engine can accept either an LLM-built deck or a frozen fallback deck.

## Phase 4b — Runtime LLM sandwich (NEW — primary brain) ✅ wired
Tasks:
1. **User profile** JSON (history, hard_constraints, needs, goal_hypotheses[], resolved_goal, boldness_stage, saved/cart/hidden, category_backoffs, evidence_log).
2. **LLM Call 1 — Cold read:** history → needs + competing goal_hypotheses (2–3 with confidence + evidence). Never a single conclusion.
3. **Allowed list builder:** code pre-filters catalog to 60–100 items (in stock, not hidden, constraints, price band, cross-category rules).
4. **LLM Call 2 — Deck generation:** allowed list + history + constraints + swipe state + stage mix (+ PROBE when hypotheses close) + time window → strict JSON cards with product_id, level, anchor_items, bridge, bio.
5. **Validation (code):** product in allowed list; anchors in history; constraints; level mix; on parse/timeout/rate-limit → serve frozen `candidates_*.json` silently.
6. **Hypothesis resolve/branch (code):** swipe/purchase confidence updates; resolve at ≥0.75; branch product trees; self-correction + 90-day evidence half-life.
7. **Deck cache** keyed by `(user, stage, time_window, resolved_goal)`.
Files: `src/engine/profile.js`, `allowedList.js`, `llmClient.js`, `coldRead.js`, `deckLlm.js`, `validateDeck.js`, `hypothesis.js`, wire into `engine.js` / `useEngine.js`.
Done when: with API up, New Session returns LLM deck with honest bridges; with API killed / >5s timeout, frozen fallback deck still plays with zero crash; probe cards appear when top-2 goals within 0.20; top-swipe probe → next session branches.

## Phase 5 — Swipe deck UI (React) ✅ / wire LLM status
Tasks: cards, Skip/Save/Add, undo, stack, gestures, animations. Show subtle “fallback deck” only in demo controls if useful (not user-facing).
Done when: Stage 0 session playable; LLM or fallback deck both swipe cleanly.

## Phase 6 — Screens + demo controls (React) ✅ / LLM demo controls
Tasks: home, post-order, cart (₹99 free-delivery), saved list, demo panel: persona, time, New Session, price drop, mark-purchased, stock toggle, **force fallback**, **reset hypotheses / unresolved goal**, **kill API** toggle for fallback demo.
Done when: persona switch + New Session rebuild; probe-resolve-branch beat demoable on Akash; self-correction beat (mark-purchased mass gainer → probing resumes).

## Phase 7 — Match moments + nudge LLM ✅ scaffold
Tasks: price-drop / free-delivery-gap / back-in-stock takeovers (triggers = code). Nudge copy = LLM template (Hinglish, family-safe) with length + banned-words validation; fail → default lines. Delivery: in-app banner/takeover + **simulated lock-screen** view; demo “lock screen” toggle. Anti-spam: max 1 nudge/user/day; priority 2>1>3>5>4.
Done when: three match paths + one nudge LLM path + lock-screen simulation work live; banned-words hard stop active.

## Phase 8 — Demo run + deploy
Tasks: walk demo script including probe→branch and fallback-when-offline; deploy static build; verify shareable link. Pre-warm cached decks for demo personas before presenting.
Done when: full script zero-crash; fallback proven by disabling network/API; probe-resolve-branch visible.

## If time runs short, cut in this order
1. Animation polish → 2. Bardhan persona → 3. Time layer polish → 4. Gestures → 5. Saved-list screen → 6. Lock-screen simulation (banner nudges survive) → 7. Live nudge LLM (keep default Hinglish lines).
Never cut: rules sandwich, validation 1–5, frozen fallback deck, swipes + undo, Stage 0→1, probe-resolve OR clear fallback path, one match moment, ≥2 personas.

## Conflicts with other docs (short list)
See chat response / keep this checklist when editing docs:
1. `architecture.md` / `context.md` / `ProblemStatement*` — still say “no LLM/network at runtime”; **llm-recommendation-spec supersedes** that for the Brain (fallback preserves offline safety).
2. `ProblemStatement*` “Source of truth” claim vs this spec — treat **llm-recommendation-spec as SoT for recommendation runtime**; update ProblemStatement when syncing.
3. Phase 8 / Core “zero-network” success criterion — now means **images + fallback must work offline**; primary path may call LLM when available.
4. `context.md` personas omit Yash / goal_hypotheses / resolved_goal profile shape.
5. Nudge LLM + lock-screen are new vs older “static Hinglish copy only” notes.
