# Pre-generated nudge copy (MVP)

Use `nudge-product-list.json` (257 products). Generate **one** filmy / late_night nudge per product offline.

Runtime will only substitute **price** (and offer lines like `₹{price}`).

## Return this JSON shape

```json
{
  "p07026": {
    "notification_title": "max 6 words tease",
    "notification_body": "full punchline line — product name at end",
    "cta_label": "Abhi mangao",
    "triggers": {
      "price_drop": {
        "notification_title": "optional override",
        "notification_body": "must mention price placeholder {{price}}",
        "cta_label": "Abhi mangao"
      },
      "saved_reminder": {
        "notification_title": "...",
        "notification_body": "...",
        "cta_label": "Dekh lo"
      },
      "fee_gap": {
        "notification_title": "...",
        "notification_body": "use {{gap}} for rupees left to free delivery",
        "cta_label": "Add karo"
      },
      "restock": {
        "notification_title": "...",
        "notification_body": "...",
        "cta_label": "Abhi lo"
      }
    }
  }
}
```

Minimum for MVP: one default `notification_title` + `notification_body` + `cta_label` per product id.  
Optional: per-trigger overrides. Use `{{price}}` and `{{gap}}` where needed.

Voice = `Docs/nudge_prompt.md` examples (filmy, late_night).
