# llm-recommendation-spec.md — Runtime LLM engine + nudges

This supersedes the offline-only candidate architecture in architecture.md. The LLM (Grok free tier; fallback: any free tier or local Ollama model) now runs at RUNTIME per user. Phase 3's frozen candidate files are KEPT as the automatic fallback when the API fails, times out (>5s), or rate-limits.

## Core pattern: the rules sandwich
CODE decides who is eligible and the deck's shape → LLM picks specific products and writes language → CODE validates before rendering. The LLM never holds a steering wheel.

## Per-user profile (the account memory — LLM is stateless, this JSON is passed into every call)
```json
{
  "user_id": "akash",
  "history": [{"id": "...", "name": "oats", "category": "..."}],
  "hard_constraints": ["veg_only"],
  "excluded_categories": [],
  "needs": ["protein", "breakfast"],
  "goal_hypotheses": [
    {"goal": "muscle_gain", "confidence": 0.55, "evidence": [...]},
    {"goal": "weight_loss", "confidence": 0.45, "evidence": [...]}
  ],
  "resolved_goal": null,
  "boldness_stage": 0,
  "saved_list": [], "cart": [], "hidden_products": {},
  "category_backoffs": {}, "evidence_log": []
}
```

## LLM Call 1 — Cold read (first session per user, and whenever goal becomes unresolved)
Input: order history. Output (strict JSON): needs[], goal_hypotheses[] (2-3 competing goals WITH confidence and evidence item names), hard_constraints[]. Rule: the LLM must output competing hypotheses, never a single conclusion. Code stores this into the profile.

## LLM Call 2 — Deck generation (every session)
Inputs (all injected by code):
1. ALLOWED PRODUCT LIST — code pre-filters catalog (in stock, not hidden, constraints pass, price band per stage) to 60-100 items with id/name/category/price/tags. LLM may ONLY choose from this list.
2. Order history (evidence for bridges)
3. Hard constraints stated explicitly as instructions
4. Swipe state: boldness_stage, recent lefts, category_backoffs, saved_list
5. Deck instructions per stage (Stage 0: 4×L2 + 1×L3 low-price; Stage 1: 3×L2 + 2×L3 + 1×L4 eligible; Stage 2: up to 2×L4) + PROBE instruction when applicable (see below)
6. Time window (re-rank preference only)
7. Output contract — strict JSON array:
```json
[{"product_id": "...", "level": "L2", "anchor_items": ["oats", "paneer"],
  "bridge": "You buy paneer and oats every week — this is protein too, just grab-and-go.",
  "bio": "Single, 20g protein, looking for someone who lifts"}]
```

## Hypothesis → Probe → Resolve → Branch
- **Probe:** if top-2 goal_hypotheses are within 0.20 confidence and resolved_goal is null → allocator instructs the LLM to include ONE cheap probe card per hypothesis (e.g. mass gainer vs whey isolate). Probes are always low-price items; never test a hypothesis with an expensive product.
- **Resolve (code, not LLM):** confidence updates — top swipe on a hypothesis's item +0.20, right +0.10, left −0.15, PURCHASE +0.35. Evidence rank: purchase > top > right > left. A hypothesis crossing 0.75 → resolved_goal set.
- **Branch:** once resolved, every deck call receives resolved_goal, and recommendations follow its product tree (weight_loss → isolate → shaker → low-cal snacks/green tea/food scale; muscle_gain → gainer → creatine/peanut butter/bigger shaker).
- **Self-correction:** a contradicting purchase drops the resolved goal's confidence by 0.35 (below threshold → resolved_goal=null → probing resumes). 2-3 lefts on the resolved branch do the same, gentler (−0.15 each). ALL evidence decays with a 90-day half-life. Confusion is a tracked number, never a stuck state: low confidence → probe cheap; high → branch bold; contradiction → drop and re-probe.

## Validation (code, after every LLM response, before rendering)
1. Every product_id exists in the allowed list (drop violators)
2. Every anchor_item exists in the user's actual history (drop card if not — the honest-bridge rule, enforced mechanically)
3. Constraints hold (veg flag, price band, excluded categories)
4. Level mix matches stage; bad mix → keep valid cards, backfill from frozen fallback candidates
5. JSON parse failure / timeout / rate limit → serve frozen fallback deck silently
6. CACHE every generated deck keyed by (user, stage, time_window, resolved_goal) — replays hit cache, never the API. Pre-warm all demo decks before presenting.

## Nudge system (triggers = rules; words = LLM; delivery = in-app + simulated push)
Triggers (code watches state):
1. price_drop on a saved item → match
2. free_delivery_gap: cart within ~₹50 of threshold AND saved item fits → match
3. back_in_stock on a saved item → match
4. post_delivery: ~40 min after delivery complete → "new cards waiting" pull-back
5. late_night_craving: 9pm-2am AND saved craving-tagged item exists

Anti-spam (hard-coded): max 1 nudge/user/day; priority 2>1>3>5>4; item nudge ignored twice → item muted; deck ignored 3 sessions → no trigger-4 nudges.

Nudge LLM template (reusable, one per trigger fire):
> You write push notifications for Blinkit, a quick-commerce app.
> TONE: flirty, cheeky, playful Hinglish — friend-teasing, Zomato-notification energy. Family-safe: no sexual words or innuendo that would embarrass on a lock screen. Cheeky yes, dirty no.
> CONTEXT: trigger_type: {..}; product: {name, price, old_price}; customer_hook: {e.g. buys paneer+oats weekly, fitness goal}; time_window: {..}.
> TASK: 1 notification — title ≤6 words, body ≤15 words. Reference customer_hook or trigger naturally, never both forced. Output JSON only: {"title": "...", "body": "..."}

Nudge validation: length limits, JSON parses, banned-words list (hard stop). Fail → pre-written default line per trigger type.

Delivery: app open → in-app top banner/toast (match triggers get the full "It's a Match!" takeover). App "closed" → simulated lock-screen view: phone-notification-styled component (dark bg, Blinkit icon, title, body, timestamp); tapping opens the item / takeover. Demo panel gains a "lock screen" toggle so triggers can be fired against it live.

## Demo additions
- Probe-resolve-branch is a first-class demo beat: same Akash history — top-swipe the isolate probe → next deck branches to weight-loss tree; reset, top-swipe the gainer probe → muscle-gain tree. Two futures from one thumb.
- Self-correction beat: after resolving weight_loss, use mark-purchased control on a mass gainer → New Session → probing resumes.

## Success criteria updates
Core adds: probe cards appear when hypotheses are close; a swipe visibly resolves the branch; validation rules 1-5 enforced; fallback deck serves when API is killed (test by disabling network); nudge template produces brand-safe copy with banned-words check active.
