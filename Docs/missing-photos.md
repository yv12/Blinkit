# Products still without a real photo

**Full list (manual download):** see [`missing-product-images.md`](./missing-product-images.md)  
Also: [`missing-product-images.csv`](./missing-product-images.csv) · [`missing-product-images.json`](./missing-product-images.json)

**Have photo: 29** · **Missing: 228 / 257**

## How to add

1. Save as `public/images/<id>.jpg` — copy the **file** column from the list (e.g. `p00037.jpg`)
2. Run `npm run sync-images`
3. Hard-refresh the app

Regenerate the list anytime:

```bash
node scripts/list-missing-images.mjs
```
