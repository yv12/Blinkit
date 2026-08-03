# context.md — What is true about this build

## Users (3 demo personas)
- **Akash (fitness):** history = oats, milk, paneer, protein items. All veg → hard veg-only constraint. Needs: protein, breakfast. Goal: fitness.
- **Janvi (household):** history = groceries, bread, butter, cleaning liquid, coffee, cold drinks. Price-sensitive → **soft** preference for lower price bands (never a hard ceiling that starves the deck). Goal: running a household.
- **Bardhan (explorer):** history = imported drinks, ice cream, biscuits, one-off items. High openness, distrusts electronics → electronics category excluded for him. Goal: trying new things.

## Data we have
- A cleaned Blinkit product CSV (~8.8K products): name, price, category (295 micro-categories, needs mapping to ~15-20 top-level), some subcategory/unit/image gaps.
- Images for the ~250-product demo subset are downloaded **once at build time** into `/public/images` and referenced as local paths in `catalog.json`. No remote image loads at runtime.

## What every recommendation is based on (5 inputs)
1. Order history → needs and goals (decides eligibility)
2. Hard constraints (veg-only, distrusted categories) — filter everything, always. Price sensitivity = soft band preference.
3. Swipe history (boldness stage, saved, hidden, category back-offs) — decides boldness
4. Time of day — 4 windows (half-open): morning 06:00–11:00, afternoon 11:00–17:00, evening 17:00–21:00, late_night 21:00–02:00, plus `anytime`. Time RE-RANKS only; it never adds unjustified products. Applied at deck build only.
5. Cart context (free-delivery gap) — powers match nudges. Demo free-delivery threshold = ₹99; gap match when within ~₹50 and a saved item fits.

## Swipe meanings (final)
- Left = not for me → dismiss, hide 30 days, product-level no
- Right = want it but not now → Saved list (resurfaces only via match moments)
- Top = want it now → straight to cart
- Undo after every swipe (~5s). Buttons (Skip/Save/Add) are the guaranteed input; gestures are a bonus layer. Deck = 5-8 cards/session (boldness stages), then end card. **New Session** rebuilds the deck from current state.

## Placements
1. Home screen: deck card in the promo banner slot, BELOW search bar + category icons; static "Frequently bought" old rail stays visible alongside.
2. Post-order screen (hero): order confirmation + delivery countdown, deck below.

## Match + nudges
Match = a Saved item meets its moment: price drop / cart within ~₹50 of ₹99 free delivery and item fits gap / back in stock. Full "It's a Match!" takeover + one-tap add. Nudge copy: flirty-cheeky Hinglish, brand-safe/family-safe (e.g. "Wo protein bar jo tumne save kiya tha? Aaj 20% sasta. Ab toh haan bolo 😌"). Nudges simulated in-app only. Demo controls: New Session, simulate price drop, mark-purchased-via-search, stock toggle.

## Non-negotiable rule
Every card must be logically derived from real purchase history and carry a one-line honest "bridge" stating the connection. No honest bridge = never shown. No random/generic filler anywhere.

## Constraints
Fully free stack. No paid APIs/models. No LLM or network calls at runtime (all LLM work offline, frozen to JSON; images bundled locally). Mobile-viewport-first. Deployable free (Vercel/Netlify/GitHub Pages/Render/Railway). Zero-crash demo requirement.

## Source of truth
`Docs/ProblemStatement.md` wins on any conflict. Keep `ProblemStatement.txt` synced to it.
