# Swipe discovery MVP — build spec

## What this is
A deployable web demo of a cross-category product discovery feature for a
quick-commerce grocery app. Users swipe through recommended products from
categories they have never bought from. The demo must run with no backend,
no database, and no paid APIs.

## Hard constraints
- Static site only. HTML, CSS, vanilla JS. No build step required.
- No login, no real inventory, no payment.
- All data is hardcoded JSON in the repo.
- Must work on a real phone browser at 390px width.
- Deployable to Vercel, Netlify, or GitHub Pages as-is.

## Scope: build exactly this, nothing more
1. Home screen with the swipe block in the promo banner slot.
2. Persona switcher (3 personas) so the demo shows different ladders.
3. Order tracking screen with the same card in the ad slot.
4. Search results screen with quiet relevance tags (no card).

5. Nudges, both in-app and after the user leaves the app. See the nudge
   section below.

Out of scope for this build: the saved list screen, social/neighbour
features, real product images.

## Nudges: two delivery channels

Use `nudges.js` and `sw.js` in this repo. Do not rewrite the trigger engine,
wire it in.

### Channel 1 — in-app, in real time
Fires while the user is on a screen. Call `runNudgeRules(state, catalog)`
after every swipe, every cart change, and after an order is placed. The rule
set decides whether anything shows. Always works, no permission needed.

The main in-app rule is the free-delivery gap: when the cart is below the
threshold, a banner offers one cross-category item that closes it. This is the
highest-value nudge in the build because the user is already looking for
something to add.

### Channel 2 — after the app is closed
Uses the Notification API plus a service worker. The service worker holds the
timer, so the nudge still fires once the tab is backgrounded or the user has
navigated away.

Flow: register the service worker on first load, ask for notification
permission only after the user's first accepted swipe (never on page load,
permission prompts before any value shown get denied), then schedule from the
rules.

### What actually works where, be honest about this in the deck
| Situation | Works? |
|---|---|
| Tab open, user on another screen | Yes |
| Tab backgrounded, browser still open | Yes, Android and desktop Chrome |
| Browser fully closed | Needs a push server, see below |
| iOS Safari | Only if added to the home screen as a PWA, iOS 16.4+ |

For a fully-closed browser you need real Web Push: a VAPID key pair, a stored
subscription, and something to send from. A single serverless function on
Vercel's free tier is enough, and the `push` handler in `sw.js` is already
written for it. Only build this if there is time after the four screens are
done. It is not required for the demo to be convincing.

### Caps, these are part of the product, not an afterthought
- One background nudge per day, maximum.
- One in-app nudge per session, maximum.
- No background nudge between 11pm and 8am.
- Every nudge must name a real item from the user's basket or saved list. If
  no honest reference exists, send nothing.

### Timing
The cross-sell nudge fires 45 minutes after delivery, once the user has
actually used what they bought. This is the demo's borrowed insight and worth
stating on the slide. For the demo, shorten the delays so a judge can see one
fire within a minute, and label the real timing on screen.

## The recommendation logic (the actual product idea)
Each recommendation is one rung of a ladder built from the user's basket.

- L0 — basket facts (what they actually bought)
- L1 — inferred intent plus hard constraints (e.g. an all-veg basket makes
  veg a filter inherited by every level below)
- L2 — same need, new category (protein basket to veg protein bars)
- L3 — same goal, different need (protein routine to a kitchen scale)
- L4 — lifestyle halo, used sparingly

Every card must carry a one-line bridge that names a real basket item. If no
honest bridge exists, drop the item rather than show it.

### Slot policy
- Default mix: 2 x L2 plus 1 x L3. L4 never shows by default.
- Accepting an item (save or add) unlocks the next level up.
- Two consecutive dismissals retreat to L2 only, at a lower price band.
- Levels backfill downward only, never upward.
- Daily limit of 3 cards, then the block shows a come-back-tomorrow state.

### Per-persona state to track
`{ acceptedCount, consecutiveDismissals, unlockedMaxLevel, played }`

## The three swipe actions
| Direction | Meaning | Effect |
|---|---|---|
| Left | Not interested | Dismiss, counts toward retreat |
| Right | Interested, not now | Goes to Saved |
| Up | Want it now | Goes to Cart |

On the order tracking screen the up action becomes "add to this order"
instead of "add to cart", since the rider has not left yet.

## Personas (build all three)
1. Fitness — basket of whey protein, oats, milk. Ladder runs toward protein
   snacks, then a kitchen scale, then fitness lifestyle items.
2. Household — basket of bread, butter, milk, cold drinks, monthly bulk
   staples. Ladder runs toward bulk staples, then storage containers.
3. Explorer — basket of ice cream, cold drinks, biscuits. Ladder runs toward
   imported snacks, then a popcorn maker.

## Design
Use `index.html` in this repo as the reference implementation. Copy its
design tokens and component structure exactly. Do not redesign it, do not
substitute a UI library, do not change the palette.

### Tokens (already defined as CSS custom properties in index.html)
| Token | Value | Use |
|---|---|---|
| `--brand-yellow` | #F8CB45 | App header, active nav tab |
| `--brand-green` | #54B226 | Cart, confirmations, add buttons |
| `--maroon` | #750000 | Swipe card fill, headings |
| `--cerise` | #DE3163 | Primary action, badges, toast |
| `--rose` | #FF8A8A | Card outline, bio text, second card in stack |
| `--rose-dust` | #A95C68 | Muted text, struck price, skip outline |
| `--rose-tint` | #FFF0F0 | Swipe block background |

Rule: decoration (fairy lights, roses, candles) frames the block only. The
card face itself stays clean so the product name and price stay readable.

## Quality floor
- Keyboard accessible: arrow keys drive the three actions.
- Touch drag works, not just the buttons.
- `prefers-reduced-motion` disables the card transition.
- Visible focus rings on all buttons.

## Deploy
Push to GitHub, connect the repo to Vercel or Netlify, no configuration
needed. The output is a single public URL.
