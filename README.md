# Blinkit Discover

A swipe-based discovery layer for Blinkit — like Tinder, but for grocery.

Blinkit already recommends what you might buy next in the same aisle. This experience is built to do something harder: move shoppers **across categories** — from paneer to whey, from oats to a shaker — with a reason that feels honest, not random.

## How recommendations work

Every card is tied to something the shopper already buys. We call that link a **bridge**.

- You buy paneer and oats → we show a protein shake as “same need, new aisle”
- You keep liking fitness snacks → we gently open gym gear, vitamins, or a scale
- You keep skipping an aisle → we back off that path

Swipes teach the system live. Likes, skips, saves, and cart adds shift what shows up next — so the deck gets more personal as you play, not after a long wait.

## Where AI fits

The brain of the product is rules + swipe signals (stage, aisle coherence, stock, photos). That part runs without an LLM and is what keeps the demo reliable.

AI (Groq) is optional on top:
- write short **bridges** and **bios** that explain *why* this product from another category
- write **nudges** when something saved drops in price or fits the basket

If AI is off or slow, frozen candidates + rules still serve a full deck. AI improves the story; it does not replace the recommendation logic.

## Why this helps Blinkit

Search and classic recommenders are strong at “more like what you already buy.” Cross-category purchase needs a different loop:

1. Start from real order history (anchors)
2. Suggest a nearby-but-new category with a clear bridge
3. Learn from the swipe in the moment
4. Unlock bolder cross-sell only after the shopper shows interest

That turns discovery into a conversation — and opens baskets that a same-aisle feed usually won’t.

## Run locally

```bash
npm install
cp .env.example .env   # optional: add GROQ_API_KEY for LLM features
npm run sync-images
npm run dev
```

Open the app (defaults to home `/legacy/index.html`). Track-order swipe deck: `/legacy/order.html` or `npm run dev:order`.

```bash
npm test
```

## Repo

https://github.com/yv12/Blinkit
