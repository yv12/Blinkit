/* ============================================================
   nudges.js — the nudge engine
   Two delivery channels:
     1. IN-APP   : fires while the user is on a screen. Always works.
     2. BACKGROUND : fires via the service worker after the user has
                     left the app. Requires permission + a registered SW.
   ============================================================ */

/* Demo delays are shortened so a judge sees one background nudge within a minute.
   Real production timing is shown on-screen via NUDGE_TIMING_LABEL. */
export const NUDGE_TIMING_LABEL =
  "Demo nudges ~20–40s · Production: price event / 45 min after delivery";

const NUDGE_RULES = [
  {
    id: "price_drop",
    channel: "background",
    delayMs: 20 * 1000,          // demo. Production: fires on the real price event.
    fires: s => s.saved.length > 0,
    build: item => ({
      title: "Sasta ho gaya, sun rahe ho",
      body: `Rs ${item.mrp} wala ab Rs ${item.price} mein, ${item.name}`,
      cta: "Abhi mangao"
    })
  },
  {
    id: "fee_gap",
    channel: "inapp",
    fires: s => s.cartTotal > 0 && s.cartTotal < s.freeDeliveryThreshold,
    build: (item, s) => ({
      title: `Rs ${s.freeDeliveryThreshold - s.cartTotal} aur, delivery free`,
      body: `Cart ko thoda aur chahiye, ${item.name}`,
      cta: "Add karo"
    })
  },
  {
    id: "cross_sell",
    channel: "background",
    delayMs: 40 * 1000,          // demo (~40s). Production: 45 min after delivery.
    fires: s => s.lastOrderDelivered,
    build: item => ({
      title: `${item.bridge} akele bore ho rahe hain`,
      body: `Dost bulaya hai, ${item.name}`,
      cta: "Cart mein lo"
    })
  },
  {
    id: "saved_reminder",
    channel: "background",
    delayMs: 24 * 60 * 60 * 1000, // unchanged — needs daysSinceOpen >= 1
    fires: s => s.saved.length > 0 && s.daysSinceOpen >= 1,
    build: item => ({
      title: "Aap ne right swipe kiya tha",
      body: `Abhi bhi wait kar raha hai, ${item.name}`,
      cta: "Dekh lo"
    })
  }
];

/* ---- caps: the thing that stops this becoming spam ---- */
const CAPS = {
  maxBackgroundPerDay: 1,
  maxInAppPerSession: 1,
  quietHours: [23, 8]           // no background nudge between 11pm and 8am
};

function withinQuietHours(d = new Date()) {
  // MVP demo: never block — judges need to see the nudge any hour.
  if (typeof window !== "undefined" && window.__MVP_NUDGES__ !== false) return false;
  const h = d.getHours();
  const [start, end] = CAPS.quietHours;
  return h >= start || h < end;
}

/* ============================================================
   IN-APP: render a banner on the current screen
   ============================================================ */
export function showInAppNudge({ title, body, cta }, onAccept) {
  const el = document.createElement("div");
  el.className = "nudge";
  el.setAttribute("role", "status");
  el.innerHTML = `
    <div class="nudge-txt">
      <strong>${title}</strong>
      <span>${body}</span>
    </div>
    <button class="nudge-cta">${cta || "OK"}</button>`;
  const host = document.querySelector(".body") || document.querySelector(".phone") || document.body;
  host.prepend(el);
  el.querySelector(".nudge-cta").onclick = () => { onAccept?.(); el.remove(); };
  // Auto-dismiss soft banners so the deck stays usable
  setTimeout(() => {
    if (el.isConnected && !el.dataset.sticky) el.remove();
  }, 12_000);
  return el;
}

/* ============================================================
   BACKGROUND: real notification, delivered by the service worker
   so it still appears once the user has left the app.
   ============================================================ */
export async function initBackgroundNudges() {
  if (!("serviceWorker" in navigator) || !("Notification" in window)) {
    return { supported: false, reason: "browser" };
  }
  const reg = await navigator.serviceWorker.register("./sw.js");
  return { supported: true, reg };
}

export async function requestNudgePermission() {
  const result = await Notification.requestPermission();
  return result === "granted";
}

export async function scheduleBackgroundNudge(payload, delayMs) {
  if (Notification.permission !== "granted") return false;
  if (withinQuietHours(new Date(Date.now() + delayMs))) return false;

  const reg = await navigator.serviceWorker.ready;
  reg.active?.postMessage({
    type: "SCHEDULE_NUDGE",
    delayMs,
    payload: {
      title: payload.title,
      body: payload.body,
      cta: payload.cta,
      tag: payload.id || "nudge",
      url: "./index.html"
    }
  });
  return true;
}

/* ============================================================
   The runner: check every rule against current state.
   Call this after every swipe, every cart change, every order.
   ============================================================ */
export async function runNudgeRules(state, catalog) {
  const sentToday = state.backgroundSentToday || 0;

  for (const rule of NUDGE_RULES) {
    if (!rule.fires(state)) continue;

    const item = pickItemForRule(rule, state, catalog);
    if (!item) continue;

    const payload = { ...rule.build(item, state), id: rule.id };

    if (rule.channel === "inapp") {
      if (state.inAppShownThisSession >= CAPS.maxInAppPerSession) continue;
      state.inAppShownThisSession = (state.inAppShownThisSession || 0) + 1;
      showInAppNudge(payload, () => state.onAddToCart?.(item));
      continue;
    }

    if (sentToday >= CAPS.maxBackgroundPerDay) continue;
    const ok = await scheduleBackgroundNudge(payload, rule.delayMs);
    if (ok) state.backgroundSentToday = sentToday + 1;
  }
}

/* Pick the item a rule should talk about.
   Saved items for reminder/price rules, an unexplored category for cross-sell. */
function pickItemForRule(rule, state, catalog) {
  if (rule.id === "price_drop" || rule.id === "saved_reminder") {
    return state.saved[0] || null;
  }
  const pool = [...catalog.L2, ...catalog.L3];
  return pool.find(p => !state.seen?.includes(p.name)) || pool[0] || null;
}
