# architecture.md — How the system is built

## Two components
- **Brain:** ladder-of-inference recommendation engine. LLM proposes candidates OFFLINE (before demo); deterministic allocator decides at RUNTIME. Why: free stack, zero live-API risk on stage, engine can never hallucinate live.
- **Face:** Tinder-style swipe UI (animations first-class) + simulated nudges. Why: swipes are a low-effort input device that feeds the Brain's boldness logic; nudges are the Brain's output channel back to the user.

## Tech stack
- **React + Vite**, mobile-viewport-first single-page app. Why: free, fast, static build deploys to Vercel, Netlify, GitHub Pages, Render (static), or Railway in one command.
- **Framer Motion** for card physics/animations (fly-off with rotation + spring, heart burst, card-to-cart arc, match takeover ≤400ms each). Why: production-grade gesture + spring animations with little code.
- **No backend, no database.** All data = static JSON files bundled with the app; all state = in-memory (React state) per persona, reset on reload. Why: demo needs no persistence across visits, and zero infra = zero failure points. Use **New Session** (not reload) to show cross-session reactions live.
- Offline scripts (data cleaning, tagging, candidate generation) = **Python**, run once, outputs frozen JSON. LLM for tagging/candidates: any free option — Grok free tier, Groq API free tier, or local open-source via Ollama (Llama/Qwen). Human-reviewed output, so model choice is flexible.
- **Images are build-time assets:** downloaded once into `/public/images` and referenced locally in `catalog.json` (`image_url` = local path). Zero remote loads at runtime.

## Data flow (end to end)
CSV → clean/dedupe/top-category map → demo subset (~250) → offline tagging (need/goal/time tags) → offline per-persona candidate generation (level, shared tag, bridge, bio line, confidence) → frozen JSON → runtime allocator builds deck (slot policy + filters + cooldowns + time boost) → user swipes → state updates → New Session rebuilds deck → match trigger → nudge/takeover → cart.

## Ladder (L0-L4)
L0 basket facts → L1 needs + hard constraints (constraints inherited upward by ALL levels) → L2 same-need/new-category → L3 same-goal/different-need → L4 lifestyle halo (Stage 0 never; Stage 1+ eligible). Confidence decays per hop → price/position decay with level. Price sensitivity is a soft band preference, not a hard exclude.

## Allocator (runtime, deterministic)
- Boldness stages (explicit, so progression is demoable):
  - **Stage 0 (default):** 4×L2 + 1×L3 low-price, no L4
  - **Stage 1 (≥1 top swipe):** 3×L2 + 2×L3 + 1×L4 eligible
  - **Stage 2 (≥3 top swipes):** up to 2×L4
  - **Retreat** (2 consecutive lefts): all-L2 low-price, stage down (floor 0) — session boldness only; category back-off is separate (3+ lefts in one category)
- State per persona: `{accepted_count, consecutive_dismissals, boldness_stage, saved_list[], cart[], hidden_products{id: hide_until}}`
- Top swipe → advance stage on next New Session. Right swipe → hold stage, weight toward saved item's category.
- Time boost: candidates matching current window ranked up (window locked at deck build). Backfill downward only. Honest-candidate shortage → shorter deck, never pad.
- Free-delivery threshold (demo) = ₹99; gap match when cart within ₹50 and a saved item fits the remaining gap.

## Files
/data: catalog.json (id, name, brand, category, subcategory, price, mrp, unit, image_url [local], in_stock, veg_flag, need_tags[], goal_tags[], time_tags[]), persona_akash.json, persona_janvi.json, persona_bardhan.json, candidates_akash.json, candidates_janvi.json, candidates_bardhan.json
/public/images: bundled product photos
/src: engine/ (allocator + state + rules, UI-independent, unit-tested), components/ (Card, Deck, HomeScreen, PostOrderScreen, SavedList, Cart, MatchTakeover, DemoControls), App

## Screens
Hidden demo controls (persona switcher · time selector morning/afternoon/evening/late night · New Session · simulate price drop · mark-purchased-via-search · stock toggle) · Mock home (deck card in promo slot + static old rail) · Swipe deck · Post-order (countdown + deck) · Saved list · Cart (remove item → Saved per rule 5; free-delivery progress bar → gap match).

Persona switch mid-deck: discard in-progress deck, clear undo buffer, load target persona state, build fresh deck.
