/**
 * Flirty-cheeky Hinglish nudge copy — brand-safe, Zomato-notification energy.
 */

function shortName(name = "") {
  const cut = name.split(",")[0].trim();
  return cut.length > 42 ? `${cut.slice(0, 40)}…` : cut;
}

export function matchHeadline(reason) {
  switch (reason) {
    case "price_drop":
      return "It's a Match!";
    case "free_delivery_gap":
      return "It's a Match!";
    case "back_in_stock":
      return "It's a Match!";
    default:
      return "It's a Match!";
  }
}

export function matchSubhead(reason) {
  switch (reason) {
    case "price_drop":
      return "Price drop pe dil garden-garden";
    case "free_delivery_gap":
      return "Free delivery ke ek kadam door";
    case "back_in_stock":
      return "Stock wapas, second chance live";
    default:
      return "Perfect timing, bilkul";
  }
}

/** Banner / toast line (Hinglish). */
export function nudgeBannerCopy(match) {
  if (!match) return "";
  const name = shortName(match.name);
  const price = Math.round(match.price);

  switch (match.reason) {
    case "price_drop":
      return `Wo ${name} jo tumne save kiya tha? Aaj sasta pad gaya — ₹${price}. Ab toh haan bolo 😌`;
    case "free_delivery_gap":
      return `Bas yeh add karo (₹${price}) aur delivery free. Cart thoda lonely hai warna.`;
    case "back_in_stock":
      return `${name} wapas stock mein! Pehle save kiya tha na — ab udaao mat.`;
    default:
      return `${name} bula raha hai. One tap, cart mein.`;
  }
}

/** Longer line inside the takeover card. */
export function matchBodyCopy(match) {
  if (!match) return "";
  const name = shortName(match.name);
  const price = Math.round(match.price);

  switch (match.reason) {
    case "price_drop":
      return `${name} ab ₹${price} pe. Save kiya tha, deal aa gayi — kya sochna?`;
    case "free_delivery_gap":
      return `₹${price} ka ${name} daalo aur free delivery unlock. Almost there, champ.`;
    case "back_in_stock":
      return `${name} phir available hai. Jo tumne pehle right-swipe kiya — ab cart bula raha hai.`;
    default:
      return `${name} · ₹${price}`;
  }
}

export function reasonChip(reason) {
  switch (reason) {
    case "price_drop":
      return "Price drop";
    case "free_delivery_gap":
      return "Free delivery";
    case "back_in_stock":
      return "Back in stock";
    default:
      return "Match";
  }
}
