# Blinkit Discover

A swipe-based product discovery experience for Blinkit — like Tinder, but for grocery.

## What we’re trying to achieve

Help shoppers find **relevant new products** they wouldn’t search for, without feeling random or spammy.

We want recommendations that:
- feel personal (based on what you buy and swipe)
- stay in the right aisle (no baby gear on a fitness path)
- only show products with real photos
- update live as you swipe, add to cart, and order

## How we plan to do it

1. **Swipe deck** — users like / skip / add items; each swipe teaches the system what they care about.
2. **Affinity engine** — category + tag weights shift Top picks and “Something different” rails in real time.
3. **Aisle rules** — hard blocks for mismatched aisles (e.g. Baby Care unless the persona actually needs it).
4. **Photo gate** — discovery only surfaces SKUs that have a real local photo.
5. **Optional LLM** — Groq can write bridges / nudges; MVP runs fine on frozen candidates + rules.

## Run locally

```bash
npm install
cp .env.example .env   # optional: add GROQ_API_KEY for LLM features
npm run sync-images
npm run dev
```

Open the app (defaults to `/legacy/order.html`). Home rails: `/legacy/index.html`.

```bash
npm test
```

## Repo

https://github.com/yv12/Blinkit
