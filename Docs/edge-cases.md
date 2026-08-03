# edge-cases.md — Rules + tests

1. **Left-swiped product bought later (e.g. via search).** Purchase overrides swipe: delete left signal, reopen category. Test: left-swipe X → mark X purchased → X's category proposable again, X never in deck (rule 6).
2. **Left signals expire after 30 days.** Test: left with timestamp 31 days ago → product eligible again. (Demo: seed a stale timestamp via test helper if needed.)
3. **Product-level vs category-level no.** 1 left = product only. 3+ lefts in same category = category back-off. Independent of boldness **retreat** (2 consecutive lefts → stage down). Test: 2 lefts in category → category still proposable; 3rd left → category paused; 2 consecutive lefts still retreat stage even if category stays open.
4. **Saved list cap 15.** Oldest drops off. Test: save 16 → list length 15, first saved gone.
5. **Top-swiped item removed from cart pre-checkout.** Downgrade to Saved (match candidate). Test: top-swipe X → remove from cart → X in saved_list, not in cart, still match-eligible.
6. **Cooldowns.** Left → hidden 30 days. Right → never in deck again (Saved-only resurfacing). Purchased → never in deck. Test each.
7. **Out-of-stock never in deck.** Saved item going OOS → back-in-stock match candidate. Test: mark candidate OOS → absent from next deck; mark saved item OOS→in-stock → match fires.
8. **Honest-candidate shortage.** Fewer than 5 honest cards → shorter deck; zero → skip session gracefully (no crash, friendly empty state). Test with a starved candidate file.
9. **Ignored deck.** 3 sessions with zero deck interaction → home card shrinks/hides for a while. (Logic implemented; demoing optional.)
10. **Undo.** Fully reverses the signal within ~5s: undone left → not hidden, counter rolled back; undone top → removed from cart WITHOUT triggering rule 5's downgrade. Test all three.
11. **Empty/short history persona.** If a persona has <3 history items, engine returns L2-only conservative deck or empty state — never crashes. Test with a stub persona.
12. **Candidates exhausted mid-usage.** All candidates consumed by cooldowns/purchases → end card with "come back tomorrow", no repeats, no crash.
13. **Double/rapid swipes.** Swiping during an animation must not double-fire signals or skip cards. Test: spam-click Add 5× fast → exactly 5 distinct cards processed.
14. **Time boundary.** Session spanning a window change (e.g. 10:59→11:01) keeps the deck it opened with; window applies at deck build / New Session only. Half-open windows: morning ends at 11:00, afternoon at 17:00, evening at 21:00.
15. **Match on an item already in cart / already purchased.** Suppress the nudge. Test: add saved item to cart manually → simulate price drop → no takeover. Dismissed match (close without add) may fire again on a later trigger.
16. **Persona switch mid-deck.** Discard in-progress deck; clear undo buffer; do not apply signals from unswiped cards; load target persona state; build fresh deck. Test: mid-deck switch → no cart/saved pollution from abandoned cards.
17. **New Session.** Rebuilds deck from current persona state (boldness stage, cooldowns, saved, cart). Does not reset persona state. Test: top-swipe → New Session → Stage 1 mix visible.
