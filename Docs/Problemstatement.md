# MVP Spec: Blinkit Cross-Category Discovery — Swipe Deck

Read this fully before writing any code. All decisions here are final unless this file is updated.  
**Source of truth:** this file (`ProblemStatement.md`). Keep `ProblemStatement.txt` in sync when this changes.

---

## Problem Statement

Blinkit users keep buying from the same few categories (dairy, groceries, staples) and rarely try new ones. The recommendations they see feel irrelevant — stale, recently-viewed, or out-of-stock items — so users ignore them. This caps the growth metric: **% of Monthly Active Customers who buy from at least one NEW category each month.**

We are building an MVP that fixes this with two components:

1. **The Brain** — a logic-based, personalised cross-sell recommendation engine built on the user's order history.
2. **The Face** — a Tinder-style card game with brilliant graphics and animations, plus personalised nudge notifications, through which the recommendations reach the user.

The game is how users talk to the engine; the nudges are how the engine talks back.

Rule that governs everything: **every recommendation must be logically derived from the user's real purchase history and must carry a one-line "bridge" stating that logic. No honest bridge = never shown. No random or generic filler products anywhere.**

---

## Component 1: The Brain (recommendation engine)

### Every recommendation is based on 5 inputs

1. **Order history** — needs and goals derived from what the user buys (protein, breakfast, fitness, household). Decides which products are eligible.
2. **Hard constraints** — veg-only, distrusted categories (hard exclude). **Price sensitivity** is a soft rank/band preference (prefer lower price bands; never a hard ceiling that can starve the deck). Filter hard constraints every level, always.
3. **Swipe history** — boldness stage, saved items, hidden items, category back-offs. Decides how bold the deck gets.
4. **Time of day** — re-ranks candidates by mood window (see Time Layer below). Time re-ranks, it NEVER overrides the logic or adds unjustified products.
5. **Cart context** — free-delivery gap, current cart. Powers match nudges. Free-delivery threshold for the demo = **₹99**; gap match fires when cart is within **₹50** of that threshold and a saved item fits the remaining gap.

### Ladder of inference (L0-L4)

- **L0 — Basket facts.** Raw purchase history.
- **L1 — Intent + hard constraints.** Needs from L0 (oats + paneer + milk → protein, breakfast). Constraints found here (all-veg → veg-only) are inherited by all levels above.
- **L2 — Same need, new category.** Shared `need` tag, category the user never bought. Bridge: "You buy paneer and oats every week — this is protein too, just grab-and-go."
- **L3 — Same goal, different need.** Shared `goal` tag, different need. Bridge: "You're clearly into fitness — people tracking protein usually track weight too."
- **L4 — Lifestyle halo.** One further hop (fitness → sleep → chamomile tea). Never by default; must be unlocked via boldness stage.

Confidence decays per hop → price and position decay with level. Never lead a first L3/L4 with an expensive item.

### Time Layer

Four windows, tagged per product in `time_tags`. Half-open ranges so boundaries are unambiguous:

| Window | Hours (inclusive start → exclusive end) | Typical products |
| --- | --- | --- |
| `morning` | 06:00 → 11:00 | breakfast, dairy, fruits, coffee |
| `afternoon` | 11:00 → 17:00 | lunch add-ons, office snacks, cold drinks |
| `evening` | 17:00 → 21:00 | dinner, family, household restock |
| `late_night` | 21:00 → 02:00 (wraps past midnight) | cravings — ice cream, chips, chocolate, instant noodles |
| `anytime` | — | eligible in every window |

Allocator boosts candidates matching the current window when picking cards. Four windows only — do not over-slice. Window is applied at **deck build** only (see edge-cases).

### Slot / allocation policy (deterministic, runtime)

- Deck: 5-8 cards per session, built by explicit boldness stages so progression is visible:
  - **Stage 0 (default):** 4×L2 + 1×L3 (low price band). L4 never.
  - **Stage 1 (after ≥1 top swipe):** 3×L2 + 2×L3 (higher price allowed) + 1×L4 card eligible.
  - **Stage 2 (after ≥3 top swipes):** up to 2×L4 allowed.
  - Retreat (2 consecutive lefts): back to all-L2, lower price band, stage decremented (floor Stage 0). This is **session boldness** — separate from category back-off (3+ lefts in one category).
- Per-persona state: `{accepted_count, consecutive_dismissals, boldness_stage, saved_list, cart, hidden_products}`.
- Top swipe → advance stage next session (visible as: more L3, first L4 card appearing).
- Right swipe → stay at stage; weight future candidates toward the saved item's category.
- Levels backfill downward only. If honest candidates run out, show a shorter deck — never pad.
- Hard constraints filter every level, always.

### Architecture: LLM proposes offline, rules decide at runtime

- **Offline (before demo, once):** LLM pass over the catalog per persona → `candidates_<persona>.json`: level, justifying shared tag, bridge sentence, bio one-liner, confidence. No honest bridge = excluded. Frozen.
- **Runtime (live demo):** plain deterministic code reads frozen candidates, applies slot policy + filters + cooldowns + time boost + swipe reactions. **No LLM calls, no network calls at runtime.**

---

## Component 2: The Face (Tinder card game + nudges)

This component must look and feel BRILLIANT — polished graphics, smooth animations, the emotional feel of a dating app, not a plain product rail. UI quality is a first-class requirement, not a nice-to-have.

### The Tinder emotional feel

- Product cards styled like dating profiles: big product photo, name, price, and a short playful "bio" one-liner on the card (the bridge line written with personality — e.g. "Single, 20g protein, looking for someone who lifts").
- The dark store is the "people near you" equivalent: cards can carry a radius touch like "11 mins away from you."
- Card stack visual: next cards peeking out behind the top card, like a real deck.

### Swipe semantics (final)

| Gesture | Meaning | Action | Signal |
|---|---|---|---|
| **Left** | Not for me | Dismiss. Hidden 30 days. Product-level no, NOT category-level. | Soft no |
| **Right** | Want it, but not now | Add to **Saved list**. Resurfaces only via match moments. | Medium yes |
| **Top** | Want it now | Straight to **cart**, cart count updates instantly. | Strong yes |

- First card ever shows a one-line instruction; never again.
- **Undo** button after every swipe, visible ~5 seconds, fully reverses the signal. Undoing a top swipe removes from cart **without** triggering the cart→Saved downgrade (edge rule 5).
- **Buttons (Skip / Save / Add to cart) are the guaranteed input; swipe gestures are a layer on top.** Demo must never depend on gesture detection.
- End card after 5-8 cards: "That's it for today — come back tomorrow."
- **Persona switch mid-deck:** discard the in-progress deck (no partial swipe signals applied from the abandoned stack), load the other persona's state, build a fresh deck. Undo buffer clears.

### Animations (required)

- Cards physically fly off in swipe direction with rotation and spring physics.
- Right swipe: heart burst + "Saved ❤️" toast. Top swipe: card arcs into the cart icon, cart badge bounces +1. Left swipe: quick fade-fling.
- Match moment: full Tinder-style "It's a Match!" takeover — product photo + user avatar, confetti, one-tap "Add to cart" button.
- Deck entry: cards fan/shuffle in. All animations 60fps-smooth, fast (under ~400ms each), never blocking the next swipe.

### The two placements

1. **Home screen card:** mock Blinkit home (ETA header, search bar, category icons), deck card in the promo banner slot BELOW search and categories. A static "Frequently bought" rail stays visible to show the old rail coexists. If ignored 3 sessions, the card shrinks/hides for a while.
2. **Post-order screen (hero moment):** fake order confirmation + delivery countdown, deck below: "While your order arrives, see what we found for you."

### Match moments + nudge notifications

A match = a Saved item meeting its right moment:
1. **Price drop** → nudge: saved item now cheaper.
2. **Free-delivery gap** → cart total is within ₹50 of the ₹99 free-delivery threshold AND a saved item's price covers the remaining gap → show on cart screen: "Add this and delivery is free."
3. **Back in stock** → saved out-of-stock item returns (via stock toggle in demo).

Nudge copy style: **flirty-cheeky Hinglish**, Zomato-notification energy (e.g. "doodh piyo, protein walla" vibe; "Wo protein bar jo tumne save kiya tha? Aaj 20% sasta. Ab toh haan bolo 😌"). Keep it brand-safe and family-safe — cheeky, never dirty. Nudges are simulated in-app (banner/toast + the match takeover), no real push infrastructure.

If a match is dismissed (close takeover without adding), it may fire again on a later trigger unless the item is already in cart or purchased (those suppress — see edge-cases).

Demo controls (hidden panel, see Screens): simulate price drop, mark-purchased-via-search, stock toggle, and a New Session button. These exist so every success criterion is demonstrable live.

---

## Edge-case rules (implement all)

1. Left-swiped product later bought (e.g. via search) → purchase overrides swipe: delete the left signal, reopen the category.
2. All left signals auto-expire after 30 days.
3. 1 left swipe = product-level only. 3+ lefts in one category = back off that category. (Independent of the 2-consecutive-left **retreat** on boldness stage.)
4. Saved list capped at 15; oldest drops off.
5. Top-swiped item removed from cart before checkout → downgrade to Saved (match candidate). Undo-top does **not** count as this removal.
6. Cooldowns: left → hidden 30 days; right → never in deck again (Saved-only); purchased → never in deck.
7. Out-of-stock items never appear in the deck. Saved item going OOS becomes a back-in-stock match candidate.
8. No honest candidates → shorter deck or skip session. Never pad.

## Data files

1. **`catalog.json`** — from the cleaned scrape (deduped, top-level category mapping added). Fields: `id, name, brand, category (top-level), subcategory, price, mrp, unit, image_url` (local path under `/public/images/...`), `in_stock, veg_flag, need_tags[], goal_tags[], time_tags[]`. Tags added in an offline LLM pass on the demo subset (~200-300 products), human-reviewed.
2. **`persona_<name>.json`** ×3 — 10-15 order-history items + starting state:
   - **Akash (fitness):** oats, milk, paneer, protein items; all veg → veg-only constraint.
   - **Janvi (household):** groceries, bread, butter, cleaning, coffee, cold drinks; price-sensitive (soft: prefer lower price bands).
   - **Bardhan (explorer):** imported drinks, ice cream, biscuits, one-offs; high openness, distrusts electronics.
3. **`candidates_<persona>.json`** ×3 — frozen offline LLM output.

## Screens

1. **Hidden demo controls panel:** persona switcher · time-window selector (**morning / afternoon / evening / late night**) · **New Session** button (rebuilds the deck from current state — this is how "next session" reactions are shown live) · **simulate price drop** · **mark item as purchased via search** (to demo edge rule 1) · **toggle stock** on a chosen item (to demo edge rule 7).
2. **Mock home screen** (with deck card + static old rail).
3. **Swipe deck screen** (cards, buttons + gestures, undo, counter, end card).
4. **Post-order screen** (countdown + deck).
5. **Saved list** (match nudge fires here or as banner).
6. **Cart** (top-swiped items, remove-from-cart control for edge rule 5, free-delivery progress bar that can trigger the gap match).

## Demo script (90 seconds)

1. Akash, post-order, morning: Stage 0 deck (4×L2 protein bars + 1 low-price L3) with bio lines → **left-swipe** one filler card (sets up edge rule 1) → **top-swipe** a protein bar → card arcs into cart.
2. Press **New Session**: Stage 1 deck — extra L3 (smart scale, higher price) + first L4 card (chamomile tea) appears. Engine visibly reacted.
3. Use **mark-purchased** control on the item left-swiped in step 1 → New Session → its category is proposable again; that product itself stays out of the deck (edge rule 1 live).
4. Right-swipe an item → trigger **simulate price drop** → "It's a Match!" takeover → one-tap add.
5. Flip time to **late night** → New Session: same Akash, deck turns to cravings (protein ice cream) — time layer proven.
6. Switch to Janvi: safer, cheaper deck. Two left swipes → **New Session** → deck retreats to all-L2 cheap.
7. Switch to Bardhan: explorer deck, no electronics despite openness (trust constraint honored). Optional: stock-toggle a saved item OOS→in-stock to show back-in-stock match.

## Non-goals

No real Blinkit integration, login, payments, delivery. No live scraping. No LLM or network calls at runtime. No real push notifications. No multi-user/family account handling (known limitation).

## Constraints

Fully free stack, no paid APIs/models anywhere.
- **Offline LLM passes (tagging, candidates):** use any free option — Grok free tier, Groq API free tier, or a local open-source model (e.g. Ollama with Llama/Qwen). Quality is human-reviewed, so model choice is flexible; whatever is free and available.
- **Images:** downloaded ONCE at build time into the app's local assets (`/public/images`), referenced locally. "Zero network at runtime" means: no API/LLM calls and no remote image loads during the demo — everything is bundled.
- **Deployment:** static build deployable to any free platform — Vercel, Netlify, GitHub Pages, Render (static site), or Railway. Pick whichever deploys the static build simplest.
- Mobile-viewport-first. Runs entirely from frozen local JSON + bundled assets.

## Success criteria (two tiers)

**Core (never cut — the demo fails without these):**
- Deck built from honest bridge/bio lines only; all three swipes + undo work per slot policy.
- Engine visibly reacts across sessions (Stage 0 → Stage 1 via New Session).
- At least one match moment triggerable live with the full match takeover.
- Edge rules 1, 5, 6, 7 demonstrable (via demo controls + cart remove).
- Zero runtime LLM/network dependencies; zero crashes across a full demo run.
- At least 2 personas (Akash + Janvi) with visibly different decks.

**Full (cuttable under time pressure, in the cut-list order):**
- 3rd persona (Bardhan). Time-window switch visibly re-ranking the deck. Gesture swipes on top of buttons. Full animation polish. Saved-list screen (banner nudge suffices).

If a Full item is cut, it is removed from the success checklist too — the Core tier is the contract.
